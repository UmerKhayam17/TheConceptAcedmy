#!/usr/bin/env node
/**
 * One command to build the Android app:   npm run android:apk
 *
 *  1. builds the website (dist/)
 *  2. syncs it + capacitor.config.ts into the android/ project
 *  3. creates the signing key on the first run (android/keystore/, not in git)
 *  4. builds a signed release APK with a new version number
 *  5. copies it to public/downloads/tca.apk  -> commit & push, the server serves it
 *
 * Needs (only on the PC that builds the APK): JDK 21 and the Android SDK.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const keystoreDir = path.join(androidDir, "keystore");
const keystoreProps = path.join(keystoreDir, "keystore.properties");
const outApk = path.join(root, "public", "downloads", "tca.apk");
const isWin = process.platform === "win32";

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
};

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Gradle 8 needs JDK 17–21 (newer JDKs, like Android Studio's bundled 25, fail). */
function findJavaHome() {
  const candidates = [process.env.JAVA_HOME].filter(Boolean);
  if (isWin) {
    for (const base of ["C:/Program Files/Java", "C:/Program Files/Eclipse Adoptium", "C:/Program Files/Microsoft"]) {
      if (!fs.existsSync(base)) continue;
      for (const d of fs.readdirSync(base).sort().reverse()) {
        if (/^jdk-?(21|17)/.test(d)) candidates.push(path.join(base, d));
      }
    }
  } else {
    candidates.push("/usr/lib/jvm/java-21-openjdk-amd64", "/usr/lib/jvm/java-17-openjdk-amd64");
  }
  const keytool = isWin ? "bin/keytool.exe" : "bin/keytool";
  for (const c of candidates) {
    if (!fs.existsSync(path.join(c, keytool))) continue;
    try {
      const v = execSync(`"${path.join(c, "bin", "java")}" -version 2>&1`).toString();
      const major = Number((v.match(/version "(\d+)/) || [])[1]);
      if (major >= 17 && major <= 21) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

function findAndroidHome() {
  const c = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWin ? path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk") : path.join(os.homedir(), "Android", "Sdk"),
    path.join(os.homedir(), "android-sdk"),
  ].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || null;
}

// ---- checks -------------------------------------------------------------
const capConfig = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
if (capConfig.includes("YOUR-DOMAIN.com") && !process.env.CAP_SERVER_URL) {
  fail('Set your live website address in capacitor.config.ts (LIVE_URL), e.g. "https://example.com/login".');
}

const javaHome = findJavaHome();
if (!javaHome) fail("JDK 17 or 21 not found. Install JDK 21 (https://adoptium.net) or set JAVA_HOME.");
const androidHome = findAndroidHome();
if (!androidHome) fail("Android SDK not found. Install Android Studio once, or set ANDROID_HOME.");

const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome };
console.log(`Using JDK: ${javaHome}\nUsing Android SDK: ${androidHome}`);

// ---- 1. signing key (first run only) ------------------------------------
if (!fs.existsSync(keystoreProps)) {
  fs.mkdirSync(keystoreDir, { recursive: true });
  const password = randomBytes(18).toString("base64url");
  const keytool = path.join(javaHome, "bin", isWin ? "keytool.exe" : "keytool");
  run(
    `"${keytool}" -genkeypair -keystore "${path.join(keystoreDir, "tca-release.jks")}" -alias tca ` +
      `-keyalg RSA -keysize 2048 -validity 10000 -storepass ${password} -keypass ${password} ` +
      `-dname "CN=The Concept Academy, O=The Concept Academy, C=PK"`,
    { env },
  );
  fs.writeFileSync(
    keystoreProps,
    `storeFile=tca-release.jks\nstorePassword=${password}\nkeyAlias=tca\nkeyPassword=${password}\n`,
  );
  console.log(
    "\n⚠  New signing key created in frontend/android/keystore/ (not in git).\n" +
      "   BACK UP THAT WHOLE FOLDER (USB / Google Drive). Without it you can never update the app.\n",
  );
}

// ---- 2. web build + sync -----------------------------------------------
run("npm run build");
run("npx cap sync android", { env });
// The app loads the live site, so don't pack the previous APK (dist/downloads) inside the new one.
fs.rmSync(path.join(androidDir, "app", "src", "main", "assets", "public", "downloads"), { recursive: true, force: true });

// ---- 3. signed release APK ---------------------------------------------
// Minutes since 2020: always increases, so every new APK installs as an update.
const versionCode = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 60000);
const d = new Date();
const versionName = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
run(
  `"${path.join(androidDir, isWin ? "gradlew.bat" : "gradlew")}" assembleRelease --console=plain ` +
    `-PappVersionCode=${versionCode} -PappVersionName=${versionName}`,
  { cwd: androidDir, env },
);

const built = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!fs.existsSync(built)) fail(`Signed APK not found at ${built}`);
fs.mkdirSync(path.dirname(outApk), { recursive: true });
fs.copyFileSync(built, outApk);

const mb = (fs.statSync(outApk).size / 1024 / 1024).toFixed(1);
console.log(
  `\n✔ Android app built: public/downloads/tca.apk (${mb} MB, version ${versionName} / ${versionCode})\n` +
    "  Next: git add -A && git commit -m \"New Android app\" && git push\n" +
    "  On the server, the normal `npm run build` puts it at /downloads/tca.apk\n",
);
