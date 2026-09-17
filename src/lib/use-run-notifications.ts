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
          }
        }
        // A refused permission must stay silent: the run itself is unaffected
        // and an error toast about notifications would help nobody.
        if (permission !== "granted") return;
        mod.sendNotification({ title: notification.title, body: notification.body });
      } catch {
        /* the plugin or the OS channel is unavailable — never disturb the app */
      }
    }

    function handle<T>(event: MessageEvent, build: (payload: T) => RunNotification) {
      try {
        // The bus emits the ENVELOPE `{ type, data, timestamp }` — reading
        // `payload.foo` here instead of `payload.data.foo` is the exact bug
        // the index watcher had (see ROADMAP §Cara verifikasi).
        const envelope = JSON.parse(String(event.data ?? "{}"));
        const payload = (envelope?.data ?? {}) as T;
        void deliver(build(payload));
      } catch {
        /* a malformed event must not break the subscription */
      }
    }

    async function connect() {
      try {
        const res = await fetch("/api/events/ticket", { method: "POST", cache: "no-store" });
        if (!res.ok) return;
        const { ticket } = (await res.json()) as { ticket?: string };
        if (!ticket || disposed) return;
        source = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
        source.addEventListener("chat:run", (e) => handle<ChatRunEvent>(e as MessageEvent, runNotificationFor));
        source.addEventListener("chat:approval", (e) => handle<ChatApprovalEvent>(e as MessageEvent, approvalNotificationFor));
        // WebView auto-reconnect never gives up on its own; a dead server would
        // otherwise be retried forever (AGENTS.md).
        source.onerror = () => {
          failures += 1;
          if (failures >= 5) {
            source?.close();
            source = null;
          }
        };
      } catch {
        /* no SSE channel: notifications are best-effort by definition */
      }
    }

    void connect();
    return () => {
      disposed = true;
      source?.close();
      source = null;
    };
  }, []);
}
