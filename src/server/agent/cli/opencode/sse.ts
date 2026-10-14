/**
 * Server-sent events from `opencode serve` (`GET /api/event`). One stream carries
 * every session's events; filtering by `data.sessionID` is the caller's job.
 */
export interface OpenCodeEvent {
  id?: string;
  type: string;
  data: Record<string, any>;
}

/** Splits complete SSE blocks off `buffer`; the incomplete tail comes back as `rest`. */
export function parseSseBlocks(buffer: string): { events: OpenCodeEvent[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: OpenCodeEvent[] = [];
  for (const block of blocks) {
    const payload = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!payload) continue;
    try {
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed.type !== "string") continue;
      const data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
      events.push({ id: typeof parsed.id === "string" ? parsed.id : undefined, type: parsed.type, data });
    } catch {
      // A block that is not a JSON event (a ping, a partial write) carries nothing to act on.
    }
  }
  return { events, rest };
}
