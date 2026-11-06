package app.mywaqt.waqt;

import android.webkit.RenderProcessGoneDetail;
import android.net.http.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSExport;
import com.getcapacitor.PluginHandle;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Serves the immutable Next.js bundle (/_next/static/…) straight from APK
 * assets instead of the network.
 *
 * In remote-URL mode every launch otherwise re-downloads ~4MB of JS/CSS
 * over the wire — that IS the slow load. _next/static assets are
 * content-hashed, so a bundled copy is always safe: new deploys emit new
 * hashes that miss the bundle and fall back to the network automatically;
 * there is no way to serve a stale chunk.
 *
 * Bundle contents live at assets/next-static/{chunks,media}/… (populated
 * by the release step). MapLibre (~3.5MB, lazily imported on the masjids
 * page only) is deliberately NOT bundled — it streams on demand.
 *
 * Error policy (all paths funnel through tryRetry/loadDiag):
 *  - Transient failures retry silently with backoff, capped by count AND a
 *    45s wall-clock window — a scheduled retry also checks a success hasn't
 *    landed since (pending retries used to punch a fresh load over a page
 *    that had already rendered).
 *  - Persistent failures show the bundled offline page WITH the real error
 *    code + URL — never an undiagnosable "reconnecting" screen.
 *  - The retry state only resets on a visible commit with no intervening
 *    error — onPageFinished fires for failed navigations too and used to
 *    reset the backoff into an infinite ~1s reload loop.
 */
public class WaqtWebViewClient extends BridgeWebViewClient {

    private static final String STATIC_PREFIX = "/_next/static/";
    private static final String ASSET_ROOT = "next-static/";
    // Two quick silent retries (~3s) cover real transient blips; after that
    // the diagnostic page takes over (it auto-retries every 8s). Retrying
    // longer in place just leaves the user staring at the WebView's ugly
    // built-in "webpage not available" error doc.
    private static final int MAX_REMOTE_RETRIES = 2;
    private static final long RETRY_WINDOW_MS = 45_000;
    private static final int MAX_RENDERER_CRASHES = 2;

    private int remoteRetries = 0;
    private long firstFailureAt = 0;
    private boolean hadMainFrameError = false;
    private int rendererCrashes = 0;
    private final Bridge bridge;

    public WaqtWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    // ── Retry machinery ──

    /** Returns true if a silent retry was scheduled. */
    private boolean tryRetry(final WebView view, final String url) {
        if (firstFailureAt == 0) firstFailureAt = System.currentTimeMillis();
        boolean inWindow = System.currentTimeMillis() - firstFailureAt < RETRY_WINDOW_MS;
        if (remoteRetries >= MAX_REMOTE_RETRIES || !inWindow) return false;
        remoteRetries++;
        view.postDelayed(() -> {
            // A success may have landed while this retry was queued —
            // without this check the retry punches a fresh navigation over
            // an already-rendered page (visible as a random reload flash).
            if (remoteRetries > 0) view.loadUrl(url);
        }, 1000L * remoteRetries);
        return true;
    }

    private void loadDiag(WebView view, String code, String url, String desc) {
        view.loadUrl("https://localhost/offline.html"
            + "?code=" + android.net.Uri.encode(code)
            + "&url=" + android.net.Uri.encode(url)
            + "&desc=" + android.net.Uri.encode(desc));
    }

    // ── Network-level failures ──

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        String host = request.getUrl().getHost();
        if (request.isForMainFrame() && isWaqtHost(host)) {
            hadMainFrameError = true;
            final String url = request.getUrl().toString();
            // The WebView paints its own ugly "webpage not available" doc on
            // every failed navigation — swallowing the callback doesn't hide
            // it. So the diagnostic card goes up IMMEDIATELY; the scheduled
            // silent retries still run behind it and navigate away the
            // moment the real page answers.
            if (tryRetry(view, url)) { /* retry runs behind the card */ }
            else { remoteRetries = 0; firstFailureAt = 0; }
            int code = error != null ? error.getErrorCode() : 0;
            String desc = error != null ? String.valueOf(error.getDescription()) : "";
            loadDiag(view, String.valueOf(code), url, desc);
            return;
        }
        super.onReceivedError(view, request, error);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
        // WebView calls BOTH signatures for main-frame errors on API 23+ —
        // the new-signature handler owns retry + the diagnostic page.
        String host = null;
        try { host = android.net.Uri.parse(failingUrl).getHost(); } catch (Exception ignored) { }
        if (isWaqtHost(host)) return;
        super.onReceivedError(view, errorCode, description, failingUrl);
    }

    // ── HTTP error statuses ──

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        String host = request.getUrl().getHost();
        if (request.isForMainFrame() && isWaqtHost(host)) {
            hadMainFrameError = true;
            int status = errorResponse != null ? errorResponse.getStatusCode() : 0;
            final String url = request.getUrl().toString();
            // Transient statuses retry; 4xx etc. go straight to diagnostics.
            if (status >= 500 || status == 429 || status == 408) {
                if (tryRetry(view, url)) { /* retry runs behind the card */ }
                else { remoteRetries = 0; firstFailureAt = 0; }
            }
            loadDiag(view, String.valueOf(status), url, describeHttpError(errorResponse, status));
            return;
        }
        super.onReceivedHttpError(view, request, errorResponse);
    }

    // Vercel/Next error pages carry the real reason — x-vercel-error header
    // (FUNCTION_INVOCATION_FAILED, DEPLOYMENT_…) and a digest in the body.
    // Pulling them onto the card turns "HTTP 500" into an actionable answer.
    private static String describeHttpError(WebResourceResponse res, int status) {
        StringBuilder sb = new StringBuilder("HTTP error ").append(status);
        try {
            if (res != null && res.getResponseHeaders() != null) {
                for (java.util.Map.Entry<String, String> e : res.getResponseHeaders().entrySet()) {
                    String k = e.getKey() == null ? "" : e.getKey().toLowerCase(Locale.ROOT);
                    if (k.startsWith("x-vercel-error") || k.equals("x-middleware-error") || k.equals("x-nextjs-error")) {
                        sb.append(" · ").append(e.getValue());
                    }
                }
            }
        } catch (Exception ignored) { }
        try {
            if (res != null && res.getData() != null) {
                byte[] buf = new byte[2048];
                int n = res.getData().read(buf);
                if (n > 0) {
                    String body = new String(buf, 0, n, java.nio.charset.StandardCharsets.UTF_8);
                    java.util.regex.Matcher m = java.util.regex.Pattern
                        .compile("digest[\"'\\s:=]+([A-Za-z0-9_\\-]+)").matcher(body);
                    if (m.find()) sb.append(" · digest ").append(m.group(1));
                }
            }
        } catch (Exception ignored) { }
        return sb.toString();
    }

    // ── TLS / certificate failures ──
    // Never call handler.proceed() — a broken cert must never be bypassed.
    // Show the diagnostic page so the failure is visible, not a blank view.
    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        String host = null;
        try { host = android.net.Uri.parse(view.getUrl()).getHost(); } catch (Exception ignored) { }
        if (isWaqtHost(host)) {
            loadDiag(view, "SSL", view.getUrl(),
                error != null ? error.toString() : "certificate error");
            return;
        }
        super.onReceivedSslError(view, handler, error);
    }

    // ── Renderer death ──
    // Default Capacitor behavior lets the process die on renderer crash.
    // Reload once or twice instead; beyond that, let it fail honestly.
    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        if (rendererCrashes < MAX_RENDERER_CRASHES) {
            rendererCrashes++;
            view.postDelayed(view::reload, 1500);
            return true;
        }
        return super.onRenderProcessGone(view, detail);
    }

    // ── Page lifecycle ──

    @Override
    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        injectBridgeIfRemote(view, url);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        injectBridgeIfRemote(view, url);
        // NOTE: deliberately NOT resetting retry state here — WebView can
        // fire onPageFinished for a FAILED navigation (error document
        // commits), which reset the backoff to 1s and produced an infinite
        // ~1s reload loop. Only a clean visible commit counts as success.
    }

    @Override
    public void onPageCommitVisible(WebView view, String url) {
        super.onPageCommitVisible(view, url);
        try {
            if (isWaqtHost(android.net.Uri.parse(url).getHost()) && !hadMainFrameError) {
                remoteRetries = 0;
                firstFailureAt = 0;
            }
            hadMainFrameError = false;
        } catch (Exception ignored) { }
    }

    // ── Capacitor bridge injection for remote origin ──

    /**
     * Capacitor's JSInjector only stitches window.Capacitor into LOCAL
     * (https://localhost) pages — remote allowNavigation pages get the
     * androidBridge transport but no JS runtime, so every plugin call
     * (push, haptics, status bar, App listeners) silently dies and the app
     * reports "push not supported". Inject the same generated bridge script
     * into www.mywaqt.app pages after load; idempotent via the JS-side guard.
     */
    private void injectBridgeIfRemote(final WebView view, String url) {
        try {
            if (!isWaqtHost(android.net.Uri.parse(url).getHost())) return;
        } catch (Exception e) { return; }
        final String script = bridgeScript();
        if (script.isEmpty()) return;
        view.evaluateJavascript(
            "(window.Capacitor && window.Capacitor.Plugins) ? 1 : 0",
            res -> {
                if (!"1".equals(res)) {
                    view.evaluateJavascript(script, null);
                }
            });
    }

    private volatile String bridgeScript;
    @SuppressWarnings("unchecked")
    private String bridgeScript() {
        if (bridgeScript != null) return bridgeScript;
        try {
            android.content.Context ctx = bridge.getContext();
            StringBuilder sb = new StringBuilder();
            sb.append(JSExport.getGlobalJS(ctx, false, false)).append('\n');
            sb.append("window.WEBVIEW_SERVER_URL = '").append(bridge.getLocalUrl()).append("';\n");
            sb.append(JSExport.getBridgeJS(ctx)).append('\n');
            // The plugins map is private on Bridge — reflect once at build
            // time rather than hardcoding the plugin list.
            java.lang.reflect.Field f = Bridge.class.getDeclaredField("plugins");
            f.setAccessible(true);
            java.util.Map<String, PluginHandle> map =
                (java.util.Map<String, PluginHandle>) f.get(bridge);
            sb.append(JSExport.getPluginJS(map.values())).append('\n');
            try { sb.append(JSExport.getCordovaJS(ctx)).append('\n'); } catch (Throwable ignored) { }
            try { sb.append(JSExport.getCordovaPluginJS(ctx)).append('\n'); } catch (Throwable ignored) { }
            try { sb.append(JSExport.getCordovaPluginsFileJS(ctx)).append('\n'); } catch (Throwable ignored) { }
            bridgeScript = sb.toString();
        } catch (Exception e) {
            bridgeScript = "";
        }
        return bridgeScript;
    }

    // ── Static-asset interception ──

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if ("GET".equals(request.getMethod())) {
            String host = request.getUrl().getHost();
            if (host != null && (host.equals("mywaqt.app") || host.endsWith(".mywaqt.app"))) {
                String path = request.getUrl().getPath();
                if (path != null && path.startsWith(STATIC_PREFIX)) {
                    WebResourceResponse res = fromAssets(path.substring(STATIC_PREFIX.length()));
                    if (res != null) return res;
                }
            }
        }
        return super.shouldInterceptRequest(view, request);
    }

    private static boolean isWaqtHost(String host) {
        return host != null && (host.equals("mywaqt.app") || host.endsWith(".mywaqt.app"));
    }

    private WebResourceResponse fromAssets(String rel) {
        // No traversal — hashed chunk names are flat anyway.
        if (rel.contains("..")) return null;
        String mime = mimeFor(rel);
        if (mime == null) return null;
        try {
            InputStream in = bridge.getContext().getAssets().open(ASSET_ROOT + rel);
            WebResourceResponse res = new WebResourceResponse(mime, "utf-8", in);
            res.setResponseHeaders(java.util.Collections.singletonMap(
                "Cache-Control", "public, max-age=31536000, immutable"));
            return res;
        } catch (IOException e) {
            return null; // not bundled → fall back to network
        }
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        return null;
    }
}
