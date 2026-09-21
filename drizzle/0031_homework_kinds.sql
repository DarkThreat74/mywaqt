-- Expand homework_kind to cover the assignment types students actually track
-- (competitor taxonomies: myHomework, Power Planner, MyStudyLife use
-- essay/lab/exam/presentation/worksheet/study in addition to the basics).
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'exam';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'essay';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'lab';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'presentation';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'worksheet';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'study';
