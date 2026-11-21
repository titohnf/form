/**
 * Analisis hasil try out menurut KOMPETENSI: persentase benar per elemen,
 * sub-elemen, kompetensi, dan indikator — susunan yang sama dengan halaman daya
 * serap Pusmendik. Dipakai tiga layar: Hasil di Sora (salinan ini), menu Hasil Try Out
 * di panel admin Tera, dan Laporan di akun keluarga.
 *
 * Fungsi MURNI: tidak membaca database, hanya menghitung dari soal dan skor
 * yang diberikan. Berpasangan dengan `lib/reports/kompetensi-tryout.ts` di repo
 * Tera; keduanya dua repo tanpa paket bersama, jadi harus sama persis.
 *
 * Persentase sebuah simpul = jumlah skor yang diperoleh ÷ jumlah skor maksimum
 * seluruh soal di bawahnya, dihitung pada SEMUA percobaan yang dilibatkan.
 * Jadi soal bertabel dan pilihan ganda kompleks dihitung dari skor sebagiannya,
 * bukan dipaksa benar atau salah, dan soal berbobot besar memengaruhi lebih
 * banyak. Soal yang belum dipetakan tidak ikut pohon (dihitung terpisah).
 */

export interface PetaKompetensi {
  elemen: { nama: string; nasional: number | null }
  subelemen: { nama: string; nasional: number | null }
  kompetensi: { nama: string; nasional: number | null }
  indikator: { nama: string; nomor: number | null; nasional: number | null }
  sumber?: string
}

export interface SoalAnalisis {
  id: string
  /** Nomor soal pada naskah (urutan asli), mulai dari 1. */
  nomor: number
  bobot: number
  kompetensi: PetaKompetensi | null
}

export interface SkorAnalisis {
  attemptId: string
  questionId: string
  /** Skor mutlak yang diperoleh (bukan persen). */
  skor: number
}

export type TingkatKompetensi = 'elemen' | 'subelemen' | 'kompetensi' | 'indikator'

export interface Simpul {
  /** Kunci stabil dari jalurnya, untuk mencocokkan simpul antar-perhitungan. */
  kunci: string
  nama: string
  tingkat: TingkatKompetensi
  /** 0–100, atau null bila tidak ada percobaan yang dihitung. */
  persen: number | null
  /** Capaian nasional di sumbernya, sebagai pembanding. */
  nasional: number | null
  /** Pembanding lain yang disisipkan pemanggil (mis. rata-rata kelas). */
  pembanding: number | null
  jumlahSoal: number
  nomorSoal: number[]
  anak: Simpul[]
}

/** Skor satu jawaban: nilai tutor menimpa nilai otomatis; kosong dihitung 0. */
export function skorJawaban(auto: number | null | undefined, manual: number | null | undefined): number {
  const n = manual ?? auto ?? 0
  return Number.isFinite(Number(n)) ? Number(n) : 0
}

interface Akumulasi {
  nama: string
  tingkat: TingkatKompetensi
  nasional: number | null
  skor: number
  maks: number
  soal: SoalAnalisis[]
  anak: Map<string, Akumulasi>
}

function simpul(kunci: string, a: Akumulasi): Simpul {
  return {
    kunci,
    nama: a.nama,
    tingkat: a.tingkat,
    persen: a.maks > 0 ? (a.skor / a.maks) * 100 : null,
    nasional: a.nasional,
    pembanding: null,
    jumlahSoal: a.soal.length,
    nomorSoal: a.soal.map((s) => s.nomor).sort((x, y) => x - y),
    anak: [...a.anak.entries()].map(([k, v]) => simpul(k, v)),
  }
}

/**
 * Menyusun pohon kompetensi untuk sekumpulan percobaan (satu siswa, atau satu
 * kelas). `attemptIds` yang dilibatkan HARUS percobaan yang sudah dikirim.
 */
export function susunPohon(soal: SoalAnalisis[], skor: SkorAnalisis[], attemptIds: string[]): Simpul[] {
  const dipakai = new Set(attemptIds)
  const jumlah = dipakai.size
  const perSoal = new Map<string, number>()
  for (const s of skor) {
    if (!dipakai.has(s.attemptId)) continue
    perSoal.set(s.questionId, (perSoal.get(s.questionId) ?? 0) + s.skor)
  }

  const akar = new Map<string, Akumulasi>()
  for (const s of soal) {
    const k = s.kompetensi
    if (!k) continue
    const jalur: [string, string, TingkatKompetensi, number | null][] = [
      [k.elemen.nama, k.elemen.nama, 'elemen', k.elemen.nasional],
      [k.subelemen.nama, k.subelemen.nama, 'subelemen', k.subelemen.nasional],
      [k.kompetensi.nama, k.kompetensi.nama, 'kompetensi', k.kompetensi.nasional],
      [`${k.indikator.nomor ?? s.nomor}`, k.indikator.nama, 'indikator', k.indikator.nasional],
    ]
    let tingkatSekarang = akar
    let prefiks = ''
    for (const [kunciLokal, nama, tingkat, nasional] of jalur) {
      prefiks = `${prefiks}/${kunciLokal}`
      let a = tingkatSekarang.get(prefiks)
      if (!a) {
        a = { nama, tingkat, nasional, skor: 0, maks: 0, soal: [], anak: new Map() }
        tingkatSekarang.set(prefiks, a)
      }
      a.skor += perSoal.get(s.id) ?? 0
      a.maks += s.bobot * jumlah
      a.soal.push(s)
      tingkatSekarang = a.anak
    }
  }
  return [...akar.entries()].map(([kunci, a]) => simpul(kunci, a))
}

/** Menyisipkan persen dari pohon lain (mis. rata-rata kelas) sebagai `pembanding`, dicocokkan lewat `kunci`. */
export function sisipkanPembanding(pohon: Simpul[], pembanding: Simpul[]): Simpul[] {
  const peta = new Map<string, number | null>()
  const kumpul = (s: Simpul[]) => {
    for (const x of s) {
      peta.set(x.kunci, x.persen)
      kumpul(x.anak)
    }
  }
  kumpul(pembanding)
  const pasang = (s: Simpul[]): Simpul[] => s.map((x) => ({ ...x, pembanding: peta.get(x.kunci) ?? null, anak: pasang(x.anak) }))
  return pasang(pohon)
}

/** Semua indikator (daun pohon), dari yang capaiannya TERENDAH. Untuk rujukan penyusunan soal berikutnya. */
export function indikatorTerlemah(pohon: Simpul[], batas = 5): Simpul[] {
  const daun: Simpul[] = []
  const telusuri = (s: Simpul[]) => {
    for (const x of s) {
      if (x.tingkat === 'indikator') daun.push(x)
      else telusuri(x.anak)
    }
  }
  telusuri(pohon)
  return daun
    .filter((d) => d.persen !== null)
    .sort((a, b) => (a.persen as number) - (b.persen as number))
    .slice(0, batas)
}

export interface RingkasanSiswa {
  attemptId: string
  /** Capaian keseluruhan pada soal yang dipetakan, 0–100. */
  persen: number | null
  elemen: Simpul[]
  terlemah: Simpul[]
}

/** Ringkasan per percobaan: capaian per elemen dan tiga indikator terlemahnya. */
export function ringkasPerSiswa(soal: SoalAnalisis[], skor: SkorAnalisis[], attemptIds: string[]): RingkasanSiswa[] {
  return attemptIds.map((id) => {
    const pohon = susunPohon(soal, skor, [id])
    const total = pohon.reduce((n, e) => n + (e.persen === null ? 0 : e.persen * bobotSimpul(e, soal)), 0)
    const bobot = pohon.reduce((n, e) => n + bobotSimpul(e, soal), 0)
    return {
      attemptId: id,
      persen: bobot > 0 ? total / bobot : null,
      elemen: pohon,
      terlemah: indikatorTerlemah(pohon, 3),
    }
  })
}

function bobotSimpul(s: Simpul, soal: SoalAnalisis[]): number {
  const nomor = new Set(s.nomorSoal)
  return soal.filter((x) => nomor.has(x.nomor)).reduce((n, x) => n + x.bobot, 0)
}

/** Berapa soal yang belum dipetakan; bila > 0, laporan perlu mencantumkannya. */
export function jumlahTanpaPeta(soal: SoalAnalisis[]): number {
  return soal.filter((s) => !s.kompetensi).length
}

/** Membulatkan ke satu desimal untuk tampilan; null tetap null. */
export function bulat1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10
}
