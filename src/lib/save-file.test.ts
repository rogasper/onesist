/**
 * The disk-streaming path must degrade to the old blob behaviour instead of
 * failing an export, and a half-written file must not be left behind.
 *
 *   bun test src/lib/save-file.test.ts
 */
import { expect, test } from "bun:test";
import { discardSaveDestination, pickSaveDestination, streamResponseToFile, type SaveFileHandle } from "./save-file";

function fakeHandle(collector: Uint8Array[] = []): SaveFileHandle & { aborted: boolean; removed: boolean } {
  const handle = {
    aborted: false,
    removed: false,
    async createWritable() {
      return {
        async write(chunk: Uint8Array) {
          collector.push(chunk);
        },
        async close() {},
        async abort() {
          handle.aborted = true;
        },
      };
    },
    async remove() {
      handle.removed = true;
    },
  };
  return handle;
}

test("without the API the caller falls back to the blob path", async () => {
  expect(await pickSaveDestination("x.zip", null)).toBeNull();
});

test("a chosen destination is returned as it is", async () => {
  const handle = fakeHandle();
  const picked = await pickSaveDestination("x.zip", async () => handle);
  expect(picked).toBe(handle);
});

test("closing the picker cancels, instead of falling back", async () => {
  const abort = new Error("The user aborted a request.");
  abort.name = "AbortError";
  expect(await pickSaveDestination("x.zip", async () => Promise.reject(abort))).toBe("cancelled");
});

test("a refused picker falls back to the blob path", async () => {
  const refusal = new Error("Must be handling a user gesture to show a file picker.");
  expect(await pickSaveDestination("x.zip", async () => Promise.reject(refusal))).toBeNull();
});

test("the response body is written straight through", async () => {
  const chunks: Uint8Array[] = [];
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    }),
  );

  await streamResponseToFile(response, fakeHandle(chunks));
  expect(chunks.map((chunk) => [...chunk])).toEqual([[1, 2], [3]]);
});

test("a broken stream aborts the write and removes the partial file", async () => {
  const handle = fakeHandle();
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.error(new Error("Koneksi terputus"));
      },
    }),
  );

  await expect(streamResponseToFile(response, handle)).rejects.toThrow("Koneksi terputus");
  expect(handle.aborted).toBe(true);
  expect(handle.removed).toBe(true);
});

test("a discarded destination is removed without throwing", async () => {
  const handle = fakeHandle();
  await discardSaveDestination(handle);
  expect(handle.removed).toBe(true);

  // A handle without remove() (older WebView) must not make the caller fail.
  await discardSaveDestination({ createWritable: async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} }) });
});
