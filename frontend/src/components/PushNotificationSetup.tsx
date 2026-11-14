import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { isNativePushAvailable, pushTapHref, startPushNotifications } from "@/lib/pushNotifications";

/**
 * Android app only: once someone is signed in, turn on phone notification-bar alerts and open
 * the right screen when one is tapped. Renders nothing.
 */
export default function PushNotificationSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (!userId || !role || !isNativePushAvailable()) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void startPushNotifications((data) => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      navigate(pushTapHref(role, data));
    }).then((done) => {
      if (cancelled) done();
      else cleanup = done;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [userId, role, navigate, qc]);

  return null;
}
