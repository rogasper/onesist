import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeSlash, Plus, Trash, Wrench, ArrowLeft } from "@phosphor-icons/react";
import { useMcpServers, emptyDraft, draftFrom, type McpServerSummary, type McpServerDraft, type McpTestResult } from "~/lib/use-mcp-servers";
import { AppButton } from "~/components/ui/AppButton";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";

const MONO = "font-mono text-xs";
const inputCls = "w-full rounded-lg px-3 py-2 bg-kumo-elevated ring ring-kumo-line text-sm focus:outline-none focus:ring-kumo-brand";

export function McpServersPanel() {
  const { servers, presets, loading, error, refresh, createServer, updateServer, deleteServer, testServer, testDraft } = useMcpServers();

  const [view, setView] = useState<"list" | "form">("list");
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<McpServerDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<McpTestResult | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const current = selected && selected !== "new" ? servers.find((s) => s.id === selected) ?? null : null;
  const isNew = selected === "new";

  useEffect(() => {
    setView("list");
    setSelected(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSaveError(null);
    setTestResult(null);
    setRevealKey(false);
    if (isNew) setDraft(emptyDraft());
    else if (current) setDraft(draftFrom(current));
  }, [selected, current]);

  function openNew() {
    setSelected("new");
    setView("form");
  }

  function openEdit(id: string) {
    setSelected(id);
    setView("form");
  }

  function backToList() {
    setView("list");
    setSelected(null);
    void refresh();
  }

  async function handleApply() {
    setSaving(true);
    setSaveError(null);
    try {
      if (isNew) {
        await createServer(draft);
      } else if (current) {
        await updateServer(current.id, draft);
      }
      setView("list");
      setSelected(null);
    } catch (err: any) {
      setSaveError(err?.message ?? "Gagal menyimpan konfigurasi server MCP.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = isNew || !current ? await testDraft(draft) : await testServer(current.id, draft);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message ?? "Gagal menguji koneksi." });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!current) return;
    try {
      await deleteServer(current.id);
      setConfirmDelete(false);
      backToList();
    } catch (err: any) {
      setSaveError(err?.message ?? "Gagal menghapus server MCP.");
      setConfirmDelete(false);
    }
  }

  if (view === "form") {
    const presetInfo = presets.find((p) => p.id === draft.preset);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-kumo-line pb-3">
          <button onClick={backToList} className="flex items-center gap-1.5 text-xs text-kumo-subtle hover:text-kumo-default">
            <ArrowLeft size={14} /> Kembali ke daftar
          </button>
          <span className="text-sm font-medium text-kumo-default ml-2">{isNew ? "Tambah Server MCP" : `Edit: ${current?.name}`}</span>
        </div>

        {saveError && <InlineAlert>{saveError}</InlineAlert>}

        <div className="grid gap-4">
          <FieldRow label="Preset">
            <select
              className={inputCls}
              value={draft.preset}
              onChange={(e) => {
                const pId = e.target.value;
                const p = presets.find((x) => x.id === pId);
                setDraft((d) => ({
                  ...d,
                  preset: pId,
                  name: d.name || p?.label || "",
                  transport: p?.transport ?? "http",
                  url: p?.url ?? d.url,
                  authKind: p?.authKind ?? "none",
                  authHeader: p?.authHeader ?? "Authorization",
                }));
              }}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {presetInfo?.hint && <p className="text-xs text-kumo-subtle mt-1">{presetInfo.hint}</p>}
          </FieldRow>

          <FieldRow label="Nama">
            <input className={inputCls} value={draft.name} placeholder="cth. GitHub MCP" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </FieldRow>

          <FieldRow label="Transport">
            <div className="flex gap-2">
              {(["http", "sse", "stdio"] as const).map((t) => (
                <AppButton
                  key={t}
                  variant="chip"
                  size="sm"
                  active={draft.transport === t}
                  onClick={() => setDraft((d) => ({ ...d, transport: t }))}
                  className="uppercase px-3"
                >
                  {t}
                </AppButton>
              ))}
            </div>
          </FieldRow>

          {draft.transport === "stdio" ? (
            <>
              <FieldRow label="Command">
                <input className={`${inputCls} ${MONO}`} value={draft.command} placeholder="npx" onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))} />
              </FieldRow>
              <FieldRow label="Args (JSON)">
                <input className={`${inputCls} ${MONO}`} value={draft.argsJson} placeholder='["-y", "@modelcontextprotocol/server-github"]' onChange={(e) => setDraft((d) => ({ ...d, argsJson: e.target.value }))} />
              </FieldRow>
              <FieldRow label="Env (JSON)">
                <input className={`${inputCls} ${MONO}`} value={draft.envJson} placeholder='{"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."}' onChange={(e) => setDraft((d) => ({ ...d, envJson: e.target.value }))} />
              </FieldRow>
            </>
          ) : (
            <FieldRow label="URL Endpoint">
              <input className={`${inputCls} ${MONO}`} value={draft.url} placeholder="https://api.githubcopilot.com/mcp/" onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} />
            </FieldRow>
          )}

          <FieldRow label="Autentikasi">
            <div className="flex gap-2 mb-2">
              {(["none", "header", "oauth"] as const).map((ak) => (
                <AppButton
                  key={ak}
                  variant="chip"
                  size="sm"
                  active={draft.authKind === ak}
                  onClick={() => setDraft((d) => ({ ...d, authKind: ak }))}
                  className="capitalize px-3"
                >
                  {ak === "none" ? "Tanpa Auth" : ak === "header" ? "Header Token" : "OAuth (Figma)"}
                </AppButton>
              ))}
            </div>
            {draft.authKind === "header" && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <input className={`${inputCls} ${MONO}`} value={draft.authHeader} placeholder="Authorization" onChange={(e) => setDraft((d) => ({ ...d, authHeader: e.target.value }))} />
                <div className="relative col-span-2">
                  <input
                    className={`${inputCls} ${MONO} pr-10`}
                    type={revealKey ? "text" : "password"}
                    value={draft.authValue}
                    placeholder={current?.hasAuthValue ? "tidak diubah" : "ghp_... atau Bearer ..."}
                    onChange={(e) => setDraft((d) => ({ ...d, authValue: e.target.value }))}
                  />
                  <button onClick={() => setRevealKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-kumo-subtle">
                    {revealKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}
            {draft.authKind === "oauth" && (
              <p className="text-xs text-kumo-subtle mt-1">Autentikasi OAuth akan diproses melalui browser saat pertama kali terhubung.</p>
            )}
          </FieldRow>

          <FieldRow label="Mode Baca Saja">
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={draft.readOnly}
                onChange={(e) => setDraft((d) => ({ ...d, readOnly: e.target.checked }))}
                className="rounded border-kumo-line text-kumo-brand focus:ring-kumo-brand"
              />
              <span className="text-xs text-kumo-default">Lewati konfirmasi persetujuan untuk semua tool server ini (anggap selalu aman/baca saja).</span>
            </label>
          </FieldRow>

          <FieldRow label="Aktif">
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                className="rounded border-kumo-line text-kumo-brand focus:ring-kumo-brand"
              />
              <span className="text-xs text-kumo-default">Aktifkan server MCP ini untuk agent.</span>
            </label>
          </FieldRow>
        </div>

        {testResult && (
          <div className={`p-3 rounded-xl border text-xs ${testResult.success ? "border-green-400/40 bg-green-400/10 text-green-300" : "border-red-400/40 bg-red-400/10 text-red-300"}`}>
            <p className="font-medium">{testResult.success ? "Uji Koneksi Berhasil" : "Uji Koneksi Gagal"}</p>
            <p className="mt-1">{testResult.message}</p>
            {testResult.tools && testResult.tools.length > 0 && (
              <p className="mt-1 font-mono text-[11px] opacity-80">Tool ditemukan: {testResult.tools.join(", ")}</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-kumo-line">
          <AppButton variant="secondary" size="base" disabled={testing} onClick={handleTest} className="rounded">
            {testing ? "Menguji..." : "Uji Koneksi & Ambil Tool"}
          </AppButton>
          {!isNew && (
            <AppButton variant="destructive" size="base" onClick={() => setConfirmDelete(true)} className="rounded ml-auto">
              Hapus
            </AppButton>
          )}
          <div className={isNew ? "ml-auto flex gap-2" : "flex gap-2"}>
            <AppButton variant="secondary" size="base" onClick={backToList} className="rounded">
              Batal
            </AppButton>
            <AppButton variant="primary" size="base" disabled={saving || !draft.name.trim()} onClick={handleApply} className="rounded">
              {saving ? "Menyimpan..." : "Simpan"}
            </AppButton>
          </div>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          title="Hapus Server MCP"
          onOpenChange={setConfirmDelete}
          onConfirm={handleDelete}
          confirmLabel="Hapus"
          destructive
        >
          Yakin ingin menghapus server MCP "{current?.name}"? Tindakan ini tidak dapat dibatalkan.
        </ConfirmDialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-kumo-subtle">
          Hubungkan Onesist dengan MCP server eksternal (GitHub, Figma, Miro, Monday) agar agent bisa memanggil toolnya langsung di chat.
        </p>
        <AppButton variant="primary" size="sm" onClick={openNew} className="rounded gap-1">
          <Plus size={14} /> Tambah Server
        </AppButton>
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="grid gap-2">
        {loading && !servers.length ? <p className="text-xs text-kumo-subtle">Memuat…</p> : null}
        {!loading && !servers.length ? (
          <div className="rounded-xl border border-dashed border-kumo-line p-8 text-center text-xs text-kumo-subtle">
            Belum ada server MCP yang dikonfigurasi. Klik "Tambah Server" untuk mulai.
          </div>
        ) : null}
        {servers.map((s) => {
          const tone = !s.enabled ? "bg-kumo-subtle" : s.lastStatus === "ok" ? "bg-green-400" : s.lastStatus === "error" ? "bg-red-400" : "bg-amber-400";
          const status = !s.enabled ? "nonaktif" : s.lastStatus === "ok" ? "terhubung" : s.lastStatus === "error" ? "gagal" : "belum diuji";

          return (
            <div key={s.id} className="flex items-center justify-between rounded-xl ring ring-kumo-line px-4 py-3 bg-kumo-elevated/20">
              <div className="space-y-1 min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${tone}`} />
                  <span className="text-sm font-medium text-kumo-default truncate">{s.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-kumo-line text-kumo-subtle uppercase">{s.presetLabel}</span>
                  {s.readOnly && <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-400/40 text-violet-300 bg-violet-400/10">baca saja</span>}
                </div>
                <p className="text-xs font-mono text-kumo-subtle truncate">{s.transport === "stdio" ? s.command : s.url}</p>
                <p className="text-[11px] text-kumo-subtle">
                  {status} · {s.toolCount} tool tersedia {s.lastCheckedAt ? `· diuji ${new Date(s.lastCheckedAt).toLocaleTimeString()}` : ""}
                </p>
                {s.lastError && <p className="text-[11px] text-red-400 truncate">Error: {s.lastError}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <AppButton variant="secondary" size="sm" onClick={() => openEdit(s.id)} className="rounded">
                  Ubah
                </AppButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-start gap-4">
      <label className="text-xs text-kumo-subtle pt-2">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
