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
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
    private static final long MIN_SPLASH_MS = 600;
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

    /**
     * Closes the top open popup on the page, if any, and returns "closed" (else "none").
     * - Side menu, dialogs, dropdown sheets (Radix): they close on the Escape key.
     * - The parent screens' own bottom sheets (role=dialog, aria-modal): they close when
     *   their dimmed background is tapped.
     */
    private static final String CLOSE_OPEN_POPUP_JS =
        "(function(){" +
            "var r=document.querySelectorAll('[role=dialog][data-state=open],[role=alertdialog][data-state=open],[role=menu][data-state=open],[role=listbox][data-state=open]');" +
            "if(r.length){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));return 'closed';}" +
            "var m=document.querySelectorAll('[role=dialog][aria-modal=true]');" +
            "if(m.length){var d=m[m.length-1];(d.parentElement||d).click();return 'closed';}" +
            "return 'none';" +
        "})()";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private View splashView;
    private long shownAt;
    private int safeTopPx;
    private int safeBottomPx;
    private boolean keyboardOpen;
    private AppUpdater appUpdater;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep splash + web content below status/nav bars (never immersive fullscreen).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (bars != null) {
            bars.setAppearanceLightStatusBars(false);
            bars.show(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
        }
        showSplash();
        installSafeArea();

        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    pushSafeArea();
                    // Don't hide yet: the page has only started. Wait until the first real
                    // screen is drawn, otherwise the site's own blue startup screen shows
                    // (plain blue while its picture is still downloading).
                    waitForFirstScreen();
                }

                @Override
                public void onReceivedError(WebView webView) {
                    hideSplash();
                }
            }
        );

        installBackButton();
        appUpdater = new AppUpdater(this, serverOrigin());
    }

    @Override
    public void onResume() {
        super.onResume();
        // New APK on the server? Ask to update (also installs one waiting for permission).
        if (appUpdater != null) appUpdater.onResume();
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
                    if (webView == null) {
                        moveTaskToBack(true);
                        return;
                    }
                    // An open menu / popup closes first (like every Android app); only when
                    // nothing is open does Back go to the previous page.
                    webView.evaluateJavascript(CLOSE_OPEN_POPUP_JS, value -> {
                        if ("\"closed\"".equals(value)) return;
                        if (webView.canGoBack()) webView.goBack();
                        else moveTaskToBack(true);
                    });
                }
            }
        );
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    /**
     * Keeps the site above the phone's navigation area and the keyboard.
     *
     * Android 15+ draws apps behind the navigation bar, so the bottom of every screen (tab bar,
     * chat box, search fields) ended up under the gesture bar / 3 buttons, and taps there hit
     * Home instead. The page is now lifted by exactly the height of whatever the phone shows at
     * the bottom: 3-button bar, 2-button bar, gesture bar, or the keyboard while typing.
     * The status bar at the top is still handled by the site (--safe-top).
     */
    private void installSafeArea() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, windowInsets) -> {
            Insets status = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets nav = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            safeTopPx = status.top;
            // Splash picture sits between the status bar and the navigation buttons, not under them.
            if (splashView != null) splashView.setPadding(nav.left, status.top, nav.right, nav.bottom);
            // The page itself now stops above the bottom bar, so the site needs no extra padding.
            safeBottomPx = 0;
            keyboardOpen = ime.bottom > nav.bottom;
            liftWebView(Math.max(nav.bottom, ime.bottom), nav.left, nav.right);
            pushSafeArea();
            // Children see no bottom bar any more (it is outside the page now), so nothing pads twice.
            return new WindowInsetsCompat.Builder(windowInsets)
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(nav.left, 0, nav.right, 0))
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(decor);
    }

    /** Shrinks the web page so it ends where the navigation bar (or keyboard) begins. */
    private void liftWebView(int bottomPx, int leftPx, int rightPx) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null || !(webView.getLayoutParams() instanceof ViewGroup.MarginLayoutParams)) return;
        if (webView.getParent() instanceof View) {
            // Colour of the strip behind the navigation buttons.
            ((View) webView.getParent()).setBackgroundColor(Color.WHITE);
        }
        ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) webView.getLayoutParams();
        if (lp.bottomMargin == bottomPx && lp.leftMargin == leftPx && lp.rightMargin == rightPx) return;
        lp.bottomMargin = bottomPx;
        lp.leftMargin = leftPx; // landscape 3-button bar sits on the side
        lp.rightMargin = rightPx;
        webView.setLayoutParams(lp);
    }

    private void pushSafeArea() {
        if (bridge == null || bridge.getWebView() == null) return;
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        // Keep a 44px floor — WebView insets are often 0 while content still draws
        // under the status bar (matches --safe-top in index.css).
        float topCss = Math.max(44f, safeTopPx / density);
        float bottomCss = Math.max(0f, safeBottomPx / density);
        // While the keyboard is open the bottom tab bar is hidden (like WhatsApp), so it does not
        // ride up above the keyboard and cover the chat / search box. The tab bars on the site are
        // marked with data-panel-mobile-nav.
        final String js =
            "document.documentElement.style.setProperty('--safe-top','" + topCss + "px');" +
            "document.documentElement.style.setProperty('--safe-bottom','" + bottomCss + "px');" +
            "if(!document.getElementById('tca-kb-style')){var s=document.createElement('style');s.id='tca-kb-style';" +
            "s.textContent='html.tca-keyboard-open [data-panel-mobile-nav]{display:none!important}';" +
            "(document.head||document.documentElement).appendChild(s);}" +
            "document.documentElement.classList.toggle('tca-keyboard-open'," + keyboardOpen + ");";
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

    /**
     * Keeps the splash up until the site has drawn its first screen (login or home). The site
     * removes its #boot-splash element at that moment (src/lib/bootSplash.ts). Checked every
     * 150 ms; MAX_SPLASH_MS still removes the splash if the site never reports in.
     */
    private void waitForFirstScreen() {
        if (splashView == null || bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().evaluateJavascript(
            "(function(){return !document.getElementById('boot-splash')||" +
                "document.documentElement.classList.contains('boot-done');})()",
            value -> {
                if ("true".equals(value)) hideSplash();
                else handler.postDelayed(this::waitForFirstScreen, 150);
            }
        );
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
