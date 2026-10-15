/**
 * The MCP token: one random secret per installation, kept beside the database
 * with owner-only permissions, compared in constant time.
 *
 *   bun test src/server/mcp/token.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bearerMatches, readOrCreateToken } from "./token";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mcp-token-"));

test("a token file is created once, owner-only, and reused", () => {
  const file = path.join(tmp(), "nested", "mcp-token.secret");
  const first = readOrCreateToken(file);
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  expect(readOrCreateToken(file)).toBe(first);
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});

test("a short or empty token file is replaced with a fresh token", () => {
  const file = path.join(tmp(), "mcp-token.secret");
  fs.writeFileSync(file, "abc");
  const token = readOrCreateToken(file);
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  expect(fs.readFileSync(file, "utf-8").trim()).toBe(token);
});

test("the bearer header must match the token exactly", () => {
  const token = "f".repeat(64);
  expect(bearerMatches(`Bearer ${token}`, token)).toBe(true);
  expect(bearerMatches(`Bearer   ${token}  `, token)).toBe(true);
  expect(bearerMatches(null, token)).toBe(false);
  expect(bearerMatches("", token)).toBe(false);
  expect(bearerMatches(`Basic ${token}`, token)).toBe(false);
  expect(bearerMatches(`Bearer ${token}0`, token)).toBe(false);
  expect(bearerMatches("Bearer ", token)).toBe(false);
});
