import { describe, expect, test } from "bun:test";
import { assertSafeMcpUrl, UnsafeMcpUrlError } from "./url-guard";

/**
 * No DNS lookups in these cases: every host is an IP literal or localhost, so
 * the suite does not depend on the network.
 */
const rejected = [
  "ftp://example.com/mcp",
  "file:///etc/passwd",
  "http://localhost:3000/mcp",
  "http://localhost./mcp",
  "http://mcp.localhost/mcp",
  "http://127.0.0.1/mcp",
  "http://127.1.2.3/mcp",
  "http://2130706433/mcp", // decimal 127.0.0.1
  "http://0x7f000001/mcp", // hex 127.0.0.1
  "http://0.0.0.0/mcp",
  "http://10.1.2.3/mcp",
  "http://172.16.0.1/mcp",
  "http://172.31.255.255/mcp",
  "http://192.168.1.1/mcp",
  "http://169.254.169.254/latest/meta-data",
  "http://100.64.0.1/mcp",
  "http://198.18.0.1/mcp",
  "http://224.0.0.1/mcp",
  "http://255.255.255.255/mcp",
  "http://[::1]/mcp",
  "http://[::]/mcp",
  "http://[fc00::1]/mcp",
  "http://[fe80::1]/mcp",
  "http://[::ffff:127.0.0.1]/mcp",
  "http://[::ffff:7f00:1]/mcp",
  "http://[2001:db8::1]/mcp",
  "http://metadata.google.internal/mcp",
];

describe("assertSafeMcpUrl", () => {
  for (const url of rejected) {
    test(`rejects ${url}`, async () => {
      await expect(assertSafeMcpUrl(url)).rejects.toBeInstanceOf(UnsafeMcpUrlError);
    });
  }

  test("accepts a public https endpoint without touching DNS", async () => {
    const url = await assertSafeMcpUrl("https://8.8.8.8/mcp");
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("8.8.8.8");
  });

  test("accepts a public http endpoint", async () => {
    const url = await assertSafeMcpUrl("http://1.1.1.1:8080/mcp");
    expect(url.port).toBe("8080");
  });

  test("rejects a non-URL", async () => {
    await expect(assertSafeMcpUrl("not a url")).rejects.toBeInstanceOf(UnsafeMcpUrlError);
  });
});
