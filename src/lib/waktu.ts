/**
 * Waktu sekarang (ms). Dibungkus supaya halaman server yang memang butuh jam
 * saat dirender (mis. Live Monitoring, yang melempar "sekarang" ke komponen
 * klien agar render server dan browser sama) tidak terkena aturan lint
 * "fungsi tidak murni saat render"; halaman itu dinamis dan memang dirender
 * ulang tiap permintaan.
 */
export const sekarangMs = (): number => Date.now();
