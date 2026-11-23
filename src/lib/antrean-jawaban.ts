/**
 * Antrean jawaban yang belum sampai ke server.
 *
 * Masalahnya: setiap jawaban disimpan ke server lewat satu panggilan, dan dulu
 * panggilan yang gagal (sinyal HP putus sebentar) hilang begitu saja — jawabannya
 * tinggal di salinan perangkat, sedangkan penilaian (`kirim_percobaan`) membaca
 * jawaban dari DATABASE. Hasilnya skor lebih rendah tanpa ada yang tahu.
 *
 * Antrean ini menyimpan jawaban sampai server benar-benar menerimanya:
 *  - `tambah` memasukkan jawaban (yang lebih baru untuk soal yang sama menimpa
 *    yang lama) lalu langsung mencoba mengirim;
 *  - `siramkan` mengirim semua yang tertunda berurutan dan berhenti di galat
 *    jaringan (dicoba lagi nanti, jawabannya tetap di antrean);
 *  - `jumlah` > 0 berarti masih ada yang belum terkirim — pemanggil menunda
 *    pengiriman akhir sampai nol.
 * Hasil `permanen` (percobaan/soal tidak dikenal) dibuang agar antrean tidak
 * macet selamanya; `expired` menandai waktu habis menurut server dan
 * mengosongkan antrean (jawaban sesudah tenggat memang ditolak server).
 */
export type HasilKirimJawaban = { expired?: boolean; permanen?: boolean } | void | undefined

export type KirimJawaban = (soalId: string, jawaban: unknown, indeks: number) => Promise<HasilKirimJawaban>

export type IsiAntrean = Record<string, { jawaban: unknown; indeks: number }>

export class AntreanJawaban {
  private tunda = new Map<string, { jawaban: unknown; indeks: number }>()
  private berjalan: Promise<void> | null = null
  /** Server menyatakan waktu sudah habis. */
  habis = false

  constructor(
    private readonly kirim: KirimJawaban,
    /** Dipanggil tiap isi antrean berubah, untuk disalin ke penyimpanan perangkat. */
    private readonly saatBerubah?: (isi: IsiAntrean) => void,
  ) {}

  get jumlah(): number {
    return this.tunda.size
  }

  tambah(soalId: string, jawaban: unknown, indeks: number): void {
    this.tunda.set(soalId, { jawaban, indeks })
    this.beritahu()
    void this.siramkan()
  }

  /** Mengisi kembali antrean dari salinan perangkat (sesudah muat ulang); tidak menimpa yang sudah ada. */
  pulihkan(isi: IsiAntrean | undefined | null): void {
    if (!isi) return
    for (const [id, item] of Object.entries(isi)) if (!this.tunda.has(id)) this.tunda.set(id, item)
    this.beritahu()
  }

  siramkan(): Promise<void> {
    if (this.berjalan) return this.berjalan
    this.berjalan = this.jalankan().finally(() => {
      this.berjalan = null
    })
    return this.berjalan
  }

  private async jalankan(): Promise<void> {
    // Diulang selama antrean terisi lagi oleh jawaban yang masuk saat mengirim.
    let masihAda = true
    while (masihAda && this.tunda.size > 0 && !this.habis) {
      masihAda = false
      for (const [id, item] of [...this.tunda]) {
        let hasil: HasilKirimJawaban
        try {
          hasil = await this.kirim(id, item.jawaban, item.indeks)
        } catch {
          return // jaringan bermasalah: berhenti, jawaban tetap di antrean
        }
        // Hanya dihapus bila belum ditimpa jawaban yang lebih baru.
        if (this.tunda.get(id) === item) this.tunda.delete(id)
        masihAda = true
        if (hasil && hasil.expired) {
          this.habis = true
          this.tunda.clear()
          break
        }
      }
      this.beritahu()
    }
  }

  private beritahu(): void {
    this.saatBerubah?.(Object.fromEntries(this.tunda))
  }
}
