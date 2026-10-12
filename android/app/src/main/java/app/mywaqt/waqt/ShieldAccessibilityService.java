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

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        if (pkg.equals(getPackageName())) { hideOverlay(); return; } // never block ourselves

        JSONObject due = dueWindow();
        if (due == null || !isBlocked(pkg)) {
            hideOverlay();
            return;
        }
        showOverlay(due.optString("name", "Prayer"), due.optLong("endMs", 0));
    }

    @Override
    public void onInterrupt() {
        hideOverlay();
    }

    @Override
    public void onDestroy() {
        hideOverlay();
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

    private boolean isBlocked(String pkg) {
        SharedPreferences prefs = getSharedPreferences(SalahShieldPlugin.PREFS, MODE_PRIVATE);
        Set<String> custom = prefs.getStringSet("blocked_apps", null);
        Set<String> list = custom != null && !custom.isEmpty() ? custom : DEFAULT_BLOCKED;
        return list.contains(pkg);
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
