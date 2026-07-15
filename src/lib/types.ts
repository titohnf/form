export type QuestionType = "mcq_single" | "true_false" | "short_answer" | "essay";

export type QuizStatus = "draft" | "published" | "closed";

export interface McqOptions {
  choices: string[];
}

export interface Question {
  id: string;
  quiz_id: string;
  type: QuestionType;
  prompt: string;
  options: McqOptions | null;
  correct_answer: unknown;
  weight: number;
  order_index: number;
}

export interface Quiz {
  id: string;
  tutor_id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  share_code: string | null;
  created_at: string;
}

export interface Attempt {
  id: string;
  quiz_id: string;
  guest_name: string;
  started_at: string;
  submitted_at: string | null;
  total_score: number | null;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  response: unknown;
  auto_score: number | null;
  manual_score: number | null;
  needs_manual_grading: boolean;
}
