/**
 * Pindahkan login dari akun-per-murid ke akun-per-keluarga.
 *
 * Latar: satu baris `profiles` di Tera merangkap catatan murid dan akun login.
 * Dari 26 murid ada 3 pasang kakak-adik, dan email tiap anak dibuat dengan
 * alias `+2` dari alamat orang tua yang sama — sistemnya sudah lama menyiasati
 * aturan satu email satu akun. Skrip ini membereskannya: satu akun per
 * keluarga, ditautkan ke anak-anaknya lewat `family_students` (migrasi 076).
 *
 * YANG TIDAK DILAKUKAN: menghapus akun auth murid. `profiles.id` mereferensi
 * `auth.users(id) on delete cascade`, sehingga menghapus akun auth ikut
 * menghapus profil murid — dan dari sana merembet ke class_students,
 * attendances, assessment_results, monthly_report_notes, serta learners dan
 * practice_answers. Seluruh riwayat akademik murid akan lenyap.
 *
 * Yang dilakukan: email murid dipindahkan ke alamat placeholder. Akun auth-nya
 * tetap hidup (jadi profilnya aman), emailnya bebas dipakai akun keluarga, dan
 * murid tidak bisa lagi login karena passwordnya tidak dibagikan.
 *
 * Jalankan simulasi dulu:
 *   npm run migrate:keluarga -- --dry-run
 * Baru sungguhan:
 *   npm run migrate:keluarga
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/** Alamat dasar sebuah email: buang alias `+apa pun`. */
function baseEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.split("+")[0]}@${domain}`;
}

const AB = "abcdefghjkmnpqrstuvwxyz23456789";
const chunk = () => Array.from({ length: 4 }, () => AB[Math.floor(Math.random() * AB.length)]).join("");
const makePw = () => `tera-${chunk()}-${chunk()}`;

interface Child {
  id: string;
  name: string;
  email: string;
  parentName: string | null;
}

async function main() {
  const { data: profs } = await db
    .from("profiles")
    .select("id, full_name, parent_name")
    .eq("role", "student")
    .order("full_name");
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });

  // Kelompokkan per alamat dasar. Dipilih ketimbang nama orang tua karena
  // alamat itu sekaligus menjadi login keluarganya — satu aturan, bukan dua
  // yang bisa bertentangan.
  const families = new Map<string, Child[]>();
  for (const p of profs ?? []) {
    const email = users?.users.find((u) => u.id === p.id)?.email;
    if (!email) {
      console.warn(`  ! ${p.full_name} tidak punya akun auth — dilewati`);
      continue;
    }
    const base = baseEmail(email);
    families.set(base, [
      ...(families.get(base) ?? []),
      { id: p.id, name: p.full_name, email, parentName: p.parent_name },
    ]);
  }

  console.log(`${profs?.length ?? 0} murid -> ${families.size} keluarga${DRY ? "  (SIMULASI)" : ""}\n`);

  const rows: string[] = ["keluarga,email,password,anak"];
  for (const [famEmail, children] of families) {
    const names = [...new Set(children.map((c) => c.parentName).filter(Boolean))];
    if (names.length > 1) {
      console.warn(`  ! ${famEmail}: nama orang tua tidak seragam (${names.join(" / ")})`);
    }
    const famName = names[0] ?? `Keluarga ${children[0].name}`;
    const pw = makePw();

    console.log(`${famName}  <${famEmail}>`);
    for (const c of children) console.log(`   anak: ${c.name}  (email lama ${c.email})`);

    if (DRY) {
      rows.push(`"${famName}",${famEmail},(simulasi),"${children.map((c) => c.name).join("; ")}"`);
      continue;
    }

    // 1. Bebaskan emailnya. Harus sebelum akun keluarga dibuat, karena satu
    //    alamat tidak boleh dipakai dua akun auth.
    for (const c of children) {
      const placeholder = `murid.${c.id.slice(0, 8)}@murid.invalid`;
      const { error } = await db.auth.admin.updateUserById(c.id, {
        email: placeholder,
        email_confirm: true,
      });
      if (error) throw new Error(`Gagal memindahkan email ${c.name}: ${error.message}`);
    }

    // 2. Akun keluarga. Profilnya dibuat otomatis oleh trigger
    //    on_auth_user_created, yang membaca role dan nama dari metadata.
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: famEmail,
      password: pw,
      email_confirm: true,
      user_metadata: { full_name: famName, role: "parent" },
    });
    if (createErr || !created.user) {
      throw new Error(`Gagal membuat akun ${famEmail}: ${createErr?.message}`);
    }

    // Role ditegaskan, tidak diserahkan ke trigger. `handle_new_user` di repo
    // memang membaca role dari metadata, tapi yang terpasang di database
    // ternyata tidak — jalannya pertama kali menghasilkan 23 akun ber-role
    // `student`. Menulis ulang di sini membuat skrip ini benar terlepas dari
    // versi trigger mana yang sedang hidup di sana.
    const { error: roleErr } = await db
      .from("profiles")
      .update({ role: "parent", full_name: famName })
      .eq("id", created.user.id);
    if (roleErr) throw new Error(`Gagal menetapkan role ${famEmail}: ${roleErr.message}`);

    // 3. Tautkan anak-anaknya.
    const { error: linkErr } = await db
      .from("family_students")
      .upsert(children.map((c) => ({ family_id: created.user.id, student_id: c.id })));
    if (linkErr) throw new Error(`Gagal menautkan anak ke ${famEmail}: ${linkErr.message}`);

    rows.push(`"${famName}",${famEmail},${pw},"${children.map((c) => c.name).join("; ")}"`);
  }

  if (!DRY) {
    const out = `${process.env.HOME}/Documents/tera-password-keluarga.csv`;
    writeFileSync(out, rows.join("\n") + "\n", { mode: 0o600 });
    console.log(`\nSelesai. Kredensial keluarga: ${out}`);
    console.log("CSV password murid yang lama sudah tidak berlaku — hapus saja.");
  } else {
    console.log("\nSimulasi selesai. Tidak ada yang diubah.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
