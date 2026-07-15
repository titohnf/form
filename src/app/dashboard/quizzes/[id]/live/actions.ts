"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveTutorFeedback(answerId: string, feedback: string) {
  const supabase = await createClient();
  await supabase.from("answers").update({ tutor_feedback: feedback }).eq("id", answerId);
}
