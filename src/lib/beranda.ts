/**
 * Ke mana tiap role dipulangkan saat ia tiba di Sora tanpa tujuan tertentu —
 * lewat root, atau sesudah berhasil masuk.
 *
 * Satu peta untuk keduanya, karena pertanyaannya memang satu: di mana orang ini
 * berada di Sora. Dua salinan yang pelan-pelan menyimpang berarti mengetik
 * alamat Sora dan menekan tombol "Masuk" berujung di tempat berbeda.
 *
 * Sejak `/practice` pensiun, hanya staf yang punya tempat di sini. Sora adalah
 * ALAT PENYUSUN SOAL; yang MENGERJAKAN soal — keluarga bimbel, murid, pelanggan
 * langganan — semuanya ada di `/belajar` milik aplikasi Tera. Karena itu peta
 * ini tinggal dua baris, dan sisanya dipulangkan dengan kalimat yang menyebut
 * ke mana harus pergi, bukan sekadar ditolak.
 */
export const BERANDA: Record<string, string> = {
  admin: "/dashboard",
  tutor: "/dashboard",
};

export const TANPA_BERANDA = "/login?error=tanpa-beranda";

export function berandaUntuk(role: string | null | undefined): string {
  if (!role) return "/login";
  return BERANDA[role] ?? TANPA_BERANDA;
}
