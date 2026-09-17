import { useEffect, useState } from "react";
import { Button } from "@cloudflare/kumo";
import { ArrowLeft, Eye, EyeSlash, Plus, X } from "@phosphor-icons/react";
import { InlineAlert } from "~/components/ui/InlineAlert";
import {
  draftFingerprint,
  testErrorHint,
  useAppSettings,
  useProviders,
  validateName,
  type ProviderDraft,
  type ProviderModelInfo,
  type ProviderSummary,
  type ProviderTestResult,
} from "~/lib/use-providers";

/**
 * BYOK provider settings (FR-L, PRD §11).
 *
 * The shape follows the design reference users know (DBX AI Config): a FULL
 * surface, not a narrow dialog. A dialog squeezes the two-column list+form
 * into 768px and that is proven broken — content overflows the box.
 *
 * Patterns followed from the reference:
 *  - stacked sections separated by lines; title + description + control + Save on the right
 *  - detail form: LABEL ON THE LEFT, control on the right (two columns), grey hint below
 *  - segmented control for enum choices, not <select>
 *  - "← Back" to return from the form to the list
 *  - empty state as a dashed-line box
 *  - footer: Test on the left, Cancel/Apply on the right
 *
 * Deliberate differences from the reference (because this is Onesist, not DBX):
 *  - no "Templates"/"Scenario Prompt Templates" — format conventions in
 *    Onesist are carried by the skill (`fsd-analyzer`), not prompt templates
 *  - there is an Agent turn limit (FR-L7), which DBX also has and is equally useful
 */
const MONO = "font-mono text-[0.8125rem]";

interface Props {
  open: boolean;
  onClose: () => void;
}

const API_STYLES = [
  { value: "completions", label: "chat/completions" },
  { value: "responses", label: "responses" },
  { value: "anthropic-messages", label: "messages (Anthropic)" },
  { value: "cli", label: "CLI agent" },
];

const AUTH_METHODS = [
  { value: "bearer", label: "Bearer" },
  { value: "api-key", label: "x-api-key" },
  { value: "none", label: "Tanpa kredensial" },
];

const emptyDraft = (): ProviderDraft => ({
  name: "",
  preset: "custom-openai",
  apiStyle: "completions",
  endpoint: "",
  apiKey: "",
  authMethod: "bearer",
  model: "",
  maxOutputTokens: 8192,
  contextWindow: null,
  proxyUrl: "",
  skipTlsVerify: false,
  enableThinking: false,
});

function draftFrom(p: ProviderSummary): ProviderDraft {
  return {
    name: p.name,
    preset: p.preset,
    apiStyle: p.apiStyle,
    endpoint: p.endpoint ?? "",
    apiKey: "",
    authMethod: p.authMethod,
    model: p.model ?? "",
    maxOutputTokens: p.maxOutputTokens,
    contextWindow: p.contextWindow,
    proxyUrl: p.proxyUrl ?? "",
    skipTlsVerify: p.skipTlsVerify,
    enableThinking: p.enableThinking,
    isDefault: p.isDefault,
  };
}

/**
 * Application-level agent preferences (FR-L7).
 *
 * Sits on this surface because this is where machine-wide configuration already
 * lives; there is no project context to attach it to, and the limit applies to
 * conversations that do not exist yet.
 */
function AgentSettingsSection() {
  const { settings, bounds, saving, save } = useAppSettings();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  // Follow the stored value until the user types; after that the field is theirs.
  useEffect(() => {
    if (settings) setDraft(String(settings.agentMaxSteps));
  }, [settings]);

  const min = bounds?.agentMaxSteps.min ?? 5;
  const max = bounds?.agentMaxSteps.max ?? 500;
  const parsed = Number(draft);
  const invalid = draft.trim() === "" || !Number.isFinite(parsed) || parsed < min || parsed > max;

  async function apply() {
    setNote(null);
    const res = await save({ agentMaxSteps: Math.round(parsed) });
    if (!res.ok) {
      setNote(res.error);
      return;
    }
    setNote("Tersimpan.");
  }

  return (
    <Section
      title="Agent"
      description="Berlaku untuk percakapan baru di semua project. Percakapan yang sudah ada menyimpan batasnya sendiri."
    >
      <FieldRow
        label="Batas langkah per turn"
        hint={`Jumlah maksimum langkah tool sebelum agent berhenti sendiri. Antara ${min} dan ${max}; nilai di luar rentang dipotong ke batas terdekat.`}
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={min}
            max={max}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setNote(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !invalid && !saving) void apply();
            }}
            className="w-28 rounded-lg px-2.5 py-1.5 bg-kumo-elevated ring ring-kumo-line text-sm text-kumo-default focus:outline-none focus:ring-kumo-brand"
          />
          <Button variant="secondary" onClick={apply} disabled={invalid || saving || draft === String(settings?.agentMaxSteps)}>
            Simpan
          </Button>
          {note ? <span className="text-sm text-kumo-subtle">{note}</span> : null}
          {invalid && draft.trim() !== "" ? (
            <span className="text-sm text-amber-400">Harus angka antara {min} dan {max}.</span>
          ) : null}
        </div>
      </FieldRow>
    </Section>
  );
}

/** Section row: title + description + control + action on the right. */function Section({ title, description, children, action, last }: { title: string; description?: string; children?: React.ReactNode; action?: React.ReactNode; last?: boolean }) {
  return (
    <section className={`grid gap-3 px-8 py-6 ${last ? "" : "border-b border-kumo-line"}`}>
      <div className="flex items-start gap-4">
        <div className="grid gap-1 min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-kumo-default">{title}</h3>
          {description ? <p className="text-sm text-kumo-subtle">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Reference-styled detail form: label on the left, control on the right. */
function FieldRow({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-x-6 gap-y-1 items-start">
      <label htmlFor={htmlFor} className="text-sm text-kumo-default pt-2">
        {label}
      </label>
      <div className="grid gap-1.5 min-w-0">
        {children}
        {hint ? <p className="text-sm text-kumo-subtle">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Segmented control, like `/chat/completions | /responses` in the reference. */
function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-lg ring ring-kumo-line overflow-hidden bg-kumo-recessed">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`px-4 py-2 text-sm ${value === o.value ? "bg-kumo-base text-kumo-default font-medium" : "text-kumo-subtle hover:bg-kumo-elevated"} ${disabled ? "opacity-60" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-full flex items-start gap-4 rounded-xl px-4 py-3.5 ring ring-kumo-line text-left ${disabled ? "opacity-60" : "hover:bg-kumo-elevated"}`}
    >
      <span className="grid gap-1 min-w-0 flex-1">
        <span className="text-sm text-kumo-default">{label}</span>
        {description ? <span className="text-sm text-kumo-subtle">{description}</span> : null}
      </span>
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 relative ${checked ? "bg-kumo-brand" : "bg-kumo-line"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

const inputCls = "w-full rounded-lg px-3 py-2 bg-kumo-elevated ring ring-kumo-line text-sm focus:outline-none focus:ring-kumo-brand";

export function ProviderSettings({ open, onClose }: Props) {
  const { providers, presets, loading, error, createProvider, updateProvider, deleteProvider, testProvider, getModelsForDraft } = useProviders();

  const [view, setView] = useState<"list" | "form">("list");
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testedFingerprint, setTestedFingerprint] = useState<string | null>(null);
  const [models, setModels] = useState<ProviderModelInfo[]>([]);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(false);

  const current = selected && selected !== "new" ? providers.find((p) => p.id === selected) ?? null : null;
  const isNew = selected === "new";
  const readOnly = current?.source === "env";

  useEffect(() => {
    if (!open) return;
    setView("list");
    setSelected(null);
  }, [open]);

  useEffect(() => {
    setSaveError(null);
    setTestResult(null);
    setTestedFingerprint(null);
    setModels([]);
    setModelsNote(null);
    setRevealKey(false);
    if (isNew) setDraft(emptyDraft());
    else if (current) setDraft(draftFrom(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (!open) return null;

  const nameState = validateName(draft.name, providers, current?.id);
  const testIsCurrent = testedFingerprint !== null && testedFingerprint === draftFingerprint(draft);

  function openNew() {
    setSelected("new");
    setView("form");
  }

  function openEdit(id: string) {
    setSelected(id);
    setView("form");
  }

  async function refreshList(): Promise<ProviderSummary[]> {
    const res = await fetch("/api/providers", { cache: "no-store" });
    return (await res.json()).providers as ProviderSummary[];
  }

  async function handleApply() {
    setSaving(true);
    setSaveError(null);
    try {
      if (isNew) await createProvider(draft);
      else if (current) await updateProvider(current.id, { ...draft, apiKey: draft.apiKey.trim() || undefined });
      setView("list");
      setSelected(null);
    } catch (err: any) {
      setSaveError(err?.message ?? "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const fp = draftFingerprint(draft);
    try {
      let id = current?.id;
      if (isNew) {
        if (nameState !== "valid") {
          setTestResult({ success: false, message: "Isi nama konfigurasi yang unik dulu sebelum menguji.", errorCategory: "config" });
          setTestedFingerprint(fp);
          return;
        }
        await createProvider(draft);
        const list = await refreshList();
        id = list.find((p) => p.name.trim().toLowerCase() === draft.name.trim().toLowerCase())?.id;
        if (id) setSelected(id);
      }
      if (!id) return;
      const result = await testProvider(id, isNew ? undefined : ({ ...draft, apiKey: draft.apiKey.trim() || undefined } as Partial<ProviderDraft>));
      setTestResult(result);
      setTestedFingerprint(fp);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message ?? "Gagal menguji koneksi", errorCategory: "unknown" });
      setTestedFingerprint(fp);
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!current) return;
    setSaving(true);
    try {
      await deleteProvider(current.id);
      setView("list");
      setSelected(null);
    } catch (err: any) {
      setSaveError(err?.message ?? "Gagal menghapus");
    } finally {
      setSaving(false);
    }
  }

  // ── Form view (drill-in) ────────────────────────────────────────────────
  if (view === "form") {
    return (
      <div className="fixed inset-0 z-50 bg-kumo-canvas flex flex-col">
        <header className="flex items-center gap-3 px-8 py-4 border-b border-kumo-line shrink-0">
          <Button variant="ghost" onClick={() => setView("list")} icon={<ArrowLeft size={14} />}>
            Back
          </Button>
          <span className="text-sm font-semibold text-kumo-default">{isNew ? "Konfigurasi baru" : current?.name}</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-8 py-6 grid gap-6">
            {isNew ? (
              <FieldRow label="Provider" hint={presets.find((p) => p.id === draft.preset)?.hint}>
                <select
                  className={inputCls}
                  value={draft.preset}
                  onChange={(e) => {
                    const p = presets.find((x) => x.id === e.target.value);
                    if (!p) return;
                    setDraft((d) => ({
                      ...d,
                      preset: p.id,
                      apiStyle: p.apiStyle,
                      authMethod: p.authMethod,
                      endpoint: p.endpoint || d.endpoint,
                      model: p.defaultModel ?? d.model,
                      maxOutputTokens: p.defaultMaxOutputTokens ?? d.maxOutputTokens,
                      name: d.name.trim() ? d.name : p.label,
                    }));
                  }}
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
            ) : null}

            <FieldRow label="Nama konfigurasi" hint={nameState === "duplicate" ? "Nama ini sudah dipakai konfigurasi lain." : undefined}>
              <input className={inputCls} value={draft.name} disabled={readOnly} placeholder="Mis. DeepSeek — kerja" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </FieldRow>

            <FieldRow label="API key" hint={current?.apiKeyMasked ? `Tersimpan: ${current.apiKeyMasked}. Biarkan kosong bila tidak ingin mengubahnya.` : "Disimpan lokal di data.db aplikasi dan tidak pernah dikirim ke tampilan."}>
              <div className="relative">
                <input
                  className={`${inputCls} ${MONO} pr-10`}
                  type={revealKey ? "text" : "password"}
                  autoComplete="off"
                  value={draft.apiKey}
                  disabled={readOnly}
                  placeholder={current?.hasApiKey ? "tidak diubah" : "tempel API key di sini"}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-kumo-subtle" onClick={() => setRevealKey((v) => !v)} title={revealKey ? "Sembunyikan" : "Tampilkan"}>
                  {revealKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </FieldRow>

            {draft.apiStyle !== "cli" ? (
              <FieldRow label="Endpoint" hint="Sertakan versi API-nya. Aplikasi tidak menambahkan /v1 sendiri.">
                <input className={`${inputCls} ${MONO}`} value={draft.endpoint} disabled={readOnly} placeholder="https://api.contoh.com/v1" onChange={(e) => setDraft((d) => ({ ...d, endpoint: e.target.value }))} />
              </FieldRow>
            ) : null}

            <FieldRow label="API">
              <Segmented
                value={draft.apiStyle}
                disabled={readOnly}
                options={API_STYLES.filter((s) => s.value !== "cli" || draft.apiStyle === "cli").slice(0, 4)}
                onChange={(v) => setDraft((d) => ({ ...d, apiStyle: v }))}
              />
            </FieldRow>

            <FieldRow label="Autentikasi">
              <Segmented value={draft.authMethod} disabled={readOnly} options={AUTH_METHODS} onChange={(v) => setDraft((d) => ({ ...d, authMethod: v }))} />
            </FieldRow>

            <FieldRow
              label="Model"
              hint={
                models.length
                  ? `${models.length} model tersedia — klik untuk memilih.`
                  : "Tekan Ambil daftar untuk melihat model yang dikenali provider, atau ketik model id-nya langsung."
              }
            >
              <div className="flex gap-2">
                <input className={`${inputCls} flex-1`} value={draft.model} disabled={readOnly} placeholder="deepseek-flash" onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} />
                {draft.apiStyle !== "cli" ? (
                  <Button
                    variant="secondary"
                    disabled={!draft.endpoint?.trim()}
                    onClick={async () => {
                      setModelsNote(null);
                      try {
                        // Uses the configuration in the form, not the saved one —
                        // so it also works when the provider was never saved.
                        const res = await getModelsForDraft({ ...draft, id: current?.id });
                        setModels(res.models);
                        setModelsNote(res.message ?? (res.models.length ? null : "Provider tidak mengembalikan daftar model. Isi model secara manual."));
                      } catch (err: any) {
                        setModelsNote(err?.message ?? "Gagal mengambil daftar model");
                      }
                    }}
                  >
                    Ambil daftar
                  </Button>
                ) : null}
              </div>
              {models.length ? (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto mt-1">
                  {models.slice(0, 80).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setDraft((d) => ({ ...d, model: m.id }))}
                      className={`rounded-md px-2 py-1 ring ${MONO} ${draft.model === m.id ? "ring-kumo-brand bg-kumo-brand/10 text-kumo-default" : "ring-kumo-line text-kumo-subtle hover:bg-kumo-elevated"}`}
                    >
                      {m.id}
                    </button>
                  ))}
                </div>
              ) : null}
              {modelsNote ? <p className="text-sm text-kumo-subtle">{modelsNote}</p> : null}
            </FieldRow>

            <FieldRow label="Context window" hint="Token. Kosong = 128000. Isi manual untuk model lokal atau custom.">
              <input
                className={inputCls}
                type="number"
                value={draft.contextWindow ?? ""}
                disabled={readOnly}
                placeholder="Auto (128000)"
                onChange={(e) => setDraft((d) => ({ ...d, contextWindow: e.target.value ? Number(e.target.value) : null }))}
              />
            </FieldRow>

            <FieldRow label="Max output tokens" hint="Wajib. Tanpa nilai eksplisit, sebagian provider membatasi output ke 4096 token dan artefak bisa terpotong tanpa peringatan.">
              <input
                className={inputCls}
                type="number"
                value={draft.maxOutputTokens ?? ""}
                disabled={readOnly}
                placeholder="8192"
                onChange={(e) => setDraft((d) => ({ ...d, maxOutputTokens: e.target.value ? Number(e.target.value) : null }))}
              />
            </FieldRow>

            <div className="grid gap-3 pt-2">
              <Toggle
                checked={draft.enableThinking}
                disabled={readOnly}
                onChange={(v) => setDraft((d) => ({ ...d, enableThinking: v }))}
                label="Aktifkan mode berpikir"
                description="Model mengeluarkan proses berpikir terpisah yang ditampilkan terlipat di percakapan."
              />
              <Toggle
                checked={draft.skipTlsVerify}
                disabled={readOnly}
                onChange={(v) => setDraft((d) => ({ ...d, skipTlsVerify: v }))}
                label="Lewati verifikasi sertifikat TLS"
                description="Hanya untuk endpoint dengan CA sendiri. Melewati verifikasi membuat lalu lintas rentan disadap."
              />
            </div>

            <FieldRow label="Proxy URL" hint="Kosongkan bila tidak memakai proxy.">
              <input className={`${inputCls} ${MONO}`} value={draft.proxyUrl} disabled={readOnly} placeholder="socks5://127.0.0.1:7890" onChange={(e) => setDraft((d) => ({ ...d, proxyUrl: e.target.value }))} />
            </FieldRow>

            {readOnly ? (
              <InlineAlert kind="info">
                Konfigurasi ini berasal dari environment (<span className={MONO}>BASE_URL_LLM</span> / <span className={MONO}>MODEL_NAME_LLM</span> /{" "}
                <span className={MONO}>API_KEY_LLM</span>) dan hanya bisa dibaca. Provider yang ditambahkan di sini akan selalu dipakai sebagai gantinya.
              </InlineAlert>
            ) : null}

            {testResult && testIsCurrent ? (
              <InlineAlert kind={testResult.success ? "success" : "error"}>
                {testResult.success ? (
                  <>
                    Terhubung
                    {typeof testResult.latencyMs === "number" ? ` · ${testResult.latencyMs} ms` : ""}
                    {testResult.modelUsed ? ` · ${testResult.modelUsed}` : ""}
                  </>
                ) : (
                  <>
                    {testResult.message}
                    <div className="mt-1">{testErrorHint(testResult.errorCategory)}</div>
                  </>
                )}
              </InlineAlert>
            ) : testedFingerprint ? (
              <InlineAlert kind="warning">Konfigurasi berubah sejak pengujian terakhir — uji ulang untuk memastikan.</InlineAlert>
            ) : null}

            {saveError ? <InlineAlert>{saveError}</InlineAlert> : null}
          </div>
        </div>

        {/* Footer: Test on the left, Cancel/Apply on the right — exactly the reference. */}
        <footer className="flex items-center gap-2 px-8 py-4 border-t border-kumo-line shrink-0">
          {!isNew && !readOnly ? (
            <Button variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? "Menguji…" : "Test"}
            </Button>
          ) : null}
          {!isNew && !readOnly ? (
            <Button variant="ghost" onClick={handleDelete} disabled={saving}>
              Hapus
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={() => setView("list")}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={readOnly || saving || nameState !== "valid"}>
              {saving ? "Menyimpan…" : "Apply"}
            </Button>
          </div>
        </footer>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-kumo-canvas flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl">
          <header className="flex items-center gap-4 px-8 py-6">
            <h2 className="text-sm font-semibold text-kumo-default flex-1">Daftar provider</h2>
            <Button variant="primary" onClick={openNew} icon={<Plus size={13} />}>
              Tambah provider
            </Button>
          </header>

          {error ? (
            <div className="px-8 pb-4">
              <InlineAlert>{error}</InlineAlert>
            </div>
          ) : null}

          <div className="px-8 pb-6">
            {loading && !providers.length ? (
              <p className="text-sm text-kumo-subtle">Memuat…</p>
            ) : !providers.length ? (
              <div className="rounded-xl border border-dashed border-kumo-line py-14 grid gap-3 justify-items-center">
                <p className="text-sm text-kumo-subtle">Belum ada provider</p>
                <Button variant="primary" onClick={openNew} icon={<Plus size={13} />}>
                  Tambah provider
                </Button>
              </div>
            ) : (
              <div className="grid gap-2">
                {providers.map((p) => {
                  const tone = !p.usable ? "bg-kumo-subtle" : p.lastTestOk === true ? "bg-green-400" : p.lastTestOk === false ? "bg-red-400" : "bg-amber-400";
                  const status = !p.usable ? "belum lengkap" : p.lastTestOk === true ? "terhubung" : p.lastTestOk === false ? "gagal" : "belum diuji";
                  return (
                    <button key={p.id} onClick={() => openEdit(p.id)} className="w-full flex items-center gap-4 rounded-xl px-4 py-3.5 ring ring-kumo-line hover:bg-kumo-elevated text-left">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tone}`} />
                      <span className="grid gap-0.5 min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-kumo-default truncate">{p.name}</span>
                          {p.isDefault ? <span className="text-sm text-kumo-subtle">· default</span> : null}
                          {p.source === "env" ? <span className="text-sm text-kumo-subtle">· environment</span> : null}
                        </span>
                        <span className={`${MONO} text-kumo-subtle truncate`}>{p.model || p.cliAgent || "belum ada model"}</span>
                      </span>
                      <span className="text-sm text-kumo-subtle shrink-0">{status}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <AgentSettingsSection />

          <Section
            title="Catatan tentang penyimpanan kredensial"
            description="API key disimpan di data.db aplikasi pada mesin ini, tidak pernah dikirim ke tampilan, dan selalu ditampilkan bertopeng. Aplikasi tidak mengirimkannya ke mana pun selain endpoint provider yang Anda tentukan."
            last
          />
        </div>
      </div>

      <footer className="flex items-center px-8 py-4 border-t border-kumo-line shrink-0">
        <div className="mx-auto w-full max-w-4xl flex">
          <Button variant="secondary" className="ml-auto" onClick={onClose} icon={<X size={13} />}>
            Tutup
          </Button>
        </div>
      </footer>
    </div>
  );
}

export default ProviderSettings;
