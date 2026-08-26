/**
 * PostgREST memulangkan paling banyak 1000 baris per permintaan, dan diam saja
 * soal itu: query tanpa `.range()` yang menyentuh baris ke-1001 kehilangan
 * sisanya tanpa error. Halaman yang mengaku menampilkan "semua" harus mengambil
 * berhalaman, atau ia akan berbohong begitu datanya tumbuh.
 *
 * `MAX_PAGES` ada supaya satu halaman tidak diam-diam berubah jadi dua puluh
 * perjalanan ke Singapura. Kalau kena, pemanggil menerima `truncated: true` dan
 * wajib mengatakannya di layar, bukan menyembunyikannya.
 *
 * Selalu urutkan dengan pemecah seri yang unik (mis. `id`) di query yang
 * dioper: dua baris dengan kunci urut sama bisa bertukar tempat antar
 * permintaan, dan satu akan terlewat sementara satu lagi terhitung dua kali.
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 12;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data } = await page(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** `in(...)` masuk ke query string, jadi daftar id panjang dipecah. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
