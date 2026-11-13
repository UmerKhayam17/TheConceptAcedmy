package com.conceptacademy.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Shows res/drawable-nodpi/splash.jpg (bundled in the APK, so no download) with a loader
 * on top of the app the moment it opens, and fades it out once the website has loaded.
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

    private final Handler handler = new Handler(Looper.getMainLooper());
    private View splashView;
    private long shownAt;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showSplash();

        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    hideSplash();
                }

                @Override
                public void onReceivedError(WebView webView) {
                    hideSplash();
                }
            }
        );
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private void showSplash() {
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundResource(R.color.splash_bg);
        container.setClickable(true); // block taps on the page underneath

        ImageView image = new ImageView(this);
        image.setImageResource(R.drawable.splash);
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
