/**
 * Phone notification-bar alerts for the Android app (Firebase push via @capacitor/push-notifications).
 *
 * After sign-in the app asks for notification permission once, registers the phone with Firebase and
 * saves the phone's token on the server (POST /notifications/device-token). The server then sends every
 * bell notification to the phone too, so it shows in the notification bar even when the app is closed.
 * Tapping it opens the matching screen. Logout removes the token on the server.
 *
 * Old APKs without the native plugin, and the website in a browser, skip all of this.
 */
import { authedFetch, type Role } from "@/lib/auth";
import { markNotificationRead, notificationHref, resolveParentNotificationHref } from "@/lib/notificationsApi";

/** Must match ANDROID_CHANNEL_ID in backend/src/services/pushService.js */
export const PUSH_CHANNEL_ID = "tca_alerts";

type CapacitorGlobal = { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean };

export function isNativePushAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.() && cap?.isPluginAvailable?.("PushNotifications"));
}

export type PushTapData = {
  notificationId?: string;
  path?: string;
  type?: string;
  moduleKey?: string;
  resource?: string;
  title?: string;
};

/** Screen to open for a tapped notification (same rules as the bell / parent alerts list). */
export function pushTapHref(role: Role, data: PushTapData): string {
  if (role === "parent") return resolveParentNotificationHref(data) || "/panel/parent/notifications";
  if (data.path) return notificationHref(role, data.path);
  return `/panel/${role}`;
}

let lastSavedToken: string | null = null;

async function saveToken(token: string) {
  if (!token || token === lastSavedToken) return;
  const res = await authedFetch("/notifications/device-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (res.ok) lastSavedToken = token;
}

/**
 * Set up phone alerts for the signed-in user. Returns a cleanup function.
 * `onTap` gets the data of a tapped notification (also one tapped while the app was closed).
 */
export async function startPushNotifications(onTap: (data: PushTapData) => void): Promise<() => void> {
  if (!isNativePushAvailable()) return () => {};
  lastSavedToken = null; // new sign-in: always save the token for this user
  const { PushNotifications } = await import("@capacitor/push-notifications");

  const handles = await Promise.all([
    PushNotifications.addListener("registration", ({ value }) => {
      void saveToken(value).catch(() => {
        /* saved again on next app open */
      });
    }),
    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registration failed", err?.error);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const data = (notification?.data || {}) as PushTapData;
      if (data.notificationId) void markNotificationRead(data.notificationId).catch(() => {});
      onTap(data);
    }),
  ]);
  const cleanup = () => handles.forEach((h) => void h.remove());

  try {
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL_ID,
      name: "Alerts",
      description: "Attendance, fees, messages, results and school notices",
      importance: 4, // high: sound + pop-up
      visibility: 1,
      vibration: true,
    });
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive === "granted") await PushNotifications.register();
  } catch (err) {
    console.warn("[push] setup failed", err);
  }
  return cleanup;
}
