"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Akun keluarga sah di Sora, tapi bukan penyusun soal: sebelum ini ia dikirim
  // ke /dashboard lalu dipulangkan proxy dengan "staff-only", seolah akunnya
  // salah. Yang dia cari ada di latihan mandiri — di sana anaknya bisa dipilih
  // tanpa kode.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user!.id)
    .single();

  redirect(profile?.role === "parent" ? "/practice" : "/dashboard");
}
