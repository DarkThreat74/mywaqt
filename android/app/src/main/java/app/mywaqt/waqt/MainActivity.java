package app.mywaqt.waqt;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SalahShieldPlugin.class);
        super.onCreate(savedInstanceState);

        // Remote-URL mode (server.url) has a known WebView measurement bug
        // (capacitor#8431): the page is laid out at the WebView's size, so
        // content taller than the screen is never scrollable — on EVERY
        // page. Overview mode + a wide viewport lets the WebView lay the
        // page out at real document size, which is what makes vertical
        // scrolling work at all.
        WebView webView = getBridge().getWebView();
        WebSettings s = webView.getSettings();
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);

        // Offline tolerance: the WebView has its own HTTP cache. When the
        // device has no usable network, serve whatever it has cached
        // (pages + API-shell HTML) instead of dying on the error path —
        // first cold boot still needs network, subsequent ones don't.
        if (!isNetworkAvailable()) {
            s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Warm launch from the shield overlay — surface shield_prayer so
        // consumeLaunchPrayer can hand it to the web layer.
        setIntent(intent);
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm =
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo info = cm == null ? null : cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }
}
