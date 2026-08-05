/**
 * Apakah kegagalan ini semata karena satu kolom belum ada di skema.
 *
 * Skema Sora hidup di seri migrasi Tera, repo yang berbeda, jadi kode bisa
 * mendarat sebelum kolomnya. Alih-alih menuntut urutan deploy yang kaku, jalur
 * tulis di sini mencoba versi lengkapnya dulu lalu menulis ulang tanpa kolom
 * yang hilang — yang gagal cuma fiturnya, bukan pekerjaan yang sedang dilakukan
 * orang. `bank_item_id` sudah memakai pola ini sejak migrasi 082.
 *
 * Mengembalikan nama kolom yang hilang, atau null kalau errornya soal lain.
 */
export function missingColumn(
  error: { code?: string; message?: string } | null,
  candidates: string[],
): string | null {
  if (!error) return null;
  // PGRST204: kolom tak dikenal saat menulis. 42703: saat membaca.
  if (error.code !== "PGRST204" && error.code !== "42703") return null;
  return candidates.find((name) => (error.message ?? "").includes(name)) ?? null;
}

/** Membuang kolom-kolom tertentu dari satu baris, untuk mencoba ulang tanpa mereka. */
export function without<T extends Record<string, unknown>>(row: T, names: string[]): T {
  const copy = { ...row };
  for (const name of names) delete copy[name];
  return copy;
}
