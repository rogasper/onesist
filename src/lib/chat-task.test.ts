/**
 * Tasks sent to the chat from another page: listeners hear them at once, and a request
 * made while no chat listened waits until the chat takes it.
 *
 *   bun test src/lib/chat-task.test.ts
 */
import { expect, test } from "bun:test";
import { openChatTask, subscribeChatTasks, takePendingChatTasks } from "./chat-task";

test("listeners hear a task at once, and it waits until taken", () => {
  takePendingChatTasks();
  const heard: string[] = [];
  const off = subscribeChatTasks((r) => heard.push(r.threadId));
  openChatTask({ threadId: "thr_a", text: "buat openapi" });
  off();
  openChatTask({ threadId: "thr_b" });
  expect(heard).toEqual(["thr_a"]);
  expect(takePendingChatTasks()).toEqual([{ threadId: "thr_a", text: "buat openapi" }, { threadId: "thr_b" }]);
  expect(takePendingChatTasks()).toEqual([]);
});
