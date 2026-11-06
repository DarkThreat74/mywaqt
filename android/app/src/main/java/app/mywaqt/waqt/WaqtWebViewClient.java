package app.mywaqt.waqt;

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
 */
public class WaqtWebViewClient extends BridgeWebViewClient {

    private static final String STATIC_PREFIX = "/_next/static/";
    private static final String ASSET_ROOT = "next-static/";
    // Capacitor's errorPath fires on the FIRST main-frame failure — a single
    // transient abort/redirect hiccup strands the user on a page that cannot
    // recover (its reload just reloads the local error file). Retry the real
    // URL in-place a few times before ever letting the error path show.
    private static final int MAX_REMOTE_RETRIES = 5;
    private int remoteRetries = 0;
    private long firstFailureAt = 0;
    private final Bridge bridge;

    public WaqtWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

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

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        String host = request.getUrl().getHost();
        if (request.isForMainFrame() && isWaqtHost(host)) {
            // Hard time cap: even if something keeps resetting the counter,
            // silent retry can never run longer than 45s — the diagnostic
            // page must always be reachable.
            if (firstFailureAt == 0) firstFailureAt = System.currentTimeMillis();
            boolean inWindow = System.currentTimeMillis() - firstFailureAt < 45_000;
            if (remoteRetries < MAX_REMOTE_RETRIES && inWindow) {
                remoteRetries++;
                final String url = request.getUrl().toString();
                // Backing off: 1s, 2s, 3s… — swallows the error entirely so the
                // user never sees the local error page for a transient failure.
                view.postDelayed(() -> view.loadUrl(url), 1000L * remoteRetries);
                return;
            }
            firstFailureAt = 0;
            // Retries exhausted — the failure is real and persistent. Load the
            // bundled error page directly (same file errorPath would show) but
            // WITH the error details so the failure is diagnosable instead of
            // a dead-end "reconnecting" screen.
            int code = error != null ? error.getErrorCode() : 0;
            String desc = error != null ? String.valueOf(error.getDescription()) : "";
            view.loadUrl("https://localhost/offline.html"
                + "?code=" + code
                + "&url=" + android.net.Uri.encode(request.getUrl().toString())
                + "&desc=" + android.net.Uri.encode(desc));
            return;
        }
        super.onReceivedError(view, request, error);
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        String host = request.getUrl().getHost();
        if (request.isForMainFrame() && isWaqtHost(host)) {
            int status = errorResponse != null ? errorResponse.getStatusCode() : 0;
            // Transient statuses (5xx, 429, 408) get the same silent retry —
            // Capacitor's default would dump the user on the error page with
            // no detail for ANY non-2xx main-frame response.
            if ((status >= 500 || status == 429 || status == 408) && remoteRetries < MAX_REMOTE_RETRIES) {
                remoteRetries++;
                final String url = request.getUrl().toString();
                view.postDelayed(() -> view.loadUrl(url), 1000L * remoteRetries);
                return;
            }
            view.loadUrl("https://localhost/offline.html"
                + "?code=" + status
                + "&url=" + android.net.Uri.encode(request.getUrl().toString())
                + "&desc=" + android.net.Uri.encode("HTTP error " + status));
            return;
        }
        super.onReceivedHttpError(view, request, errorResponse);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
        // WebView calls BOTH signatures for main-frame errors on API 23+ —
        // handling only the new one lets this callback still hit the error
        // path underneath the retry. Deprecated signature has no isForMainFrame,
        // so it only fires for main-frame errors by definition.
        String host = null;
        try { host = android.net.Uri.parse(failingUrl).getHost(); } catch (Exception ignored) { }
        if (isWaqtHost(host)) {
            // The new-signature handler owns retry + the diagnostic error
            // page — letting this one through would overwrite it.
            return;
        }
        super.onReceivedError(view, errorCode, description, failingUrl);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        injectBridgeIfRemote(view, url);
        // NOTE: deliberately NOT resetting remoteRetries here — WebView can
        // fire onPageFinished for a FAILED navigation (error document
        // commits), which reset the backoff to 1s and produced an infinite
        // ~1s reload loop. Only a visible commit counts as success.
    }

    @Override
    public void onPageCommitVisible(WebView view, String url) {
        super.onPageCommitVisible(view, url);
        // A remote page that actually painted clears the retry budget —
        // only count failures, not successful loads between them.
        try {
            if (isWaqtHost(android.net.Uri.parse(url).getHost())) { remoteRetries = 0; firstFailureAt = 0; }
        } catch (Exception ignored) { }
    }

    @Override
    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        injectBridgeIfRemote(view, url);
    }

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
