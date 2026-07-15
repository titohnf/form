"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateShareCode } from "@/lib/share-code";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createQuiz() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("quizzes")
    .insert({ tutor_id: user.id, title: "Kuis Baru", status: "draft" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal membuat kuis");
  }

  redirect(`/dashboard/quizzes/${data.id}/edit`);
}

export async function deleteQuiz(quizId: string) {
  const supabase = await createClient();
  await supabase.from("quizzes").delete().eq("id", quizId);
  redirect("/dashboard");
}

export async function publishQuiz(quizId: string) {
  const supabase = await createClient();

  let shareCode = generateShareCode();
  // Retry a couple times on the unlikely chance of a collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase
      .from("quizzes")
      .update({ status: "published", share_code: shareCode })
      .eq("id", quizId);
    if (!error) break;
    shareCode = generateShareCode();
  }

  redirect(`/dashboard/quizzes/${quizId}/edit`);
}
