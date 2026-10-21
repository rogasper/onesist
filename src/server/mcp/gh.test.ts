import { expect, test } from "bun:test";
import { ghStatus, readGhToken } from "./gh";

test("ghStatus returns valid status object with expected structure", async () => {
  const status = await ghStatus();
  expect(typeof status.installed).toBe("boolean");
  expect(typeof status.authenticated).toBe("boolean");
  expect(Array.isArray(status.scopes)).toBe(true);

  if (status.installed && status.authenticated) {
    expect(status.path).not.toBeNull();
    expect(status.version).not.toBeNull();
    expect(status.account).not.toBeNull();
    expect(status.tokenPrefix).not.toBeNull();
    expect(status.error).toBeNull();
  } else if (!status.installed) {
    expect(status.path).toBeNull();
    expect(status.authenticated).toBe(false);
  }
});

test("readGhToken retrieves a non-empty token when authenticated", async () => {
  const status = await ghStatus();
  if (status.authenticated) {
    const token = await readGhToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(token.slice(0, 4)).toBe(status.tokenPrefix ?? "");
  }
});
