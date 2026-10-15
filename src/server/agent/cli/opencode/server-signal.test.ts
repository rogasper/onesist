/**
 * The OpenCode server Onesist spawns must not outlive Onesist when it is terminated by a
 * signal: Bun does not run "exit" listeners on a signal, so the child needs its own hook.
 * A helper process spawns a fake server, is sent SIGTERM, and the fake must be gone.
 *
 *   bun test src/server/agent/cli/opencode/server-signal.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-oc-signal-"));
const fake = path.join(dir, "opencode");
fs.writeFileSync(
  fake,
  `#!/usr/bin/env bun
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
Bun.serve({ hostname: "127.0.0.1", port, fetch(req) {
  if (new URL(req.url).pathname === "/api/info") return Response.json({ version: "2.0.0-fake" });
  return new Response("{}");
} });
console.log("Server listening on http://127.0.0.1:" + port);
setInterval(() => {}, 1000);
`,
);
fs.chmodSync(fake, 0o755);

const serverFile = path.resolve("src/server/agent/cli/opencode/server.ts");
const helper = path.join(dir, "helper.ts");
fs.writeFileSync(
  helper,
  `import { getOpenCodeConnection, openCodeServerPid } from ${JSON.stringify(serverFile)};
await getOpenCodeConnection({ binary: ${JSON.stringify(fake)} });
console.log("READY " + openCodeServerPid());
setInterval(() => {}, 1000);
`,
);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("a SIGTERM to Onesist stops the OpenCode server it started", async () => {
  const proc = Bun.spawn(["bun", helper], { stdout: "pipe", stderr: "pipe" });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let childPid = 0;
  try {
    while (!childPid) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const match = text.match(/READY (\d+)/);
      if (match) childPid = Number(match[1]);
    }
    expect(childPid).toBeGreaterThan(0);
    reader.releaseLock();

    proc.kill("SIGTERM");
    await proc.exited;

    // The child is reaped asynchronously after the helper exits; allow a short grace period.
    for (let i = 0; i < 30 && alive(childPid); i++) await Bun.sleep(100);
    expect(alive(childPid)).toBe(false);
  } finally {
    // A failing run must not leave its fake server behind (it would hold the test's port forever).
    if (childPid && alive(childPid)) process.kill(childPid, "SIGKILL");
    if (!proc.killed) proc.kill("SIGKILL");
  }
});
