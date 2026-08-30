/**
 * Kosongkan seluruh soal dan jejak pengerjaannya, setelah `backup:soal`.
 *
 * Pasangan dari `backup-soal.ts`. Skrip ini menolak jalan kalau cadangannya
 * tidak lengkap: tiap tabel dibandingkan dengan `manifest.json`, dan baris yang
 * ada di database tapi tidak terhitung di cadangan menghentikannya. Urutan
 * yang salah cuma bikin repot; menghapus yang belum tersalin tidak bisa dibatalkan.
 *
 * Yang tidak disentuh: taksonomi kurikulum (`subjects`, `curriculum_topics`,
 * `curriculum_topic_groups`), sesi belajar (`sessions`), penilaian tutor
 * (`assessments`, `assessment_results`), murid, dan seluruh sisi keuangan.
 * Soal baru nanti digantung ke topik yang sama.
 *
 * Sebagian jejak pengerjaan murid tetap runtuh lewat `on delete cascade` —
 * jawaban tidak bisa hidup tanpa soal yang ditanyakannya. Tabel-tabel itu
 * dihitung sebelum dan sesudah (CASCADE_WATCH) supaya kerugiannya kelihatan
 * angkanya, bukan ditemukan belakangan.
 *
 * Jalankan: npm run wipe:soal -- --yes
 *           npm run wipe:soal -- --yes backups/soal-2026-08-30-...   (cadangan tertentu)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient } from "./admin-db";
import { CASCADE_WATCH, SOAL_TABLES } from "./soal-tables";

const db = adminClient();
const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const explicitDir = args.find((a) => !a.startsWith("--"));

/** Cadangan terbaru di `backups/`, kecuali ada yang ditunjuk di baris perintah. */
function backupDir(): string {
  if (explicitDir) {
    const dir = join(process.cwd(), explicitDir);
    if (!existsSync(join(dir, "manifest.json"))) {
      throw new Error(`Bukan folder cadangan: ${explicitDir}`);
    }
    return dir;
  }
  const root = join(process.cwd(), "backups");
  const dirs = existsSync(root)
    ? readdirSync(root)
        .filter((d) => d.startsWith("soal-") && existsSync(join(root, d, "manifest.json")))
        .sort()
    : [];
  if (dirs.length === 0) {
    throw new Error("Belum ada cadangan. Jalankan `npm run backup:soal` dulu.");
  }
  return join(root, dirs[dirs.length - 1]);
}

async function countRows(table: string): Promise<number | null> {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(`Gagal menghitung ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function main() {
  const dir = backupDir();
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as {
    dibuat: string;
    tabel: Record<string, number>;
    tabelTidakAda: string[];
  };
  console.log(`Cadangan: ${dir}\nDibuat  : ${manifest.dibuat}\n`);

  // 1. Periksa dulu semuanya, baru hapus. Berhenti di tengah akan meninggalkan
  //    paket tanpa soal — keadaan yang lebih membingungkan daripada dua-duanya utuh.
  const plan: { table: string; column: string; rows: number }[] = [];
  for (const table of SOAL_TABLES) {
    const live = await countRows(table);
    if (live === null) continue;
    const saved = manifest.tabel[table];
    if (saved === undefined) {
      throw new Error(`${table} ada di database tapi tidak ada di cadangan. Ulangi backup:soal.`);
    }
    if (live > saved) {
      throw new Error(
        `${table}: ${live} baris di database, cuma ${saved} di cadangan. ` +
          "Ada yang masuk setelah backup — ulangi `npm run backup:soal`.",
      );
    }
    if (live === 0) {
      console.log(`  ${table}: sudah kosong`);
      continue;
    }
    // PostgREST menolak DELETE tanpa filter. Kolom pertama tiap tabel ini
    // `not null` (id, atau bagian pertama primary key gabungan), jadi
    // `is not null` mencakup seluruh baris tanpa perlu menyebut satu per satu.
    const saveddata = JSON.parse(readFileSync(join(dir, `${table}.json`), "utf-8")) as Record<
      string,
      unknown
    >[];
    const column = "id" in (saveddata[0] ?? {}) ? "id" : Object.keys(saveddata[0] ?? {})[0];
    if (!column) throw new Error(`${table}: tidak tahu kolom penyaring; cadangannya kosong.`);
    plan.push({ table, column, rows: live });
  }

  if (plan.length === 0) {
    console.log("\nTidak ada yang perlu dihapus.");
    return;
  }

  const total = plan.reduce((a, p) => a + p.rows, 0);
  console.log(`\nAkan dihapus ${total} baris:`);
  for (const p of plan) console.log(`  ${p.table}: ${p.rows}`);

  const cascadeBefore: Record<string, number> = {};
  for (const table of CASCADE_WATCH) {
    const n = await countRows(table);
    if (n !== null) cascadeBefore[table] = n;
  }
  console.log("\nIkut runtuh lewat cascade (sebelum):");
  for (const [t, n] of Object.entries(cascadeBefore)) console.log(`  ${t}: ${n}`);

  if (!confirmed) {
    console.log("\nIni baru pratinjau. Tambahkan --yes untuk benar-benar menghapus.");
    return;
  }

  console.log("");
  for (const { table, column } of plan) {
    const { error } = await db.from(table).delete().not(column, "is", null);
    if (error) throw new Error(`Gagal menghapus ${table}: ${error.message}`);
    const sisa = await countRows(table);
    console.log(`  ${table}: kosong (sisa ${sisa})`);
  }

  console.log("\nAkibat cascade:");
  for (const [t, before] of Object.entries(cascadeBefore)) {
    const after = await countRows(t);
    console.log(`  ${t}: ${before} -> ${after}`);
  }

  console.log(`\nSelesai. Pulihkan dari ${dir} kalau ternyata salah.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
