/**
 * Regression: an ERD table is found in DBML by its name, and only its own declaration
 * is sent with a message.
 *
 *   bun test src/server/agent/mention-refs.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The DB client opens its file at import time, so point it at a temp file first.
process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-refs-")), "data.db");

const { dbmlTableBlock, dbmlTableNames } = await import("~/server/agent/mention-refs");

const dbml = `Table users {
  id integer [pk]
  email varchar
}

Table "orders" as O {
  id integer [pk]
  user_id integer [ref: > users.id]
}
`;

test("every table name in the document is listed, quoted or not", () => {
  expect(dbmlTableNames(dbml)).toEqual(["users", "orders"]);
});

test("a table's block is its own declaration and nothing after it", () => {
  const block = dbmlTableBlock(dbml, "users")!;
  expect(block.startsWith("Table users {")).toBe(true);
  expect(block.endsWith("}")).toBe(true);
  expect(block).not.toContain("orders");
  expect(dbmlTableBlock(dbml, "orders")).toContain("user_id");
  expect(dbmlTableBlock(dbml, "missing")).toBeNull();
});
