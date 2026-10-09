/**
 * Regression: only small images, as data URLs, and at most a few per message, are stored.
 *
 *   bun test src/lib/image-attachment.test.ts
 */
import { expect, test } from "bun:test";
import { MAX_IMAGES, MAX_IMAGE_URL_LENGTH, imagePartProblem } from "./image-attachment";

const picture = (url = "data:image/png;base64,AAAA", mediaType = "image/png") => ({ type: "file", mediaType, url });

test("a small picture as a data URL is accepted, alongside text", () => {
  expect(imagePartProblem([{ type: "text", text: "lihat ini" }, picture()])).toBeNull();
});

test("a file that is not a picture is refused", () => {
  expect(imagePartProblem([{ type: "file", mediaType: "application/pdf", url: "data:application/pdf;base64,AA" }])).toMatch(/Hanya gambar/);
});

test("a URL that is not an inline picture is refused", () => {
  expect(imagePartProblem([picture("https://example.com/a.png")])).toBe("Gambar tidak valid.");
  expect(imagePartProblem([picture("data:image/jpeg;base64,AA", "image/png")])).toBe("Gambar tidak valid.");
});

test("a picture over the size limit is refused, and so is a message with too many", () => {
  const big = `data:image/png;base64,${"A".repeat(MAX_IMAGE_URL_LENGTH)}`;
  expect(imagePartProblem([picture(big)])).toMatch(/terlalu besar/);
  expect(imagePartProblem(Array.from({ length: MAX_IMAGES + 1 }, () => picture()))).toMatch(/Maksimal/);
});
