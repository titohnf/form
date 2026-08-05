const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/**
 * "3 hari lalu", "sekitar 4 jam lalu" — jarak dari `iso` ke `now`.
 *
 * `now` dioper, tidak dibaca dari `Date.now()`, karena ini dipanggil saat
 * render komponen (aturan kemurnian React Compiler) dan supaya semua baris di
 * satu daftar diukur terhadap titik waktu yang sama.
 *
 * Memakai `Intl.RelativeTimeFormat` ketimbang menambah `date-fns`: yang
 * dibutuhkan hanya satu fungsi ini, dan bulan/tahun di sini memang perkiraan
 * kasar (30/365 hari) — cukup untuk label "terakhir diperbarui".
 */
/**
 * Titik waktu untuk mengukur `relativeTime`, dibaca sekali per render.
 *
 * Ada sebagai fungsi tersendiri karena `Date.now()` tidak boleh dipanggil
 * langsung di badan komponen (aturan kemurnian React Compiler) — sama seperti
 * `sessionWindowStart`.
 */
export function nowMs(): number {
  return Date.now();
}

export function relativeTime(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);

  if (abs < 60 * 1000) return "baru saja";

  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "baru saja";
}
