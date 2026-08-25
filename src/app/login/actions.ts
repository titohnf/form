"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { berandaUntuk } from "@/lib/beranda";

export async function login(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Tidak semua yang boleh masuk adalah penyusun soal. Keluarga dan murid dicari
  // di latihan mandiri, bukan di /dashboard — mengirim mereka ke sana berarti
  // dipulangkan proxy dengan "staff-only", seolah akunnya salah. Petanya sama
  // dengan yang dipakai root, supaya mengetik alamat Sora dan menekan "Masuk"
  // berujung di tempat yang sama.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user!.id)
    .single();

  redirect(berandaUntuk(profile?.role));
}
