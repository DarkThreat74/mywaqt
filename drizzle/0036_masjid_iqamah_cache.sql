-- Cache of resolved live iqamah per registry masjid, so we don't refetch
-- masjid homepages/widget endpoints on every /api/masjids request.
ALTER TABLE masjid_sources ADD COLUMN IF NOT EXISTS iqamah_cache jsonb;
ALTER TABLE masjid_sources ADD COLUMN IF NOT EXISTS iqamah_checked_at timestamptz;
