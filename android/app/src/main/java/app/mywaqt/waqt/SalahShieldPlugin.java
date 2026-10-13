package app.mywaqt.waqt;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * SalahShield — bridge between the web layer and the native blocking side.
 *
 * The web app owns the schedule (prayer windows + marked state, read from
 * Dexie) and pushes it into SharedPreferences via syncSchedule(). The
 * accessibility service reads those prefs on every foreground-app event —
 * so blocking works fully offline and needs no timers.
 *
 * Permission model (all verified live, none grantable programmatically):
 *   accessibility — required: detects foreground apps + draws the overlay
 *   usageAccess   — per-app screen-time stats (future feature)
 *   battery       — exempt from Doze/OEM killers so the service stays bound
 *   notifications — optional polish
 *   overlay       — SYSTEM_ALERT_WINDOW; NOT required by our design
 *                   (TYPE_ACCESSIBILITY_OVERLAY is drawn by the service
 *                   itself) but reported for completeness.
 */
@CapacitorPlugin(name = "SalahShield")
public class SalahShieldPlugin extends Plugin {

    static final String PREFS = "salah_shield";

    /**
     * Whether native push can actually register. Capacitor's
     * PushNotifications.register() calls FirebaseMessaging.getInstance()
     * unconditionally — without google-services.json there is no default
     * FirebaseApp, so it throws IllegalStateException, which the bridge
     * rethrows as RuntimeException on a Handler thread = process death.
     * JS must check this BEFORE calling register(). Reflection keeps the
     * Firebase import optional so the app still builds if the firebase
     * dependency is ever dropped entirely.
     */
    @PluginMethod
    public void pushReady(PluginCall call) {
        boolean ready = false;
        try {
            Class<?> firebaseApp = Class.forName("com.google.firebase.FirebaseApp");
            java.lang.reflect.Method getApps = firebaseApp.getMethod("getApps", Context.class);
            java.util.List<?> apps = (java.util.List<?>) getApps.invoke(null, getContext());
            ready = apps != null && !apps.isEmpty();
        } catch (Throwable ignored) {
            // Firebase classes absent or uninitialized → push cannot work.
        }
        JSObject out = new JSObject();
        out.put("ready", ready);
        call.resolve(out);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject out = new JSObject();
        out.put("accessibility", isAccessibilityEnabled(ctx));
        out.put("usageAccess", hasUsageAccess(ctx));
        out.put("battery", isBatteryExempt(ctx));
        out.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        out.put("overlay", Settings.canDrawOverlays(ctx));
        call.resolve(out);
    }

    @PluginMethod
    public void openPermissionSettings(PluginCall call) {
        String key = call.getString("key", "");
        Context ctx = getContext();
        Intent i;
        switch (key) {
            case "accessibility":
                i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                break;
            case "usageAccess":
                i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
                break;
            case "overlay":
                i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + ctx.getPackageName()));
                break;
            case "battery":
                // Direct exemption request — shows the system dialog, not a list.
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + ctx.getPackageName()));
                break;
            case "notifications":
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
                break;
            default:
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + ctx.getPackageName()));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open settings", e);
        }
    }

    /**
     * The web layer's pushed schedule. Body:
     *   { enabled, blockedApps: [...], windows: [{name, startMs, endMs, marked}] }
     * Windows carry absolute epoch milliseconds — no date guard or minute
     * math native-side, so post-midnight Isha, travel timezones, and
     * multi-day schedules all just work. Once every window has ended the
     * schedule is inert: stale data can never block.
     */
    @PluginMethod
    public void syncSchedule(PluginCall call) {
        JSObject data = call.getData();
        if (data == null) { call.reject("No data"); return; }
        SharedPreferences.Editor edit = getContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("schedule", data.toString());
        // The service reads blocked_apps as a StringSet — sync it so custom
        // app lists actually take effect instead of silently falling back
        // to the built-in defaults.
        try {
            org.json.JSONArray apps = data.optJSONArray("blockedApps");
            if (apps != null) {
                java.util.Set<String> set = new java.util.HashSet<>();
                for (int i = 0; i < apps.length(); i++) set.add(apps.optString(i));
                edit.putStringSet("blocked_apps", set);
            }
        } catch (Exception ignored) {}
        edit.apply();
        call.resolve();
    }

    /** The overlay's "Open Waqt" button launches the app with a
     *  shield_prayer extra. The web layer calls this once on resume to
     *  learn which prayer sent the user — returns null when there wasn't
     *  one, and clears it so it's consumed exactly once. */
    @PluginMethod
    public void consumeLaunchPrayer(PluginCall call) {
        JSObject out = new JSObject();
        try {
            Intent i = getActivity() != null ? getActivity().getIntent() : null;
            String prayer = i != null ? i.getStringExtra("shield_prayer") : null;
            if (prayer != null) i.removeExtra("shield_prayer");
            out.put("prayer", prayer);
        } catch (Exception e) {
            out.put("prayer", (String) null);
        }
        call.resolve(out);
    }

    /** Instant release — called the moment a prayer is marked so the overlay
     *  drops without waiting for the next schedule sync. */
    @PluginMethod
    public void markPrayed(PluginCall call) {
        String prayer = call.getString("prayer", "");
        Context ctx = getContext();
        String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString("schedule", null);
        try {
            if (raw != null && !prayer.isEmpty()) {
                JSONObject schedule = new JSONObject(raw);
                org.json.JSONArray windows = schedule.optJSONArray("windows");
                if (windows != null) {
                    for (int i = 0; i < windows.length(); i++) {
                        JSONObject w = windows.optJSONObject(i);
                        if (w != null && prayer.equals(w.optString("name"))) {
                            w.put("marked", true);
                        }
                    }
                    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                            .edit().putString("schedule", schedule.toString()).apply();
                }
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    // ── Grant checks ──

    private boolean isAccessibilityEnabled(Context ctx) {
        String expected = ctx.getPackageName() + "/" + ShieldAccessibilityService.class.getName();
        String enabled = Settings.Secure.getString(
                ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        for (String svc : enabled.split(":")) {
            if (svc.equalsIgnoreCase(expected)) return true;
        }
        return false;
    }

    private boolean hasUsageAccess(Context ctx) {
        try {
            AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
            ApplicationInfo info = ctx.getApplicationInfo();
            int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    info.uid, info.packageName);
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isBatteryExempt(Context ctx) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }
}
