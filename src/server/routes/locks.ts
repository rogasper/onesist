/**
 * Document write locks across windows (Fase 5E). A window claims a document with the client
 * id it opened its SSE stream with; another window gets "held" until the holder releases it
 * or its stream closes. Every change is announced as `lock:changed`.
 */
import { json } from "../http/response";
import { Router } from "../http/router";
import { docLocks } from "~/server/realtime/doc-locks";
import { eventBus } from "~/server/realtime/events";

export const router = new Router();

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidClientId(v: unknown): v is string {
  return typeof v === "string" && CLIENT_ID.test(v);
}

function readInput(data: Record<string, unknown>): { key: string; clientId: string } | null {
  const key = typeof data.key === "string" ? data.key.trim() : "";
  if (!key || key.length > 200 || !isValidClientId(data.clientId)) return null;
  return { key, clientId: data.clientId };
}

router.post("locks/claim", async ({ body }) => {
  const input = readInput((await body()) as Record<string, unknown>);
  if (!input) return json({ error: "Permintaan kunci dokumen tidak valid." }, 400);
  const before = docLocks.holderOf(input.key);
  const result = docLocks.claim(input.key, input.clientId);
  if (result.ok) {
    if (before !== input.clientId) eventBus.emitLockChanged({ key: input.key });
    return json({ ok: true });
  }
  return json({ ok: false, reason: result.reason });
});

router.post("locks/release", async ({ body }) => {
  const input = readInput((await body()) as Record<string, unknown>);
  if (!input) return json({ error: "Permintaan kunci dokumen tidak valid." }, 400);
  const released = docLocks.release(input.key, input.clientId);
  if (released) eventBus.emitLockChanged({ key: input.key });
  return json({ ok: released });
});
