-- Add optional details column to events table.
-- Shown under the title in the calendar as smaller, grayer text.
ALTER TABLE events ADD COLUMN IF NOT EXISTS details TEXT;
