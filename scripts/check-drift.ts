/**
 * Bandingkan migrasi di repo `tera` dengan skema yang benar-benar hidup di
 * database.
 *
 * Ditulis setelah menemukan dua penyimpangan dalam satu sesi: dua tabel yang
 * ada di migrasi tapi tidak ada di database (`monthly_report_notes`,
 * `announcements`), dan satu trigger yang isinya berbeda dari repo. Dua
 * kejadian itu menunjukkan pola: database produksi bukan hasil menjalankan
 * berurutan migrasi di repo ini.
 *
 * Yang bisa diperiksa dari sisi klien hanyalah PERMUKAAN skema — tabel, kolom,
 * dan fungsi yang dipanggil lewat RPC. Isi fungsi, definisi trigger, dan
 * policy RLS tidak terlihat dari sini; untuk itu perlu membandingkan dump
 * `pg_dump --schema-only` dengan repo. Batas itu disebut di ringkasan supaya
 * hasil "tidak ada masalah" tidak dibaca lebih jauh daripada yang ia klaim.
 *
 * Jalankan: npm run check:drift
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const MIGRATIONS =
  process.env.TERA_MIGRATIONS ??
  join(process.cwd(), "..", "tera", "supabase", "migrations");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** Tabel dan kolom yang dijanjikan migrasi, dibaca dari SQL-nya. */
function expectedSchema(): { tables: Map<string, Set<string>>; functions: Set<string> } {
  const tables = new Map<string, Set<string>>();
  const functions = new Set<string>();
  const dropped = new Set<string>();

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf-8");

    for (const m of sql.matchAll(/create table (?:if not exists )?([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) {
      const cols = new Set<string>();
      for (const line of m[2].split("\n")) {
        const c = line.trim().match(/^([a-z_]+)\s+(uuid|text|int|integer|numeric|boolean|jsonb|timestamptz|date|user_role|session_status|attendance_status)/i);
        if (c && !["primary", "unique", "foreign", "constraint", "check"].includes(c[1])) {
          cols.add(c[1]);
        }
      }
      tables.set(m[1], cols);
    }

    for (const m of sql.matchAll(/alter table ([a-z_]+)\s+add column (?:if not exists )?([a-z_]+)/gi)) {
      tables.get(m[1])?.add(m[2]);
    }
    // Kolom dan fungsi yang dibuang lagi oleh migrasi berikutnya. Tanpa ini
    // pemeriksa akan melaporkan `classes.subject_id` (dipindah ke
    // class_subjects di 014) dan `seed_tka_question` (dihapus sendiri di akhir
    // seed 062) sebagai hilang — dua alarm palsu yang membuat laporan ini
    // gampang diabaikan.
    for (const m of sql.matchAll(/alter table ([a-z_]+)\s+drop column (?:if exists )?([a-z_]+)/gi)) {
      tables.get(m[1])?.delete(m[2]);
    }
    for (const m of sql.matchAll(/drop table (?:if exists )?([a-z_]+)/gi)) dropped.add(m[1]);
    // Fungsi trigger (`returns trigger`) dilewati: PostgREST tidak
    // mengekspornya sebagai RPC, jadi ketidakhadirannya di daftar bukan bukti
    // apa pun.
    for (const m of sql.matchAll(
      /create (?:or replace )?function ([a-z_]+)\s*\([\s\S]{0,400}?returns\s+(\w+)/gi,
    )) {
      if (m[2].toLowerCase() !== "trigger") functions.add(m[1]);
    }

    // Dijalankan SETELAH create: seed 062 membuat lalu membuang
    // `seed_tka_question` di file yang sama, jadi urutannya menentukan.
    for (const m of sql.matchAll(/drop function (?:if exists )?([a-z_]+)/gi)) {
      functions.delete(m[1]);
    }
  }

  // `drop table` diikuti `create table` di migrasi berikutnya tetap dihitung
  // ada; yang dibuang hanya yang tidak pernah dibuat ulang.
  for (const t of dropped) if (!tables.has(t)) tables.delete(t);
  return { tables, functions };
}

async function main() {
  const { tables, functions } = expectedSchema();
  console.log(`Repo menjanjikan ${tables.size} tabel dan ${functions.size} fungsi.\n`);

  const missingTables: string[] = [];
  const missingColumns: string[] = [];

  for (const [table, cols] of tables) {
    // Tanpa `head: true`: pada permintaan HEAD, PostgREST tidak mengirim badan
    // respons sehingga error "tabel tidak ada" tidak pernah sampai ke klien —
    // semua tabel akan tampak ada.
    const { error } = await db.from(table).select("*").limit(1);
    if (error) {
      missingTables.push(table);
      continue;
    }
    // Kolom diperiksa sekaligus; PostgREST menyebut nama kolom pertama yang
    // tidak dikenalnya, jadi sisanya diperiksa satu per satu kalau gagal.
    const { error: colErr } = await db.from(table).select([...cols].join(",")).limit(1);
    if (colErr) {
      for (const c of cols) {
        const { error: one } = await db.from(table).select(c).limit(1);
        if (one) missingColumns.push(`${table}.${c}`);
      }
    }
  }

  // Fungsi diperiksa lewat spesifikasi OpenAPI PostgREST, bukan dipanggil.
  // Memanggilnya berarti menebak argumen — dan sebagian fungsi di sini punya
  // efek samping (`start_assessment_attempt` membuat attempt, `seed_tka_question`
  // menulis soal). Memanggil tanpa argumen juga tidak bisa dipakai sebagai
  // bukti: PostgREST mencocokkan nama DAN tanda tangan, sehingga fungsi yang
  // butuh argumen selalu dilaporkan "tidak ditemukan".
  const spec = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
  }).then((r) => r.json() as Promise<{ paths?: Record<string, unknown> }>);
  const exposed = new Set(
    Object.keys(spec.paths ?? {})
      .filter((p) => p.startsWith("/rpc/"))
      .map((p) => p.slice(5)),
  );
  const missingFunctions = [...functions].filter((fn) => !exposed.has(fn));

  const report = (label: string, items: string[]) => {
    console.log(`${label}: ${items.length === 0 ? "tidak ada" : ""}`);
    for (const i of items) console.log(`   - ${i}`);
  };
  report("Tabel hilang", missingTables);
  report("Kolom hilang", missingColumns);
  report("Fungsi hilang", missingFunctions);

  console.log(
    "\nCatatan: pemeriksaan ini hanya melihat permukaan skema (tabel, kolom, fungsi).\n" +
      "Isi fungsi, definisi trigger, dan policy RLS TIDAK terlihat dari sisi klien —\n" +
      "drift handle_new_user() yang kita temukan tidak akan tertangkap di sini.\n" +
      "Untuk itu bandingkan `supabase db dump --schema-only` dengan repo.",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
