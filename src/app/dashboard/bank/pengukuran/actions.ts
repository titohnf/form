"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Menyusun paket sebuah topik dari butir yang sudah ditandai (PRD FR2).
 *
 * Seluruh aturannya ada di `semai_paket_topik()` (migrasi tera 145/147): satu
 * paket latihan per level Bloom, satu paket ujian, dan paket yang sudah pernah
 * dikerjakan murid tidak disentuh. Aksi ini sengaja tidak menambahkan aturan
 * sendiri — dua tempat yang sama-sama memutuskan isi paket adalah dua tempat
 * yang suatu hari akan berbeda pendapat.
 *
 * Aman diulang. Menambah butir baru ke bank lalu menekan tombolnya lagi akan
 * memperbarui paket yang belum tersentuh, bukan membuat paket kedua.
 *
 * `topikId` datang dari form, jadi tidak dipercaya di sini: gerbangnya RLS
 * admin pada `paket_topik` dan syarat `topik` yang ada di fungsi itu sendiri.
 */
export async function susunPaket(_sebelumnya: string | null, formData: FormData): Promise<string> {
  const topikId = String(formData.get("topikId") ?? "");
  if (!topikId) return "Topik tidak dikenali.";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("semai_paket_topik", { p_topik_id: topikId });

  if (error) return `Gagal menyusun paket: ${error.message}`;

  revalidatePath("/dashboard/bank/pengukuran");

  const paket = (data ?? []) as { jumlah_butir: number | string }[];
  if (paket.length === 0) {
    return "Belum ada butir yang bisa dipaketkan untuk topik ini.";
  }

  const butir = paket.reduce((t, p) => t + Number(p.jumlah_butir ?? 0), 0);
  return `${paket.length} paket tersusun, berisi ${butir} butir.`;
}

/**
 * Membuka atau menutup sebuah topik untuk murid (kolom `topik.aktif`).
 *
 * Ini satu-satunya saklar yang menentukan sebuah topik muncul di peta murid:
 * `topik_tersedia()` (migrasi tera 146) hanya menyajikan topik aktif. Sampai
 * sekarang saklar itu cuma bisa disentuh lewat SQL Editor, yang berarti
 * keputusan yang paling terlihat oleh anak — topik apa yang boleh ia kerjakan
 * — adalah keputusan yang tidak punya layar.
 *
 * TIDAK ADA SYARAT "HARUS PUNYA PAKET" di sini, dan itu sengaja. Ada urutan
 * kerja yang sah di mana topik dibuka lebih dulu lalu diisi, dan aksi yang
 * menolaknya akan memaksa orang kembali ke SQL Editor — persis keadaan yang
 * sedang diperbaiki. Yang benar adalah MENGATAKAN akibatnya di layar sebelum
 * tombolnya ditekan, bukan melarang.
 */
export async function setAktifTopik(
  _sebelumnya: string | null,
  formData: FormData,
): Promise<string> {
  const topikId = String(formData.get("topikId") ?? "");
  const aktif = formData.get("aktif") === "1";
  if (!topikId) return "Topik tidak dikenali.";

  const supabase = await createClient();
  const { error } = await supabase.from("topik").update({ aktif }).eq("id", topikId);

  if (error) return `Gagal mengubah status topik: ${error.message}`;

  revalidatePath("/dashboard/bank/pengukuran");
  return aktif ? `${topikId} dibuka untuk murid.` : `${topikId} ditutup dari peta murid.`;
}
