-- 0023_performance_indexes.sql
-- Composite indexes for common query patterns identified in the PWA performance audit.
-- These cover ORDER BY clauses that were causing filesorts and improve WHERE clause efficiency.

-- Homework: ORDER BY (due_date, due_time) for the homework list query
CREATE INDEX IF NOT EXISTS homeworks_user_due_time_idx
  ON homeworks (user_id, due_date, due_time);

-- Homework: completed_at filter for "pending OR completed recently" query
CREATE INDEX IF NOT EXISTS homeworks_user_completed_at_idx
  ON homeworks (user_id, completed_at);

-- Talks: filter by processing_status + ORDER BY title
CREATE INDEX IF NOT EXISTS talks_processing_status_title_idx
  ON talks (processing_status, title);

-- Talk folders: ORDER BY (sort_order, name)
CREATE INDEX IF NOT EXISTS talk_folders_sort_name_idx
  ON talk_folders (sort_order, name);

-- Classes: ORDER BY (sort_order, created_at)
CREATE INDEX IF NOT EXISTS classes_user_sort_created_idx
  ON classes (user_id, sort_order, created_at);

-- Events: series query ORDER BY start_at
CREATE INDEX IF NOT EXISTS events_user_series_start_idx
  ON events (user_id, series_id, start_at);
