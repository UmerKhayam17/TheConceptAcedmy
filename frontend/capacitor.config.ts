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
      // Native launch screen (plain blue, no logo). index.html hides it as soon as
      // your web splash (public/splash.jpg) is on screen; 6s is only a fallback.
      launchShowDuration: 6000,
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
