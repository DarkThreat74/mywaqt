-- 0060: users.hidden_tabs — which nav/tool surfaces the user hid
ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_tabs text[];
