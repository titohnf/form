/**
 * Salin seluruh soal — dan semua yang bisa terseret cascade-nya — ke berkas
 * JSON di luar database, sebelum `wipe:soal` membuangnya.
 *
 * Ditulis untuk satu momen tertentu: soal yang ada sekarang lahir dari masa
 * coba-coba, dan pemiliknya mau mulai dari kosong. Cadangan ini yang membuat
 * "mulai dari kosong" bisa dibatalkan.
 *
 * Hasilnya satu folder `backups/soal-<tanggal>/`, satu berkas JSON per tabel,
 * plus `manifest.json` berisi jumlah baris tiap tabel. Angka di manifest itulah
 * yang dibaca `wipe:soal` untuk memastikan ia hanya menghapus yang sudah
 * tersalin. Folder `backups/` tidak masuk git: isinya jawaban murid.
 *
 * Daftar gambar di bucket `question-images` ikut dicatat, tapi berkasnya TIDAK
 * diunduh dan nanti tidak ikut dihapus — biarkan menganggur di Storage
 * daripada hilang bersama soal yang menunjuknya.
 *
 * Jalankan: npm run backup:soal
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient } from "./admin-db";
import { BACKUP_TABLES } from "./soal-tables";

const db = adminClient();
const PAGE = 1000;

/** Ambil seluruh isi satu tabel; PostgREST membatasi satu permintaan 1000 baris. */
async function fetchAll(table: string): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").range(from, from + PAGE - 1);
    if (error) {
      // Tabel yang belum ada di database ini bukan kegagalan: skema Tera dan
      // Sora berbagi satu proyek, dan sebagian tabel `practice_*` lahir belakangan.
      if (/does not exist|schema cache/i.test(error.message)) return null;
      throw new Error(`Gagal membaca ${table}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const dir = join(process.cwd(), "backups", `soal-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const counts: Record<string, number> = {};
  const missing: string[] = [];

  for (const table of BACKUP_TABLES) {
    const rows = await fetchAll(table);
    if (rows === null) {
      missing.push(table);
      console.log(`  ${table}: tidak ada di database ini, dilewati`);
      continue;
    }
    writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
    counts[table] = rows.length;
    console.log(`  ${table}: ${rows.length} baris`);
  }

  // Gambar stimulus: dicatat saja, tidak diunduh dan tidak dihapus.
  const { data: images } = await db.storage.from("question-images").list("tka", { limit: 1000 });
  writeFileSync(
    join(dir, "storage-question-images.json"),
    JSON.stringify(images ?? [], null, 2),
  );

  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(
      { dibuat: new Date().toISOString(), tabel: counts, tabelTidakAda: missing },
      null,
      2,
    ),
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nCadangan tersimpan: ${dir}`);
  console.log(`Total ${total} baris dari ${Object.keys(counts).length} tabel.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
