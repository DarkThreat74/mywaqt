-- Public portal visibility settings on users.
-- Enforced server-side on every /api/public/[token]/* request; changing them
-- applies to the existing share link immediately (no regeneration needed).

ALTER TABLE users ADD COLUMN share_future_days integer NOT NULL DEFAULT 30;
ALTER TABLE users ADD COLUMN share_past_days integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN share_show_events boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN share_show_event_details boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN share_show_prayer_times boolean NOT NULL DEFAULT true;
