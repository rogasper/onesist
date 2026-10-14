/**
 * OpenCode's event stream: complete `data:` blocks become events, comments and
 * malformed blocks are skipped, an unfinished block is kept for the next read.
 *
 *   bun test src/server/agent/cli/opencode/sse.test.ts
 */
import { expect, test } from "bun:test";
import { parseSseBlocks } from "./sse";

test("complete blocks become events and the unfinished tail is kept", () => {
  const { events, rest } = parseSseBlocks(
    'data: {"id":"e1","type":"a","data":{"sessionID":"s1"}}\n\n: heartbeat\n\ndata: {"type":"b","data":{}}\n\ndata: {"type":"c"',
  );
  expect(events).toEqual([
    { id: "e1", type: "a", data: { sessionID: "s1" } },
    { id: undefined, type: "b", data: {} },
  ]);
  expect(rest).toBe('data: {"type":"c"');
});

test("CRLF line endings and multi-line data are accepted", () => {
  const { events } = parseSseBlocks('data: {"type":"x",\r\ndata: "data":{"k":1}}\r\n\r\n');
  expect(events).toEqual([{ id: undefined, type: "x", data: { k: 1 } }]);
});

test("blocks that are not JSON events are skipped", () => {
  const { events } = parseSseBlocks('data: not json\n\ndata: {"noType":true}\n\nevent: ping\n\n');
  expect(events).toEqual([]);
});

test("a missing data object becomes an empty one", () => {
  expect(parseSseBlocks('data: {"type":"server.connected"}\n\n').events[0].data).toEqual({});
});
