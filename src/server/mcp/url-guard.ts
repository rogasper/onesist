/**
 * URL safety for external MCP servers.
 *
 * The server makes requests to a URL the user typed, so the URL decides where
 * this process connects. Only http/https is allowed, and a host that is this
 * machine, a private network or a reserved range is refused: a mis-typed or
 * malicious endpoint must not turn the app into a proxy for its own network.
 *
 * Hostnames are resolved and every returned address is checked, so a public
 * name pointing at 127.0.0.1 or 10.0.0.0/8 is refused too.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeMcpUrlError extends Error {}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

function ipv4Blocked(octets: number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0/24, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function ipv4FromGroups(hi: number, lo: number): number[] {
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

/** Expands an IPv6 literal into eight 16-bit groups. Throws on garbage. */
function ipv6Groups(host: string): number[] {
  let text = host;
  // Embedded IPv4 tail: ::ffff:127.0.0.1 → ::ffff:7f00:1
  const v4 = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const parts = v4[1].split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => n > 255)) throw new UnsafeMcpUrlError("Alamat IP server MCP tidak valid.");
    text = text.slice(0, -v4[1].length) + ((parts[0] << 8) | parts[1]).toString(16) + ":" + ((parts[2] << 8) | parts[3]).toString(16);
  }
  const halves = text.split("::");
  if (halves.length > 2) throw new UnsafeMcpUrlError("Alamat IP server MCP tidak valid.");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && head.length !== 8) throw new UnsafeMcpUrlError("Alamat IP server MCP tidak valid.");
  if (halves.length === 2 && missing < 0) throw new UnsafeMcpUrlError("Alamat IP server MCP tidak valid.");
  return [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((g) => {
    const n = parseInt(g, 16);
    if (!Number.isFinite(n) || n < 0 || n > 0xffff) throw new UnsafeMcpUrlError("Alamat IP server MCP tidak valid.");
    return n;
  });
}

function ipv6Blocked(host: string): boolean {
  const g = ipv6Groups(host);
  const [a, b, c] = g;
  const allZero = g.every((n) => n === 0);
  if (allZero) return true; // ::
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true; // ::1
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if (a === 0x2001 && b === 0x0000) return true; // Teredo
  if (a === 0x0064 && b === 0xff9b && c === 0 && g[3] === 0) {
    return ipv4Blocked(ipv4FromGroups(g[6], g[7])); // NAT64
  }
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) {
    return ipv4Blocked(ipv4FromGroups(g[6], g[7])); // ::ffff:0:0/96
  }
  if (a === 0x2002) {
    return ipv4Blocked(ipv4FromGroups(g[1], g[2])); // 6to4
  }
  return false;
}

function assertAddressAllowed(address: string): void {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    if (ipv4Blocked(octets)) {
      throw new UnsafeMcpUrlError("Server MCP tidak boleh mengarah ke alamat lokal, privat, atau reserved.");
    }
    return;
  }
  if (version === 6) {
    if (ipv6Blocked(address)) {
      throw new UnsafeMcpUrlError("Server MCP tidak boleh mengarah ke alamat lokal, privat, atau reserved.");
    }
    return;
  }
  throw new UnsafeMcpUrlError("Alamat host server MCP tidak valid.");
}

/**
 * Validates a user-supplied MCP endpoint. Returns the parsed URL so callers use
 * exactly what was checked, rather than re-parsing the raw string.
 */
export async function assertSafeMcpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeMcpUrlError("URL server MCP tidak valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeMcpUrlError("Server MCP hanya boleh memakai http atau https.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeMcpUrlError("URL server MCP tidak punya host.");
  if (host === "localhost" || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new UnsafeMcpUrlError("Server MCP tidak boleh mengarah ke host lokal.");
  }

  const version = isIP(host);
  if (version !== 0) {
    assertAddressAllowed(host);
    return url;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeMcpUrlError(`Host server MCP "${host}" tidak dapat di-resolve.`);
  }
  if (!addresses.length) throw new UnsafeMcpUrlError(`Host server MCP "${host}" tidak dapat di-resolve.`);
  for (const entry of addresses) assertAddressAllowed(entry.address);
  return url;
}

/**
 * `fetch` for the MCP SDK (transport and OAuth metadata/token calls).
 *
 * Every hop is validated, and redirects are followed by hand so a public URL
 * cannot bounce the request into the private network between checks.
 */
export const safeMcpFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  for (let hop = 0; hop <= 5; hop++) {
    await assertSafeMcpUrl(url);
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    url = new URL(location, url).href;
  }
  throw new UnsafeMcpUrlError("Terlalu banyak pengalihan dari server MCP.");
}) as unknown as typeof fetch;
