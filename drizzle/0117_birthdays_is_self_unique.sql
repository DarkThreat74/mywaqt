-- At most one "this is me" birthday row per user. Backs up the atomic
-- claimSelfSlot check in src/app/api/birthdays/route.ts; mirrors the
-- oneSelfPerUser uniqueIndex declared in src/lib/db/schema.ts.
-- CONCURRENTLY avoids a table lock on write — cannot run inside a transaction.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS birthdays_one_self_per_user
  ON birthdays (user_id) WHERE is_self;
