-- 0064: subscription cancellation (keeps spend history) + renewal-push dedupe
ALTER TABLE subscriptions ADD COLUMN cancelled_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN last_renewal_notified_on date;
