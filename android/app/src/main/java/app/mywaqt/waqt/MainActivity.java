package app.mywaqt.waqt;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String REMOTE_APP_URL = "https://www.mywaqt.app/prayer";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SalahShieldPlugin.class);
        super.onCreate(savedInstanceState);

        // Serve _next/static bundle assets from the APK instead of the
        // network — the single biggest cold-load win in remote-URL mode.
        getBridge().setWebViewClient(new WaqtWebViewClient(getBridge()));

        // Remote-URL mode (server.url) has a known WebView measurement bug
        // (capacitor#8431): the page is laid out at the WebView's size, so
        // content taller than the screen is never scrollable — on EVERY
        // page. Overview mode + a wide viewport lets the WebView lay the
        // page out at real document size, which is what makes vertical
        // scrolling work at all.
        WebView webView = getBridge().getWebView();
        WebSettings s = webView.getSettings();
        CookieManager.getInstance().setAcceptCookie(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setJavaScriptEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // Kill the WebView's elastic overscroll glow/stretch — CSS
        // overscroll-behavior doesn't reach it; this is the native switch.
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Offline tolerance: the WebView has its own HTTP cache. When the
        // device has no usable network, serve whatever it has cached
        // (pages + API-shell HTML) instead of dying on the error path —
        // first cold boot still needs network, subsequent ones don't.
        if (!isNetworkAvailable()) {
            s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        }

        // A cold start from an App Link / notification tap carries a waqt.app
        // URL in the intent — honor it before the generic session resume,
        // or the user lands on the local page while the link rots in the
        // bridge's appUrlOpen event (no listener on the local origin).
        String deepLink = deepLinkUrl(getIntent());
        if (deepLink != null) {
            webView.post(() -> webView.loadUrl(deepLink));
            return;
        }

        // The local landing page is for first-time users. After login, the
        // HttpOnly session cookie persists in the Android WebView cookie jar;
        // resume the app from that same origin, including from cache offline.
        String cookies = CookieManager.getInstance().getCookie(REMOTE_APP_URL);
        if (cookies != null && cookies.contains("waqt-session=")) {
            webView.post(() -> webView.loadUrl(REMOTE_APP_URL));
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // A cold offline launch used to leave LOAD_CACHE_ELSE_NETWORK active
        // for the entire process, even after signal returned.
        WebView webView = getBridge().getWebView();
        webView.getSettings().setCacheMode(
            isNetworkAvailable() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Warm launch from the shield overlay — surface shield_prayer so
        // consumeLaunchPrayer can hand it to the web layer.
        setIntent(intent);
        // Warm app-link hit: if the WebView is still on the local shell or
        // error page, take it to the link's destination directly.
        String deepLink = deepLinkUrl(intent);
        if (deepLink != null) {
            WebView webView = getBridge().getWebView();
            String current = webView.getUrl() == null ? "" : webView.getUrl();
            String host = null;
            try { host = android.net.Uri.parse(current).getHost(); } catch (Exception ignored) { }
            if (host == null || !host.endsWith("mywaqt.app")) {
                webView.loadUrl(deepLink);
            }
        }
    }

    private String deepLinkUrl(Intent intent) {
        if (intent == null) return null;
        android.net.Uri uri = intent.getData();
        if (uri == null) return null;
        String host = uri.getHost();
        if (host != null && (host.equals("mywaqt.app") || host.endsWith(".mywaqt.app"))
            && "https".equals(uri.getScheme())) {
            return uri.toString();
        }
        return null;
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm =
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        android.net.Network network = cm.getActiveNetwork();
        NetworkCapabilities caps = network == null ? null : cm.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
}
