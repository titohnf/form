export type QuestionType =
  | "mcq_single"
  | "true_false"
  | "short_answer"
  | "essay"
  | "mcq_multi"
  | "matching"
  | "ordering"
  | "fill_blank"
  | "upload_file";

export type QuizStatus = "draft" | "published" | "closed";

export interface McqOptions {
  choices: string[];
}

export interface MatchingPair {
  left: string;
  right: string;
}

export interface MatchingOptions {
  pairs: MatchingPair[];
}

export interface OrderingOptions {
  items: string[];
}

/** Shape of `questions.options` — varies by `type`, see per-type interfaces above. */
export type QuestionOptions = McqOptions | MatchingOptions | OrderingOptions | null;

/** Sentinel value in `Question.branching` meaning "submit the quiz now" instead of jumping to another question. */
export const BRANCH_END = "__END__";

/** Maps an answer value (for mcq_single/true_false) to a target question id, or BRANCH_END. Unmapped answers fall through to the next question by order_index. */
export type Branching = Record<string, string>;

export interface Question {
  id: string;
  quiz_id: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOptions;
  correct_answer: unknown;
  weight: number;
  order_index: number;
  branching: Branching | null;
}

export interface QuizSettings {
  time_limit_minutes: number | null;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  show_score_immediately: boolean;
  max_attempts: number | null;
  opens_at: string | null;
  closes_at: string | null;
  sequential_mode: boolean;
}

export const defaultQuizSettings: QuizSettings = {
  time_limit_minutes: null,
  shuffle_questions: false,
  shuffle_choices: false,
  show_score_immediately: true,
  max_attempts: null,
  opens_at: null,
  closes_at: null,
  sequential_mode: false,
};

export interface Quiz {
  id: string;
  tutor_id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  share_code: string | null;
  created_at: string;
  settings: Partial<QuizSettings> | null;
  class_id: string | null;
}

export interface Attempt {
  id: string;
  quiz_id: string;
  guest_name: string;
  started_at: string;
  submitted_at: string | null;
  total_score: number | null;
  current_question_index: number;
  last_active_at: string;
  student_id: string | null;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  quiz_id: string;
  response: unknown;
  auto_score: number | null;
  manual_score: number | null;
  needs_manual_grading: boolean;
  tutor_feedback: string | null;
}

export interface Class {
  id: string;
  tutor_id: string;
  name: string;
  created_at: string;
}

export interface Student {
  id: string;
  class_id: string;
  name: string;
  email: string | null;
  created_at: string;
}

export interface QuestionBankItem {
  id: string;
  tutor_id: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOptions;
  correct_answer: unknown;
  weight: number;
  created_at: string;
}
