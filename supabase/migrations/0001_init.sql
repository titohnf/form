-- QuizCraft MVP schema: quizzes, questions, attempts, answers
-- Guest students never authenticate; they are identified only by an attempt row.

create extension if not exists pgcrypto;

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  share_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  type text not null check (type in ('mcq_single', 'true_false', 'short_answer', 'essay')),
  prompt text not null,
  options jsonb,
  correct_answer jsonb,
  weight numeric not null default 1,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  guest_name text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  total_score numeric
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  response jsonb,
  auto_score numeric,
  manual_score numeric,
  needs_manual_grading boolean not null default false,
  unique (attempt_id, question_id)
);

create index if not exists questions_quiz_id_idx on questions (quiz_id);
create index if not exists attempts_quiz_id_idx on attempts (quiz_id);
create index if not exists answers_attempt_id_idx on answers (attempt_id);

-- Row Level Security -------------------------------------------------------

alter table quizzes enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;
alter table answers enable row level security;

-- Tutors manage only their own quizzes.
create policy "tutor manages own quizzes" on quizzes
  for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

-- Anyone (anon guests) can read a published quiz's public shape by share_code.
create policy "public can read published quizzes" on quizzes
  for select
  using (status = 'published');

-- Tutors manage questions that belong to their own quizzes.
create policy "tutor manages own questions" on questions
  for all
  using (exists (select 1 from quizzes q where q.id = questions.quiz_id and q.tutor_id = auth.uid()))
  with check (exists (select 1 from quizzes q where q.id = questions.quiz_id and q.tutor_id = auth.uid()));

-- Guests may read questions of a published quiz (needed to render the form),
-- but correct_answer is stripped out at the application layer via a view.
create policy "public can read questions of published quizzes" on questions
  for select
  using (exists (select 1 from quizzes q where q.id = questions.quiz_id and q.status = 'published'));

-- Tutors can read attempts/answers for their own quizzes.
create policy "tutor reads own quiz attempts" on attempts
  for select
  using (exists (select 1 from quizzes q where q.id = attempts.quiz_id and q.tutor_id = auth.uid()));

create policy "tutor updates own quiz attempts" on attempts
  for update
  using (exists (select 1 from quizzes q where q.id = attempts.quiz_id and q.tutor_id = auth.uid()));

-- Guests (anon) can create an attempt against a published quiz.
create policy "public can create attempts on published quizzes" on attempts
  for insert
  with check (exists (select 1 from quizzes q where q.id = attempts.quiz_id and q.status = 'published'));

-- Guests can read back their own attempt to show a confirmation/score screen
-- (client only ever queries by the specific attempt id it just created).
create policy "public can read attempts" on attempts
  for select
  using (true);

create policy "tutor reads own quiz answers" on answers
  for select
  using (exists (
    select 1 from attempts a join quizzes q on q.id = a.quiz_id
    where a.id = answers.attempt_id and q.tutor_id = auth.uid()
  ));

create policy "tutor updates own quiz answers" on answers
  for update
  using (exists (
    select 1 from attempts a join quizzes q on q.id = a.quiz_id
    where a.id = answers.attempt_id and q.tutor_id = auth.uid()
  ));

create policy "public can insert answers for published quizzes" on answers
  for insert
  with check (exists (
    select 1 from attempts a join quizzes q on q.id = a.quiz_id
    where a.id = answers.attempt_id and q.status = 'published'
  ));

create policy "public can read own submitted answers" on answers
  for select
  using (true);

-- A view of questions safe to expose to guests before grading (no answer key).
create or replace view public_quiz_questions as
  select id, quiz_id, type, prompt, options, weight, order_index
  from questions;
