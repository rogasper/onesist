import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeSlash, Plus, Trash, Wrench, ArrowLeft, Key, ShieldCheck, ArrowsClockwise, TerminalWindow } from "@phosphor-icons/react";
import { useMcpServers, api, emptyDraft, draftFrom, type GhStatus, type McpPresetInfo, type McpServerSummary, type McpServerDraft, type McpTestResult } from "~/lib/use-mcp-servers";
import { AppButton } from "~/components/ui/AppButton";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";

const MONO = "font-mono text-xs";
const inputCls = "w-full rounded-lg px-3 py-2 bg-kumo-elevated ring ring-kumo-line text-sm focus:outline-none focus:ring-kumo-brand";

export function McpServersPanel() {
  const { servers, presets, loading, error, refresh, createServer, updateServer, deleteServer, testServer, testDraft, startOAuth, oauthResult, ghStatus, ghToken } = useMcpServers();

  const [view, setView] = useState<"list" | "form">("list");
  const [selected, setSelected] = useState<string | "new" | null>(null);
  /**
   * Bumped only when a form is opened. The form must NOT reset on `selected` or
   * `current`: connecting saves the row and adopts its id, and a refresh hands
   * back a new object — both used to wipe the draft and the test result.
   */
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<McpServerDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<McpTestResult | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [configMode, setConfigMode] = useState<"auto" | "manual">("auto");
  const [oauthRunning, setOauthRunning] = useState(false);
  /** GitHub connects through the `gh` CLI instead of a browser OAuth flow. */
  const [gh, setGh] = useState<GhStatus | null>(null);
  const [ghChecking, setGhChecking] = useState(false);
  /** A credential was acquired but not saved yet; shown as a pending badge. */
  const [credentialReady, setCredentialReady] = useState(false);
  /** Which discard is waiting for confirmation: a preset change, or Batal. */
  const [pendingDiscard, setPendingDiscard] = useState<{ kind: "preset"; next: McpPresetInfo } | { kind: "cancel" } | null>(null);

  const current = selected && selected !== "new" ? servers.find((s) => s.id === selected) ?? null : null;
  const isNew = selected === "new";
  const selectedPreset = presets.find((p) => p.id === draft.preset) ?? presets[0];
  const isCustom = draft.preset === "custom";
  /** How this preset can connect automatically; null means manual only. */
  const connectKind = selectedPreset?.connect ?? null;

  /**
   * Has the user changed anything worth protecting? Compared against the stored
   * row, or against an empty draft for a new server, so an untouched form never
   * asks for confirmation.
   */
  const baseline = current ? draftFrom(current) : emptyDraft();
  const dirty =
    credentialReady ||
    (Object.keys(baseline) as (keyof McpServerDraft)[]).some((k) => baseline[k] !== draft[k]);

  useEffect(() => {
    setView("list");
    setSelected(null);
    void refresh();
  }, [refresh]);

  // Keyed on `formKey` only: `current` is a fresh object after every refresh, so
  // depending on it wiped a test result the moment the test refreshed the list.
  useEffect(() => {
    setSaveError(null);
    setTestResult(null);
    setRevealKey(false);
    setOauthRunning(false);
    if (isNew) {
      setDraft(emptyDraft());
      setConfigMode("manual");
    } else if (current) {
      setDraft(draftFrom(current));
      // Auto configuration belongs to the preset, not to the stored `authKind`:
      // a gh-adopted row keeps `header` as its transport detail while still
      // being connected through the CLI panel.
      const preset = presets.find((p) => p.id === current.preset);
      setConfigMode(preset?.connect ? "auto" : "manual");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);

  // GitHub's auto configuration needs the CLI state, so it is read whenever the
  // form shows that preset — including after the user picks it.
  useEffect(() => {
    if (view !== "form" || draft.preset !== "github") return;
    let cancelled = false;
    setGhChecking(true);
    ghStatus()
      .then((s) => {
        if (!cancelled) setGh(s);
      })
      .catch(() => {
        if (!cancelled) setGh(null);
      })
      .finally(() => {
        if (!cancelled) setGhChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, draft.preset, ghStatus]);

  function openNew() {
    setSelected("new");
    setView("form");
    setFormKey((k) => k + 1);
  }

  function openEdit(id: string) {
    setSelected(id);
    setView("form");
    setFormKey((k) => k + 1);
  }

  function backToList() {
    setView("list");
    setSelected(null);
    void refresh();
  }

  /**
   * Leaves the form, asking first when something would be lost. Batal and the
   * preset switch both land here, so the two cannot drift apart.
   */
  function requestDiscard(action: { kind: "preset"; next: McpPresetInfo } | { kind: "cancel" }) {
    if (!dirty) {
      if (action.kind === "cancel") backToList();
      else applyPreset(action.next);
      return;
    }
    setPendingDiscard(action);
  }

  function applyPreset(next: McpPresetInfo) {
    setDraft((d) => ({
      ...d,
      preset: next.id,
      name: d.name || (next.id === "custom" ? "" : next.label),
      transport: next.transport,
      url: next.url,
      authKind: next.authKind,
      authHeader: next.authHeader ?? "Authorization",
      // The credential belonged to the previous preset.
      credentialRef: "",
      authValue: "",
    }));
    setConfigMode(next.connect ? "auto" : "manual");
    setCredentialReady(false);
    setTestResult(null);
  }

  function confirmDiscard() {
    if (!pendingDiscard) return;
    if (pendingDiscard.kind === "cancel") backToList();
    else applyPreset(pendingDiscard.next);
    setPendingDiscard(null);
  }

  async function handleApply() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = isNew ? await createServer(draft) : current ? await updateServer(current.id, draft) : null;
      // A credential was verified against the draft before saving, so the stored
      // row has never been tested: run it now so the list does not read
      // "belum diuji" for a server the user just confirmed.
      if (saved && credentialReady) {
        await testServer(saved.id, {});
      }
      setView("list");
      setSelected(null);
      void refresh();
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
      // Testing a stored row sends only the changed fields, so a credential the
      // server already holds (a gh token, an OAuth bundle) is not overwritten by
      // the empty field the form deliberately shows.
      const res = current ? await testServer(current.id, draft) : await testDraft(draft);
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

  /** Confirms an acquired credential against the endpoint, without saving it. */
  async function verifyCredential(credentialRef: string) {
    const res = await testDraft({ ...draft, credentialRef });
    setTestResult(res);
  }

  /**
   * Auto configuration for GitHub runs through the `gh` CLI: GitHub publishes no
   * dynamic client registration, so there is no browser OAuth to start. The CLI
   * has already been authorized, and its token works against the MCP endpoint.
   *
   * The token is held as an unsaved credential: it becomes part of the row only
   * when the user presses Simpan.
   */
  async function handleGhConnect() {
    setOauthRunning(true);
    setSaveError(null);
    try {
      const { credentialRef } = await ghToken();
      setDraft((d) => ({ ...d, credentialRef, authKind: "header", authHeader: "Authorization" }));
      setCredentialReady(true);
      await verifyCredential(credentialRef);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message ?? "Gagal memakai token gh CLI." });
    } finally {
      setOauthRunning(false);
    }
  }

  /** Re-reads the CLI state; the user may have run `gh auth login` just now. */
  async function refreshGh() {
    setGhChecking(true);
    try {
      setGh(await ghStatus());
    } catch (err: any) {
      setGh(null);
      setSaveError(err?.message ?? "Gagal memeriksa gh CLI.");
    } finally {
      setGhChecking(false);
    }
  }

  /**
   * Auto configuration: the server must exist before OAuth can start (the
   * callback writes the token onto its row), so an unsaved draft is saved
   * first. The authorization URL comes from the server's own metadata —
   * dynamic client registration + PKCE — never a hand-built provider URL.
   */
  async function handleAutoConnect() {
    setOauthRunning(true);
    setSaveError(null);
    try {
      const started = await startOAuth(draft.url);

      // Either the provider returned a token straight away, or the user has to
      // approve in a browser. Both end with an unsaved credential in the draft.
      let credentialRef = started.state;
      if (!started.authorized) {
        if (!started.authorizationUrl) throw new Error("Server MCP tidak mengembalikan URL otorisasi.");

        const popup = window.open(started.authorizationUrl, "onesist_mcp_oauth", "width=620,height=760");
        if (!popup) throw new Error("Jendela otorisasi diblokir browser. Izinkan popup lalu coba lagi.");

        // The callback lands in a separate document, so its result is read back
        // by polling until the credential appears or the user closes the window.
        const approved = await new Promise<boolean>((resolve) => {
          const timer = setInterval(async () => {
            const res = await oauthResult(started.state).catch(() => null);
            if (res && !res.pending) {
              clearInterval(timer);
              resolve(true);
              return;
            }
            if (popup.closed) {
              clearInterval(timer);
              resolve(false);
            }
          }, 1000);
        });
        if (!approved) throw new Error("Otorisasi belum selesai. Jendela ditutup sebelum akses diberikan.");
      }

      setDraft((d) => ({ ...d, credentialRef, authKind: "oauth" }));
      setCredentialReady(true);
      await verifyCredential(credentialRef);
    } catch (err: any) {
      const message = err?.message ?? "Gagal menjalankan otorisasi.";
      // A provider that will not register us needs a token from the user's own
      // account; switching the form there is more useful than repeating the error.
      if (String(message).includes("pendaftaran klien otomatis")) {
        setConfigMode("manual");
        setDraft((d) => ({ ...d, authKind: "header", authHeader: d.authHeader || "Authorization" }));
      }
      setTestResult({ success: false, message });
    } finally {
      setOauthRunning(false);
    }
  }

  if (view === "form") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-kumo-line pb-3">
          <button
            onClick={() => requestDiscard({ kind: "cancel" })}
            className="flex items-center gap-1.5 text-xs text-kumo-subtle hover:text-kumo-default"
          >
            <ArrowLeft size={14} /> Kembali ke daftar
          </button>
          <span className="text-sm font-medium text-kumo-default ml-2">{isNew ? "Tambah Server MCP" : `Edit: ${current?.name}`}</span>
          {dirty && <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-300 bg-amber-400/10">belum disimpan</span>}
        </div>

        {saveError && <InlineAlert>{saveError}</InlineAlert>}

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-kumo-subtle uppercase tracking-wider block mb-2.5">Pilih Preset Server MCP</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {presets.map((p) => {
                const selected = draft.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      // Switching preset replaces everything the form holds, so an
                      // edited or connected form asks before dropping it.
                      if (p.id === draft.preset) return;
                      requestDiscard({ kind: "preset", next: p });
                    }}
                    className={`text-left rounded-xl p-3.5 border transition-all flex flex-col justify-between ${
                      selected
                        ? "border-kumo-brand bg-kumo-brand/10 ring-1 ring-kumo-brand"
                        : "border-kumo-line bg-kumo-elevated/30 hover:bg-kumo-elevated/60"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        {p.logo.startsWith("/") ? (
                          <img src={p.logo} alt={p.label} className="w-5 h-5 object-contain" />
                        ) : (
                          <span className="text-xl">{p.logo}</span>
                        )}
                        {selected && <Check size={14} className="text-kumo-brand" weight="bold" />}
                      </div>
                      <h3 className="text-xs font-medium text-kumo-default">{p.label}</h3>
                      <p className="text-[11px] text-kumo-subtle mt-0.5 line-clamp-2">{p.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <FieldRow label="Nama Server">
            <input className={inputCls} value={draft.name} placeholder="cth. GitHub MCP" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </FieldRow>

          {/* The auto/manual choice only exists for presets that have an
              automatic way in. Figma and Custom connect manually, so they show
              the fields directly instead of a toggle with one real option. */}
          {connectKind && (
            <FieldRow label="Konfigurasi">
              <div className="flex gap-2 mb-3">
                <AppButton variant="chip" size="sm" active={configMode === "auto"} onClick={() => setConfigMode("auto")} className="px-3">
                  Auto Configuration
                </AppButton>
                <AppButton variant="chip" size="sm" active={configMode === "manual"} onClick={() => setConfigMode("manual")} className="px-3">
                  Manual Configuration
                </AppButton>
              </div>

              {configMode === "auto" && connectKind === "gh" && (
                <div className="rounded-xl ring ring-kumo-line p-4 bg-kumo-elevated/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <TerminalWindow size={14} className="text-kumo-subtle" />
                    <span className="text-xs font-medium text-kumo-default">gh CLI</span>
                    <button
                      onClick={() => void refreshGh()}
                      disabled={ghChecking}
                      title="Periksa ulang gh CLI"
                      className="ml-auto flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default disabled:opacity-40"
                    >
                      <ArrowsClockwise size={10} className={ghChecking ? "animate-spin" : ""} /> Refresh
                    </button>
                  </div>

                  {ghChecking && !gh ? (
                    <p className="text-xs text-kumo-subtle">Memeriksa gh CLI…</p>
                  ) : gh?.installed && gh.authenticated ? (
                    <>
                      <p className="text-xs text-green-400">
                        Terdeteksi{gh.account ? ` — akun ${gh.account}` : ""}
                        {gh.version ? ` · ${gh.version}` : ""}
                      </p>
                      {gh.scopes.length ? (
                        <p className="text-[11px] text-kumo-subtle font-mono">Scope: {gh.scopes.join(", ")}</p>
                      ) : null}
                      <AppButton variant="primary" size="sm" disabled={oauthRunning} onClick={handleGhConnect} className="rounded gap-1.5">
                        <ShieldCheck size={14} /> {oauthRunning ? "Menghubungkan…" : "Pakai token gh CLI"}
                      </AppButton>
                    </>
                  ) : gh?.installed ? (
                    <>
                      <p className="text-xs text-amber-400">{gh.error}</p>
                      <p className="text-[11px] text-kumo-subtle">
                        Jalankan <span className="font-mono">gh auth login</span> di terminal, lalu tekan Refresh.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-amber-400">gh CLI tidak terdeteksi di PATH.</p>
                      <p className="text-[11px] text-kumo-subtle">
                        Pasang dari <span className="font-mono">https://cli.github.com</span>, login, lalu tekan Refresh. Sementara itu pakai
                        Manual Configuration dengan Personal Access Token.
                      </p>
                    </>
                  )}
                </div>
              )}

              {configMode === "auto" && connectKind === "oauth" && (
                <div className="rounded-xl ring ring-kumo-line p-4 bg-kumo-elevated/20 space-y-3">
                  <p className="text-xs text-kumo-subtle">
                    Hubungkan akun Anda secara otomatis melalui alur OAuth resmi {selectedPreset?.label}.
                  </p>
                  <AppButton variant="primary" size="sm" disabled={oauthRunning} onClick={handleAutoConnect} className="rounded gap-1.5">
                    <ShieldCheck size={14} /> {oauthRunning ? "Menghubungkan ke OAuth..." : `Hubungkan ke ${selectedPreset?.label}`}
                  </AppButton>
                  {credentialReady ? (
                    <p className="text-[11px] text-green-400 font-mono">Kredensial diperoleh — tekan Simpan untuk menyimpan</p>
                  ) : current?.hasAuthValue && current.preset === draft.preset ? (
                    <p className="text-[11px] text-kumo-subtle font-mono">Kredensial tersimpan (belum diubah)</p>
                  ) : null}
                </div>
              )}
            </FieldRow>
          )}

          {(!connectKind || configMode === "manual") && (
            <>
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
                    <input className={`${inputCls} ${MONO}`} value={draft.envJson} placeholder='{"GITHUB_TOKEN": "..."}' onChange={(e) => setDraft((d) => ({ ...d, envJson: e.target.value }))} />
                  </FieldRow>
                </>
              ) : (
                <FieldRow label="URL Endpoint">
                  <input className={`${inputCls} ${MONO}`} value={draft.url} placeholder="https://api.githubcopilot.com/mcp/" onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} />
                </FieldRow>
              )}

              <FieldRow label="Autentikasi">
                <div className="flex gap-2 mb-2">
                  {/* OAuth is not offered here: it is what Auto Configuration
                      performs, and a token typed by hand is a header credential. */}
                  {(["none", "header"] as const).map((ak) => (
                    <AppButton
                      key={ak}
                      variant="chip"
                      size="sm"
                      active={draft.authKind === ak}
                      onClick={() => setDraft((d) => ({ ...d, authKind: ak }))}
                      className="capitalize px-3"
                    >
                      {ak === "none" ? "Tanpa Auth" : "Header Token"}
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
              </FieldRow>
            </>
          )}

          <FieldRow label="Mode Baca Saja">
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={draft.readOnly}
                onChange={(e) => setDraft((d) => ({ ...d, readOnly: e.target.checked }))}
                className="rounded border-kumo-line text-kumo-brand focus:ring-kumo-brand"
              />
              <span className="text-xs text-kumo-default">Lewati konfirmasi persetujuan untuk semua tool server ini (dianggap aman/baca saja).</span>
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
            <AppButton variant="secondary" size="base" onClick={() => requestDiscard({ kind: "cancel" })} className="rounded">
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

        <ConfirmDialog
          open={pendingDiscard !== null}
          title={pendingDiscard?.kind === "preset" ? "Ganti preset server MCP?" : "Batalkan perubahan?"}
          onOpenChange={(open) => {
            if (!open) setPendingDiscard(null);
          }}
          onConfirm={confirmDiscard}
          confirmLabel={pendingDiscard?.kind === "preset" ? "Ya, ganti" : "Ya, batalkan"}
          cancelLabel="Lanjut mengedit"
          destructive
        >
          {pendingDiscard?.kind === "preset"
            ? `Mengganti ke preset "${pendingDiscard.next.label}" akan membuang perubahan dan kredensial yang belum disimpan pada form ini.`
            : "Perubahan dan kredensial yang belum disimpan akan hilang. Lanjutkan?"}
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
