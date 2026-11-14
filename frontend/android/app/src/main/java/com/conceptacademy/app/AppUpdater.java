package com.conceptacademy.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.util.TypedValue;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import org.json.JSONObject;

/**
 * Keeps the installed APK itself up to date (the website part already updates on its own).
 *
 * Every APK build publishes /downloads/tca-version.json next to /downloads/tca.apk
 * (scripts/build-apk.mjs). On open, and when the app comes back to the front, this class
 * reads that file. If the server has a newer versionCode it shows "Update available",
 * downloads the APK with a progress bar, checks its SHA-256 against the file, and opens
 * Android's install screen. Android itself also refuses the APK unless it is signed with
 * the same key as the installed app.
 *
 * Android never lets an app outside the Play Store install an update silently: the user
 * confirms the install (one tap), and the very first time allows "Install unknown apps"
 * for this app.
 */
final class AppUpdater {

    private static final String TAG = "TCAUpdate";
    private static final String VERSION_PATH = "/downloads/tca-version.json";
    /** Don't check the server more often than this while the app stays open (ms). */
    private static final long CHECK_EVERY_MS = 30 * 60 * 1000L;
    /** After "Later", don't ask again for this long (ms) unless the update is required. */
    private static final long SNOOZE_MS = 6 * 60 * 60 * 1000L;

    private final Activity activity;
    private final String origin;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final SharedPreferences prefs;

    private long lastCheckAt;
    private boolean busy;
    private AlertDialog dialog;
    /** Downloaded and verified APK waiting for the "Install unknown apps" permission. */
    private File pendingApk;

    AppUpdater(Activity activity, String origin) {
        this.activity = activity;
        this.origin = origin;
        this.prefs = activity.getSharedPreferences("app_update", Context.MODE_PRIVATE);
    }

    /** Called from onResume: install a waiting APK, or check the server (throttled). */
    void onResume() {
        if (pendingApk != null && canInstall()) {
            File apk = pendingApk;
            pendingApk = null;
            launchInstaller(apk);
            return;
        }
        long now = System.currentTimeMillis();
        if (busy || now - lastCheckAt < CHECK_EVERY_MS) return;
        lastCheckAt = now;
        busy = true;
        new Thread(this::checkServer, "apk-update-check").start();
    }

    // ---------------------------------------------------------------- check

    private void checkServer() {
        try {
            JSONObject info = new JSONObject(readText(origin + VERSION_PATH + "?t=" + System.currentTimeMillis()));
            long latest = info.optLong("versionCode", 0);
            long current = installedVersionCode();
            Log.i(TAG, "installed " + current + ", server " + latest);
            if (latest <= current) {
                cleanupDownloads();
                busy = false;
                return;
            }
            boolean force = info.optBoolean("force", false);
            long snoozedUntil = prefs.getLong("snooze_" + latest, 0);
            if (!force && System.currentTimeMillis() < snoozedUntil) {
                busy = false;
                return;
            }
            Update u = new Update(
                latest,
                info.optString("versionName", String.valueOf(latest)),
                absolute(info.optString("apk", "/downloads/tca.apk")),
                info.optString("sha256", "").toLowerCase(),
                info.optLong("size", 0),
                info.optString("notes", ""),
                force
            );
            ui.post(() -> askToUpdate(u));
        } catch (Throwable t) {
            Log.i(TAG, "update check skipped: " + t);
            busy = false;
        }
    }

    private void askToUpdate(Update u) {
        if (activity.isFinishing()) { busy = false; return; }
        String size = u.size > 0 ? String.format(" (%.1f MB)", u.size / 1024f / 1024f) : "";
        String msg = "A new version of The Concept Academy app is ready" + size + "."
            + (u.notes.isEmpty() ? "" : "\n\n" + u.notes)
            + "\n\nIt downloads in the app, then Android asks you to tap Install.";
        AlertDialog.Builder b = new AlertDialog.Builder(activity)
            .setTitle("Update available")
            .setMessage(msg)
            .setCancelable(!u.force)
            .setPositiveButton("Update", (d, w) -> startDownload(u));
        if (!u.force) {
            b.setNegativeButton("Later", (d, w) -> {
                prefs.edit().putLong("snooze_" + u.versionCode, System.currentTimeMillis() + SNOOZE_MS).apply();
                busy = false;
            });
            b.setOnCancelListener(d -> busy = false);
        }
        dialog = b.show();
    }

    // ------------------------------------------------------------- download

    private void startDownload(Update u) {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(22);
        box.setPadding(pad, dp(8), pad, 0);
        ProgressBar bar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        TextView label = new TextView(activity);
        label.setText("Starting download…");
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        box.addView(bar);
        box.addView(label);
        dialog = new AlertDialog.Builder(activity)
            .setTitle("Downloading update")
            .setView(box)
            .setCancelable(false)
            .show();

        new Thread(() -> {
            try {
                File apk = download(u, (pct, mb) -> ui.post(() -> {
                    bar.setProgress(pct);
                    label.setText(pct + "%  ·  " + mb);
                }));
                ui.post(() -> {
                    dismiss();
                    install(apk);
                });
            } catch (Throwable t) {
                Log.w(TAG, "download failed", t);
                ui.post(() -> {
                    dismiss();
                    busy = false;
                    new AlertDialog.Builder(activity)
                        .setTitle("Update failed")
                        .setMessage("The update could not be downloaded. Check your internet and try again.")
                        .setPositiveButton("Try again", (d, w) -> startDownload(u))
                        .setNegativeButton(u.force ? null : "Close", null)
                        .setCancelable(!u.force)
                        .show();
                });
            }
        }, "apk-update-download").start();
    }

    private interface Progress { void on(int percent, String text); }

    private File download(Update u, Progress progress) throws Exception {
        File dir = new File(activity.getCacheDir(), "updates");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
        File out = new File(dir, "tca-" + u.versionCode + ".apk");
        File tmp = new File(dir, out.getName() + ".part");

        HttpURLConnection c = (HttpURLConnection) new URL(u.apkUrl + "?v=" + u.versionCode).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setUseCaches(false);
        try {
            if (c.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IllegalStateException("HTTP " + c.getResponseCode());
            long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : u.size;
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(tmp)) {
                byte[] buf = new byte[64 * 1024];
                long done = 0;
                int lastPct = -1, n;
                while ((n = in.read(buf)) != -1) {
                    os.write(buf, 0, n);
                    sha.update(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int pct = (int) Math.min(100, done * 100 / total);
                        if (pct != lastPct) {
                            lastPct = pct;
                            progress.on(pct, String.format("%.1f / %.1f MB", done / 1048576f, total / 1048576f));
                        }
                    }
                }
            }
            if (!u.sha256.isEmpty() && !u.sha256.equals(hex(sha.digest()))) {
                tmp.delete();
                throw new SecurityException("checksum mismatch");
            }
        } finally {
            c.disconnect();
        }
        // Must really be our app, and really the newer version.
        PackageInfo pi = activity.getPackageManager().getPackageArchiveInfo(tmp.getAbsolutePath(), 0);
        if (pi == null || !activity.getPackageName().equals(pi.packageName) || versionCodeOf(pi) < u.versionCode) {
            tmp.delete();
            throw new SecurityException("not the expected app");
        }
        if (out.exists()) out.delete();
        if (!tmp.renameTo(out)) throw new IllegalStateException("rename failed");
        return out;
    }

    // -------------------------------------------------------------- install

    private void install(File apk) {
        if (canInstall()) {
            launchInstaller(apk);
            return;
        }
        // First time only: Android needs "Install unknown apps" switched on for this app.
        pendingApk = apk;
        new AlertDialog.Builder(activity)
            .setTitle("One-time permission")
            .setMessage("To install updates, allow this app to install apps.\n\nOn the next screen turn on \"Allow from this source\", then come back.")
            .setCancelable(false)
            .setPositiveButton("Open settings", (d, w) -> {
                try {
                    activity.startActivity(new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())
                    ));
                } catch (Throwable t) {
                    Log.w(TAG, "settings not available", t);
                }
            })
            .show();
    }

    private void launchInstaller(File apk) {
        busy = false;
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Throwable t) {
            Log.w(TAG, "installer failed", t);
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.getPackageManager().canRequestPackageInstalls();
    }

    // -------------------------------------------------------------- helpers

    private static final class Update {
        final long versionCode;
        final String versionName, apkUrl, sha256, notes;
        final long size;
        final boolean force;

        Update(long versionCode, String versionName, String apkUrl, String sha256, long size, String notes, boolean force) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.sha256 = sha256;
            this.size = size;
            this.notes = notes;
            this.force = force;
        }
    }

    private long installedVersionCode() throws PackageManager.NameNotFoundException {
        return versionCodeOf(activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0));
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
    }

    /** Only same-site links are accepted for the APK. */
    private String absolute(String path) {
        if (path.startsWith("/")) return origin + path;
        if (path.startsWith(origin + "/")) return path;
        return origin + "/downloads/tca.apk";
    }

    private static String readText(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(15000);
        c.setUseCaches(false);
        try (InputStream in = c.getInputStream()) {
            if (c.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IllegalStateException("HTTP " + c.getResponseCode());
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte x : bytes) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private void cleanupDownloads() {
        File[] old = new File(activity.getCacheDir(), "updates").listFiles();
        if (old != null) for (File f : old) f.delete();
    }

    private void dismiss() {
        try { if (dialog != null) dialog.dismiss(); } catch (Throwable ignored) {}
        dialog = null;
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, activity.getResources().getDisplayMetrics()));
    }
}
