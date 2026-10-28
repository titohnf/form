/**
 * Mengganti seluruh butir pengukuran (bertopik) dengan naskah sungguhan.
 *
 * Tiga fase, dijalankan satu per satu supaya tiap langkah bisa diperiksa:
 *
 *   tsx scripts/ganti-butir-pengukuran.ts cadangan
 *   tsx scripts/ganti-butir-pengukuran.ts hapus --yes
 *   tsx scripts/ganti-butir-pengukuran.ts impor <folder-naskah>
 *
 * `hapus` menolak jalan tanpa cadangan yang jumlah barisnya cocok dengan isi
 * database sekarang. Yang dihapus HANYA yang berpangkal pada butir bertopik:
 * butir latihan bebas (topik_id null) dan seluruh sisi kurikulum tidak disentuh.
 *
 * Urutan hapus mengikuti migrasi 179: jawaban dan sesi jalur peta, keadaan
 * turunannya, lalu keanggotaan paket dan butirnya.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient } from "./admin-db";
import { parseSoalJson } from "../src/lib/soal-json";

const db = adminClient();
const PAGE = 1000;
const [fase, ...args] = process.argv.slice(2);

type Baris = Record<string, unknown>;

async function ambilSemua(
  tabel: string,
  saring?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<Baris[]> {
  const hasil: Baris[] = [];
  for (let dari = 0; ; dari += PAGE) {
    let q = db.from(tabel).select("*").range(dari, dari + PAGE - 1);
    if (saring) q = saring(q);
    const { data, error } = await q;
    // Tabel yang belum lahir di database ini (migrasi belum terpasang) bukan galat.
    if (error && /does not exist|schema cache/i.test(error.message)) return [];
    if (error) throw new Error(`Gagal membaca ${tabel}: ${error.message}`);
    hasil.push(...(data ?? []));
    if (!data || data.length < PAGE) return hasil;
  }
}

/** Sesi jalur peta: yang berpangkal pada paket atau probe (kolom penempatan belum ada di database ini). */
const SESI_PETA = (q: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
  q.or("paket_topik_id.not.is.null,probe_topik_id.not.is.null");

/** Isi yang dicadangkan, per tabel. */
async function kumpulkan(): Promise<Record<string, Baris[]>> {
  const butir = await ambilSemua("question_bank_items", (q) => q.not("topik_id", "is", null));
  const sesi = await ambilSemua("practice_sessions", SESI_PETA);
  const idSesi = new Set(sesi.map((s) => s.id));
  const jawaban = (await ambilSemua("practice_answers")).filter((a) => idSesi.has(a.session_id));
  const isi: Record<string, Baris[]> = {
    question_bank_items: butir,
    practice_sessions: sesi,
    practice_answers: jawaban,
  };
  for (const t of [
    "item_probe",
    "paket_topik",
    "paket_topik_item",
    "paket_topik_kunci",
    "status_topik_siswa",
    "penempatan_topik",
    "jadwal_retest",
    "nudge_log",
    "notifikasi_eskalasi",
  ]) {
    isi[t] = await ambilSemua(t);
  }
  return isi;
}

function cadanganTerbaru(): string {
  const akar = join(process.cwd(), "backups");
  const dir = existsSync(akar)
    ? readdirSync(akar)
        .filter((d) => d.startsWith("pengukuran-") && existsSync(join(akar, d, "manifest.json")))
        .sort()
    : [];
  if (dir.length === 0) throw new Error("Belum ada cadangan. Jalankan fase `cadangan` dulu.");
  return join(akar, dir[dir.length - 1]);
}

async function cadangan() {
  const isi = await kumpulkan();
  const dir = join(process.cwd(), "backups", `pengukuran-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
  mkdirSync(dir, { recursive: true });
  const manifest: Record<string, number> = {};
  for (const [tabel, baris] of Object.entries(isi)) {
    writeFileSync(join(dir, `${tabel}.json`), JSON.stringify(baris));
    manifest[tabel] = baris.length;
    console.log(tabel.padEnd(24), baris.length);
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nCadangan: ${dir}`);
}

async function hapus() {
  if (!args.includes("--yes")) throw new Error("Tambahkan --yes untuk benar-benar menghapus.");

  // Cadangan harus mencakup SEMUA yang ada sekarang, bukan sekadar ada.
  const dir = cadanganTerbaru();
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as Record<string, number>;
  const sekarang = await kumpulkan();
  for (const [tabel, baris] of Object.entries(sekarang)) {
    if (baris.length > (manifest[tabel] ?? 0)) {
      throw new Error(`${tabel}: ${baris.length} baris di database, ${manifest[tabel] ?? 0} di cadangan. Cadangkan ulang.`);
    }
  }
  console.log(`Cadangan sah: ${dir}\n`);

  const idSesi = sekarang.practice_sessions.map((s) => s.id as string);
  const kelompok = <T,>(a: T[], n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  async function hapusTabel(tabel: string, saring: (q: any) => any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { error, count } = await saring(db.from(tabel).delete({ count: "exact" }));
    if (error && /does not exist|schema cache/i.test(error.message)) return;
    if (error) throw new Error(`Gagal menghapus ${tabel}: ${error.message}`);
    console.log(`hapus ${tabel.padEnd(24)} ${count}`);
  }

  // 1. Sesi jalur peta dan jawabannya.
  for (const k of kelompok(idSesi)) await hapusTabel("practice_answers", (q) => q.in("session_id", k));
  for (const k of kelompok(idSesi)) await hapusTabel("practice_sessions", (q) => q.in("id", k));
  // 2. Keadaan turunan.
  await hapusTabel("penempatan_topik", (q) => q.not("learner_id", "is", null));
  await hapusTabel("jadwal_retest", (q) => q.not("learner_id", "is", null));
  await hapusTabel("paket_topik_kunci", (q) => q.not("learner_id", "is", null));
  await hapusTabel("status_topik_siswa", (q) => q.not("learner_id", "is", null));
  await hapusTabel("nudge_log", (q) => q.not("learner_id", "is", null));
  // 3. Keanggotaan paket menahan butirnya (`on delete restrict`); paketnya
  // sendiri dibiarkan — `semai_paket_topik` memakainya lagi.
  await hapusTabel("paket_topik_item", (q) => q.not("paket_id", "is", null));
  await hapusTabel("item_probe", (q) => q.not("topik_id", "is", null));
  // 4. Butirnya.
  await hapusTabel("question_bank_items", (q) => q.not("topik_id", "is", null));
}

async function impor() {
  const folder = args[0];
  if (!folder) throw new Error("Sebutkan folder naskah.");

  const { data: topik, error: eTopik } = await db.from("topik").select("id");
  if (eTopik) throw new Error(eTopik.message);
  const kodeSah = new Set((topik ?? []).map((t) => t.id as string));

  const { data: admin, error: eAdmin } = await db.from("profiles").select("id").eq("role", "admin").limit(1);
  if (eAdmin || !admin?.length) throw new Error(`Admin tidak ditemukan: ${eAdmin?.message ?? "kosong"}`);
  const pembuat = admin[0].id as string;

  const berkas = readdirSync(folder).filter((f) => f.endsWith(".json")).sort();
  let total = 0;
  for (const nama of berkas) {
    const hasil = parseSoalJson(readFileSync(join(folder, nama), "utf-8"), kodeSah, false);
    if (hasil.fatal) throw new Error(`${nama}: ${hasil.fatal}`);
    const bermasalah = hasil.rows.filter((r) => !r.item);
    if (bermasalah.length) {
      throw new Error(`${nama}: ${bermasalah.length} butir ditolak, mis. baris ${bermasalah[0].nomor}: ${bermasalah[0].masalah}`);
    }
    const baris = hasil.rows.map((r) => {
      const q = r.item!;
      return {
        created_by: pembuat,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        correct_answer: q.correct_answer,
        weight: q.weight,
        explanation: q.explanation,
        bloom_level: q.bloom_level,
        penjelasan_per_opsi: q.penjelasan_per_opsi,
        pola_solo: q.pola_solo,
        elemen_proses: q.elemen_proses,
        label_kategori: q.label_kategori,
        tag_konteks_pisa: q.tag_konteks_pisa,
        sumber_pembuatan: q.sumber_pembuatan,
        peruntukan: q.peruntukan,
        topik_id: q.topik_id,
        status_verifikasi: "aktif",
      };
    });
    const { data, error } = await db.from("question_bank_items").insert(baris).select("id, topik_id, peruntukan");
    if (error) throw new Error(`${nama}: ${error.message}`);
    // Kolam probe punya tabel keanggotaannya sendiri; retest mengundi dari sana.
    const probe = (data ?? []).filter((d) => d.peruntukan === "probe");
    if (probe.length) {
      const { error: eProbe } = await db
        .from("item_probe")
        .insert(probe.map((d) => ({ topik_id: d.topik_id, question_bank_item_id: d.id })));
      if (eProbe) throw new Error(`${nama}: item_probe: ${eProbe.message}`);
    }
    total += baris.length;
    console.log(`${nama.padEnd(36)} ${baris.length}${probe.length ? `  (probe ${probe.length})` : ""}`);
  }
  console.log(`\n${total} butir diimpor dari ${berkas.length} berkas.`);
}

async function semai() {
  const { data: topik, error } = await db.from("topik").select("id").order("id");
  if (error) throw new Error(error.message);
  for (const t of topik ?? []) {
    const { data, error: e } = await db.rpc("semai_paket_topik", { p_topik_id: t.id });
    if (e) throw new Error(`${t.id}: ${e.message}`);
    const paket = (data ?? []) as { jumlah_butir: number | string }[];
    console.log(t.id.padEnd(8), `${paket.length} paket,`, paket.reduce((n, p) => n + Number(p.jumlah_butir ?? 0), 0), "butir");
  }
}

const FASE: Record<string, () => Promise<void>> = { cadangan, hapus, impor, semai };
if (!FASE[fase]) {
  console.error("Fase: cadangan | hapus --yes | impor <folder> | semai");
  process.exit(1);
}
FASE[fase]().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
