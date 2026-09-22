-- Masjid source registry imported from the MIT-licensed praytime project:
-- each row is a masjid plus the public endpoint that publishes its iqamah
-- (Masjidal JSON API, Mohid widget page, Mawaqit, etc.). Iqamah itself is
-- fetched live and cached, not stored.
CREATE TABLE IF NOT EXISTS masjid_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,       -- praytime uuid4
  name text NOT NULL,
  address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  timezone text,
  website text,
  fetch_url text,                          -- endpoint that publishes iqamah
  platform text,                           -- masjidal | mohid | mawaqit | masjidbox | other
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS masjid_sources_geo_idx ON masjid_sources (lat, lng);
