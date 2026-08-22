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
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // Resolve script path robustly for both dev (cwd=project root) and desktop (cwd="/" + SA_CLIENT_DIR).
    // Prefer the self-contained bundled .js (no node_modules needed); fall back to source .mjs (dev).
    const names = ["plantuml-convert.js", "plantuml-convert.mjs"];
    const bases: string[] = [];
    // 1. Relative to this file (src/server/routes/canvas.ts -> ../../.. = project root)
    try {
      const thisDir = path.dirname(fileURLToPath(import.meta.url));
      bases.push(path.resolve(thisDir, "../../../scripts"));
      bases.push(path.resolve(thisDir, "../../scripts"));
    } catch {}
    // 2. Relative to SA_CLIENT_DIR (desktop: app_data/server/client -> app_data/server)
    if (process.env.SA_CLIENT_DIR) {
      bases.push(path.resolve(process.env.SA_CLIENT_DIR, "../scripts"));
      bases.push(path.resolve(process.env.SA_CLIENT_DIR, "../server/scripts"));
      bases.push(path.resolve(process.env.SA_CLIENT_DIR, "../server/assets/scripts"));
      bases.push(path.resolve(process.env.SA_CLIENT_DIR, "../../scripts"));
    }
    // 3. CWD-based (dev)
    bases.push(path.resolve(process.cwd(), "scripts"));
    bases.push(path.resolve(process.cwd(), "dist/server/scripts"));
    // 4. Dist assets (post-build copies it there)
    try {
      const thisDir2 = path.dirname(fileURLToPath(import.meta.url));
      bases.push(path.resolve(thisDir2, "../assets/scripts"));
    } catch {}
    let scriptPath: string | null = null;
    outer: for (const base of bases) {
      for (const name of names) {
        const cand = path.join(base, name);
        if (fs.existsSync(cand)) { scriptPath = cand; break outer; }
      }
    }
    if (!scriptPath) {
      // Fallback: try CWD one more time (error message will show tried paths)
      scriptPath = path.join(bases[0] ?? path.resolve(process.cwd(), "scripts"), "plantuml-convert.mjs");
    }
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
