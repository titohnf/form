-- Phase 4: branching logic support. Gamification and LaTeX need no schema changes
-- (computed at render time / plain text with $...$ delimiters respectively).
-- AI-generated questions land in the existing `questions` table once a tutor accepts them.

alter table questions add column if not exists branching jsonb;
