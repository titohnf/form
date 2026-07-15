-- Phase 2 (Live Monitoring) + Phase 3 (Classes & Question Bank) + remaining Question Builder scope.

-- Classes & roster ----------------------------------------------------------

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes (id) on delete cascade,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists students_class_id_idx on students (class_id);

alter table classes enable row level security;
alter table students enable row level security;

create policy "tutor manages own classes" on classes
  for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

create policy "tutor manages own students" on students
  for all
  using (exists (select 1 from classes c where c.id = students.class_id and c.tutor_id = auth.uid()))
  with check (exists (select 1 from classes c where c.id = students.class_id and c.tutor_id = auth.uid()));

-- Guests need to read the roster of the class a published quiz is assigned to,
-- so the public quiz page can offer a name dropdown instead of free text.
create policy "public can read students of classes tied to a published quiz" on students
  for select
  using (exists (
    select 1 from quizzes q where q.class_id = students.class_id and q.status = 'published'
  ));

-- Question bank ---------------------------------------------------------

create table if not exists question_bank_items (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  prompt text not null,
  options jsonb,
  correct_answer jsonb,
  weight numeric not null default 1,
  created_at timestamptz not null default now()
);

alter table question_bank_items enable row level security;

create policy "tutor manages own question bank" on question_bank_items
  for all
  using (auth.uid() = tutor_id)
  with check (auth.uid() = tutor_id);

-- Quiz settings & class assignment ------------------------------------------

alter table quizzes add column if not exists settings jsonb not null default '{}'::jsonb;
alter table quizzes add column if not exists class_id uuid references classes (id) on delete set null;

-- Extra question types --------------------------------------------------

alter table questions drop constraint if exists questions_type_check;
alter table questions add constraint questions_type_check
  check (type in (
    'mcq_single', 'true_false', 'short_answer', 'essay',
    'mcq_multi', 'matching', 'ordering', 'fill_blank', 'upload_file'
  ));

-- Attempt progress tracking (for live monitoring) ---------------------------

alter table attempts add column if not exists current_question_index integer not null default 0;
alter table attempts add column if not exists last_active_at timestamptz not null default now();
alter table attempts add column if not exists student_id uuid references students (id) on delete set null;

-- Denormalized quiz_id on answers so Supabase Realtime can filter directly
-- (postgres_changes filters only support a single-column equality on the
-- table being watched; answers has no direct quiz_id otherwise).
alter table answers add column if not exists quiz_id uuid references quizzes (id) on delete cascade;
alter table answers add column if not exists tutor_feedback text;

create index if not exists answers_quiz_id_idx on answers (quiz_id);
create index if not exists attempts_last_active_at_idx on attempts (last_active_at);

-- RLS: guest autosave (create attempt on name entry, upsert answers per question,
-- before final submit) -------------------------------------------------------

create policy "public can update own attempts" on attempts
  for update
  using (exists (select 1 from quizzes q where q.id = attempts.quiz_id and q.status = 'published'))
  with check (exists (select 1 from quizzes q where q.id = attempts.quiz_id and q.status = 'published'));

create policy "public can update own answers" on answers
  for update
  using (exists (
    select 1 from attempts a join quizzes q on q.id = a.quiz_id
    where a.id = answers.attempt_id and q.status = 'published'
  ))
  with check (exists (
    select 1 from attempts a join quizzes q on q.id = a.quiz_id
    where a.id = answers.attempt_id and q.status = 'published'
  ));

-- Storage bucket for the upload_file question type ---------------------------

insert into storage.buckets (id, name, public)
values ('quiz-uploads', 'quiz-uploads', true)
on conflict (id) do nothing;

create policy "anyone can upload quiz files" on storage.objects
  for insert
  with check (bucket_id = 'quiz-uploads');

create policy "anyone can read quiz files" on storage.objects
  for select
  using (bucket_id = 'quiz-uploads');

-- Live Monitoring needs Supabase Realtime enabled on these tables (off by default).

alter publication supabase_realtime add table attempts;
alter publication supabase_realtime add table answers;
