package app.mywaqt.waqt;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SalahShieldPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Warm launch from the shield overlay — surface shield_prayer so
        // consumeLaunchPrayer can hand it to the web layer.
        setIntent(intent);
    }
}
