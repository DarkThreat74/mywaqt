-- 0019: Talk processing pipeline + folder metadata
-- Adds: folder image/dates, talk processing status, processed audio key, topics, publish flow

-- ── Folder metadata: image, optional date range ──
ALTER TABLE talk_folders ADD COLUMN IF NOT EXISTS image_key TEXT;
ALTER TABLE talk_folders ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE talk_folders ADD COLUMN IF NOT EXISTS end_date DATE;

-- ── Talk processing pipeline ──
-- processing_status: pending (just uploaded) → processing (worker running) → ready (processed, awaiting publish) → published (live) / failed
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processed_storage_key TEXT;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS topics TEXT;

-- Index for filtering published talks in the user-facing library
CREATE INDEX IF NOT EXISTS talks_processing_status_idx ON talks(processing_status);
CREATE INDEX IF NOT EXISTS talks_published_idx ON talks(published_at);

-- Backfill: existing talks with a storage_key are already published
UPDATE talks SET processing_status = 'published', published_at = added_at
  WHERE storage_key IS NOT NULL AND processing_status = 'pending';

-- ── Verify ──
DO $$
BEGIN
  RAISE NOTICE '0019: Added folder image_key, start_date, end_date';
  RAISE NOTICE '0019: Added talks processing_status, processed_storage_key, processed_at, published_at, processing_error, topics';
END $$;
