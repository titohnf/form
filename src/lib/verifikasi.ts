import { missingColumn } from "./missing-column";

/**
 * Tahap verifikasi sebuah butir soal, dari draf sampai layak dikerjakan murid.
 *
 * Alurnya berasal dari dokumen fondasi Bagian 3.12, dan alasannya tidak
 * berlebihan: kunci jawaban yang salah meruntuhkan validitas seluruh pengukuran
 * yang dibangun di atasnya. Karena itu verifikasi matematis dipisah dari review
 * pedagogis — yang pertama menanyakan "hitungannya benar?", yang kedua
 * "levelnya memang C2, dan distraktornya mencerminkan miskonsepsi nyata?".
 * Satu orang boleh merangkap keduanya di tim kecil; yang tidak boleh dirangkap
 * adalah verifikator dengan penyusun drafnya sendiri (Protokol Uji Coba
 * Bagian 5).
 *
 * Urutannya ditegakkan DI DATABASE lewat trigger (migrasi tera 141). Daftar di
 * sini kembarannya untuk keperluan layar — supaya tombol yang pasti ditolak
 * tidak ditawarkan sejak awal. Kalau keduanya berbeda, yang menang trigger, dan
 * yang terlihat adalah pesan galat dari server; bukan keadaan yang berbahaya,
 * tapi memang harus diubah berpasangan.
 */
export type StatusVerifikasi =
  | "draf"
  | "terverifikasi_matematis"
  | "direview_pedagogis"
  | "aktif"
  | "ditarik";

/** Urutan maju. `ditarik` tidak ada di sini: ia cabang, bukan tahap. */
export const TAHAP_VERIFIKASI: StatusVerifikasi[] = [
  "draf",
  "terverifikasi_matematis",
  "direview_pedagogis",
  "aktif",
];

export const LABEL_VERIFIKASI: Record<StatusVerifikasi, string> = {
  draf: "Draf",
  terverifikasi_matematis: "Terverifikasi matematis",
  direview_pedagogis: "Direview pedagogis",
  aktif: "Aktif",
  ditarik: "Ditarik",
};

/** Kalimat yang menjawab "apa artinya soal ini ada di tahap itu". */
export const ARTI_VERIFIKASI: Record<StatusVerifikasi, string> = {
  draf: "Baru ditulis. Belum ada yang memeriksa hitungannya.",
  terverifikasi_matematis:
    "Kunci jawabannya sudah dihitung ulang secara terpisah dan benar.",
  direview_pedagogis:
    "Level Bloom, distraktor, dan bahasanya sudah diperiksa sesuai rubrik.",
  aktif: "Boleh dikerjakan murid.",
  ditarik: "Ditarik dari peredaran. Tidak muncul di mana pun.",
};

/**
 * Status berikutnya yang boleh dipilih dari status sekarang.
 *
 * Cerminan aturan trigger: maju atau mundur satu langkah, ditarik dari mana
 * saja, dan yang sudah ditarik hanya bisa kembali sebagai draf — bukan langsung
 * aktif lagi, karena butir yang pernah ditarik perlu melewati pemeriksaan yang
 * sama seperti butir baru.
 */
export function transisiBoleh(dari: StatusVerifikasi): StatusVerifikasi[] {
  if (dari === "ditarik") return ["draf"];

  const i = TAHAP_VERIFIKASI.indexOf(dari);
  const langkah: StatusVerifikasi[] = [];
  if (i > 0) langkah.push(TAHAP_VERIFIKASI[i - 1]);
  if (i >= 0 && i < TAHAP_VERIFIKASI.length - 1) langkah.push(TAHAP_VERIFIKASI[i + 1]);
  langkah.push("ditarik");
  return langkah;
}

/** Hanya butir `aktif` yang boleh sampai ke murid (FR1). */
export function bolehDikerjakanMurid(status: StatusVerifikasi | null | undefined): boolean {
  return status === "aktif";
}

/**
 * Benar kalau kegagalan ini semata karena kolom `status_verifikasi` belum ada.
 *
 * Pola yang sama dengan `bloom.ts`: skemanya hidup di seri migrasi Tera, jadi
 * kode bisa mendarat lebih dulu daripada kolomnya. Sebelum migrasi 141 jalan,
 * soal tetap tersimpan dan tetap terbaca; yang belum bekerja hanya statusnya.
 */
export function isMissingStatusColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  return missingColumn(error, ["status_verifikasi"]) !== null;
}
