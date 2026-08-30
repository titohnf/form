/**
 * Klien Supabase service-role untuk skrip lepas.
 *
 * Next.js memuat .env.local sendiri, skrip seperti ini tidak — jadi dibaca
 * manual supaya kuncinya cukup tinggal di .env.local (sudah masuk .gitignore)
 * dan tidak perlu ditempel di baris perintah; riwayat shell adalah tempat yang
 * buruk untuk kunci yang melewati seluruh RLS.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function adminClient() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.\n" +
        "Ambil service_role di Supabase Dashboard -> Project Settings -> API,\n" +
        "lalu tambahkan satu baris ke .env.local:\n\n" +
        "  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n",
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
