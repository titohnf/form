/**
 * Taksonomi Bloom, sumbu kedua tiap soal di samping topiknya.
 *
 * Disimpan sebagai angka 1–6, bukan teks "C1", supaya bisa diurutkan dan
 * dijumlahkan tanpa membedah string — sebaran per topik dihitung dengan
 * membandingkan angka, dan tangga C1→C4 di satu topik memang punya arah.
 *
 * Null berarti belum ditetapkan. Ratusan soal sudah ada sebelum kolom ini,
 * jadi "belum berlabel" harus jadi keadaan yang sah, bukan nol yang menyamar
 * sebagai level.
 */
export const BLOOM_LEVELS = [
  { value: 1, code: "C1", label: "Mengingat" },
  { value: 2, code: "C2", label: "Memahami" },
  { value: 3, code: "C3", label: "Menerapkan" },
  { value: 4, code: "C4", label: "Menganalisis" },
  { value: 5, code: "C5", label: "Mengevaluasi" },
  { value: 6, code: "C6", label: "Mencipta" },
] as const;

export type BloomLevel = (typeof BLOOM_LEVELS)[number]["value"];

/** "C3 — Menerapkan", atau null kalau levelnya belum ditetapkan. */
export function bloomLabel(level: number | null | undefined): string | null {
  const found = BLOOM_LEVELS.find((b) => b.value === level);
  return found ? `${found.code} — ${found.label}` : null;
}

/**
 * Benar kalau kegagalan ini semata karena kolom `bloom_level` belum ada.
 *
 * Skemanya hidup di seri migrasi Tera, bukan di repo ini, jadi kode bisa
 * mendarat lebih dulu daripada kolomnya — sama seperti yang dilakukan
 * `bank_item_id` sebelum migrasi 082. Sebelum migrasinya jalan, soal tetap
 * tersimpan; yang belum bekerja hanya labelnya.
 */
export function isMissingBloomColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (!(error.message ?? "").includes("bloom_level")) return false;
  // PGRST204: kolom tak dikenal saat menulis. 42703: saat membaca.
  return error.code === "PGRST204" || error.code === "42703";
}

/**
 * Sebaran level di satu topik, urut C1→C6, mis. "C1 2 · C2 3 · C3 3 · C4 2".
 *
 * Level yang tidak terpakai tidak dilaporkan sebagai kekurangan: topik yang
 * wajarnya berhenti di C4 tidak sedang kurang C5 dan C6, dan menandainya merah
 * hanya melatih orang mengabaikan peringatan.
 */
export function bloomSpread(levels: (number | null | undefined)[]): {
  filled: { code: string; count: number }[];
  unlabelled: number;
} {
  const counts = new Map<number, number>();
  let unlabelled = 0;

  for (const level of levels) {
    const known = BLOOM_LEVELS.find((b) => b.value === level);
    if (!known) {
      unlabelled += 1;
      continue;
    }
    counts.set(known.value, (counts.get(known.value) ?? 0) + 1);
  }

  return {
    filled: BLOOM_LEVELS.filter((b) => counts.has(b.value)).map((b) => ({
      code: b.code,
      count: counts.get(b.value)!,
    })),
    unlabelled,
  };
}
