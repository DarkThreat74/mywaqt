package app.mywaqt.waqt;

import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.content.Context;
import android.view.Surface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native Qibla heading source. Rotation vector already fuses the phone's
 * accelerometer, gyroscope, and magnetometer; GeomagneticField converts its
 * magnetic-north azimuth to true north for the user's coordinates.
 */
@CapacitorPlugin(name = "QiblaSensor")
public class QiblaSensorPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensors;
    private Sensor rotation;
    private boolean listening = false;
    private double latitude;
    private double longitude;

    @Override
    public void load() {
        sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        rotation = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", rotation != null);
        out.put("listening", listening);
        call.resolve(out);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Double lat = call.getDouble("latitude");
        Double lng = call.getDouble("longitude");
        if (lat == null || lng == null || rotation == null || sensors == null) {
            call.reject("Rotation-vector sensor or location unavailable");
            return;
        }
        latitude = lat;
        longitude = lng;
        if (!listening) {
            sensors.registerListener(this, rotation, SensorManager.SENSOR_DELAY_GAME);
            listening = true;
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopListening();
        call.resolve();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!listening || event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;
        float[] matrix = new float[9];
        float[] remapped = new float[9];
        float[] orientation = new float[3];
        SensorManager.getRotationMatrixFromVector(matrix, event.values);

        int rotationId = getActivity() == null
                ? Surface.ROTATION_0
                : getActivity().getWindowManager().getDefaultDisplay().getRotation();
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

        SensorManager.getOrientation(remapped, orientation);
        double magnetic = normalize(Math.toDegrees(orientation[0]));
        GeomagneticField field = new GeomagneticField(
                (float) latitude, (float) longitude, 0f, System.currentTimeMillis());
        double declination = field.getDeclination();
        double trueHeading = normalize(magnetic + declination);

        JSObject out = new JSObject();
        out.put("heading", trueHeading);
        out.put("magneticHeading", magnetic);
        out.put("declination", declination);
        out.put("sensorAccuracy", event.accuracy);
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
    }

    private static double normalize(double degrees) {
        return (degrees % 360 + 360) % 360;
    }
}
