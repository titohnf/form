"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { totalScore } from "@/lib/grading";

export async function gradeEssayAnswer(
  quizId: string,
  attemptId: string,
  answerId: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const manualScore = Number(formData.get("manual_score"));

  await supabase.from("answers").update({ manual_score: manualScore }).eq("id", answerId);

  const { data: answers } = await supabase
    .from("answers")
    .select("auto_score, manual_score, needs_manual_grading")
    .eq("attempt_id", attemptId);

  const score = totalScore(answers ?? []);
  await supabase.from("attempts").update({ total_score: score }).eq("id", attemptId);

  revalidatePath(`/dashboard/quizzes/${quizId}/results/${attemptId}`);
  revalidatePath(`/dashboard/quizzes/${quizId}/results`);
}
