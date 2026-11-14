package com.conceptacademy.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Shows the splash picture with a loader on top of the app the moment it opens, and fades
 * it out once the website has loaded.
 *
 * The picture auto-updates: each launch quietly downloads /splash.jpg from the server (only
 * if it changed) and keeps it on the phone. The next launch shows that copy. The picture
 * bundled in the APK (res/drawable-nodpi/splash.jpg) is used only until the first download.
 */
public class MainActivity extends BridgeActivity {

    /** Keep the splash on screen at least this long (ms). */
    private static final long MIN_SPLASH_MS = 1500;
    /** Remove it after this long even if the site is slow or offline (ms). */
    private static final long MAX_SPLASH_MS = 10000;
    /** Loader position: distance from the bottom, as a share of screen height (matches index.html). */
    private static final float LOADER_BOTTOM = 0.025f;
    /** Loader color (gold) and text under it. */
    private static final int LOADER_COLOR = Color.parseColor("#F5B301");
    private static final String LOADER_TEXT = "LOADING...";
    /** Used if the server address can't be read from the Capacitor config. */
    private static final String DEFAULT_ORIGIN = "https://theconcept.ac.pk";
    private static final String SPLASH_FILE = "splash.jpg";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private View splashView;
    private long shownAt;
    private int safeTopPx;
    private int safeBottomPx;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showSplash();
        installSafeArea();

        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    hideSplash();
                    pushSafeArea();
                }

                @Override
                public void onReceivedError(WebView webView) {
                    hideSplash();
                }
            }
        );

        installBackButton();
    }

    /**
     * Phone back button: go to the previous page inside the site (like a browser) instead of
     * closing the app. On the first page there is nothing to go back to, so the app is sent to
     * the background (like pressing Home) rather than being destroyed.
     */
    private void installBackButton() {
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    WebView webView = bridge != null ? bridge.getWebView() : null;
                    if (webView != null && webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        moveTaskToBack(true);
                    }
                }
            }
        );
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    /** Publish the system bar sizes so the site can pad the tab bar above the gesture / 3-button nav. */
    private void installSafeArea() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, windowInsets) -> {
            Insets status = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets nav = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            safeTopPx = status.top;
            safeBottomPx = nav.bottom;
            pushSafeArea();
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(decor);
    }

    private void pushSafeArea() {
        if (bridge == null || bridge.getWebView() == null) return;
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        final String js =
            "document.documentElement.style.setProperty('--safe-top','" + (safeTopPx / density) + "px');" +
            "document.documentElement.style.setProperty('--safe-bottom','" + (safeBottomPx / density) + "px');";
        bridge.getWebView().post(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(js, null);
            }
        });
    }

    private void showSplash() {
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundResource(R.color.splash_bg);
        container.setClickable(true); // block taps on the page underneath

        ImageView image = new ImageView(this);
        Bitmap saved = loadSavedSplash();
        if (saved != null) image.setImageBitmap(saved);
        else image.setImageResource(R.drawable.splash);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        container.addView(
            image,
            new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );

        LinearLayout loaderBox = new LinearLayout(this);
        loaderBox.setOrientation(LinearLayout.VERTICAL);
        loaderBox.setGravity(Gravity.CENTER_HORIZONTAL);

        loaderBox.addView(new SpokeSpinner(this, LOADER_COLOR), new LinearLayout.LayoutParams(dp(44), dp(44)));

        TextView label = new TextView(this);
        label.setText(LOADER_TEXT);
        label.setTextColor(Color.WHITE);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setLetterSpacing(0.15f);
        label.setShadowLayer(dp(3), 0, dp(1), Color.argb(115, 0, 0, 0));
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        labelParams.topMargin = dp(10);
        loaderBox.addView(label, labelParams);

        FrameLayout.LayoutParams boxParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
        );
        boxParams.bottomMargin = Math.round(getResources().getDisplayMetrics().heightPixels * LOADER_BOTTOM);
        container.addView(loaderBox, boxParams);

        addContentView(
            container,
            new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );
        splashView = container;
        shownAt = SystemClock.uptimeMillis();
        handler.postDelayed(this::removeSplashNow, MAX_SPLASH_MS);
        new Thread(this::refreshSplashFromServer, "splash-update").start();
    }

    /** The picture downloaded from the server on an earlier launch, or null. */
    private Bitmap loadSavedSplash() {
        try {
            File f = new File(getFilesDir(), SPLASH_FILE);
            return f.isFile() ? BitmapFactory.decodeFile(f.getAbsolutePath()) : null;
        } catch (Throwable t) {
            return null;
        }
    }

    private String serverOrigin() {
        try {
            String url = bridge != null ? bridge.getServerUrl() : null;
            if (url != null) {
                Uri u = Uri.parse(url);
                if (u.getScheme() != null && u.getHost() != null) {
                    return u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
                }
            }
        } catch (Throwable ignored) {}
        return DEFAULT_ORIGIN;
    }

    /** Downloads /splash.jpg if it changed on the server and saves it for the next launch. */
    private void refreshSplashFromServer() {
        HttpURLConnection conn = null;
        try {
            SharedPreferences prefs = getSharedPreferences("splash", MODE_PRIVATE);
            File target = new File(getFilesDir(), SPLASH_FILE);
            conn = (HttpURLConnection) new URL(serverOrigin() + "/" + SPLASH_FILE).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(15000);
            conn.setUseCaches(false);
            String etag = prefs.getString("etag", null);
            if (etag != null && target.isFile()) conn.setRequestProperty("If-None-Match", etag);
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) { // 304 = unchanged
                Log.i("TCASplash", "splash check: HTTP " + code);
                return;
            }

            File tmp = new File(getFilesDir(), SPLASH_FILE + ".tmp");
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            }
            BitmapFactory.Options check = new BitmapFactory.Options();
            check.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(tmp.getAbsolutePath(), check);
            if (check.outWidth <= 0 || !tmp.renameTo(target)) { // not a picture: keep the old one
                tmp.delete();
                return;
            }
            prefs.edit().putString("etag", conn.getHeaderField("ETag")).apply();
            Log.i("TCASplash", "splash updated from server (" + target.length() + " bytes)");
        } catch (Throwable ignored) {
            // Offline or server error: keep the current picture.
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void hideSplash() {
        long wait = Math.max(0, MIN_SPLASH_MS - (SystemClock.uptimeMillis() - shownAt));
        handler.postDelayed(this::removeSplashNow, wait);
    }

    private void removeSplashNow() {
        final View view = splashView;
        if (view == null) return;
        splashView = null;
        handler.removeCallbacksAndMessages(null);
        view
            .animate()
            .alpha(0f)
            .setDuration(250)
            .withEndAction(() -> {
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
            })
            .start();
    }

    /** 12 rounded bars with a fading trail, stepping clockwise (same as the web splash loader). */
    private static class SpokeSpinner extends View {

        private static final int SPOKES = 12;
        private static final long STEP_MS = 1000 / SPOKES;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        SpokeSpinner(Context context, int color) {
            super(context);
            paint.setColor(color);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeCap(Paint.Cap.ROUND);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float size = Math.min(getWidth(), getHeight());
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f;
            float outer = size / 2f - size * 0.045f;
            float inner = outer - size * 0.18f;
            paint.setStrokeWidth(size * 0.09f);
            int head = (int) ((SystemClock.uptimeMillis() / STEP_MS) % SPOKES);
            for (int k = 0; k < SPOKES; k++) {
                // k = 0 is the brightest bar; the trail fades behind it (counter-clockwise).
                paint.setAlpha(Math.round(255 * (1f - k * 0.075f)));
                canvas.save();
                canvas.rotate((head - k) * 30f, cx, cy);
                canvas.drawLine(cx, cy - outer, cx, cy - inner, paint);
                canvas.restore();
            }
            postInvalidateDelayed(STEP_MS);
        }
    }
}
