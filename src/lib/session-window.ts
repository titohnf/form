/**
 * Awal jendela daftar sesi yang boleh ditugaskan: dua minggu ke belakang.
 *
 * Jendelanya di sekitar hari ini, bukan "terbaru": jadwal Tera terisi berbulan
 * ke depan, jadi mengurutkan menurun lalu memotong beberapa baris hanya
 * menampilkan sesi paling jauh dan mengubur sesi minggu ini. Batas belakangnya
 * ada supaya paket soal masih bisa ditugaskan ke sesi yang baru saja lewat.
 *
 * Tinggal di modul sendiri karena `Date.now()` tidak boleh dipanggil langsung
 * di badan komponen (aturan kemurnian React Compiler).
 */
export function sessionWindowStart(): string {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
}
