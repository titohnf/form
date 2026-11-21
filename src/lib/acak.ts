/**
 * Pengacakan yang STABIL per peserta: benihnya id percobaan, jadi urutan yang
 * sama muncul lagi setelah halaman dimuat ulang. Pengacakan acak biasa akan
 * mengubah urutan soal di tengah ujian dan merusak nomor soal yang tersimpan.
 */
import type { McqOptions, Question } from "@/lib/types";

/** FNV-1a: teks menjadi bilangan 32-bit. */
function benih(teks: string): number {
  let h = 2166136261;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: pembangkit bilangan acak kecil dengan benih. */
function pembangkit(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kocok<T>(daftar: T[], acak: () => number): T[] {
  const hasil = [...daftar];
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

/**
 * Urutan soal dan urutan pilihan untuk satu peserta. Kunci dan jawaban tidak
 * terpengaruh: jawaban disimpan per id soal dan per TEKS pilihan, bukan per
 * posisi, sehingga penilaian sama persis dengan urutan aslinya.
 */
export function susunUntukPeserta(
  soal: Question[],
  idPercobaan: string,
  acakSoal: boolean,
  acakPilihan: boolean,
): Question[] {
  if (!acakSoal && !acakPilihan) return soal;
  const acak = pembangkit(benih(idPercobaan));
  const urut = acakSoal ? kocok(soal, acak) : soal;
  if (!acakPilihan) return urut;
  return urut.map((q) => {
    if (q.type !== "mcq_single" && q.type !== "mcq_multi") return q;
    const opsi = q.options as McqOptions | null;
    if (!opsi?.choices) return q;
    return { ...q, options: { ...opsi, choices: kocok(opsi.choices, pembangkit(benih(idPercobaan + q.id))) } };
  });
}
