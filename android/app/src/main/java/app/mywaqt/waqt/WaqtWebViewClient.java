package app.mywaqt.waqt;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

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
