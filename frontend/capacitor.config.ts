import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app (APK) wrapper for the portal.
 *
 * The app loads the LIVE website, so every update you deploy to the server
 * shows up in the app automatically. Set your real domain below (or pass
 * CAP_SERVER_URL when running `npx cap sync`).
 */
const LIVE_URL = process.env.CAP_SERVER_URL || "https://theconcept.ac.pk/login";

/** Background color shown behind/around the splash image. Matches the top of splash.jpg. */
const SPLASH_BG = "#0047da";

const config: CapacitorConfig = {
  appId: "com.conceptacademy.app",
  appName: "The Concept Academy",
  webDir: "dist",
  server: {
    url: LIVE_URL,
    androidScheme: "https",
  },
  android: {
    backgroundColor: SPLASH_BG,
  },
  plugins: {
    SplashScreen: {
      // 0 = don't hold Android's plain launch screen. The splash image is shown by
      // MainActivity.java straight from the APK and fades out when the site has loaded.
      launchShowDuration: 0,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: SPLASH_BG,
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
