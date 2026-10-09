import { useEffect } from "react";
import {
  approvalNotificationFor,
  isDesktopShell,
  runNotificationFor,
  shouldNotify,
  type ChatApprovalEvent,
  type ChatRunEvent,
  type RunNotification,
} from "~/lib/run-notification";
import { subscribe } from "~/lib/event-stream";

/**
 * Reports a swallowed notification failure into the server log, once per
 * distinct message. The UX stays silent on purpose (FR-B16: a failed
 * notification must not disturb the run), but "nothing happens and nothing is
 * written anywhere" is how a broken notification channel stays broken — the
 * server log is the one place both ends of the app meet.
 */
const reportedFailures = new Set<string>();
function reportFailure(message: string) {
  if (reportedFailures.has(message) || reportedFailures.size > 5) return;
  reportedFailures.add(message);
  void fetch("/api/system/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ where: "native-notification", message }),
    cache: "no-store",
  }).catch(() => {
    /* the server may be exactly what is down */
  });
}

/**
 * Desktop notifications for chat runs (Fase 5.6, FR-B16).
 *
 * Mounted once at the app root, NOT in the chat panel: the run that finishes
 * may belong to a project the user has navigated away from, and the panel only
 * exists on `/projects/*`. The server already knows when a run ends or blocks
 * on an approval, so the signal comes over the existing SSE bus (two new event
 * types) rather than being inferred from a streaming response.
 *
 * Web builds are inert: `isDesktopShell()` is false, so no ticket is requested
 * and no EventSource is opened.
 */
export function useRunNotifications(): void {
  useEffect(() => {
    if (!isDesktopShell()) return;

    let source: EventSource | null = null;
    let disposed = false;
    let failures = 0;
    // A reconnect re-delivers events; one run must not notify twice.
    const seen = new Set<string>();
    // "unknown" until the OS is asked. Asking happens on the FIRST notification
    // attempt, not at startup: a user who never runs an agent should never see
    // an OS permission dialog.
    let permission: "unknown" | "granted" | "refused" = "unknown";

    async function deliver(notification: RunNotification) {
      if (seen.has(notification.key)) return;
      if (!shouldNotify({ focused: document.hasFocus() && !document.hidden, isDesktopShell: true, alreadySeen: false })) return;
      seen.add(notification.key);
      try {
        const mod = await import("@tauri-apps/plugin-notification");
        if (permission === "unknown") {
          if (await mod.isPermissionGranted()) {
            permission = "granted";
          } else {
            // Returns "granted" | "denied" | "prompt"; only "granted" sends.
            permission = (await mod.requestPermission()) === "granted" ? "granted" : "refused";
            if (permission === "refused") reportFailure("notification permission was denied by the OS");
          }
        }
        // A refused permission must stay silent: the run itself is unaffected
        // and an error toast about notifications would help nobody.
        if (permission !== "granted") return;
        mod.sendNotification({ title: notification.title, body: notification.body });
      } catch (err) {
        /* the plugin or the OS channel is unavailable — never disturb the app,
           but leave a trace in the server log (see reportFailure) */
        reportFailure(String((err as { message?: string })?.message ?? err));
      }
    }

    function handle<T>(payload: T, build: (payload: T) => RunNotification) {
      void deliver(build(payload));
    }

    // One shared stream for the whole tab (see event-stream.ts); the payload is the bus `data`.
    const offs = [
      subscribe("chat:run", (data) => handle<ChatRunEvent>(data, runNotificationFor)),
      subscribe("chat:approval", (data) => handle<ChatApprovalEvent>(data, approvalNotificationFor)),
    ];
    return () => offs.forEach((off) => off());
  }, []);
}
