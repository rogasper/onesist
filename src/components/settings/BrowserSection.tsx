import { useCallback, useEffect, useState } from "react";
import { InlineAlert } from "~/components/ui/InlineAlert";

interface BrowserStatus {
  browser: { name: string; path: string } | null;
  running: boolean;
  profileExists: boolean;
}

const BROWSER_NAMES: Record<string, string> = { chrome: "Google Chrome", edge: "Microsoft Edge", chromium: "Chromium" };

/**
 * The window Onesist uses to open design links. Private files need a sign-in once, done by
 * the user in that window; public links need none (P4.3).
 */
export function BrowserSection() {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/browser/status", { cache: "no-store" });
    if (res.ok) setStatus((await res.json()) as BrowserStatus);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Gagal menjalankan perintah browser.");
      await load();
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5">
      <h2 className="text-xs font-medium text-kumo-subtle uppercase tracking-wider mb-3">Browser untuk tautan</h2>
      <div className="space-y-3 text-sm text-kumo-default">
        {status?.browser ? (
          <p>
            Dipakai: <span className="font-medium">{BROWSER_NAMES[status.browser.name] ?? status.browser.name}</span>
            <span className="block text-xs text-kumo-subtle break-all">{status.browser.path}</span>
          </p>
        ) : (
          <p className="text-amber-400">
            Chrome atau Edge tidak ditemukan. Pasang salah satunya, lalu muat ulang halaman ini.
          </p>
        )}
        <p className="text-xs text-kumo-subtle">
          Tautan publik (Figma, halaman web) dibuka tanpa login. Untuk berkas Figma yang privat, masuk sekali di jendela
          yang terbuka, lalu tutup jendelanya. Onesist tidak menyimpan kata sandi Anda; sesi tersimpan di profil browser khusus
          Onesist, terpisah dari browser pribadi Anda.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy || !status?.browser}
            onClick={() => void post("/api/browser/login")}
            className="rounded-lg px-3 py-1.5 text-xs ring ring-kumo-line hover:bg-kumo-elevated disabled:opacity-50"
          >
            Buka browser untuk masuk
          </button>
          {status?.profileExists ? (
            confirmReset ? (
              <>
                <button
                  disabled={busy}
                  onClick={() => void post("/api/browser/reset")}
                  className="rounded-lg px-3 py-1.5 text-xs bg-red-500/15 text-red-400 ring ring-red-400/30 disabled:opacity-50"
                >
                  Ya, hapus sesi
                </button>
                <button onClick={() => setConfirmReset(false)} className="rounded-lg px-3 py-1.5 text-xs text-kumo-subtle">
                  Batal
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="rounded-lg px-3 py-1.5 text-xs text-kumo-subtle hover:text-kumo-default">
                Hapus sesi browser
              </button>
            )
          ) : null}
        </div>
        {error ? <InlineAlert>{error}</InlineAlert> : null}
      </div>
    </div>
  );
}
