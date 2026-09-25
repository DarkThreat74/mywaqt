-- talk_progress.user_id had no foreign key: deleting a user orphaned their
-- listening-progress rows (dangling personal data). Clean orphans, then add
-- the cascade FK so user deletion removes everything.
DELETE FROM talk_progress tp WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = tp.user_id);
ALTER TABLE talk_progress
  ADD CONSTRAINT talk_progress_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Community iqamah data belongs to everyone who uses it — a contributor
-- deleting their account shouldn't erase times other users rely on.
ALTER TABLE masjid_iqamah ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE masjid_iqamah DROP CONSTRAINT masjid_iqamah_submitted_by_fkey;
ALTER TABLE masjid_iqamah
  ADD CONSTRAINT masjid_iqamah_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;
