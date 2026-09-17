import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, MagnifyingGlass, Sliders } from "@phosphor-icons/react";
import type { ChatProviderOption } from "~/lib/use-chat";

/**
 * Model picker in the composer (ADR-001 D8, FR-A9, FR-L4, FR-L12).
 *
 * The design reference uses a popup with search + per-provider groups +
 * "enter model manually". That shape matters for BYOK: one user can have
 * several configurations (work, personal, local endpoint), and a flat list
 * becomes unreadable past about five entries.
 *
 * The saved model is always merged with the live model (FR-L4) so providers
 * without `GET /models` stay usable with a manually typed model.
 */

interface Props {
  providers: ChatProviderOption[];
  /** Provider used by the thread; "" means follow the app default. */
  providerId: string;
  model: string | null;
  onSelect: (providerId: string, model: string | null) => void;
  onOpenProviders: () => void;
}

export function ModelPicker({ providers, providerId, model, onSelect, onOpenProviders }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [manualFor, setManualFor] = useState<string | null>(null);
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

  const current = providers.find((p) => p.id === providerId) ?? null;
  const label = current ? `${current.name}${model ? ` · ${model}` : ""}` : "Provider default";

  // Search filters per model, not per provider — the user is looking for
  // the model name, and that is usually what they remember best.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers
      .map((p) => {
        const models = (p.models ?? []).filter((m) => !q || m.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
        return { provider: p, models };
      })
      .filter((g) => g.models.length > 0 || !q);
  }, [providers, query]);

  return (
    // The one toolbar item allowed to shrink: every other control is `shrink-0`,
    // so when the row runs out of room the model name gives up width first and
    // ends in an ellipsis. That keeps the row on one line without `overflow`,
    // which would clip the popovers that open upward out of it.
    <div ref={ref} className="relative min-w-[2.25rem] max-w-[6.5rem] @2xl/composer:max-w-[12rem]">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Model: ${label}`}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2 h-8 hover:bg-kumo-tint text-sm text-kumo-default"
      >
        <Sliders size={13} className="text-kumo-subtle shrink-0" />
        <span className="truncate whitespace-nowrap">{label}</span>
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

            {groups.map(({ provider, models }) => (
              <div key={provider.id} className="grid gap-0.5">
                <div className="px-2.5 pt-2 pb-1 text-[11px] uppercase tracking-wide text-kumo-subtle flex items-center gap-2">
                  <span className="truncate">{provider.name}</span>
                  {provider.envFallback ? <span className="text-[10px] normal-case">· environment</span> : null}
                  {provider.isDefault ? <span className="text-[10px] normal-case">· default</span> : null}
                </div>
                {models.map((m) => {
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

            {!providers.length ? (
              <p className="px-2.5 py-3 text-sm text-kumo-subtle">Belum ada provider yang bisa dipakai.</p>
            ) : null}
          </div>

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
