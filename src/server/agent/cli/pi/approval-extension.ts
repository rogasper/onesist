/**
 * The extension Onesist loads into each `pi --mode rpc` process with `--extension`. It asks
 * before a write, edit or shell command (`ask`), lets them run (`auto`), or blocks them
 * (`readonly`). It lives in the app's data folder, never in the user's Pi config. Pi loads
 * it as TypeScript; the type import is erased, so nothing from Pi's package is needed at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { EXECUTE_POLICY_FILE, shellCommandAllowed } from "~/server/agent/execute-policy";

/**
 * The rules `execute` applies, from the shared module. Its source is embedded so the extension
 * (which Pi loads on its own) runs exactly the same check.
 */
const EXECUTE_RULES = [shellCommandAllowed.toString(), `const EXECUTE_POLICY_FILE = ${JSON.stringify(EXECUTE_POLICY_FILE)};`].join("\n");

export const APPROVAL_EXTENSION_SOURCE = `import fs from "node:fs";
import path from "node:path";
${EXECUTE_RULES}

const WRITE_TOOLS = ["write", "edit", "bash"];

function insideRun(file, cwd) {
  const rel = path.relative(cwd, path.resolve(cwd, file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function allowedCommands(cwd) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(cwd, EXECUTE_POLICY_FILE), "utf-8"));
    return Array.isArray(parsed?.allowedCommands) ? parsed.allowedCommands : [];
  } catch {
    return [];
  }
}

// \`execute\`: writes inside the run folder and checked shell commands run without a question.
function executeAllows(event, cwd) {
  if (event.toolName === "bash") return typeof event.input?.command === "string" && shellCommandAllowed(event.input.command, allowedCommands(cwd), cwd);
  const file = event.input?.path;
  return typeof file === "string" && insideRun(file, cwd);
}

export default function (pi) {
  const policy = process.env.ONESIST_PI_POLICY ?? "ask";
  pi.on("tool_call", async (event, ctx) => {
    if (!WRITE_TOOLS.includes(event.toolName)) return;
    if (policy === "auto") return;
    if (policy === "readonly") return { block: true, reason: "Mode hanya-baca: perubahan tidak diizinkan." };
    if (policy === "execute" && executeAllows(event, ctx.cwd)) return;
    const ok = await ctx.ui.confirm("Izinkan Pi memakai " + event.toolName + "?", JSON.stringify(event.input).slice(0, 500));
    if (!ok) return { block: true, reason: "Ditolak oleh pengguna." };
  });
}
`;

export function ensureApprovalExtension(dataDir: string): string {
  const dir = path.join(dataDir, "pi");
  const file = path.join(dir, "onesist-approval.ts");
  fs.mkdirSync(dir, { recursive: true });
  let current = "";
  try {
    current = fs.readFileSync(file, "utf-8");
  } catch {
    /* not written yet */
  }
  if (current !== APPROVAL_EXTENSION_SOURCE) fs.writeFileSync(file, APPROVAL_EXTENSION_SOURCE, "utf-8");
  return file;
}
