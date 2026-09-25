/**
 * Drizzle schema — single source of truth for the database.
 * Translated from the Waqt spec section 3 (Database Schema).
 *
 * See CODEBASE_PATTERNS.md §8 (Schema Discipline):
 * - Single-file schema, idempotent migrations
 * - TS types match DB schema exactly
 * - After schema changes, run `pnpm drizzle-kit generate` and tell the user
 *   to run the migration against their Neon database.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  time,
  date,
  integer,
  numeric,
  doublePrecision,
  varchar,
  uniqueIndex,
  index,
  primaryKey,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';

// ─── Enums ───

export const subscriptionTier = pgEnum('subscription_tier', ['free', 'plus']);

export const prayerName = pgEnum('prayer_name', [
  'fajr',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
]);

export const prayerStatus = pgEnum('prayer_status', [
  'pending',
  'prayed',
  'missed',
  'assumed_prayed',
  // Deliberate pause — menstruation, illness, travel. Keeps the streak alive
  // (benefit of the doubt) without counting as a completed prayer.
  'excused',
]);

export const eventType = pgEnum('event_type', ['block', 'task', 'reminder']);

export const userRole = pgEnum('user_role', ['user', 'admin']);

// ─── Users ───

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  // Display name — collected during onboarding, used in public calendar URL and header
  displayName: text('display_name'),
  // First name — used in prayer friends dashboard
  firstName: text('first_name'),
  phone: text('phone'),
  phoneVerified: boolean('phone_verified').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  subscriptionTier: subscriptionTier('subscription_tier').default('free').notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  role: userRole('role').default('user').notNull(),
  // Public calendar share token — null = sharing disabled, non-null = public read-only calendar at /user/[name]/[token]
  publicShareToken: text('public_share_token').unique(),
  // Public portal visibility settings — enforced server-side on every public request
  shareFutureDays: integer('share_future_days').default(30).notNull(),
  sharePastDays: integer('share_past_days').default(0).notNull(),
  shareShowEvents: boolean('share_show_events').default(true).notNull(),
  shareShowEventDetails: boolean('share_show_event_details').default(true).notNull(),
  shareShowPrayerTimes: boolean('share_show_prayer_times').default(true).notNull(),
  // Sessions (JWTs) issued before this instant are rejected — set on password
  // reset/change so a stolen session dies immediately instead of living out
  // its 7-day expiry.
  sessionsValidAfter: timestamp('sessions_valid_after', { withTimezone: true }),
  // 6-character prayer share code — share with friends to let them see your prayer streaks
  prayerCode: text('prayer_code').unique(),
  // Scheduled account deletion — non-null means the account will be fully
  // deleted 5h after this instant unless the user cancels first.
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
}, (table) => [
  index('users_role_idx').on(table.role),
  index('users_created_at_idx').on(table.createdAt),
]);

// ─── Prayer Friends (share streak access via code, with accept/reject flow) ───

export const prayerFriendStatus = pgEnum('prayer_friend_status', ['pending', 'accepted', 'rejected']);

export const prayerFriends = pgTable(
  'prayer_friends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The user who sent the friend request
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // The user who received the request
    friendId: uuid('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: prayerFriendStatus('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // When the request was accepted or rejected
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('prayer_friends_user_friend_idx').on(table.userId, table.friendId),
    index('prayer_friends_friend_status_idx').on(table.friendId, table.status),
  ],
);

// ─── Prayer Reminders (friend → friend nudge, deduped per prayer per day) ───

export const prayerReminders = pgTable(
  'prayer_reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The friend who tapped "remind"
    senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // The friend being reminded
    recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Date in the RECIPIENT's timezone (YYYY-MM-DD) — matches prayer_log.date semantics
    date: date('date').notNull(),
    prayerName: prayerName('prayer_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One reminder per sender per prayer per day — the dedupe backstop
    uniqueIndex('prayer_reminders_sender_recipient_date_prayer_idx').on(
      table.senderId,
      table.recipientId,
      table.date,
      table.prayerName,
    ),
    index('prayer_reminders_recipient_idx').on(table.recipientId, table.date),
  ],
);

// ─── Prayer Cheers (one-tap "mashaAllah" to a friend, deduped per day) ───

export const prayerCheers = pgTable(
  'prayer_cheers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Date in the RECIPIENT's timezone (YYYY-MM-DD)
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('prayer_cheers_sender_recipient_date_idx').on(
      table.senderId,
      table.recipientId,
      table.date,
    ),
    index('prayer_cheers_recipient_idx').on(table.recipientId, table.date),
  ],
);

// ─── Prayer Day Completions (first time a user completes all 5 for a date) ───
// Powers: shared streaks, "friend completed all 5" notifications (dedupe),
// challenge progress. Inserted once per user/date via ON CONFLICT DO NOTHING.

export const prayerDayCompletions = pgTable(
  'prayer_day_completions',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('prayer_day_completions_user_date_idx').on(table.userId, table.date),
    index('prayer_day_completions_date_idx').on(table.date),
  ],
);

// ─── Prayer Friend Streaks (shared streak: both completed the same date) ───

export const prayerFriendStreaks = pgTable(
  'prayer_friend_streaks',
  {
    // Canonical pair ordering: userLowId < userHighId
    userLowId: uuid('user_low_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    userHighId: uuid('user_high_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    streak: integer('streak').default(0).notNull(),
    bestStreak: integer('best_streak').default(0).notNull(),
    // Last matched date (YYYY-MM-DD in each user's own timezone)
    lastDate: date('last_date'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userLowId, table.userHighId] })],
);

// ─── Prayer Invites (shareable deep links) ───

export const prayerInvites = pgTable(
  'prayer_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inviterId: uuid('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 hex of the URL token — raw token is never stored
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('prayer_invites_token_hash_idx').on(table.tokenHash),
    index('prayer_invites_inviter_idx').on(table.inviterId),
  ],
);

// ─── Prayer Groups (private circles, join by code) ───

export const prayerGroups = pgTable(
  'prayer_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 60 }).notNull(),
    inviteCode: varchar('invite_code', { length: 12 }).notNull(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('prayer_groups_invite_code_idx').on(table.inviteCode)],
);

export const prayerGroupMembers = pgTable(
  'prayer_group_members',
  {
    groupId: uuid('group_id').notNull().references(() => prayerGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 10 }).default('member').notNull(), // 'owner' | 'member'
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index('prayer_group_members_user_idx').on(table.userId),
  ],
);

// ─── Prayer Challenges ───

export const prayerChallenges = pgTable(
  'prayer_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => prayerGroups.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    // Number of complete days (all 5 prayed/assumed/excused) each member aims for
    goalDays: integer('goal_days').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('prayer_challenges_group_idx').on(table.groupId)],
);

// ─── Prayer Settings (per-user location + calculation) ───

export const prayerSettings = pgTable('prayer_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
  longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
  timezone: text('timezone').notNull(),
  // AlAdhan method ID, 2 = ISNA
  calculationMethod: integer('calculation_method').default(2).notNull(),
  // 'standard' or 'hanafi' — affects Asr calculation
  madhab: text('madhab').default('standard'),
  // ── Friends visibility controls (privacy-preserving defaults) ──
  // Streak is visible by default; today's detailed per-prayer status and
  // sunnah logs are hidden by default. Users opt in to share more.
  friendsSeeStreak: boolean('friends_see_streak').default(true).notNull(),
  friendsSeeTodayStatus: boolean('friends_see_today_status').default(false).notNull(),
  friendsSeeSunnah: boolean('friends_see_sunnah').default(false).notNull(),
  friendsSeeMasjidPct: boolean('friends_see_masjid_pct').default(true).notNull(),
  // Opt-in: push me when an accepted friend completes all 5 prayers today
  friendsNotifyComplete: boolean('friends_notify_complete').default(false).notNull(),
  // 'male' | 'female' — captured in onboarding; gates hayd tracking
  gender: text('gender'),
  haydTracking: boolean('hayd_tracking').default(false).notNull(),
  // Selected masjid for iqamah times (external directory id or 'manual')
  masjidExternalId: text('masjid_external_id'),
  masjidName: text('masjid_name'),
  // Iqamah config: directory offsets/fixed arrays (fajr..isha order) or manual per-prayer times
  masjidIqamah: jsonb('masjid_iqamah').$type<{
    manual?: Partial<Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', string>>;
    fixed?: (string | null)[];
    offsets?: (number | null)[];
    jummah?: string[] | null;
  }>(),
  useIqamahReminders: boolean('use_iqamah_reminders').default(false).notNull(),
  // Global minute offset applied to all displayed prayer times
  timeOffsetMinutes: integer('time_offset_minutes').default(0).notNull(),
  showNaflTimes: boolean('show_nafl_times').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Hayd Periods (menstruation pause — prayer obligation lifted) ───
export const haydPeriods = pgTable('hayd_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'), // null = ongoing
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('hayd_periods_user_idx').on(table.userId, table.startDate),
]);

// ─── Masjid Iqamah (crowdsourced iqamah times) ───
export const masjidIqamah = pgTable('masjid_iqamah', {
  id: uuid('id').primaryKey().defaultRandom(),
  masjidId: text('masjid_id').notNull().unique(), // external id: "osm:node/123", "mq:uuid"
  masjidName: text('masjid_name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  fajr: text('fajr'),
  dhuhr: text('dhuhr'),
  asr: text('asr'),
  maghrib: text('maghrib'),
  isha: text('isha'),
  jummah: jsonb('jummah').$type<string[]>(),
  // set null on account deletion — community data survives the contributor
  submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('masjid_iqamah_geo_idx').on(table.lat, table.lng),
]);

// ─── Masjid Sources (praytime registry: masjid → public iqamah endpoint) ───
export const masjidSources = pgTable('masjid_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  timezone: text('timezone'),
  website: text('website'),
  fetchUrl: text('fetch_url'),
  platform: text('platform'),
  // Server-side cache of resolved iqamah — avoids refetching the masjid's
  // homepage/widget endpoint on every nearby request.
  iqamahCache: jsonb('iqamah_cache').$type<{ fixed: (string | null)[]; offsets?: (number | null)[]; jummah: string[]; provider?: string } | null>(),
  iqamahCheckedAt: timestamp('iqamah_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('masjid_sources_geo_idx').on(table.lat, table.lng),
]);

// ─── Prayer Blocks (prevent unwanted friend requests) ───
export const prayerBlocks = pgTable('prayer_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedUserId: uuid('blocked_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('prayer_blocks_user_blocked_idx').on(table.userId, table.blockedUserId),
  index('prayer_blocks_user_idx').on(table.userId),
]);

// ─── Prayer Times Cache (monthly, per user) ───

export const prayerTimesCache = pgTable(
  'prayer_times_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    fajr: time('fajr').notNull(),
    sunrise: time('sunrise').notNull(),
    dhuhr: time('dhuhr').notNull(),
    asr: time('asr').notNull(),
    maghrib: time('maghrib').notNull(),
    isha: time('isha').notNull(),
    // Extra AlAdhan times for nafl markers (nullable for rows synced before 0033)
    imsak: time('imsak'),
    firstThird: time('first_third'),
    lastThird: time('last_third'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('prayer_times_cache_user_date_idx').on(table.userId, table.date),
    // BRIN index for cron range scans (fetch all rows for a date across all users)
    index('prayer_times_cache_date_brin_idx').using('brin', table.date),
  ],
);

// ─── Notification Preferences ───

export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 'push' | 'push_sms' | 'sms'
  prayerEarlyMid: text('prayer_early_mid').default('push').notNull(),
  prayerFinal: text('prayer_final').default('push').notNull(),
  // Locked to 'push' only — no SMS option for other reminders
  otherReminders: text('other_reminders').default('push').notNull(),
  // Per-prayer overrides: { fajr: {mode:'push'|'silent'|'off', beforeMin:number}, ... }
  perPrayer: jsonb('per_prayer').$type<Partial<Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', { mode: 'push' | 'silent' | 'off'; beforeMin: number }>>>(),
});

// ─── Push Subscriptions (web + native) ───

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Web Push fields (used when platform = 'web')
  endpoint: text('endpoint').notNull().default(''),
  p256dh: text('p256dh').notNull().default(''),
  auth: text('auth').notNull().default(''),
  // Native push fields (used when platform = 'ios' or 'android')
  platform: text('platform').notNull().default('web'), // 'web' | 'ios' | 'android'
  token: text('token'), // APNs token (iOS) or FCM token (Android)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Hot path: cron fetches all subs for a user to send push notifications
  userIdIdx: index('push_subscriptions_user_id_idx').on(table.userId),
}));

// ─── Prayer Log (one row per user per prayer per day) ───

export const prayerLog = pgTable(
  'prayer_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    prayerName: prayerName('prayer_name').notNull(),
    wentToMasjid: boolean('went_to_masjid'),
    status: prayerStatus('status').default('pending').notNull(),
    markedAt: timestamp('marked_at', { withTimezone: true }),
    lastCheckinAt: timestamp('last_checkin_at', { withTimezone: true }),
    // 0=none, 1=early, 2=mid, 3=closing
    checkinStage: integer('checkin_stage').default(0).notNull(),
  },
  (table) => [
    uniqueIndex('prayer_log_user_date_prayer_idx').on(
      table.userId,
      table.date,
      table.prayerName,
    ),
    // Partial index for analytics queries (filter on prayed/assumed_prayed)
    index('prayer_log_user_date_prayed_idx').on(table.userId, table.date),
    // BRIN index for cron range scans (append-only, ordered by date)
    index('prayer_log_date_brin_idx').using('brin', table.date),
  ],
);

// ─── Sunnah Log (tracks sunnah/nafl prayers associated with fard prayers) ───

export const sunnahLog = pgTable(
  'sunnah_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    // e.g. "fajr_before", "dhuhr_before", "dhuhr_after", "witr"
    sunnahKey: text('sunnah_key').notNull(),
    // The fard prayer this sunnah is associated with (for ordering checks)
    associatedFard: prayerName('associated_fard').notNull(),
    prayed: boolean('prayed').default(false).notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sunnah_log_user_date_key_idx').on(
      table.userId,
      table.date,
      table.sunnahKey,
    ),
    // Partial index for dashboard queries (filter on prayed=true)
    index('sunnah_log_user_date_prayed_idx').on(table.userId, table.date),
  ],
);

// ─── Qadaa Ledger ───

export const qadaaLedger = pgTable('qadaa_ledger', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Per-salah qadaa counts — each tracks how many of that specific prayer are owed
  fajrOwed: integer('fajr_owed').default(0).notNull(),
  dhuhrOwed: integer('dhuhr_owed').default(0).notNull(),
  asrOwed: integer('asr_owed').default(0).notNull(),
  maghribOwed: integer('maghrib_owed').default(0).notNull(),
  ishaOwed: integer('isha_owed').default(0).notNull(),
  // Whether the initial setup has been completed
  setupCompleted: boolean('setup_completed').default(false).notNull(),
  // Waterline for the "missed prayers since last update" prompt — missed
  // prayer_log rows with a date after this count toward the nudge.
  unloggedSeenThrough: date('unlogged_seen_through'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const qadaaLogEntries = pgTable('qadaa_log_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  // Which prayer was logged as qadaa
  prayerName: text('prayer_name').notNull(),
  // Capped at 1-20 per submission
  amountLogged: integer('amount_logged').notNull(),
  loggedAt: timestamp('logged_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Query: fetch qadaa log entries by user
  userIdIdx: index('qadaa_log_entries_user_id_idx').on(table.userId),
}));

// ─── Calendar Events ───

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // Optional details/note shown under the title in the calendar (smaller, grayer text).
  details: text('details'),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  type: eventType('type').default('block').notNull(),
  // Custom color (hex string like "#c2410c"). Null = use type-based default color.
  color: text('color'),
  // Whether to send a push notification 15 min before this event.
  // Defaults to true. User can disable per-event in the create/edit form.
  notify: boolean('notify').default(true).notNull(),
  // iCal RRULE string, null = one-off
  recurrenceRule: text('recurrence_rule'),
  // Unique identifier for a recurring series. All events in the same series
  // share this UUID. Null for one-off events. Used for bulk update/delete.
  // This is NOT the same as recurrenceRule — two independent series can
  // have the same rule string but different seriesId values.
  seriesId: uuid('series_id'),
  createdVia: text('created_via').default('manual').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // When a push notification was sent for this event (null = not notified yet)
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
}, (table) => ({
  // Hot path: calendar day/month view (user_id = $1 AND start_at BETWEEN $2 AND $3)
  userStartIdx: index('events_user_start_idx').on(table.userId, table.startAt),
  // Notification cron: find events needing notification (partial index)
  pendingNotifyIdx: index('events_pending_notify_idx').on(table.startAt),
  // BRIN index for time-series range scans (100-1000x smaller than B-tree)
  startAtBrinIdx: index('events_start_at_brin_idx').using('brin', table.startAt),
  // Notification cleanup: find events by user + notification status
  userNotifiedIdx: index('events_user_notified_idx').on(table.userId, table.notifiedAt),
  // Bulk update/delete by series — find all events in a recurring series
  seriesIdIdx: index('events_series_id_idx').on(table.userId, table.seriesId),
}));

// ─── Dhikr Sequences (curated content, NOT AI-generated) ───

export const dhikrSequences = pgTable('dhikr_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  phraseArabic: text('phrase_arabic').notNull(),
  phraseTransliteration: text('phrase_transliteration').notNull(),
  targetCount: integer('target_count').notNull(),
  sequenceOrder: integer('sequence_order').notNull(),
  sourceCitation: text('source_citation').notNull(),
});

// ─── Talks Library (self-hosted MP3s on Cloudflare R2 + external links) ───

export const talkFolders = pgTable('talk_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  // Default speaker for talks in this folder (inherited when talk speaker is empty)
  speaker: text('speaker'),
  // R2 storage key for folder image (e.g. "folder-images/uuid.jpg")
  imageKey: text('image_key'),
  // Optional date range for series/events
  startDate: date('start_date'),
  endDate: date('end_date'),
  // Accent color for the folder (auto-assigned from palette, admin can override).
  // Values: "teal" | "amber" | "rose" | "indigo" | "emerald" | "violet" | "orange" | "sky"
  // null = auto-assign based on folder order
  folderColor: text('folder_color'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const talks = pgTable('talks', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').references(() => talkFolders.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  speaker: text('speaker'),
  description: text('description'),
  // Comma-separated topics for search (e.g. "patience, salah, ramadan")
  topics: text('topics'),
  // R2 storage key for the ORIGINAL uploaded MP3
  storageKey: text('storage_key'),
  // R2 storage key for the PROCESSED Opus (after 10-stage filter chain + Opus encode)
  processedStorageKey: text('processed_storage_key'),
  // File size in bytes (for display + offline storage management)
  fileSize: integer('file_size'),
  // Duration in seconds
  duration: integer('duration'),
  // External URL fallback (for legacy talks or external links)
  externalUrl: text('external_url'),
  // Processing pipeline status: pending → processing → ready → published / failed
  processingStatus: text('processing_status').default('pending').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  processingError: text('processing_error'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  folderIdx: index('talks_folder_idx').on(t.folderId),
  processingStatusIdx: index('talks_processing_status_idx').on(t.processingStatus),
  publishedIdx: index('talks_published_idx').on(t.publishedAt),
}));

// ─── Talk Progress (per-user listening state) ───
// Tracks playback position and completion status for each user × talk.
// Used for "listened" checkmarks, folder progress bars, and resume playback.
export const talkProgress = pgTable('talk_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  talkId: uuid('talk_id').notNull().references(() => talks.id, { onDelete: 'cascade' }),
  // Last playback position in seconds (0 if not started)
  position: integer('position').default(0).notNull(),
  // Whether the user has marked this talk as listened (auto at 100% or manual checkmark)
  completed: boolean('completed').default(false).notNull(),
  // When the talk was completed
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // Last time the user interacted with this talk (play, pause, seek)
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // One progress record per user × talk
  userTalkIdx: uniqueIndex('talk_progress_user_talk_idx').on(t.userId, t.talkId),
  userCompletedIdx: index('talk_progress_user_completed_idx').on(t.userId, t.completed),
}));

// ─── Trusted Devices (FingerprintJS) ───

export const trustedDevices = pgTable('trusted_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // SHA-256 hash of the FingerprintJS visitorId — never store raw fingerprint
  fingerprintHash: text('fingerprint_hash').notNull(),
  // Optional label for the user to identify the device (e.g. "iPhone 15")
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // One device per user — prevents duplicate entries
  userDeviceIdx: uniqueIndex('trusted_devices_user_hash_idx').on(t.userId, t.fingerprintHash),
}));

// ─── Login Attempts (per-account brute-force protection) ───
// DB-backed so it survives serverless cold starts and is shared across instances.
// Tracks failed login attempts per email. After 10 failures in 15 min, the
// account is locked. Successful login clears the counter.

export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  failedAt: timestamp('failed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Index for fast lookup of recent attempts by email
  emailFailedAtIdx: index('login_attempts_email_failed_at_idx').on(t.email, t.failedAt),
}));

// ─── Password Reset Tokens ───
// Single-use, expiring, SHA-256 hashed tokens for the email-link reset flow.
// The raw token only ever exists in the emailed URL — never stored or logged.

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('password_reset_tokens_user_idx').on(t.userId),
}));

// ─── Goals (hierarchical goal tracking with tree/list views) ───

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Self-referencing FK — the cascade delete is handled in the migration SQL
  // because Drizzle's type inference can't handle () => goals.id in the same initializer
  parentId: uuid('parent_id'),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('active').notNull(), // active | done | archived | backlog
  // Type: long-term (yearly/life goals) vs short-term (weekly/monthly milestones)
  goalType: text('goal_type').default('short_term').notNull(), // long_term | short_term
  // Optional target date — when the goal should be achieved by
  targetDate: date('target_date'),
  // Optional progress tracking — when progressTarget is set, the goal is a
  // "target tracker" (e.g. read 300 pages by June) and the UI shows a pace
  // line: expected progress vs actual progress over elapsed time.
  progressCurrent: integer('progress_current').default(0).notNull(),
  progressTarget: integer('progress_target'),
  sortOrder: integer('sort_order').default(0).notNull(),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  // Index for querying goals by user
  userIdIdx: index('goals_user_id_idx').on(table.userId),
  // Index for querying children of a goal
  parentIdIdx: index('goals_parent_id_idx').on(table.parentId),
  // Composite index for list query: WHERE user_id = $1 ORDER BY sort_order, created_at
  // Eliminates the sort step
  userSortCreatedIdx: index('goals_user_sort_created_idx').on(table.userId, table.sortOrder, table.createdAt),
  // Filter by type (long-term vs short-term tabs)
  userIdxType: index('goals_user_type_idx').on(table.userId, table.goalType),
  // Filter by target date (Today tab: goals due this week)
  userIdxTargetDate: index('goals_user_target_date_idx').on(table.userId, table.targetDate),
}));

export const goalShareTokens = pgTable('goal_share_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Query: list/revoke share tokens by user
  userIdIdx: index('goal_share_tokens_user_id_idx').on(table.userId),
}));

// ─── Homework Tracker ─────────────────────────────────────────────────
// Students can track homework assignments with due dates, categorize by class,
// and see them as colored dots on the calendar.

export const homeworkStatus = pgEnum('homework_status', ['pending', 'completed']);
export const homeworkPriority = pgEnum('homework_priority', ['low', 'medium', 'high']);
export const homeworkKind = pgEnum('homework_kind', ['homework', 'test', 'quiz', 'exam', 'essay', 'lab', 'project', 'presentation', 'worksheet', 'reading', 'study', 'other']);

// Classes (subjects) — color-coded for calendar dots and list chips
export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull(),
  archived: boolean('archived').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('classes_user_id_idx').on(table.userId),
}));

// Homework assignments
export const homeworks = pgTable('homeworks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
  dueDate: date('due_date').notNull(),
  dueTime: time('due_time'),
  priority: homeworkPriority('priority').default('medium').notNull(),
  status: homeworkStatus('status').default('pending').notNull(),
  kind: homeworkKind('kind').default('homework').notNull(),
  // "Do date" — when the user plans to work on it (distinct from due date).
  // plannedEventId links to a synced events row so it renders on the calendar.
  plannedDate: date('planned_date'),
  plannedStartTime: time('planned_start_time'),
  plannedEndTime: time('planned_end_time'),
  estimatedMinutes: integer('estimated_minutes'),
  plannedEventId: uuid('planned_event_id').references(() => events.id, { onDelete: 'set null' }),
  // Deadline reminder stages — set once each stage push is sent (cron)
  notified3dAt: timestamp('notified_3d_at', { withTimezone: true }),
  notified1dAt: timestamp('notified_1d_at', { withTimezone: true }),
  notifiedMorningAt: timestamp('notified_morning_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Hot path: list homework by user ordered by due date
  userDueIdx: index('homeworks_user_due_idx').on(table.userId, table.dueDate),
  // Planned study sessions for a user's day
  userPlannedIdx: index('homeworks_user_planned_date_idx').on(table.userId, table.plannedDate),
  // Filter by class
  userClassIdx: index('homeworks_user_class_idx').on(table.userId, table.classId),
  // Filter by status
  userStatusIdx: index('homeworks_user_status_idx').on(table.userId, table.status),
  // Auto-prune: filter by userId + status + completedAt
  userStatusCompletedIdx: index('homeworks_user_status_completed_idx').on(table.userId, table.status, table.completedAt),
}));

// Homework subtasks — checklist steps inside an assignment
export const homeworkSubtasks = pgTable('homework_subtasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  homeworkId: uuid('homework_id').notNull().references(() => homeworks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  homeworkIdIdx: index('homework_subtasks_homework_idx').on(table.homeworkId),
  userIdIdx: index('homework_subtasks_user_idx').on(table.userId),
}));

// ─── Habits (daily/weekly habit tracking with streaks) ───────────────

export const habitFrequency = pgEnum('habit_frequency', ['daily', 'weekly']);

export const habits = pgTable('habits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  frequency: habitFrequency('frequency').default('daily').notNull(),
  // Optional time-of-day grouping: morning | afternoon | evening | night
  timeOfDay: text('time_of_day'),
  // Optional specific time (e.g., "07:00") for reminders/display
  reminderTime: text('reminder_time'),
  color: text('color').default('#c2410c').notNull(),
  targetCount: integer('target_count').default(1).notNull(),
  archived: boolean('archived').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('habits_user_id_idx').on(table.userId),
}));

// Habit completion logs — one row per habit per date
export const habitLogs = pgTable('habit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  habitId: uuid('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  date: date('date').notNull(), // YYYY-MM-DD
  count: integer('count').default(1).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: one log per habit per date
  userHabitDateIdx: uniqueIndex('habit_logs_user_habit_date_idx').on(table.userId, table.habitId, table.date),
  // Query all logs for a user on a date (Today tab)
  userDateIdx: index('habit_logs_user_date_idx').on(table.userId, table.date),
}));

// ─── Notes (quick brain dump / journal) ──────────────────────────────

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  content: text('content').notNull().default(''),
  pinned: boolean('pinned').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('notes_user_id_idx').on(table.userId),
  userUpdatedIdx: index('notes_user_updated_idx').on(table.userId, table.updatedAt),
}));

// ─── Sadaqah Tracker ───

export const sadaqahLogs = pgTable(
  'sadaqah_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(), // currency amount
    currency: text('currency').default('USD').notNull(),
    category: text('category').notNull(), // 'sadaqah' | 'zakat' | 'fidyah' | 'charity'
    note: text('note'),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('sadaqah_logs_user_id_idx').on(table.userId),
    userDateIdx: index('sadaqah_logs_user_date_idx').on(table.userId, table.date),
  }),
);

// ─── Type Exports (for use in app code) ───

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PrayerSettings = typeof prayerSettings.$inferSelect;
export type PrayerTimesCache = typeof prayerTimesCache.$inferSelect;
export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type PrayerLog = typeof prayerLog.$inferSelect;
export type NewPrayerLog = typeof prayerLog.$inferInsert;
export type QadaaLedger = typeof qadaaLedger.$inferSelect;
export type QadaaLogEntry = typeof qadaaLogEntries.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type DhikrSequence = typeof dhikrSequences.$inferSelect;
export type Talk = typeof talks.$inferSelect;
export type TalkFolder = typeof talkFolders.$inferSelect;
export type TalkProgress = typeof talkProgress.$inferSelect;
export type PrayerFriend = typeof prayerFriends.$inferSelect;
export type PrayerBlock = typeof prayerBlocks.$inferSelect;
export type TrustedDevice = typeof trustedDevices.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type GoalShareToken = typeof goalShareTokens.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
export type Homework = typeof homeworks.$inferSelect;
export type NewHomework = typeof homeworks.$inferInsert;
export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type SadaqahLog = typeof sadaqahLogs.$inferSelect;
export type NewSadaqahLog = typeof sadaqahLogs.$inferInsert;
export type HabitLog = typeof habitLogs.$inferSelect;
export type NewHabitLog = typeof habitLogs.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type HaydPeriod = typeof haydPeriods.$inferSelect;
export type MasjidIqamah = typeof masjidIqamah.$inferSelect;
export type MasjidSource = typeof masjidSources.$inferSelect;
