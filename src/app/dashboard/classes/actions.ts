"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createClass(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const { data, error } = await supabase
    .from("classes")
    .insert({ tutor_id: user.id, name })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/dashboard/classes/${data.id}`);
}

export async function deleteClass(classId: string) {
  const supabase = await createClient();
  await supabase.from("classes").delete().eq("id", classId);
  redirect("/dashboard/classes");
}

export async function addStudent(classId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!name) return;

  await supabase.from("students").insert({ class_id: classId, name, email: email || null });
  revalidatePath(`/dashboard/classes/${classId}`);
}

export async function deleteStudent(classId: string, studentId: string) {
  const supabase = await createClient();
  await supabase.from("students").delete().eq("id", studentId);
  revalidatePath(`/dashboard/classes/${classId}`);
}
