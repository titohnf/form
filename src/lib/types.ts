export type QuestionType =
  | "mcq_single"
  | "true_false"
  | "short_answer"
  | "essay"
  | "mcq_multi"
  | "matching"
  | "ordering"
  | "fill_blank"
  | "upload_file"
  | "statement_grid";

export type QuizStatus = "draft" | "published" | "closed";

/**
 * What a question set is *for* — the axis the dashboard menus split on
 * (migration 079). Distinct from who may sit it: that is decided by whether
 * the set is assigned to a Tera session (`assessments`) or handed out as a
 * loose share code, and a try out may well be either.
 */
export type QuizKind = "asesmen" | "remedial" | "tryout";

export const QUIZ_KIND_LABEL: Record<QuizKind, string> = {
  asesmen: "Asesmen",
  remedial: "Remedial",
  tryout: "Try Out",
};

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

export interface StatementGridOptions {
  statements: string[];
  /** The two answer buttons, in [true, false] order. "Benar"/"Salah" by default, but a Fakta/Opini grid works the same. */
  answer_labels: [string, string];
}

export type StatementGridGradingMode = "proportional" | "all_or_nothing";

/**
 * Shape of `statement_grid`'s `correct_answer`. One entry per statement, aligned
 * by index with `StatementGridOptions.statements`. A null entry means the tutor
 * has not marked that row yet — a publishable question has none (see
 * `questionIssue`), but a draft in progress does.
 *
 * `grading_mode` lives here rather than in `options` so it stays on the server
 * side of the answer-key boundary along with the key itself.
 */
export interface StatementGridAnswer {
  answers: (boolean | null)[];
  grading_mode: StatementGridGradingMode;
}

/** Shape of `questions.options` — varies by `type`, see per-type interfaces above. */
export type QuestionOptions =
  | McqOptions
  | MatchingOptions
  | OrderingOptions
  | StatementGridOptions
  | null;

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
  /** Shown to students after they answer in practice mode. Null for questions without one. */
  explanation: string | null;
  /**
   * The bank item this question was copied from (migration 082), or null when
   * it was written here. Provenance only — editing either side never touches
   * the other. Used to hide "Simpan ke Bank" on questions that came from the
   * bank, where saving would silently create a twin. Absent until 082 runs.
   */
  bank_item_id?: string | null;
  /** Taksonomi Bloom 1–6, null kalau belum ditetapkan. Lihat `lib/bloom.ts`. */
  bloom_level?: number | null;
  /**
   * Stimulus shown above the prompt, in array order. Empty for questions that
   * are pure text. TKA leans on these heavily — diagrams, geometric figures,
   * charts — which is why they live here rather than being squeezed into the
   * prompt. Equations are never images: those belong in the prompt as LaTeX.
   */
  stimulus_images: string[];
}

/**
 * The editable columns a question has, shared by the quiz editor and the bank
 * editor. `branching` only means anything inside a quiz; the bank ignores it.
 */
export interface QuestionPatch {
  type: QuestionType;
  prompt: string;
  weight: number;
  options: QuestionOptions;
  correct_answer: unknown;
  explanation: string | null;
  branching: Branching | null;
  stimulus_images: string[];
  /** Taksonomi Bloom 1–6, null kalau belum ditetapkan. Lihat `lib/bloom.ts`. */
  bloom_level: number | null;
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
  created_by: string | null;
  title: string;
  description: string | null;
  status: QuizStatus;
  /** Absent until migration 079 has run; treat a missing value as "asesmen". */
  kind?: QuizKind;
  share_code: string | null;
  created_at: string;
  settings: Partial<QuizSettings> | null;
  /** A class in Tera, not one of Sora's own — those no longer exist. */
  class_id: string | null;
  /**
   * The session this set was authored for — the OWNERSHIP axis of migration
   * 071, which decides who may edit it. Null on admin-authored parent sets so
   * no tutor can change them; where a set is *used* lives in `assessments`
   * instead (see {@link Assessment}).
   */
  session_id: string | null;
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
  learner_id: string | null;
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

/**
 * One band of a mastery scale, e.g. {label: "Baik", min: 70}. Bands are stored
 * ascending by `min`, and `min` is a percentage of the maximum score. A subject
 * with no rubric shows raw percentages instead of labels.
 */
export interface MasteryBand {
  label: string;
  min: number;
}

/** A row of `mastery_rubrics`. `subject_id` null is the default for every subject. */
export interface MasteryRubric {
  id: string;
  subject_id: string | null;
  bands: MasteryBand[];
}

/** A subject in Tera. Sora only ever reads these. */
export interface Subject {
  id: string;
  name: string;
}

/** A class in Tera, read only to scope a quiz to one. Sora has no classes of its own. */
export interface Class {
  id: string;
  name: string;
}

/** A teaching session in Tera, read only to pick one to assign a question set to. */
export interface SessionOption {
  id: string;
  scheduled_at: string;
  topic: string | null;
  classes: { name: string } | null;
}

/**
 * A row of Tera's `assessments` — one question set assigned to one session.
 * This is the assignment axis of migration 074: `quizzes.session_id` says who
 * may edit the set, this says where it is used and where its scores land. One
 * set may have many of these, each with its own share code.
 */
export interface Assessment {
  id: string;
  session_id: string;
  quiz_id: string | null;
  title: string;
  share_code: string | null;
  created_at: string;
}

/**
 * A curriculum topic in Tera, addressed by the stable id introduced in migration
 * 060. `curriculum_topics` itself is flat — a topic is the group of rows sharing
 * a six-column key — so questions are tagged to this group, never to the key.
 */
export interface CurriculumTopicGroup {
  id: string;
  subject_id: string;
  curriculum: string;
  grade_level: string;
  semester: number;
  theme: string | null;
  topic: string;
}

/**
 * Who is practising. `profile_id` set means a student enrolled in Tera; null
 * means someone from outside who only ever uses Sora. Neither has an
 * account — `access_code` is a credential the admin hands out.
 */
export interface Learner {
  id: string;
  profile_id: string | null;
  name: string;
  access_code: string | null;
  created_at: string;
}

export interface QuestionBankItem {
  id: string;
  created_by: string | null;
  type: QuestionType;
  prompt: string;
  options: QuestionOptions;
  correct_answer: unknown;
  weight: number;
  explanation: string | null;
  stimulus_images: string[];
  /** Taksonomi Bloom 1–6, null kalau belum ditetapkan. Lihat `lib/bloom.ts`. */
  bloom_level?: number | null;
  created_at: string;
}
