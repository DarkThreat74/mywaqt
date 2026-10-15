-- Expenses: haircut support — detail (barber name etc.) + photo thumbnail.
-- photo_data holds a client-compressed JPEG as base64 text (TOASTed);
-- list queries never select it — it's served via /api/expenses/[id]/photo.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS detail varchar(80);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS photo_data text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS photo_mime varchar(32);
