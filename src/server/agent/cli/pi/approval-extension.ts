/**
 * The extension Onesist loads into each `pi --mode rpc` process with `--extension`. It asks
 * before a write, edit or shell command (`ask`), lets them run (`auto`), or blocks them
 * (`readonly`). It lives in the app's data folder, never in the user's Pi config. Pi loads
 * it as TypeScript; the type import is erased, so nothing from Pi's package is needed at runtime.
 */
import fs from "node:fs";
import path from "node:path";

export const APPROVAL_EXTENSION_SOURCE = `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WRITE_TOOLS = ["write", "edit", "bash"];

export default function (pi: ExtensionAPI) {
  const policy = process.env.ONESIST_PI_POLICY ?? "ask";
  pi.on("tool_call", async (event, ctx) => {
    if (!WRITE_TOOLS.includes(event.toolName)) return;
    if (policy === "auto") return;
    if (policy === "readonly") return { block: true, reason: "Mode hanya-baca: perubahan tidak diizinkan." };
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
