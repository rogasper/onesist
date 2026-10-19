/**
 * Render-cost guard for the streaming chat. Each streamed chunk used to re-render the
 * whole transcript synchronously, and every markdown render made new component types,
 * so each code block remounted per chunk. These checks keep the three fixes in place:
 * the stream is throttled, the markdown components are memoized, and the code renderer
 * passed to them is stable.
 *
 *   bun test src/components/chat/stream-render.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { CHAT_STREAM_THROTTLE_MS } from "./chat-state";

const read = (p: string) => fs.readFileSync(path.join(import.meta.dir, p), "utf-8");
const chat = read("ChatSurface.tsx");
const markdown = read("../mermaid/DiagramRenderer.tsx");

test("the stream render is throttled", () => {
  expect(CHAT_STREAM_THROTTLE_MS).toBeGreaterThan(0);
  expect(chat).toContain("throttle: CHAT_STREAM_THROTTLE_MS");
});
test("markdown components are built once per content, not per render", () => {
  expect(markdown).toContain("const components = useMemo<");
  expect(markdown).not.toMatch(/const components: Record<string, React\.ComponentType<any>> = \{/);
});
test("the chat's code renderer keeps its identity across chunks", () => {
  expect(chat).toMatch(/const codeRenderer = useCallback\(/);
  expect(chat).toContain("codeRenderer={codeRenderer}");
});
