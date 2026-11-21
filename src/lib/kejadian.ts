/**
 * Jenis kejadian yang dicatat selama peserta mengerjakan try out bertampilan
 * TKA. Harus sama dengan `check` di migrasi Tera 223 (`attempt_events.kind`).
 *
 * Yang dicatat hanya untuk dinilai tutor; tidak pernah mengubah nilai atau
 * mengirim jawaban paksa.
 */
export const JENIS_KEJADIAN = [
  "hilang_fokus",
  "kembali",
  "layar_penuh_keluar",
  "salin",
  "cetak",
  "klik_kanan",
  "tombol_terlarang",
  "screenshot_key",
] as const;

export type JenisKejadian = (typeof JENIS_KEJADIAN)[number];

export const LABEL_KEJADIAN: Record<JenisKejadian, string> = {
  hilang_fokus: "Meninggalkan halaman ujian",
  kembali: "Kembali ke halaman ujian",
  layar_penuh_keluar: "Keluar dari layar penuh",
  salin: "Mencoba menyalin soal",
  cetak: "Mencoba mencetak",
  klik_kanan: "Membuka menu klik kanan",
  tombol_terlarang: "Menekan pintasan terlarang",
  screenshot_key: "Menekan tombol PrintScreen",
};
