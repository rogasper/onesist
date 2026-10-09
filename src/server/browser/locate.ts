/**
 * Which installed browser the managed capture window uses (P4.2): Chrome first, then Edge
 * (Windows always has Edge), then Chromium. A path set in `browser.path` overrides the search.
 */
import fs from "node:fs";
import path from "node:path";

export interface BrowserChoice {
  name: "chrome" | "edge" | "chromium";
  path: string;
}

/** Where each browser is installed on each platform, in order of preference. */
export function browserCandidates(platform: string, env: Record<string, string | undefined>): BrowserChoice[] {
  if (platform === "darwin") {
    return [
      { name: "chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      { name: "edge", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
      { name: "chromium", path: "/Applications/Chromium.app/Contents/MacOS/Chromium" },
    ];
  }
  if (platform === "win32") {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter((r): r is string => !!r);
    const out: BrowserChoice[] = [];
    for (const root of roots) out.push({ name: "chrome", path: path.join(root, "Google", "Chrome", "Application", "chrome.exe") });
    for (const root of roots) out.push({ name: "edge", path: path.join(root, "Microsoft", "Edge", "Application", "msedge.exe") });
    return out;
  }
  return [
    { name: "chrome", path: "/usr/bin/google-chrome" },
    { name: "chromium", path: "/usr/bin/chromium" },
    { name: "edge", path: "/usr/bin/microsoft-edge" },
  ];
}

/** The first browser that exists, or the override when it is set and exists. */
export function findBrowser(input: {
  platform: string;
  env: Record<string, string | undefined>;
  override?: string | null;
  exists?: (p: string) => boolean;
}): BrowserChoice | null {
  const exists = input.exists ?? ((p: string) => fs.existsSync(p));
  if (input.override) {
    return exists(input.override) ? { name: "chrome", path: input.override } : null;
  }
  return browserCandidates(input.platform, input.env).find((c) => exists(c.path)) ?? null;
}
