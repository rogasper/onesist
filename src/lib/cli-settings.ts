/**
 * The settings form of a CLI provider, declared per driver instead of written per CLI
 * (plan D, "Setting per driver"). Every field maps onto an existing provider column,
 * so there is no new storage: `cliPath` = the binary, `endpoint` = the URL of a server
 * the user runs, `apiKey` = that server's password (masked and redacted like a key).
 */
export type CliSettingColumn = "cliPath" | "endpoint" | "apiKey";

export interface CliSettingField {
  column: CliSettingColumn;
  label: string;
  hint: string;
  placeholder: string;
  /** Typed like a password and never shown back. */
  secret?: boolean;
}

const binaryField = (placeholder: string): CliSettingField => ({
  column: "cliPath",
  label: "Path binary",
  hint: "Kosong = pakai perintah yang ada di PATH.",
  placeholder,
});

const FIELDS: Record<string, CliSettingField[]> = {
  antigravity: [binaryField("agy")],
  claude: [binaryField("claude")],
  pi: [binaryField("pi")],
  codex: [binaryField("codex")],
  opencode: [
    binaryField("opencode"),
    {
      column: "endpoint",
      label: "Server URL",
      hint: "Kosong = Onesist menjalankan opencode serve sendiri. Isi untuk memakai server OpenCode yang sudah Anda jalankan.",
      placeholder: "http://127.0.0.1:4096",
    },
    {
      column: "apiKey",
      label: "Password server",
      hint: "Hanya untuk Server URL di atas (OPENCODE_PASSWORD server itu). Disimpan seperti API key.",
      placeholder: "kosong bila server tanpa password",
      secret: true,
    },
  ],
};

export function cliSettingFields(cliAgent: string | null | undefined): CliSettingField[] {
  return (cliAgent && FIELDS[cliAgent]) || [binaryField(cliAgent || "path/ke/cli")];
}
