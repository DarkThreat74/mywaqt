package app.mywaqt.waqt;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Handler;
import android.os.Looper;
import android.view.Surface;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Native Qibla heading + GPS source.
 *
 * Heading chain, best first:
 *   TYPE_ROTATION_VECTOR          — gyro+mag fusion; also reports an
 *                                   estimated heading error in values[4].
 *   TYPE_GEOMAGNETIC_ROTATION_VECTOR — accel+mag fusion for gyro-less devices.
 *   accel + magnetometer          — manual getRotationMatrix/getOrientation.
 * Every path is screen-rotation remapped and corrected from magnetic to true
 * north with GeomagneticField at the user's coordinates — fully offline.
 *
 * getLocation() uses LocationManager (GPS/network) so the compass works with
 * no wifi/data: the satellite fix needs no network once granted.
 */
@CapacitorPlugin(name = "QiblaSensor", permissions = {
    @Permission(alias = "loc", strings = {
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class QiblaSensorPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensors;
    private Sensor rotation;      // TYPE_ROTATION_VECTOR or GEOMAGNETIC fallback
    private Sensor accel;
    private Sensor magneto;
    private boolean geoFallback = false;   // using GEOMAGNETIC_ROTATION_VECTOR
    private boolean amFallback = false;    // using raw accel+magnetometer
    private boolean listening = false;
    private boolean wantListening = false; // guards start/stop racing on the main looper
    private double latitude;
    private double longitude;
    private GeomagneticField geoField;     // declination model — rebuilt per fix, not per event
    private long lastEmitMs = 0;           // throttle bridge traffic (~15 Hz)
    private final float[] lastAccel = new float[3];
    private final float[] lastMag = new float[3];
    private boolean haveAccel = false, haveMag = false;

    @Override
    public void load() {
        sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensors != null) {
            rotation = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            if (rotation == null) {
                rotation = sensors.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
                geoFallback = rotation != null;
            }
            if (rotation == null) {
                accel = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
                magneto = sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
                amFallback = accel != null && magneto != null;
            }
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", rotation != null || amFallback);
        out.put("fusion", rotation != null ? (geoFallback ? "geomagnetic" : "full") : (amFallback ? "accel-mag" : "none"));
        out.put("listening", listening);
        call.resolve(out);
    }

    /** GPS fix that works with no wifi/data — satellite + last-known fallback. */
    @PluginMethod
    public void getLocation(PluginCall call) {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) { call.reject("no location manager"); return; }
        boolean permitted = ActivityCompat.checkSelfPermission(getContext(),
                Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ActivityCompat.checkSelfPermission(getContext(),
                Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!permitted) {
            requestPermissionForAlias("loc", call, "reply");
            return;
        }
        deliverLocation(call, lm);
    }

    @PermissionCallback
    private void reply(PluginCall call) {
        if (getBridge().getActivity() == null) { call.reject("no activity"); return; }
        deliverLocation(call, (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE));
    }

    private void deliverLocation(PluginCall call, LocationManager lm) {
        if (lm == null) { call.reject("no location manager"); return; }
        try {
            // Re-check here — the permission may have just been granted in reply().
            boolean fine = ActivityCompat.checkSelfPermission(getContext(),
                    Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            // Last-known first — instant and usually fresh enough for a bearing.
            Location best = null;
            for (String p : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
                try {
                    Location l = lm.getLastKnownLocation(p);
                    if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
                } catch (SecurityException ignored) { }
            }
            if (best != null) { resolveLocation(call, best); return; }
            if (!fine) { call.reject("location permission denied"); return; }
            // Cold fix: one GPS update, 20s timeout.
            final PluginCall saved = call;
            final Handler h = new Handler(Looper.getMainLooper());
            final boolean[] done = { false };
            final android.location.LocationListener listener = new android.location.LocationListener() {
                @Override public void onLocationChanged(Location l) {
                    if (done[0]) return;
                    done[0] = true;
                    lm.removeUpdates(this);
                    h.removeCallbacksAndMessages(null);
                    resolveLocation(saved, l);
                }
            };
            h.postDelayed(() -> {
                if (done[0]) return;
                done[0] = true;
                lm.removeUpdates(listener);
                saved.reject("gps timeout");
            }, 20000);
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0, 0, listener, Looper.getMainLooper());
        } catch (SecurityException e) {
            call.reject("location permission denied");
        } catch (Exception e) {
            call.reject("location failed: " + e.getMessage());
        }
    }

    private void resolveLocation(PluginCall call, Location l) {
        JSObject out = new JSObject();
        out.put("latitude", l.getLatitude());
        out.put("longitude", l.getLongitude());
        out.put("accuracy", l.hasAccuracy() ? l.getAccuracy() : -1);
        out.put("ageMs", System.currentTimeMillis() - l.getTime());
        call.resolve(out);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Double lat = call.getDouble("latitude");
        Double lng = call.getDouble("longitude");
        if (lat == null || lng == null || sensors == null || (rotation == null && !amFallback)) {
            call.reject("Orientation sensor or location unavailable");
            return;
        }
        latitude = lat;
        longitude = lng;
        geoField = null; // declination model is location-dependent
        // Plugin methods run on a Capacitor worker thread with no Looper —
        // registerListener() without a Handler silently returns false there.
        // Register on the main thread (also where events get delivered).
        final Handler main = new Handler(Looper.getMainLooper());
        wantListening = true;
        main.post(() -> {
            if (!wantListening) { call.resolve(); return; } // stop() beat us here
            if (!listening) {
                boolean ok;
                if (rotation != null) {
                    ok = sensors.registerListener(this, rotation, SensorManager.SENSOR_DELAY_GAME, main);
                } else {
                    ok = sensors.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME, main);
                    ok = sensors.registerListener(this, magneto, SensorManager.SENSOR_DELAY_GAME, main) && ok;
                }
                listening = ok;
            }
            if (listening) call.resolve();
            else call.reject("sensor registration failed");
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        wantListening = false;
        stopListening();
        call.resolve();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!listening) return;
        float[] matrix = new float[9];
        if (amFallback) {
            if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                System.arraycopy(event.values, 0, lastAccel, 0, 3); haveAccel = true;
            } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
                System.arraycopy(event.values, 0, lastMag, 0, 3); haveMag = true;
            }
            if (!haveAccel || !haveMag) return;
            float[] R = new float[9], I = new float[9];
            if (!SensorManager.getRotationMatrix(R, I, lastAccel, lastMag)) return;
            matrix = R;
        } else {
            int type = event.sensor.getType();
            if (type != Sensor.TYPE_ROTATION_VECTOR && type != Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) return;
            SensorManager.getRotationMatrixFromVector(matrix, event.values);
        }

        int rotationId = getActivity() == null
                ? Surface.ROTATION_0
                : getActivity().getWindowManager().getDefaultDisplay().getRotation();
        float[] remapped = new float[9];
        boolean remappedOk;
        if (rotationId == Surface.ROTATION_90) {
            remappedOk = SensorManager.remapCoordinateSystem(matrix, SensorManager.AXIS_Y, SensorManager.AXIS_MINUS_X, remapped);
        } else if (rotationId == Surface.ROTATION_180) {
            remappedOk = SensorManager.remapCoordinateSystem(matrix, SensorManager.AXIS_MINUS_X, SensorManager.AXIS_MINUS_Y, remapped);
        } else if (rotationId == Surface.ROTATION_270) {
            remappedOk = SensorManager.remapCoordinateSystem(matrix, SensorManager.AXIS_MINUS_Y, SensorManager.AXIS_X, remapped);
        } else {
            System.arraycopy(matrix, 0, remapped, 0, matrix.length);
            remappedOk = true;
        }
        if (!remappedOk) return;

        // ~15 Hz is plenty for a compass needle; 50 Hz across the bridge is
        // pure battery + JS churn.
        long now = System.currentTimeMillis();
        if (now - lastEmitMs < 66) return;
        lastEmitMs = now;

        float[] orientation = new float[3];
        SensorManager.getOrientation(remapped, orientation);
        double magnetic = normalize(Math.toDegrees(orientation[0]));
        if (geoField == null) {
            geoField = new GeomagneticField(
                    (float) latitude, (float) longitude, 0f, now);
        }
        double declination = geoField.getDeclination();
        double trueHeading = normalize(magnetic + declination);

        JSObject out = new JSObject();
        out.put("heading", trueHeading);
        out.put("magneticHeading", magnetic);
        out.put("declination", declination);
        out.put("sensorAccuracy", event.accuracy);
        // Fused rotation vector carries the OS's own 95%-confidence heading
        // error (radians) in values[4] — the honest accuracy signal.
        if (rotation != null && !geoFallback && event.values != null && event.values.length > 4) {
            out.put("headingErrorDeg", Math.toDegrees(event.values[4]));
        }
        notifyListeners("heading", out);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        JSObject out = new JSObject();
        out.put("sensorAccuracy", accuracy);
        notifyListeners("accuracy", out);
    }

    @Override
    protected void handleOnDestroy() {
        stopListening();
        super.handleOnDestroy();
    }

    private void stopListening() {
        if (listening && sensors != null) sensors.unregisterListener(this);
        listening = false;
        haveAccel = haveMag = false;
    }

    private static double normalize(double degrees) {
        return (degrees % 360 + 360) % 360;
    }
}
