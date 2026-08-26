/**
 * Pindahkan `stimulus_images` ke dalam teks soal sebagai `[gambar: url]`.
 *
 * Latar: gambar soal dulu hidup di kolomnya sendiri dan selalu dirender di
 * atas pertanyaan — posisinya bukan keputusan penyusun soal, melainkan
 * keputusan tata letak yang dibuat sekali untuk semua soal. Sejak isi soal
 * bisa memuat gambar dan tabel di posisi mana pun (`lib/isi-soal.tsx`), kolom
 * itu tidak punya alasan lagi untuk ada, dan editor sudah berhenti menulisinya.
 *
 * Skrip ini yang memindahkan data lamanya. Penandanya ditaruh di ATAS teks,
 * persis seperti tampilan sebelumnya — supaya tidak ada satu soal pun yang
 * berubah tampilannya karena migrasi ini. Menaruhnya di tempat yang lebih
 * masuk akal adalah pekerjaan manusia yang tahu isi soalnya.
 *
 * Dua tabel, karena soal hidup di dua tempat: `question_bank_items` (soal induk
 * di Latihan Soal) dan `questions` (salinannya di dalam paket soal).
 *
 * Kolomnya tidak dikosongkan dan tidak di-DROP: skemanya milik repo Tera, dan
 * membiarkan datanya membuat skrip ini bisa dijalankan ulang tanpa kehilangan
 * apa pun kalau ada yang perlu diperiksa. Yang menjaga soal tidak kebagian dua
 * gambar adalah pemeriksaan "penandanya sudah ada" di bawah.
 *
 * Jalankan simulasi dulu:
 *   npm run migrate:gambar -- --dry-run
 * Baru sungguhan:
 *   npm run migrate:gambar
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const DRY = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

interface Baris {
  id: string;
  prompt: string | null;
  stimulus_images: string[] | null;
}

/** Teks soal dengan penanda gambar di depan, melewati yang sudah ada di sana. */
function gabung(prompt: string, urls: string[]): string | null {
  const baru = urls.filter((u) => u && !prompt.includes(u));
  if (baru.length === 0) return null;
  return [...baru.map((u) => `[gambar: ${u}]`), prompt].join("\n");
}

async function pindahkan(tabel: "question_bank_items" | "questions") {
  const { data, error } = await db
    .from(tabel)
    .select("id, prompt, stimulus_images")
    .not("stimulus_images", "is", null);
  if (error) throw new Error(`${tabel}: ${error.message}`);

  const baris = (data ?? []) as Baris[];
  let diubah = 0;
  let dilewati = 0;

  for (const b of baris) {
    const urls = b.stimulus_images ?? [];
    if (urls.length === 0) continue;

    const prompt = gabung(b.prompt ?? "", urls);
    if (!prompt) {
      dilewati++;
      continue;
    }

    if (!DRY) {
      const { error: e } = await db.from(tabel).update({ prompt }).eq("id", b.id);
      if (e) throw new Error(`${tabel} ${b.id}: ${e.message}`);
    }
    diubah++;
  }

  console.log(
    `${tabel}: ${diubah} soal ${DRY ? "akan dipindahkan" : "dipindahkan"}` +
      (dilewati ? `, ${dilewati} dilewati (penandanya sudah ada)` : ""),
  );
}

async function main() {
  if (DRY) console.log("— simulasi, tidak ada yang ditulis —");
  await pindahkan("question_bank_items");
  await pindahkan("questions");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
