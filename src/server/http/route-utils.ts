import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { projects } from "~/server/db/schema";

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export function defaultRoot(): string {
  return process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), "..");
}

export function resolveRoot(projectId?: string | null): string {
  if (projectId) {
    try {
      const proj = db.select().from(projects).where(eq(projects.id, projectId)).get();
      if (proj?.rootPath) return proj.rootPath;
    } catch {}
  }
  return defaultRoot();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getProject(projectId: string): any {
  return db.select().from(projects).where(eq(projects.id, projectId)).get();
}

export interface CommandResult {
  code: number;
  out: string;
}

export function runCommand(cmd: string, args: string[], timeoutMs = 45000): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (code: number, out: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, out });
    };
    try {
      const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let out = "";
      let errOut = "";
      proc.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
      proc.stderr.on("data", (chunk: Buffer) => (errOut += chunk.toString()));
      proc.on("close", (code) => {
        if (code !== 0 && errOut.trim()) console.error(`[runCommand] ${cmd} stderr:`, errOut.trim().slice(0, 400));
        done(code ?? -1, out.trim());
      });
      proc.on("error", (err) => {
        console.error(`[runCommand] spawn ${cmd} failed:`, err.message);
        done(-1, "");
      });
      // Some Windows pickers keep the child alive after the dialog closes;
      // never let the caller hang forever.
      timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        done(-1, "");
      }, timeoutMs);
    } catch {
      done(-1, "");
    }
  });
}
