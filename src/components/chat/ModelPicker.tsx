import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, MagnifyingGlass, Sliders } from "@phosphor-icons/react";
import { visibleModels } from "~/components/chat/model-list";
import { refreshProviderModels, type ChatProviderOption } from "~/lib/use-chat";
import { providerLogo } from "~/lib/provider-logo";
import { RUNTIME_STATE_LABEL, runtimeStateClass, useRuntimeStatus } from "~/lib/runtime-status";
import { activeChoice } from "~/lib/model-options";
import type { ModelOptionDescriptor } from "~/lib/runtime-types";

/**
 * Model picker in the composer (ADR-001 D8, FR-A9, FR-L4, FR-L12).
 *
 * The design reference uses a popup with search + per-provider groups +
 * "enter model manually". That shape matters for BYOK: one user can have
 * several configurations (work, personal, local endpoint), and a flat list
 * becomes unreadable past about five entries.
 *
 * A provider's list is what it reported when it was last refreshed (U3). A provider that
 * shows at most one stored model is asked for its full list when the popover opens, once per
 * page load, and each provider shows a few models with "Tampilkan semua" for the rest. The
 * saved model is always in the list (FR-L4), so providers without `GET /models` stay usable
 * with a manually typed model.
 */

type ReasoningValue = "low" | "medium" | "high" | null;

/** Reasoning effort choices; `null` means the provider's own default. */
const REASONING_OPTIONS: { value: ReasoningValue; label: string; hint: string }[] = [
  { value: null, label: "Default", hint: "Ikut default provider" },
  { value: "low", label: "Rendah", hint: "Berpikir lebih singkat" },
  { value: "medium", label: "Sedang", hint: "Keseimbangan kecepatan dan ketelitian" },
  { value: "high", label: "Tinggi", hint: "Berpikir lebih dalam, lebih lambat" },
];

/** Requests already made in this page load, so reopening the picker does not ask again. */
const requested = new Map<string, Promise<string[]>>();

/** One request per provider per page load. A failed request is forgotten, so the next open retries. */
function requestModels(providerId: string, force: boolean): Promise<string[]> {
  if (force) requested.delete(providerId);
  let pending = requested.get(providerId);
  if (!pending) {
    pending = refreshProviderModels(providerId).catch(() => {
      requested.delete(providerId);
      return [] as string[];
    });
    requested.set(providerId, pending);
  }
  return pending;
}

interface Props {
  providers: ChatProviderOption[];
  /** Provider used by the thread; "" means follow the app default. */
  providerId: string;
  model: string | null;
  onSelect: (providerId: string, model: string | null) => void;
  onOpenProviders: () => void;
  /** Reasoning effort lives here, next to the model it applies to. */
  reasoningSupported: boolean;
  reasoningLevel: ReasoningValue;
  onReasoningLevel: (level: ReasoningValue) => void;
  /** Options of the selected model from its runtime (OpenCode variants). */
  optionDescriptors: ModelOptionDescriptor[];
  modelOptions: Record<string, string>;
  onModelOption: (id: string, value: string | null) => void;
}

/** Why a CLI provider's models may be missing; nothing when it is ready. */
function CliGroupStatus({ providerId, open }: { providerId: string; open: boolean }) {
  const status = useRuntimeStatus(providerId, open);
  if (!status || status.state === "ready") return null;
  return (
    <p className={`px-2.5 pb-1 text-xs ${runtimeStateClass(status.state)}`}>
      {RUNTIME_STATE_LABEL[status.state]}: {status.message}
    </p>
  );
}

export function ModelPicker({
  providers,
  providerId,
  model,
  onSelect,
  onOpenProviders,
  reasoningSupported,
  reasoningLevel,
  onReasoningLevel,
  optionDescriptors,
  modelOptions,
  onModelOption,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [manualFor, setManualFor] = useState<string | null>(null);
  /** Model ids each provider reported on refresh, by provider id. */
  const [fetchedIds, setFetchedIds] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setManualFor(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function load(p: ChatProviderOption, force: boolean) {
    setPending((prev) => new Set(prev).add(p.id));
    void requestModels(p.id, force).then((ids) => {
      setFetchedIds((prev) => ({ ...prev, [p.id]: ids }));
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
    });
  }

  // Opening the picker is the only trigger: a provider that shows at most one stored model is
  // asked for its full list. Nothing polls.
  useEffect(() => {
    if (!open) return;
    for (const p of providers) {
      if (p.apiStyle === "cli" || (p.models?.length ?? 0) > 1) continue;
      load(p, false);
    }
    // Runs on open and when the provider list changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, providers]);

  const current = providers.find((p) => p.id === providerId) ?? null;
  const fallback = providers.find((p) => p.isDefault) ?? null;
  // The trigger shows only the model id; the provider's name goes in the tooltip.
  const shownModel = model ?? current?.model ?? fallback?.model ?? "Default";
  const providerName = (current ?? fallback)?.name ?? "";

  /** The stored list first, then what the provider reported on refresh, without duplicates. */
  function modelsOf(p: ChatProviderOption): string[] {
    return [...new Set([...(p.models ?? []), ...(fetchedIds[p.id] ?? [])])];
  }

  // Search matches models by name. A search that matches a configuration's own name shows all
  // of that configuration's models, since the user may remember the configuration instead.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers
      .map((p) => {
        const all = modelsOf(p);
        const providerMatch = !!q && p.name.toLowerCase().includes(q);
        const view = visibleModels(all, {
          query: providerMatch ? "" : query,
          expanded: expanded.has(p.id) || providerMatch,
          selected: providerId === p.id ? (model ?? p.model) : null,
        });
        return { provider: p, total: all.length, shown: view.shown, hidden: view.hidden };
      })
      .filter((g) => !q || g.shown.length > 0);
    // Recomputed when the search, the expansion, the loaded lists, or the selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, query, expanded, fetchedIds, providerId, model]);

  return (
    // The one toolbar item allowed to shrink: every other control is `shrink-0`,
    // so when the row runs out of room the model name gives up width first and
    // ends in an ellipsis. That keeps the row on one line without `overflow`,
    // which would clip the popovers that open upward out of it.
    <div ref={ref} className="relative min-w-[2.25rem] max-w-[6.5rem] @2xl/composer:max-w-[12rem]">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Model: ${shownModel}${providerName ? ` · ${providerName}` : ""}`}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2 h-8 hover:bg-kumo-tint text-sm text-kumo-default"
      >
        <Sliders size={13} className="text-kumo-subtle shrink-0" />
        <span className="truncate whitespace-nowrap">{shownModel}</span>
        <CaretDown size={10} weight="bold" className="hidden @2xl/composer:inline text-kumo-subtle shrink-0" />
      </button>

      {open ? (
        // Right-anchored for the same reason as the actions popover: the panel is
        // docked right, so a 340px popover anchored left would lose its right edge.
        <div className="absolute bottom-full right-0 mb-2 z-30 w-[340px] rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 ring ring-kumo-line mb-1.5">
            <MagnifyingGlass size={13} className="text-kumo-subtle shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari model…"
              className="flex-1 min-w-0 bg-transparent text-sm text-kumo-default focus:outline-none"
            />
          </div>

          <div className="max-h-72 overflow-y-auto grid gap-0.5">
            <button
              onClick={() => {
                onSelect("", null);
                setOpen(false);
              }}
              className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-kumo-elevated"
            >
              <span className="w-4 shrink-0 text-kumo-brand">{providerId === "" ? <Check size={13} weight="bold" /> : null}</span>
              <span className="grid gap-0.5 min-w-0">
                <span className="text-sm text-kumo-default">Provider default</span>
                <span className="text-sm text-kumo-subtle">Ikut pengaturan aplikasi</span>
              </span>
            </button>

            {groups.map(({ provider, total, shown, hidden }) => (
              <div key={provider.id} className="grid gap-0.5">
                <div className="px-2.5 pt-2 pb-1 text-[11px] uppercase tracking-wide text-kumo-subtle flex items-center gap-2">
                  {providerLogo(provider) ? (
                    <img src={providerLogo(provider)!} alt="" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 object-contain dark:invert" />
                  ) : null}
                  <span className="truncate">{provider.name}</span>
                  <span className="normal-case tabular-nums">· {total} model</span>
                  {provider.envFallback ? <span className="text-[10px] normal-case">· environment</span> : null}
                  {provider.isDefault ? <span className="text-[10px] normal-case">· default</span> : null}
                  {provider.apiStyle !== "cli" ? (
                    <button
                      onClick={() => load(provider, true)}
                      disabled={pending.has(provider.id)}
                      className="ml-auto normal-case text-[11px] text-kumo-brand hover:underline disabled:opacity-50"
                    >
                      Perbarui
                    </button>
                  ) : null}
                </div>
                {pending.has(provider.id) ? <p className="px-2.5 pb-1 text-xs text-kumo-subtle">Memuat daftar model…</p> : null}
                {provider.apiStyle === "cli" ? <CliGroupStatus providerId={provider.id} open={open} /> : null}
                {shown.map((m) => {
                  const active = providerId === provider.id && (model ?? provider.model) === m;
                  return (
                    <button
                      key={`${provider.id}:${m}`}
                      onClick={() => {
                        onSelect(provider.id, m);
                        setOpen(false);
                      }}
                      className="w-full flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-kumo-elevated"
                    >
                      <span className="w-4 shrink-0 text-kumo-brand">{active ? <Check size={13} weight="bold" /> : null}</span>
                      <span className="text-sm font-mono text-kumo-default truncate">{m}</span>
                    </button>
                  );
                })}
                {hidden > 0 ? (
                  <button
                    onClick={() => setExpanded((prev) => new Set(prev).add(provider.id))}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-sm text-kumo-subtle hover:bg-kumo-elevated ml-6"
                  >
                    Tampilkan semua ({total})
                  </button>
                ) : null}
                {manualFor === provider.id ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                    <input
                      autoFocus
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manual.trim()) {
                          onSelect(provider.id, manual.trim());
                          setManual("");
                          setManualFor(null);
                          setOpen(false);
                        }
                      }}
                      placeholder="id model, mis. gpt-5-mini"
                      className="flex-1 min-w-0 rounded-lg px-2 py-1 bg-kumo-elevated ring ring-kumo-line text-sm font-mono focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (!manual.trim()) return;
                        onSelect(provider.id, manual.trim());
                        setManual("");
                        setManualFor(null);
                        setOpen(false);
                      }}
                      className="rounded-lg px-2 py-1 text-sm text-kumo-brand hover:bg-kumo-elevated"
                    >
                      Pakai
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setManual("");
                      setManualFor(provider.id);
                    }}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-sm text-kumo-brand hover:bg-kumo-elevated ml-6"
                  >
                    + masukkan model manual
                  </button>
                )}
              </div>
            ))}

            {!providers.length ? <p className="px-2.5 py-3 text-sm text-kumo-subtle">Belum ada provider yang bisa dipakai.</p> : null}
          </div>

          {reasoningSupported ? (
            <div className="grid gap-1.5 px-2.5 pt-2 pb-2 mt-1 border-t border-kumo-line">
              <span className="text-[11px] uppercase tracking-wide text-kumo-subtle">Tingkat berpikir</span>
              <div className="flex w-fit rounded-lg ring ring-kumo-line p-0.5">
                {REASONING_OPTIONS.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => onReasoningLevel(o.value)}
                    title={o.hint}
                    className={`rounded-md px-2 py-0.5 text-xs ${
                      reasoningLevel === o.value ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {optionDescriptors.map((d) => {
            const active = activeChoice(d, modelOptions);
            return (
              <div key={d.id} className="grid gap-1.5 px-2.5 pt-2 pb-2 mt-1 border-t border-kumo-line">
                <span className="text-[11px] uppercase tracking-wide text-kumo-subtle">{d.label}</span>
                <div className="flex flex-wrap w-fit rounded-lg ring ring-kumo-line p-0.5">
                  {[{ value: null as string | null, label: "Default" }, ...d.choices].map((c) => (
                    <button
                      key={c.value ?? "default"}
                      onClick={() => onModelOption(d.id, c.value)}
                      title={c.value === null ? "Ikut default model" : undefined}
                      className={`rounded-md px-2 py-0.5 text-xs ${
                        active === c.value ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <button
            onClick={() => {
              setOpen(false);
              onOpenProviders();
            }}
            className="w-full text-left rounded-lg px-2.5 py-2 mt-1 text-sm text-kumo-default hover:bg-kumo-elevated border-t border-kumo-line"
          >
            Kelola provider…
          </button>
        </div>
      ) : null}
    </div>
  );
}
