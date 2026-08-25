/**
 * Ke mana tiap role dipulangkan saat ia tiba di Sora tanpa tujuan tertentu —
 * lewat root, atau sesudah berhasil masuk.
 *
 * Satu peta untuk keduanya, karena pertanyaannya memang satu: di mana orang ini
 * berada di Sora. Dua salinan yang pelan-pelan menyimpang berarti mengetik
 * alamat Sora dan menekan tombol "Masuk" berujung di tempat berbeda.
 *
 * Role yang tidak terdaftar tidak punya halaman di sini — `mandiri` berlatih di
 * `/belajar` milik repo Tera — jadi ia dipulangkan ke /login dengan kalimat yang
 * menjelaskan itu, bukan dilempar ke /dashboard lalu ditolak proxy seolah
 * akunnya salah.
 */
export const BERANDA: Record<string, string> = {
  admin: "/dashboard",
  tutor: "/dashboard",
  parent: "/practice",
  student: "/practice",
};

export const TANPA_BERANDA = "/login?error=tanpa-beranda";

export function berandaUntuk(role: string | null | undefined): string {
  if (!role) return "/login";
  return BERANDA[role] ?? TANPA_BERANDA;
}
