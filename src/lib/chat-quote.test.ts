/**
 * Regression: a quote sent while no chat is open waits for the chat, and a quote sent
 * while one is open reaches it at once; each quote is handed out once.
 *
 *   bun test src/lib/chat-quote.test.ts
 */
import { expect, test } from "bun:test";
import { sendQuoteToChat, subscribeQuotes, takePendingQuotes } from "./chat-quote";

test("a quote waits until a chat takes it, and is handed out only once", () => {
  takePendingQuotes();
  sendQuoteToChat({ text: "a", source: "FSD" });
  sendQuoteToChat({ text: "b", source: "API spec" });
  expect(takePendingQuotes().map((q) => q.text)).toEqual(["a", "b"]);
  expect(takePendingQuotes()).toEqual([]);
});

test("a listening chat gets the quote at once and nothing is left waiting", () => {
  takePendingQuotes();
  const got: string[] = [];
  const unsubscribe = subscribeQuotes((q) => got.push(q.text));
  sendQuoteToChat({ text: "langsung", source: "FSD" });
  unsubscribe();
  expect(got).toEqual(["langsung"]);
  expect(takePendingQuotes().map((q) => q.text)).toEqual(["langsung"]);
  takePendingQuotes();
});
