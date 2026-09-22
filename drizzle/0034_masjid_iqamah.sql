-- Crowdsourced iqamah times: users submit their local masjid's iqamah,
-- one canonical record per external masjid id (latest submission wins).
CREATE TABLE IF NOT EXISTS masjid_iqamah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masjid_id text NOT NULL UNIQUE,          -- e.g. "osm:node/123", "mq:uuid"
  masjid_name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  fajr text, dhuhr text, asr text, maghrib text, isha text,
  jummah jsonb,                            -- string[] of "HH:MM"
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS masjid_iqamah_geo_idx ON masjid_iqamah (lat, lng);
