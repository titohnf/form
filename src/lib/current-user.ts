import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string | null;
  email: string | null;
  fullName: string | null;
  role: string | null;
  isTutor: boolean;
}

/**
 * Siapa yang sedang masuk, dibaca sekali per permintaan.
 *
 * Dibungkus `cache()` React karena layout dan halaman dirender dalam satu
 * permintaan yang sama: tanpa ini keduanya masing-masing memanggil
 * `auth.getUser()` (yang benar-benar menembak server Supabase, bukan sekadar
 * membaca cookie) lalu menanyakan `profiles` lagi. Empat perjalanan bolak-balik
 * ke Singapura untuk menjawab satu pertanyaan yang sama.
 *
 * `cache()` hanya menyatukan pemanggilan di dalam satu render; server action
 * dan proxy adalah permintaan tersendiri, jadi keduanya tetap memeriksa sendiri
 * — memang harus begitu, karena di sanalah keputusan aksesnya diambil.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { id: null, email: null, fullName: null, role: null, isTutor: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? null,
    isTutor: profile?.role === "tutor",
  };
});
