/** Apakah sebuah jawaban dianggap sudah diisi. Dipakai layar ujian (warna nomor) dan layar pemantauan. */
export function terjawab(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some(terjawab);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(terjawab);
  return true; // boolean dan angka, termasuk false dan 0
}
