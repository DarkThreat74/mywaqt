package app.waqt.fidget;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Eat the native long-click callout — toys implement their own holds.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setOnLongClickListener(v -> true);
        }
    }
}
