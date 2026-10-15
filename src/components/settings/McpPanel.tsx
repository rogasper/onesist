import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeSlash } from "@phosphor-icons/react";

interface McpInfo {
  url: string;
  token: string;
  snippets: { claude: string; opencode: string };
}

/**
 * Shows how to connect an outside agent CLI to this project's MCP endpoint
 * (read-only data access). Loaded when the panel mounts; nothing here changes
 * on its own, so there is no polling.
 */
export function McpPanel({ projectId }: { projectId: string }) {
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectId)}/mcp`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        return body as McpInfo;
      })
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [projectId]);

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      setCopied(null);
    }
  }, []);

  if (error) return <p className="text-xs text-red-400">Gagal memuat konfigurasi MCP: {error}</p>;
  if (!info) return <p className="text-xs text-kumo-subtle">Memuat…</p>;

  const masked = `${info.token.slice(0, 6)}${"•".repeat(20)}`;
  const row = (key: string, label: string, value: string, display = value) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-kumo-subtle">{label}</span>
        <button
          onClick={() => copy(key, value)}
          className="ml-auto flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default"
        >
          <Copy size={10} /> {copied === key ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-kumo-elevated border border-kumo-line rounded px-2 py-1.5 text-kumo-default">
        {display}
      </pre>
    </div>
  );

  return (
    <div className="space-y-3 text-xs">
      <p className="text-kumo-subtle">
        Agent CLI yang kamu jalankan sendiri (Claude Code, OpenCode) bisa membaca data project ini lewat MCP: skema dan
        isi database aplikasi, index kode, dan thread chat. Hanya baca. URL berubah kalau port aplikasi berubah.
      </p>
      {row("url", "URL endpoint", info.url)}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-kumo-subtle">Token</span>
          <button
            onClick={() => setShowToken((v) => !v)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default"
          >
            {showToken ? <EyeSlash size={10} /> : <Eye size={10} />} {showToken ? "Sembunyikan" : "Tampilkan"}
          </button>
          <button
            onClick={() => copy("token", info.token)}
            className="ml-auto flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default"
          >
            <Copy size={10} /> {copied === "token" ? "Tersalin" : "Salin"}
          </button>
        </div>
        <pre className="text-[11px] font-mono break-all bg-kumo-elevated border border-kumo-line rounded px-2 py-1.5 text-kumo-default">
          {showToken ? info.token : masked}
        </pre>
      </div>
      {row("claude", "Claude Code (jalankan di folder project)", info.snippets.claude)}
      {row("opencode", "OpenCode (isi opencode.json di folder project)", info.snippets.opencode)}
    </div>
  );
}
