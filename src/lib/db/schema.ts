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
  uniqueIndex,
  index,
  pgEnum,
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
  // 6-character prayer share code — share with friends to let them see your prayer streaks
  prayerCode: text('prayer_code').unique(),
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
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
});

// ─── Web Push Subscriptions ───

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
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
  userId: uuid('user_id').notNull(),
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
export const homeworkKind = pgEnum('homework_kind', ['homework', 'test', 'project', 'quiz', 'reading', 'other']);

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
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Hot path: list homework by user ordered by due date
  userDueIdx: index('homeworks_user_due_idx').on(table.userId, table.dueDate),
  // Filter by class
  userClassIdx: index('homeworks_user_class_idx').on(table.userId, table.classId),
  // Filter by status
  userStatusIdx: index('homeworks_user_status_idx').on(table.userId, table.status),
  // Auto-prune: filter by userId + status + completedAt
  userStatusCompletedIdx: index('homeworks_user_status_completed_idx').on(table.userId, table.status, table.completedAt),
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
