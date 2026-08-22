import { Router } from "../http/router";
import { json } from "../http/response";

export const router = new Router();

// POST /api/canvas/plantuml  { code: string }
router.post("canvas/plantuml", async ({ body }) => {
  let data: any;
  try {
    data = await body();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const code = typeof data?.code === "string" ? data.code : "";
  if (!code.trim()) return json({ error: "code is required" }, 400);
  if (code.length > 20000) return json({ error: "code too large" }, 400);

  // Use Node subprocess to avoid Bun's elkjs Worker incompatibility (Bun's Worker fails to load elk-worker.min.js)
  try {
    const { spawn } = await import("node:child_process");
    const path = await import("node:path");
    const scriptPath = path.resolve(process.cwd(), "scripts/plantuml-convert.mjs");
    // Try Node via shell to ensure fnm PATH is resolved (Bun's env may not have fnm)
    const nodeCandidates = ["node", "/opt/homebrew/bin/node", "/usr/local/bin/node", "/Users/user/.local/share/fnm/node-versions/v24.18.0/installation/bin/node"];
    let nodeExe = "node";
    // Probe which node works by checking version
    for (const cand of nodeCandidates) {
      try {
        const { spawnSync } = await import("node:child_process");
        const r = spawnSync(cand, ["--version"], { encoding: "utf-8" });
        if (r.status === 0 && r.stdout?.includes("v")) { nodeExe = cand; break; }
      } catch {}
    }
    const result: any = await new Promise((resolve, reject) => {
      const child = spawn(nodeExe, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", reject);
      child.on("close", (code: number | null) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(out));
          } catch (e) {
            reject(new Error(`Invalid JSON from converter: ${out.slice(0, 500)}`));
          }
        } else {
          reject(new Error(err || `Converter exited with ${code}`));
        }
      });
      child.stdin.write(code);
      child.stdin.end();
    });
    return json({ elements: result.elements || [], files: result.files || {}, appState: result.appState || {} });
  } catch (e: any) {
    console.error("[canvas/plantuml] parse error", e);
    return json({ error: e?.message || "PlantUML parse failed" }, 400);
  }
});
