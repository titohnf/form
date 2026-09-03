import { missingColumn } from "./missing-column";

/**
 * Keadaan sebuah butir soal: sudah di bank, boleh dikerjakan murid, atau
 * dihentikan dari peredaran.
 *
 * DULUNYA EMPAT TAHAP — draf, terverifikasi matematis, direview pedagogis,
 * aktif — mengikuti dokumen fondasi Bagian 3.12. Yang membatalkannya bukan
 * pendapat tentang pentingnya verifikasi, melainkan tempat verifikasi itu
 * benar-benar terjadi: naskah butir disusun di luar sistem dan kunci numeriknya
 * dihitung ulang secara terpisah sebelum diimpor, jadi dua tahap perantara di
 * dalam aplikasi tidak menambah satu pun pemeriksaan — hanya dua klik untuk
 * mencatat pemeriksaan yang sudah selesai di tempat lain. Seribu butir di bank,
 * tidak satu pun pernah singgah di keduanya (migrasi tera 185).
 *
 * Yang menjamin kuncinya benar sekarang ada di luar layar ini: cara naskahnya
 * disusun, dan pemeriksa impor yang menguji tiap kunci dengan `nilai_jawaban()`
 * di database sebelum butirnya masuk.
 *
 * `ditarik` tetap tidak bisa langsung jadi `aktif` — itu satu-satunya
 * perpindahan yang masih dijaga trigger, dan alasannya tetap: butir ditarik
 * karena ada yang salah padanya.
 */
export type StatusVerifikasi = "draf" | "aktif" | "ditarik";

/** Dua keadaan yang berarti. `ditarik` cabang, bukan tahap. */
export const TAHAP_VERIFIKASI: StatusVerifikasi[] = ["draf", "aktif"];

export const LABEL_VERIFIKASI: Record<StatusVerifikasi, string> = {
  draf: "Draf",
  aktif: "Aktif",
  ditarik: "Ditarik",
};

/** Kalimat yang menjawab "apa artinya butir ini ada di keadaan itu". */
export const ARTI_VERIFIKASI: Record<StatusVerifikasi, string> = {
  draf: "Sudah di bank, belum sampai ke murid.",
  aktif: "Boleh dikerjakan murid.",
  ditarik: "Ditarik dari peredaran. Tidak muncul di mana pun.",
};

/**
 * Keadaan yang boleh dipilih dari keadaan sekarang.
 *
 * Cerminan trigger migrasi tera 185: bebas, kecuali butir yang sudah ditarik —
 * ia kembali sebagai draf dulu, lalu diaktifkan dengan sadar.
 */
export function transisiBoleh(dari: StatusVerifikasi): StatusVerifikasi[] {
  if (dari === "ditarik") return ["draf"];
  return dari === "aktif" ? ["draf", "ditarik"] : ["aktif", "ditarik"];
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
