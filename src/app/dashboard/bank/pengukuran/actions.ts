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

/**
 * Mengaktifkan seluruh butir draf sebuah topik sekaligus.
 *
 * SATU KLIK UNTUK SATU NASKAH, bukan satu klik per butir. Naskah masuk
 * berombongan — satu topik utuh sekali impor, 46 butir untuk D-01 — dan yang
 * diputuskan orang sesudah membacanya juga satu: naskah ini boleh dikerjakan
 * murid. Menyuruhnya menekan tombol yang sama 46 kali bukan pemeriksaan
 * tambahan, cuma pengulangan; yang benar-benar memeriksa tiap butir adalah
 * pemeriksa impor, dan itu sudah jalan sebelum butirnya sampai ke sini.
 *
 * YANG DISENTUH HANYA `draf`. Butir yang DITARIK sengaja tidak ikut: ia
 * dihentikan karena ada yang salah padanya, dan menghidupkannya kembali lewat
 * tombol massal adalah cara paling mudah mengembalikan kesalahan yang baru saja
 * dihentikan tanpa ada yang menyadarinya. Trigger di database (migrasi tera
 * 185) menolaknya juga — di sini ia tidak diminta sejak awal, supaya seluruh
 * aksinya tidak gagal gara-gara satu butir yang memang tidak boleh ikut.
 */
export async function aktifkanSemuaDraf(
  _sebelumnya: string | null,
  formData: FormData,
): Promise<string> {
  const topikId = String(formData.get("topikId") ?? "");
  if (!topikId) return "Topik tidak dikenali.";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_bank_items")
    .update({ status_verifikasi: "aktif" })
    .eq("topik_id", topikId)
    .eq("status_verifikasi", "draf")
    .select("id");

  if (error) return `Gagal mengaktifkan: ${error.message}`;

  const jumlah = data?.length ?? 0;
  revalidatePath("/dashboard/bank/pengukuran");
  revalidatePath(`/dashboard/bank/pengukuran/${topikId}`);

  if (jumlah === 0) return "Tidak ada butir draf di topik ini.";
  return `${jumlah} butir aktif. Sekarang bisa dikerjakan murid.`;
}
