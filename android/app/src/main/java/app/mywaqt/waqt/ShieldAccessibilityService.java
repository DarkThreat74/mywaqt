package app.mywaqt.waqt;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Watches which app is in the foreground (TYPE_WINDOW_STATE_CHANGED) and,
 * while a prayer window is open and unmarked, covers blocked apps with a
 * full-screen overlay pointing back to Waqt.
 *
 * Everything is read from SharedPreferences ("salah_shield") — the web layer
 * pushes windows as absolute epoch milliseconds, so no network, timers, or
 * timezone math run at blocking time and a schedule pushed yesterday still
 * covers post-midnight Isha correctly. Once every pushed window has ended
 * the schedule is inert — blocking can never fire on stale data.
 */
public class ShieldAccessibilityService extends AccessibilityService {

    private WindowManager wm;
    private android.view.View overlay;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable ticker;
    private TextView countdownView;
    private long overlayEndsAtMs = 0;
    private String overlayPrayer = null;

    /** Social/distracting packages — curated, so no QUERY_ALL_PACKAGES needed.
     *  Overridden by the "blocked_apps" StringSet the web layer syncs. */
    private static final Set<String> DEFAULT_BLOCKED = new HashSet<>(java.util.Arrays.asList(
            "com.instagram.android",
            "com.zhiliaoapp.musically",        // TikTok
            "com.ss.android.ugc.trill",      // TikTok (regional)
            "com.twitter.android",
            "com.x.android",
            "com.facebook.katana",
            "com.snapchat.android",
            "com.reddit.frontpage",
            "com.google.android.youtube",
            "com.discord",
            "org.telegram.messenger",
            "tv.twitch.android.app",
            "com.pinterest",
            "com.linkedin.android",
            "com.tumblr",
            "com.threads.android",
            "com.netflix.mediaclient",
            "com.spotify.music",
            "com.whatsapp",
            "com.bereal.ft"
    ));

    // ── Local scroll counter ──
    // Counted apps — short-form feeds. Each debounced TYPE_VIEW_SCROLLED
    // event ≈ one more piece of content consumed. Everything stays in
    // SharedPreferences on this device; nothing is uploaded.
    private static final Set<String> SCROLL_APPS = new HashSet<>(java.util.Arrays.asList(
            "com.instagram.android",
            "com.instagram.lite",
            "com.zhiliaoapp.musically",        // TikTok
            "com.ss.android.ugc.trill",      // TikTok (regional)
            "com.ss.android.ugc.aweme",      // TikTok/Douyin variants
            "com.zhiliaoapp.musically.go",   // TikTok Lite
            "com.google.android.youtube",
            "com.snapchat.android",
            "com.facebook.katana",
            "com.facebook.lite",
            "com.twitter.android",
            "com.x.android",
            "com.threads.android",
            "com.reddit.frontpage",
            "com.pinterest",
            "com.kwai.video",                // Kwai
            "com.smile.gifmaker",            // Kuaishou
            "video.likee",                   // Likee
            "com.next.innovation.takatak"    // Josh/MX TakaTak class apps
    ));
    // Apps where every scroll is already a feed — count all scroll events.
    private static final Set<String> FEED_ALWAYS = new HashSet<>(java.util.Arrays.asList(
            "com.instagram.android", "com.instagram.lite",
            "com.zhiliaoapp.musically", "com.ss.android.ugc.trill",
            "com.ss.android.ugc.aweme", "com.zhiliaoapp.musically.go",
            "com.kwai.video", "com.smile.gifmaker", "video.likee"
    ));
    // For the rest (YouTube/Facebook/Snap/Reddit/…), only count scrolls on
    // surfaces that look like SHORT-FORM content — a scrolled node's id or
    // class must contain one of these. Per-app so YouTube's home feed and
    // long-video pages don't count; generic "recycler"/"list" would match
    // every settings page and DM thread, so they're deliberately absent.
    private static final java.util.Map<String, String[]> SHORT_HINTS = new java.util.HashMap<String, String[]>() {{
        put("com.google.android.youtube", new String[]{"reel", "shorts", "pivot"});            // Shorts only, not Home/watch pages
        put("com.facebook.katana",      new String[]{"reel", "stories", "watch", "video"});
        put("com.facebook.lite",        new String[]{"reel", "stories", "watch", "video"});
        put("com.snapchat.android",     new String[]{"spotlight", "stories", "discover", "subscription"});
        put("com.twitter.android",      new String[]{"timeline", "video"});
        put("com.x.android",            new String[]{"timeline", "video"});
        put("com.threads.android",      new String[]{"feed", "timeline"});
        put("com.reddit.frontpage",     new String[]{"feed", "post", "video"});
        put("com.pinterest",            new String[]{"pin", "feed", "idea", "story"});
        put("com.next.innovation.takatak", new String[]{"feed", "video", "pager"});
    }};
    private static final String[] SHORT_HINTS_DEFAULT = {
            "reel", "shorts", "spotlight", "video", "clips", "for_you", "fyp", "feed"
    };
    // One counted scroll ≈ one piece of content. A swipe burst produces many
    // raw scroll events; ~1.2s between counts approximates "next video" and
    // soaks up double-fires on the same card.
    private static final long SCROLL_DEBOUNCE_MS = 1200;

    // Activities that are never a feed, even inside a feed app — DMs, chats,
    // search, comments, camera, settings. Tracked from window-state events:
    // the class name there IS the activity (e.g. DirectThreadActivity).
    private static final String[] NOT_FEED_ACTIVITY = {
            "direct", "message", "messenger", "chat", "inbox", "comment",
            "setting", "search", "camera", "call", "share", "picker",
            "login", "onboarding", "browser", "weblink", "webview", "reply"
    };
    private String fgActivity = "";

    // Transient system windows — notification shade, permission dialogs,
    // keyboard — fire window-state events but aren't "leaving the app".
    // Ignoring them keeps the pill alive while they're on screen.
    private static final Set<String> TRANSIENT_PKGS = new HashSet<>(java.util.Arrays.asList(
            "com.android.systemui",
            "android",
            "com.google.android.permissioncontroller",
            "com.android.packageinstaller"
    ));
    private boolean isTransientPkg(String pkg) {
        return TRANSIENT_PKGS.contains(pkg) || pkg.contains("inputmethod");
    }

    // Human labels for the overlay's expanded line.
    private static final java.util.Map<String, String> SCROLL_APP_NAMES = new java.util.HashMap<String, String>() {{
        put("com.instagram.android", "Instagram"); put("com.instagram.lite", "Instagram Lite");
        put("com.zhiliaoapp.musically", "TikTok"); put("com.ss.android.ugc.trill", "TikTok");
        put("com.ss.android.ugc.aweme", "TikTok"); put("com.zhiliaoapp.musically.go", "TikTok Lite");
        put("com.google.android.youtube", "YouTube"); put("com.snapchat.android", "Snapchat");
        put("com.facebook.katana", "Facebook"); put("com.facebook.lite", "Facebook Lite");
        put("com.twitter.android", "X"); put("com.x.android", "X");
        put("com.threads.android", "Threads"); put("com.reddit.frontpage", "Reddit");
        put("com.pinterest", "Pinterest"); put("com.kwai.video", "Kwai");
        put("com.smile.gifmaker", "Kuaishou"); put("video.likee", "Likee");
        put("com.next.innovation.takatak", "Josh");
    }};

    private android.view.View counterView;
    private TextView counterText;
    private long lastScrollAt = 0;
    private String fgPkg = null;
    private long fgSince = 0;
    private int counterX = -1, counterY = -1; // remembered drag position
    private boolean counterExpanded = false;

    private SharedPreferences prefs() {
        return getSharedPreferences(SalahShieldPlugin.PREFS, MODE_PRIVATE);
    }

    private boolean counterEnabled() {
        return prefs().getBoolean("scroll_counter", true);
    }

    private static String todayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /** Today's stats object — {total, apps:{pkg:n}, sec:{pkg:s}} — created fresh
     *  when the stored date has rolled over. */
    private JSONObject todayStats() throws Exception {
        SharedPreferences p = prefs();
        JSONObject day = null;
        String raw = p.getString("scroll_today", null);
        if (raw != null) {
            day = new JSONObject(raw);
            if (!todayKey().equals(day.optString("date"))) {
                try { flushSession(day); } catch (Exception ignored) {}
                archiveDay(day);                    // move yesterday into history
                day = null;
            }
        }
        if (day == null) {
            day = new JSONObject();
            day.put("date", todayKey());
            day.put("total", 0);
            day.put("apps", new JSONObject());
            day.put("sec", new JSONObject());
        }
        return day;
    }

    private void saveToday(JSONObject day) {
        prefs().edit().putString("scroll_today", day.toString()).apply();
    }

    /** Yesterday's finished stats go into scroll_history (last 14 days kept). */
    private void archiveDay(JSONObject day) {
        try {
            String raw = prefs().getString("scroll_history", "{}");
            JSONObject hist = new JSONObject(raw);
            hist.put(day.optString("date"), day);
            // prune to newest 14 entries
            java.util.List<String> keys = new java.util.ArrayList<>();
            java.util.Iterator<String> it = hist.keys();
            while (it.hasNext()) keys.add(it.next());
            java.util.Collections.sort(keys);
            while (keys.size() > 14) hist.remove(keys.remove(0));
            prefs().edit().putString("scroll_history", hist.toString()).apply();
        } catch (Exception ignored) {}
    }

    /** True when the scrolled surface looks like a feed — checked against the
     *  event source's view-id and class name for feed-ish hints. */
    private boolean looksLikeFeed(String pkg, AccessibilityEvent event) {
        try {
            AccessibilityNodeInfo src = event.getSource();
            if (src == null) return false;
            String id = src.getViewIdResourceName();
            String cls = String.valueOf(event.getClassName());
            src.recycle();
            if (id == null) id = "";
            String hay = (id + " " + cls).toLowerCase(Locale.US);
            String[] hints = SHORT_HINTS.get(pkg);
            if (hints == null) hints = SHORT_HINTS_DEFAULT;
            for (String h : hints) if (hay.contains(h)) return true;
            return false;
        } catch (Exception e) { return false; }
    }

    // Last window-state change — scrolls within 500ms of a transition are
    // usually layout settles / keyboard animations, not real swipes.
    private long lastWindowChangeAt = 0;
    // Nested scrolling fires the same delta on child + parent in one frame —
    // count identical deltas within a frame-window once, not twice.
    private int lastDistPx = 0;
    private long lastDistAt = 0;
    // WebViews/long-text report absolute position, not deltas or items —
    // diff successive scrollY per app (Scrollmeter's third measurement tier).
    private final java.util.Map<String, Integer> lastScrollYByPkg = new java.util.HashMap<>();

    /** Pixel distance this event moved, or 0. API 28+ reports exact deltas;
     *  WebViews report position (scrollY diff); other toolkits fall back to
     *  item-index × quarter-screen. Jumps >~4 screens are feed resets. */
    private int scrollDistancePx(String pkg, AccessibilityEvent event) {
        int screenH = getResources().getDisplayMetrics().heightPixels;
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            try {
                int dy = event.getScrollDeltaY(), dx = event.getScrollDeltaX();
                if (dy != -1 || dx != -1) {
                    int d = Math.max(Math.abs(dy), Math.abs(dx));
                    return d <= screenH * 4 ? d : 0;
                }
            } catch (Exception ignored) {}
        }
        int from = event.getFromIndex(), to = event.getToIndex();
        if (from >= 0 && to >= 0 && to != from) {
            int items = Math.min(Math.abs(to - from), 8);
            // Pager feeds (TikTok/Reels/Shorts) show one full-screen item per
            // card; list feeds average ~quarter-screen rows.
            int perItem = FEED_ALWAYS.contains(pkg) ? screenH : screenH / 4;
            return items * perItem;
        }
        int y = event.getScrollY();
        if (y >= 0) {
            Integer last = lastScrollYByPkg.get(pkg);
            lastScrollYByPkg.put(pkg, y);
            if (last != null) {
                int d = Math.abs(y - last);
                return d <= screenH * 4 ? d : 0;
            }
        }
        return 0;
    }

    /** px → metres, using this device's real density. */
    private float pxToMeters(long px) {
        float dpi = getResources().getDisplayMetrics().densityDpi;
        return px / (dpi * 39.3701f);
    }

    private void countScroll(String pkg, AccessibilityEvent event) {
        long now = System.currentTimeMillis();
        // Feed surfaces only: the foreground screen must not be a non-feed
        // activity (kills DM-thread counting), either the app is always a
        // feed or the scrolled surface looks like one, and the swipe moved
        // a meaningful distance — micro-scrolls/bounces aren't content.
        final boolean feedCtx = inFeedContext()
                && (FEED_ALWAYS.contains(pkg) || looksLikeFeed(pkg, event))
                && now - lastWindowChangeAt > 500;
        // meaningfulScroll gates the item count only — sub-90px deltas are
        // still real distance and belong in px accumulation.
        final boolean feed = feedCtx && meaningfulScroll(event);
        // Presence-anchored: once it appears on a real feed scroll it stays
        // until the user actually leaves the feed — no inactivity timer.
        if (feedCtx && counterEnabled()) {
            try { showCounter(todayStats().optInt("total")); } catch (Exception ignored) {}
            handler.removeCallbacks(evaluateHide);
        }
        if (!feedCtx) return;
        try {
            JSONObject day = todayStats();
            // ── Distance: every event carries real pixels (API 28+) — the
            // lead metric. No debounce: deltas are exact, not events. ──
            int dist = scrollDistancePx(pkg, event);
            if (dist > 0 && dist == lastDistPx && now - lastDistAt < 50) {
                dist = 0; // same frame, nested child+parent — counted once
            }
            if (dist > 0) {
                lastDistPx = dist;
                lastDistAt = now;
                JSONObject px = day.optJSONObject("px");
                if (px == null) { px = new JSONObject(); day.put("px", px); }
                px.put(pkg, px.optLong(pkg) + dist);
                day.put("pxTotal", day.optLong("pxTotal") + dist);
                // Ship density once so the web UI can convert px → metres.
                if (!day.has("dpi")) day.put("dpi", getResources().getDisplayMetrics().densityDpi);
            }
            // ── Items: cards passed — secondary metric. ──
            // Pager feeds (TikTok/Reels/Shorts): each new landing index IS a
            // card — settle-aware by construction (the index only exists once
            // the page settles). Dedup by index so re-events on the same card
            // don't recount. List feeds keep the 1.2s debounce.
            int toIdx = event.getToIndex();
            boolean newPagerCard = FEED_ALWAYS.contains(pkg) && toIdx >= 0
                    && event.getFromIndex() != toIdx
                    && !(pkg.equals(lastCardPkg) && toIdx == lastCardIdx);
            if (newPagerCard || now - lastScrollAt >= SCROLL_DEBOUNCE_MS) {
                lastScrollAt = now;
                if (newPagerCard) { lastCardPkg = pkg; lastCardIdx = toIdx; }
                countCard(day, pkg, now, event);
            }
            saveToday(day);
            updateCounter(day.optInt("total"));
        } catch (Exception ignored) {}
    }

    private String lastCardPkg = null;
    private int lastCardIdx = -1;

    private void countCard(JSONObject day, String pkg, long now, AccessibilityEvent event) throws Exception {
        day.put("total", day.optInt("total") + 1);
        JSONObject apps = day.optJSONObject("apps");
        if (apps != null) apps.put(pkg, apps.optInt(pkg) + 1);
        // Hour-of-day bucket for the time-of-day chart.
        JSONObject hours = day.optJSONObject("hours");
        if (hours == null) { hours = new JSONObject(); day.put("hours", hours); }
        String h = String.valueOf(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY));
        hours.put(h, hours.optInt(h) + 1);
        // Sessions: a burst of counted scrolls in one app with gaps
        // under 45s. Powers "how many at a time" + session length.
        trackSession(day, pkg, now, event);
    }

    // ── Session tracking ──
    private String sessPkg = null;
    private long sessStart = 0, sessLast = 0;
    private int sessCount = 0;
    private final java.util.Set<String> sessSeen = new java.util.HashSet<>();

    /** Card identity for unique-counting: the adapter index when present,
     *  else a hash of the scrolled node's text/description/id — only the
     *  hash is kept, content never leaves the event. */
    private String eventIdentity(AccessibilityEvent event) {
        int to = event.getToIndex();
        if (to >= 0) return "i" + to;
        android.view.accessibility.AccessibilityNodeInfo src = event.getSource();
        if (src == null) return null;
        try {
            CharSequence t = src.getText();
            CharSequence d = src.getContentDescription();
            String id = src.getViewIdResourceName();
            if (t == null && d == null && id == null) return null;
            return "h" + java.util.Objects.hash(t, d, id);
        } finally {
            src.recycle();
        }
    }
    private static final long SESSION_GAP_MS = 45_000;

    /** Extends the open session or closes it into day.sessions and starts a
     *  new one. Entries: {p:pkg, t:minutes-since-midnight, c:count, d:sec}. */
    private void trackSession(JSONObject day, String pkg, long now, AccessibilityEvent event) throws Exception {
        String ident = eventIdentity(event);
        if (pkg.equals(sessPkg) && now - sessLast <= SESSION_GAP_MS) {
            sessCount++;
            sessLast = now;
            if (ident != null) sessSeen.add(ident);
            return;
        }
        flushSession(day);
        sessPkg = pkg; sessStart = now; sessLast = now; sessCount = 1;
        sessSeen.clear();
        if (ident != null) sessSeen.add(ident);
    }

    /** Writes the open session into the day's sessions array (capped at 200). */
    private void flushSession(JSONObject day) throws Exception {
        if (sessPkg == null) return;
        org.json.JSONArray arr = day.optJSONArray("sessions");
        if (arr == null) { arr = new org.json.JSONArray(); day.put("sessions", arr); }
        if (arr.length() < 200) {
            java.util.Calendar cal = java.util.Calendar.getInstance();
            cal.setTimeInMillis(sessStart);
            JSONObject s = new JSONObject();
            s.put("p", sessPkg);
            s.put("t", cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE));
            s.put("c", sessCount);
            s.put("d", Math.max(1, (sessLast - sessStart) / 1000));
            if (!sessSeen.isEmpty()) s.put("u", sessSeen.size());
            arr.put(s);
        }
        sessPkg = null;
    }

    /** Re-checks whether the pill should still exist — posted with a delay
     *  on context changes so one stray window event can't blink it. */
    private final Runnable evaluateHide = new Runnable() {
        @Override public void run() {
            if (fgPkg == null || !inFeedContext() || !counterEnabled()) hideCounter();
        }
    };
    private static final long HIDE_HYSTERESIS_MS = 600;

    /** A real "next item" swipe either advances the adapter index or moves a
     *  meaningful pixel distance. Item indices exist on most list widgets;
     *  deltas exist on API 28+. Both absent → accept the event. */
    private boolean meaningfulScroll(AccessibilityEvent event) {
        // Only reject when BOTH signals agree nothing moved: same index AND
        // a tiny delta. An unchanged index with a big delta is a long item
        // mid-swipe; a moved index with no delta data is still real.
        int from = event.getFromIndex(), to = event.getToIndex();
        if (android.os.Build.VERSION.SDK_INT < 28) return true;
        int dy = 0, dx = 0;
        try { dy = event.getScrollDeltaY(); dx = event.getScrollDeltaX(); } catch (Exception ignored) {}
        if (dy == -1 && dx == -1) return true;        // deltas unavailable
        int dist = Math.max(Math.abs(dy), Math.abs(dx));
        if (from >= 0 && to >= 0) {
            // Both signals available: unmoved index AND tiny distance →
            // in-place update / bounce. Either signal moving → real swipe.
            return to != from || dist > 90;
        }
        return dist > 90;
    }

    private boolean inFeedContext() {
        String a = fgActivity.toLowerCase(Locale.US);
        for (String bad : NOT_FEED_ACTIVITY) if (a.contains(bad)) return false;
        return true;
    }

    private void trackForeground(String pkg, AccessibilityEvent event) {
        long now = System.currentTimeMillis();
        // System overlays don't change which app is really in front.
        if (isTransientPkg(pkg)) return;
        // Close out the previous app's session time.
        if (fgPkg != null && SCROLL_APPS.contains(fgPkg) && fgSince > 0) {
            try {
                JSONObject day = todayStats();
                JSONObject sec = day.optJSONObject("sec");
                if (sec != null) sec.put(fgPkg, sec.optLong(fgPkg) + (now - fgSince) / 1000);
                flushSession(day);   // leaving the app ends the scroll session
                saveToday(day);
            } catch (Exception ignored) {}
        }
        fgPkg = SCROLL_APPS.contains(pkg) ? pkg : null;
        fgSince = SCROLL_APPS.contains(pkg) ? now : 0;
        // The event's class name is the Activity on window-state changes —
        // remember it so scrolls inside non-feed screens (DMs, search…) are
        // ignored. Empty/system classes keep the previous value.
        String cls = event == null ? null : String.valueOf(event.getClassName());
        if (cls != null && !cls.equals("null") && !cls.startsWith("android.")) fgActivity = cls;
    }

    // ── Floating counter pill ──

    private void showCounter(int total) {
        if (!counterEnabled()) { hideCounter(); return; }
        if (wm == null) return;
        if (counterView == null) {
            counterText = new TextView(this);
            counterText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            counterText.setTypeface(Typeface.DEFAULT_BOLD);
            counterText.setTextColor(Color.parseColor("#efe8dd"));
            counterText.setPadding(dp(12), dp(6), dp(12), dp(6));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor("#e61a1815")); // warm ink, ~90% opaque
            bg.setCornerRadius(dp(14));
            bg.setStroke(dp(1), Color.parseColor("#40efe8dd"));
            counterText.setBackground(bg);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.END;
            lp.x = dp(10); lp.y = dp(120);
            // Drag anywhere on the pill; a tap (no move) toggles the expanded
            // detail ("142 today · TikTok"). The pill is never dismissible —
            // it lives as long as a counted app is in front.
            final WindowManager.LayoutParams flp = lp;
            counterText.setOnTouchListener(new android.view.View.OnTouchListener() {
                float downX, downY; int startX, startY; boolean moved;
                @Override public boolean onTouch(android.view.View v, android.view.MotionEvent e) {
                    switch (e.getAction()) {
                    case android.view.MotionEvent.ACTION_DOWN:
                        downX = e.getRawX(); downY = e.getRawY();
                        startX = flp.x; startY = flp.y; moved = false;
                        return true;
                    case android.view.MotionEvent.ACTION_MOVE:
                        if (!moved && Math.hypot(e.getRawX() - downX, e.getRawY() - downY) > dp(6)) moved = true;
                        if (!moved) return true;
                        // RIGHT gravity: dragging left increases x.
                        flp.x = (int) (startX - (e.getRawX() - downX));
                        flp.y = (int) (startY + (e.getRawY() - downY));
                        try { wm.updateViewLayout(counterView, flp); } catch (Exception ignored) {}
                        return true;
                    case android.view.MotionEvent.ACTION_UP:
                        if (moved) {
                            prefs().edit().putInt("counter_x", flp.x).putInt("counter_y", flp.y).apply();
                        } else {
                            counterExpanded = !counterExpanded;
                            try {
                                JSONObject day = todayStats();
                                updateCounter(day.optInt("total"));
                            } catch (Exception ignored) {}
                        }
                        return true;
                    }
                    return true;
                }
            });
            try {
                counterText.setAlpha(0f);
                wm.addView(counterText, lp);
                counterView = counterText;
                counterText.animate().alpha(1f).setDuration(160).start();
            } catch (Exception ignored) { return; }
        }
        updateCounter(total);
        // Restore the remembered drag position (persisted across sessions).
        if (counterX < 0) {
            counterX = prefs().getInt("counter_x", -1);
            counterY = prefs().getInt("counter_y", -1);
        }
        if (counterX >= 0) {
            WindowManager.LayoutParams lp = (WindowManager.LayoutParams) counterView.getLayoutParams();
            lp.x = counterX; lp.y = counterY;
            try { wm.updateViewLayout(counterView, lp); } catch (Exception ignored) {}
        }
    }

    private void updateCounter(int total) {
        if (counterText == null) return;
        String appLabel = "";
        int sec = 0;
        String dist = "";
        try {
            JSONObject day = todayStats();
            float m = pxToMeters(day.optLong("pxTotal"));
            dist = m >= 1000 ? String.format(Locale.US, "%.1f km", m / 1000f)
                    : m >= 1 ? String.format(Locale.US, "%.0f m", m)
                    : total + "";
            if (fgPkg != null) {
                String known = SCROLL_APP_NAMES.get(fgPkg);
                appLabel = known != null ? known : fgPkg.substring(fgPkg.lastIndexOf('.') + 1);
                sec = day.optJSONObject("sec") != null ? day.optJSONObject("sec").optInt(fgPkg) : 0;
            }
        } catch (Exception ignored) {}
        if (counterExpanded && fgPkg != null) {
            String t = sec >= 60 ? (sec / 60) + "m" : sec > 0 ? sec + "s" : "";
            counterText.setText(dist + " today · " + appLabel + (t.isEmpty() ? "" : " · " + t));
        } else {
            counterText.setText(dist + " today");
        }
        counterText.setTextColor(0xffefe8dd);
    }

    private void hideCounter() {
        if (counterView != null && wm != null) {
            final android.view.View v = counterView;
            WindowManager.LayoutParams lp = (WindowManager.LayoutParams) v.getLayoutParams();
            counterX = lp.x; counterY = lp.y;
            v.animate().alpha(0f).setDuration(140).withEndAction(new Runnable() {
                @Override public void run() {
                    try { wm.removeView(v); } catch (Exception ignored) {}
                }
            }).start();
        }
        counterView = null;
        counterText = null;
    }

    private void tickCounter(String pkg) {
        // Any window change can end the pill's context — leaving the app, or
        // entering a non-feed screen in the same app. Evaluate after a short
        // hysteresis so transient window events can't flicker it away.
        if (!SCROLL_APPS.contains(pkg) || !inFeedContext() || !counterEnabled()) {
            handler.removeCallbacks(evaluateHide);
            handler.postDelayed(evaluateHide, HIDE_HYSTERESIS_MS);
        }
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        startGuardNotification();
    }

    /** OEMs kill accessibility services to save battery; a silent ongoing
     *  notification makes the service foreground-priority. IMPORTANCE_MIN —
     *  sits collapsed in the shade, taps through to the app. */
    private void startGuardNotification() {
        try {
            final String ch = "waqt_guard_bg";
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (android.os.Build.VERSION.SDK_INT >= 26 && nm != null) {
                nm.createNotificationChannel(new android.app.NotificationChannel(
                        ch, "Waqt guard", android.app.NotificationManager.IMPORTANCE_MIN));
            }
            android.content.Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            android.app.PendingIntent pi = launch == null ? null : android.app.PendingIntent.getActivity(
                    this, 0, launch, android.app.PendingIntent.FLAG_IMMUTABLE);
            android.app.Notification.Builder b = android.os.Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(this, ch)
                    : new android.app.Notification.Builder(this);
            b.setContentTitle("Waqt guard active")
             .setContentText("Scroll counter and prayer shield running")
             .setSmallIcon(getApplicationInfo().icon)
             .setOngoing(true);
            if (pi != null) b.setContentIntent(pi);
            android.app.Notification n = b.build();
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                startForeground(1001, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else if (android.os.Build.VERSION.SDK_INT >= 29) {
                startForeground(1001, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST);
            } else {
                startForeground(1001, n);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        if (pkg.equals(getPackageName())) { hideOverlay(); hideCounter(); return; } // never block ourselves

        // Scroll counter bookkeeping — foreground time + feed scrolls.
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            lastWindowChangeAt = System.currentTimeMillis();
            if (!isTransientPkg(pkg)) {
                trackForeground(pkg, event);
                tickCounter(pkg);
                // Show as soon as a counted app is in front on a feed-ish
                // screen — not only after the first scroll event.
                if (counterEnabled() && SCROLL_APPS.contains(pkg) && inFeedContext()) {
                    try { showCounter(todayStats().optInt("total")); } catch (Exception ignored) {}
                    handler.removeCallbacks(evaluateHide);
                }
            }
        } else if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_SCROLLED && SCROLL_APPS.contains(pkg)) {
            countScroll(pkg, event);
        }

        JSONObject due = dueWindow();
        if (due == null || !isBlocked(pkg)) {
            hideOverlay();
            return;
        }
        // A bypass taps through ONCE for that window — it never unblocks the
        // next prayer, but a stuck overlay must always be escapable.
        String bypassed = getSharedPreferences(SalahShieldPlugin.PREFS, MODE_PRIVATE)
                .getString("bypassed_window", null);
        if (bypassed != null && bypassed.equals(due.optString("name") + ":" + due.optLong("endMs"))) {
            hideOverlay();
            return;
        }
        showOverlay(due.optString("name", "Prayer"), due.optLong("endMs", 0));
    }

    @Override
    public void onInterrupt() {
        hideOverlay();
        hideCounter();
    }

    @Override
    public void onDestroy() {
        hideOverlay();
        hideCounter();
        try { stopForeground(true); } catch (Exception ignored) {}
        super.onDestroy();
    }

    // ── Schedule evaluation ──

    /** Returns the unmarked window open right now, or null. */
    private JSONObject dueWindow() {
        SharedPreferences prefs = getSharedPreferences(SalahShieldPlugin.PREFS, MODE_PRIVATE);
        String raw = prefs.getString("schedule", null);
        if (raw == null) return null;
        try {
            JSONObject schedule = new JSONObject(raw);
            if (!schedule.optBoolean("enabled", false)) return null;

            long now = System.currentTimeMillis();
            JSONArray windows = schedule.optJSONArray("windows");
            if (windows == null) return null;
            for (int i = 0; i < windows.length(); i++) {
                JSONObject w = windows.optJSONObject(i);
                if (w == null || w.optBoolean("marked", false)) continue;
                long start = w.optLong("startMs", -1);
                long end = w.optLong("endMs", -1);
                if (start < 0 || end < 0) continue;
                if (now >= start && now < end) return w;
            }
        } catch (Exception ignored) {}
        return null;
    }

    // Block ALL apps while a window is due — the point of the shield is that
    // nothing distracts from prayer, not just social media. The only
    // exemptions are the system surfaces the user MUST keep to escape or
    // revoke (otherwise a broken setup could lock the phone).
    private static final Set<String> NEVER_BLOCK = new HashSet<>(java.util.Arrays.asList(
            "com.android.settings",        // needed to revoke accessibility
            "com.android.systemui",        // home/recents/pull-down
            "com.miui.securitycenter",     // Xiaomi system tools
            "com.samsung.android.lool",    // Samsung device care
            "android"
    ));

    private boolean isBlocked(String pkg) {
        if (NEVER_BLOCK.contains(pkg)) return false;
        SharedPreferences prefs = getSharedPreferences(SalahShieldPlugin.PREFS, MODE_PRIVATE);
        Set<String> custom = prefs.getStringSet("blocked_apps", null);
        // An explicit custom list overrides block-all mode (e.g. tests).
        if (custom != null && !custom.isEmpty()) return custom.contains(pkg);
        return true;
    }

    // ── Overlay ──

    private void showOverlay(String prayerName, long endsAtMs) {
        if (overlay != null) {
            // Already up — refresh which prayer/ending we're showing.
            overlayPrayer = prayerName;
            overlayEndsAtMs = endsAtMs;
            updateCountdown();
            return;
        }
        if (wm == null) return;

        overlayPrayer = prayerName;
        overlayEndsAtMs = endsAtMs;
        String pretty = prayerName.substring(0, 1).toUpperCase(Locale.US) + prayerName.substring(1);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(32), dp(32), dp(32), dp(32));
        // Waqt paper — dark warm ink, matches the app's night palette.
        root.setBackgroundColor(Color.parseColor("#1a1815"));

        TextView title = new TextView(this);
        title.setText(pretty + " is due");
        title.setTextColor(Color.parseColor("#efe8dd"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Salah Shield is on. Mark it prayed in Waqt to continue.");
        sub.setTextColor(Color.parseColor("#a89d8f"));
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        sp.setMargins(0, dp(14), 0, 0);
        root.addView(sub, sp);

        countdownView = new TextView(this);
        countdownView.setTextColor(Color.parseColor("#b9a88a"));
        countdownView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        countdownView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cp.setMargins(0, dp(8), 0, 0);
        root.addView(countdownView, cp);

        Button btn = new Button(this);
        btn.setText("Open Waqt — mark it prayed");
        btn.setAllCaps(false);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#b9a88a"));
        bg.setCornerRadius(dp(14));
        btn.setBackground(bg);
        btn.setTextColor(Color.parseColor("#1a1815"));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        bp.setMargins(0, dp(32), 0, 0);
        btn.setOnClickListener(v -> {
            Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                i.putExtra("shield_prayer", prayerName);
                startActivity(i);
            }
        });
        root.addView(btn, bp);

        // Tiny bypass escape — small text at the bottom, deliberately
        // de-emphasized but never absent. Bypass is remembered per-window
        // (name:endMs) so it can't silently unshield future prayers.
        TextView bypass = new TextView(this);
        bypass.setText("bypass");
        bypass.setTextColor(Color.parseColor("#6f675e"));
        bypass.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        bypass.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams byp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        byp.setMargins(0, dp(20), 0, 0);
        bypass.setPadding(dp(24), dp(8), dp(24), dp(8));
        bypass.setOnClickListener(v -> {
            getSharedPreferences(SalahShieldPlugin.PREFS, MODE_PRIVATE).edit()
                    .putString("bypassed_window", prayerName + ":" + endsAtMs).apply();
            hideOverlay();
        });
        root.addView(bypass, byp);

        // Focusable so touches and Back land on the shield instead of
        // falling through to the blocked app — without this the overlay is
        // wallpaper, not a gate. Back is consumed; Home is never interceptable
        // (leaving the blocked app is allowed — the next event drops the overlay).
        root.setFocusableInTouchMode(true);
        root.setOnKeyListener((v, keyCode, ev) -> keyCode == KeyEvent.KEYCODE_BACK);

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                // Drawn by the accessibility service itself — no
                // SYSTEM_ALERT_WINDOW grant needed on modern Android.
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.CENTER;

        try {
            wm.addView(root, lp);
            overlay = root;
            root.requestFocus();
            updateCountdown();
            // Self-healing tick — re-checks the window every 30s so the
            // overlay drops the moment the prayer window ends or a mark
            // lands, even if no new accessibility event fires.
            ticker = new Runnable() {
                @Override public void run() {
                    JSONObject due = dueWindow();
                    if (due == null) { hideOverlay(); return; }
                    overlayPrayer = due.optString("name", overlayPrayer);
                    overlayEndsAtMs = due.optLong("endMs", overlayEndsAtMs);
                    updateCountdown();
                    handler.postDelayed(this, 30_000);
                }
            };
            handler.postDelayed(ticker, 30_000);
        } catch (Exception ignored) {}
    }

    private void updateCountdown() {
        if (countdownView == null) return;
        if (overlayEndsAtMs <= 0) { countdownView.setText(""); return; }
        long leftMs = overlayEndsAtMs - System.currentTimeMillis();
        if (leftMs <= 0) { countdownView.setText("Window closing…"); return; }
        long mins = (leftMs + 30_000) / 60_000;
        String closeAt = new SimpleDateFormat("h:mm a", Locale.US).format(new Date(overlayEndsAtMs));
        countdownView.setText("ends in " + mins + "m — window closes " + closeAt);
    }

    private void hideOverlay() {
        if (ticker != null) { handler.removeCallbacks(ticker); ticker = null; }
        countdownView = null;
        overlayPrayer = null;
        overlayEndsAtMs = 0;
        if (overlay != null && wm != null) {
            try { wm.removeView(overlay); } catch (Exception ignored) {}
            overlay = null;
        }
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }
}
