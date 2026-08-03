import { spawn } from "node:child_process";
import path from "node:path";

export interface ConvertResult {
  ok: boolean;
  markdown?: string;
  error?: string;
  tool: "markitdown" | "none";
}

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".txt", ".md", ".html", ".htm",
  ".csv", ".json", ".xml", ".epub", ".png", ".jpg", ".jpeg", ".gif", ".webp",
]);

export function isSupportedUpload(name: string): boolean {
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[^\w.\- ]+/g, "_").trim();
  return base.replace(/\s+/g, "_").replace(/\.{2,}/g, ".");
}

function run(cmd: string, args: string[], timeoutMs = 30_000, cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      resolve({ code: -1, stdout, stderr: "conversion timeout" });
    }, timeoutMs);
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -2, stdout, stderr: `spawn error: ${err.message}` });
    });
  });
}

export async function convertWithMarkitdown(filePath: string): Promise<ConvertResult> {
  const res = await run("markitdown", [filePath], 30_000);
  if (res.code === 0 && res.stdout.trim()) {
    return { ok: true, markdown: res.stdout, tool: "markitdown" };
  }
  return { ok: false, error: res.stderr?.trim() || res.stdout?.trim() || "markitdown conversion failed", tool: "markitdown" };
}

const OPENCODE_PROMPT_SUFFIX =
  ". Use the markitdown skill to convert it to Markdown. " +
  "Print ONLY the resulting Markdown content with no commentary, no code fences, no summary.";

/**
 * Convert via headless opencode using the project's markitdown skill.
 * The file path is passed inside the prompt (not via --file) because
 * `--file` cannot attach binary documents like DOCX/PPTX/XLSX.
 */
export async function convertWithOpencode(filePath: string, timeoutMs = 300_000): Promise<ConvertResult> {
  const args = [
    "run",
    "-m", "opencode-go/deepseek-v4-flash",
    "--format", "json",
    "--auto",
    "--agent", "execute",
    `Convert this file to Markdown: ${filePath}${OPENCODE_PROMPT_SUFFIX}`,
  ];
  const projectRoot = path.resolve(process.cwd(), "..");
  const res = await run("opencode", args, timeoutMs, projectRoot);
  const textEvents: string[] = [];
  let errorMsg: string | null = null;
  for (const line of res.stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev.type === "text" && typeof ev.part?.text === "string") {
        const t = ev.part.text.trim();
        if (t) textEvents.push(t);
      } else if (ev.type === "error") {
        errorMsg = ev.error?.data?.message || ev.error?.message || ev.error || errorMsg;
      }
    } catch {}
  }
  const markdown = textEvents.join("\n").trim();
  if (markdown) {
    return { ok: true, markdown, tool: "markitdown" };
  }
  if (res.code !== 0) {
    return { ok: false, error: errorMsg || res.stderr?.trim() || `opencode exited with code ${res.code}`, tool: "markitdown" };
  }
  return { ok: false, error: errorMsg || "opencode finished without producing Markdown output", tool: "markitdown" };
}
