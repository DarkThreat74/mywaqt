// Single source of truth for homework assignment types.
// Must stay in sync with the homework_kind Postgres enum
// (drizzle/0031_homework_kinds.sql + src/lib/db/schema.ts).
export const HOMEWORK_KINDS = [
  "homework",
  "test",
  "quiz",
  "exam",
  "essay",
  "lab",
  "project",
  "presentation",
  "worksheet",
  "reading",
  "study",
  "other",
] as const;

export type HomeworkKind = (typeof HOMEWORK_KINDS)[number];

export const KIND_LABELS: Record<HomeworkKind, string> = {
  homework: "Homework",
  test: "Test",
  quiz: "Quiz",
  exam: "Exam",
  essay: "Essay",
  lab: "Lab",
  project: "Project",
  presentation: "Presentation",
  worksheet: "Worksheet",
  reading: "Reading",
  study: "Study",
  other: "Other",
};
