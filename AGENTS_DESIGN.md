# Waqt — Agent Design Rules for Hydration Safety

> **Read this file before writing any client component (`"use client"`) that
> renders dates, times, or any locale-dependent text. Failure to follow these
> rules causes hydration mismatches that crash the app in production.**

---

## The Problem

Next.js 16 with React 19 treats hydration mismatches aggressively. A single
text content difference between the server-rendered HTML and the client's
first render can trigger the error boundary, showing "Something went wrong"
and breaking all client-side navigation (links, buttons, state updates).

### What causes mismatches

The server (Node.js) and the client (browser) have **different ICU data** for
locale-dependent APIs. The same function call produces different output:

| API | Server (Node.js) | Client (Chrome) | Mismatch? |
|-----|------------------|-----------------|-----------|
| `new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })` | `"Jan 5"` | `"Jan. 5"` | YES |
| `new Intl.DateTimeFormat("en-US-u-ca-islamic").format(date)` | May throw (no ICU) | `"5 Jumada al-Akhirah 1447"` | YES |
| `new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })` | Server time zone | Browser time zone | YES |
| `new Date().getHours()` | Server local time | User local time | YES |

### What does NOT cause mismatches

- Pure arithmetic: `new Date(y, m-1, d).getDay()` — same result everywhere
- Hardcoded arrays: `["January", "February", ...]`
- String splitting: `"2025-01-05".split("-")` — deterministic
- State that starts as `null`/`""` and is set in `useEffect` — both server
  and client render the same initial value

---

## The Rules

### Rule 1: Never call locale-dependent APIs during render

**BANNED in render path** (component body, useMemo, direct JSX):

```tsx
// ❌ NEVER — causes hydration mismatch
const formatted = dateObj.toLocaleDateString("en-US", { month: "long" });
const hijri = new Intl.DateTimeFormat("en-US-u-ca-islamic").format(dateObj);
const now = new Date().toLocaleString("en-US", { timeZone: tz });
const hour = new Date().getHours();
```

### Rule 2: Compute locale-dependent strings in useEffect

```tsx
// ✅ CORRECT — compute after mount, render stable fallback during SSR
const [formattedDate, setFormattedDate] = useState("");

useEffect(() => {
  Promise.resolve().then(() => {
    setFormattedDate(dateObj.toLocaleDateString("en-US", { month: "long" }));
  });
}, [dateObj]);

return <h1>{formattedDate || "Loading..."}</h1>;
```

The `Promise.resolve().then(...)` wrapper defers the `setState` outside the
effect body to avoid the `react-hooks/set-state-in-effect` ESLint warning.

### Rule 3: Use stable fallbacks during SSR

The fallback must be **identical** on server and client initial render:

```tsx
// ✅ Good — empty string is the same on server and client
const [label, setLabel] = useState("");

// ✅ Good — ISO date string is deterministic
const fallback = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// ❌ Bad — new Date() produces different values
const fallback = new Date().toISOString();
```

### Rule 4: `new Date()` in render is a hydration bomb

`new Date()` returns the current time, which differs between server and client
by the network round-trip time. Even `new Date("2025-01-05T00:00:00")` is safe
(deterministic), but `new Date()` (no args) is NOT.

```tsx
// ❌ NEVER in render path
const now = new Date();
const isPast = eventEnd < now;

// ✅ Move to useEffect or useMemo with state
const [now, setNow] = useState<number | null>(null);
useEffect(() => {
  Promise.resolve().then(() => setNow(Date.now()));
}, []);
const isPast = now !== null && eventEnd < now;
```

### Rule 5: `suppressHydrationWarning` is a last resort

Use `suppressHydrationWarning` only when:
- The mismatch is purely visual (e.g., theme class on `<html>`)
- You cannot restructure the component to defer the value

```tsx
// Acceptable for the theme script pattern
<html suppressHydrationWarning>
```

Do NOT use it as a general-purpose fix for date formatting. Use Rule 2 instead.

### Rule 6: Conditional rendering based on `loading` is safe

If a locale-dependent value is only rendered when `!loading`, and `loading`
starts as `true` on both server and client, the mismatched code path is never
reached during SSR:

```tsx
// ✅ Safe — loading starts true, so this doesn't render during SSR
{!loading && (
  <span>{event.date.toLocaleDateString("en-US")}</span>
)}
```

### Rule 7: `getOfflineDB()` and `window`/`navigator` are safe in effects

Client-only APIs (`window`, `navigator`, `IndexedDB`) are safe inside
`useEffect` and `useCallback` called from `useEffect`. They are NOT safe in
the render body:

```tsx
// ❌ NEVER in render body
const online = navigator.onLine;

// ✅ Safe in useEffect
useEffect(() => {
  setIsOnline(navigator.onLine);
}, []);
```

---

## Checklist for New Client Components

Before marking a `"use client"` component as done:

- [ ] No `toLocaleDateString`, `toLocaleString`, `toLocaleTimeString` in render
- [ ] No `Intl.DateTimeFormat` in render (except inside useEffect)
- [ ] No `new Date()` (no args) in render
- [ ] No `new Date().getHours()`, `.getMinutes()`, `.getDay()` in render
- [ ] No `window`, `navigator`, `document` in render body
- [ ] No `Math.random()` or `Date.now()` in render
- [ ] All locale-dependent strings computed in `useEffect` with stable fallback
- [ ] `useState` initial values are identical on server and client
- [ ] `suppressHydrationWarning` only used for theme/SSR-specific cases

---

## Verified Components

These components have been audited and follow the rules:

| Component | Status | Notes |
|-----------|--------|-------|
| `DayDateHeader` | ✅ Fixed | `formattedDate` and `hijriDate` moved to useEffect |
| `ListViewClient` | ✅ Fixed | `weekLabel` moved to useEffect; prayer times API parsing fixed |
| `MonthViewClient` | ✅ Safe | Uses hardcoded month names; `today` in useEffect |
| `DayViewClient` | ✅ Safe | Locale calls only in useEffect or conditional rendering |
| `GlobalAudioPlayer` | ✅ Safe | Uses `mounted` guard; no locale APIs |
| `PrayerCheckinPopup` | ✅ Safe | Time computed in render but popup only opens on user interaction |

---

## Common Anti-Patterns to Avoid

### 1. `useMemo` with locale-dependent calls

```tsx
// ❌ useMemo runs during render — locale mismatch
const label = useMemo(() => {
  return date.toLocaleDateString("en-US", { month: "long" });
}, [date]);
```

### 2. Direct `new Date()` in JSX

```tsx
// ❌ Different timestamp on server vs client
<span>Last updated: {new Date().toLocaleTimeString()}</span>
```

### 3. `Intl.DateTimeFormat` for Hijri/Islamic calendar in render

```tsx
// ❌ Server may not support Islamic calendar ICU data
const hijri = new Intl.DateTimeFormat("en-US-u-ca-islamic").format(date);
```

### 4. Browser timezone in render

```tsx
// ❌ Server timezone ≠ user's browser timezone
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const time = new Date().toLocaleString("en-US", { timeZone: tz });
```

---

## Verification

After writing any client component, verify:

```bash
pnpm exec tsc --noEmit              # Type check
pnpm exec eslint --max-warnings=0   # Lint (includes hydration rules)
pnpm run build                      # Production build
```

Then test in the browser:
1. Hard refresh (Ctrl+Shift+R) — no hydration errors in console
2. Navigate between routes — no "Something went wrong" error boundary
3. Check React DevTools for hydration warnings

---

## Data Loading and Scale Rules

### Never fetch with a placeholder date

A client date is unresolved until the browser initializes it. Do not derive an
API parameter from `new Date(0)`, an empty fallback, or a server-local date.
Keep the date nullable and return early from callbacks/effects until it exists.
This prevents an epoch request followed by the real request during hydration.

### One user action means one request

- Audit mount effects for duplicate fetches caused by changing hydration state.
- Deduplicate request-scoped server reads with `React.cache()` when appropriate.
- Do not combine navigation preload with a second manual navigation fetch.
- Do not warm service-worker caches on every focus, visibility, or online event.
  Cache warming needs an in-flight guard and a cooldown.
- Do not POST an unchanged push subscription on every page load.

### Every hot query is bounded and projected

- User-facing list APIs require a date/range filter, pagination, or a hard limit.
- Select only columns used by the response; do not use `SELECT *` on hot routes.
- Add indexes for columns used by recurring filters, ownership checks, and sort
  order. Verify with the generated SQL or an execution plan for large tables.
- GET handlers are read-only. Never delete, normalize, or otherwise mutate data
  while serving a read.
- Authenticate before data access and filter every user-owned row by the current
  `session.userId`. Never accept ownership from the client.

### Dynamic routes and optional bundles

- Disable link prefetch for highly dynamic authenticated routes when prefetching
  would generate avoidable server and database traffic.
- Lazy-load large, rarely used client features.
- `next/dynamic({ ssr: false })` belongs in a Client Component, never directly
  in a Server Component.

---

## Talks Library and Audio Publishing Rules

### Catalog reads

- Catalog responses must be bounded and must not expose R2 storage keys.
- Do not generate a presigned R2 URL for every catalog item. Return a stable,
  authenticated application stream URL and sign only the selected talk.
- Search, history, downloads, loading, failure, no-results, no-downloads, empty
  folder, and empty-library states are required parts of the customer UI.
- Talks and all religious content remain human-curated; never generate filler.

### Offline audio

- The audio cache name is release-independent. App cache-version changes must
  not erase user downloads.
- Never use a rotating presigned URL as an offline identity. Match a stable app
  stream URL or the stable object path and remove old keys when replacing it.
- The player and library must use the same shared cache helpers and cache name.
- Only cache complete successful audio responses; never store partial 206 bodies
  as complete downloads.

### Admin uploads and processing

- Validate UUIDs, JSON, file extensions, declared sizes, URL protocols, and date
  ranges on the server even when the form also validates them.
- Direct uploads require bounded sizes. Clean up a newly uploaded object if its
  database record cannot be created.
- Processing claims must be atomic so two requests cannot process one talk.
- Record a processing start time and permit safe recovery after the serverless
  processing deadline; a talk must not remain permanently stuck in `processing`.
- Delete the database row first, then remove original and processed R2 objects
  best-effort. Replacing/deleting folder art must clean up the prior object.
- Avoid duplicate large-file disk writes and unbounded in-memory work.
- Polling intervals require terminal states, a maximum lifetime, and unmount
  cleanup. Never leave an interval running after navigation.

### Mobile and iPhone verification

For customer and admin talk flows, verify 320px, 375px, 414px, and 768px:

- No horizontal overflow in metadata, status badges, or action rows.
- Controls are at least 44px where practical and have accessible names/focus.
- Action rows wrap or stack before text becomes unreadable.
- File inputs work with the iOS picker and show selected file name and size.
- Upload/processing state uses `aria-live` and cannot be accidentally dismissed.
- Fixed player/navigation surfaces include `env(safe-area-inset-bottom)`.
- Test reduced motion, keyboard navigation, offline launch, and reconnect.

---

## Service Worker Navigation Caching Rules

### Navigation MUST be network-first, not stale-while-revalidate

The service worker's navigation handler MUST try the network first and fall
back to cache only when the network fails. Serving cached HTML first
(stale-while-revalidate) breaks pages whose content depends on the URL query
string:

- `/calendar/day?date=2024-01-07` and `/calendar/day?date=2024-01-08` share
  the same pathname (`/calendar/day`) but render completely different HTML.
- If the SW caches by pathname only, every `?date=` variant serves the same
  stale page — the user cannot switch days.

### Cache keys MUST include the query string

When caching navigation responses, use the **full URL** (pathname + search)
as the cache key, not just the pathname. This ensures each date variant gets
its own offline cache entry. Fall back to a pathname-only match only when the
full URL has no cache entry (for older SW versions that used pathname-only keys).

### What to cache vs. what to always fetch

| Request type | Strategy | Why |
|---|---|---|
| Navigation (HTML pages) | Network-first | Pages are `force-dynamic`; query string changes content |
| RSC/Flight payloads | Network-only | Tied to build ID + session; caching causes stale data |
| `_next/static/` chunks | Cache-first | Content-hashed, immutable |
| API GET (events, etc.) | Stale-while-revalidate | Data changes infrequently; SWR is safe for reads |
| API writes (POST/PATCH/DELETE) | Online: pass-through, Offline: queue | Never cache writes |

### Never serve a cached page for a different URL variant

If the user navigates to `/calendar/day?date=2024-01-08` and the SW only has
`/calendar/day` (no query string) cached, it MUST NOT serve that cached page
as if it were the requested URL. The cached page was rendered for a different
date. Instead, fetch from the network. Only serve the pathname-only cache as a
last-resort fallback when the network is down AND no full-URL cache exists.
