/**
 * Pi's RPC framing: LF-only records, command responses matched by id, events passed on in
 * order, broken lines skipped, and a closed process failing what is still waiting.
 *
 *   bun test src/server/agent/cli/pi/jsonl.test.ts
 */
import { expect, test } from "bun:test";
import { PiJsonl } from "./jsonl";

function pair() {
  const written: any[] = [];
  return { jsonl: new PiJsonl((line) => written.push(JSON.parse(line))), written };
}

test("a command is written as one JSON line and resolved by its response id", async () => {
  const { jsonl, written } = pair();
  const pending = jsonl.command({ type: "get_state" });
  expect(written[0]).toMatchObject({ type: "get_state" });
  jsonl.feed(JSON.stringify({ id: written[0].id, type: "response", command: "get_state", success: true, data: { sessionId: "abc" } }) + "\n");
  expect((await pending).sessionId).toBe("abc");
});

test("a failed response rejects with the server's error", async () => {
  const { jsonl, written } = pair();
  const pending = jsonl.command({ type: "switch_session", sessionPath: "/x" });
  jsonl.feed(JSON.stringify({ id: written[0].id, type: "response", command: "switch_session", success: false, error: "sesi tidak ada" }) + "\n");
  await expect(pending).rejects.toThrow("sesi tidak ada");
});

test("events arrive in order; CRLF is accepted; a line split across chunks is joined", () => {
  const { jsonl } = pair();
  const seen: string[] = [];
  jsonl.onEvent((r) => seen.push(r.type));
  const line = JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "halo" } });
  jsonl.feed(line.slice(0, 12));
  jsonl.feed(line.slice(12) + "\r\n" + JSON.stringify({ type: "agent_end" }) + "\n");
  expect(seen).toEqual(["message_update", "agent_end"]);
});

test("a line that is not JSON is skipped and the next record still arrives", () => {
  const { jsonl } = pair();
  const seen: string[] = [];
  jsonl.onEvent((r) => seen.push(r.type));
  jsonl.feed("{ rusak\nlog biasa dari ekstensi\n" + JSON.stringify({ type: "turn_end" }) + "\n");
  expect(seen).toEqual(["turn_end"]);
});

test("a U+2028 inside a JSON string does not split the record", () => {
  const { jsonl } = pair();
  const seen: string[] = [];
  jsonl.onEvent((r) => seen.push(r.text));
  jsonl.feed(JSON.stringify({ type: "message_end", text: "a\u2028b" }) + "\n");
  expect(seen).toEqual(["a\u2028b"]);
});

test("closing fails what is waiting and reports once", async () => {
  const { jsonl } = pair();
  const reasons: string[] = [];
  jsonl.onClosed((r) => reasons.push(r));
  const pending = jsonl.command({ type: "get_state" }, 60_000);
  jsonl.close("proses Pi keluar");
  jsonl.close("lagi");
  await expect(pending).rejects.toThrow("proses Pi keluar");
  expect(reasons).toEqual(["proses Pi keluar"]);
});

test("a command with no response times out", async () => {
  const { jsonl } = pair();
  await expect(jsonl.command({ type: "get_available_models" }, 20)).rejects.toThrow("melewati batas waktu");
});
