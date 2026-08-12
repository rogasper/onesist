import { Fragment, useState } from "react";
import { Plus, X, PencilSimple, LinkSimple, MagnifyingGlass } from "@phosphor-icons/react";
import type {
  BusinessRequirement,
  DesignSolution,
  FunctionalRequirement,
  RtmDataset,
  TestCase,
} from "~/shared/types";
import { deriveFrTrace, type FrTrace } from "~/lib/rtm-trace";
import type { EntityKind, RtmEntity } from "./types";

export interface RtmMatrixCallbacks {
  onEdit: (kind: EntityKind, entity: RtmEntity) => void;
  onDelete: (kind: EntityKind, entity: RtmEntity) => void;
  /** Link or unlink (id === null removes). */
  onLink: (frId: string, kind: "design" | "test", id: string | null) => void;
  /** Open create dialog; frId is set when creating from inside a row cell to auto-link. */
  onCreate: (kind: EntityKind, frId: string | null) => void;
}

interface RtmMatrixProps {
  data: RtmDataset;
  callbacks: RtmMatrixCallbacks;
}

interface Group {
  br: BusinessRequirement | null;
  frs: FunctionalRequirement[];
}

export function RtmMatrix({ data, callbacks }: RtmMatrixProps) {
  const byId = (list: RtmEntity[]) => new Map(list.map((e) => [e.id, e]));

  const groups: Group[] = data.brs.map((br) => ({
    br,
    frs: data.frs.filter((f) => f.brId === br.id),
  }));
  const unmapped = data.frs.filter((f) => !f.brId);
  if (unmapped.length > 0) groups.push({ br: null, frs: unmapped });

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-kumo-subtle">
          <LinkSimple size={28} className="mx-auto mb-2 opacity-60" />
          <p className="text-sm">Belum ada data traceability.</p>
          <p className="text-xs mt-1">Mulai dengan menambah Business Requirement, atau minta agent membuatkan RTM.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto glass-container rounded-lg">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-kumo-elevated/95 backdrop-blur">
          <tr className="text-left text-[10px] uppercase tracking-wider text-kumo-subtle">
            <th className="px-3 py-2 border-b border-kumo-line w-[220px] min-w-[180px]">Business Requirement</th>
            <th className="px-3 py-2 border-b border-kumo-line min-w-[220px]">Functional Requirement</th>
            <th className="px-3 py-2 border-b border-kumo-line min-w-[200px]">Design Solution</th>
            <th className="px-3 py-2 border-b border-kumo-line min-w-[200px]">Test Case</th>
            <th className="px-3 py-2 border-b border-kumo-line min-w-[220px]">Status Traceability</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const rows = group.frs.length > 0 ? group.frs : [null];
            const coverage = group.br
              ? data.frs.filter((f) => f.brId === group.br!.id).map((f) => deriveFrTrace(f, data.links))
              : [];
            const fullCount = coverage.filter((t) => t.status === "lengkap").length;
            return (
              <Fragment key={group.br?.id ?? "unmapped"}>
                {rows.map((fr, idx) => {
                  const trace = fr ? deriveFrTrace(fr, data.links) : null;
                  const brCell = idx === 0 ? (
                    <td
                      rowSpan={rows.length}
                      className="px-3 py-2 align-top border-b border-r border-kumo-line/60"
                    >
                      {group.br ? (
                        <div className="group">
                          <button
                            onClick={() => callbacks.onEdit("br", group.br!)}
                            className="flex items-start gap-1 text-left font-medium text-kumo-default hover:text-kumo-brand transition-colors"
                            title="Edit"
                          >
                            <span className="font-mono text-[11px] text-kumo-brand shrink-0 mt-0.5">{group.br.code}</span>
                            <span className="text-xs">{group.br.title}</span>
                            <PencilSimple size={10} className="opacity-0 group-hover:opacity-60 shrink-0 mt-0.5" />
                          </button>
                          <span className="mt-1 text-[10.5px] text-kumo-subtle whitespace-pre-wrap break-words leading-relaxed">{group.br.description}</span>
                          {coverage.length > 0 && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <div className="h-1 flex-1 rounded-full bg-kumo-line/50 overflow-hidden max-w-[120px]">
                                <div className="h-full bg-green-400/70" style={{ width: `${coverage.length ? Math.round((fullCount / coverage.length) * 100) : 0}%` }} />
                              </div>
                              <span className="text-[10px] text-kumo-subtle">{fullCount}/{coverage.length} lengkap</span>
                            </div>
                          )}
                          {coverage.length === 0 && (
                            <div className="mt-1 text-[10px] text-amber-400/80">belum dipecah</div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs text-amber-400/90 font-medium">Belum dipecah</span>
                          <div className="text-[10px] text-kumo-subtle mt-0.5">FR tanpa Business Requirement</div>
                        </div>
                      )}
                    </td>
                  ) : null;

                  if (!fr) {
                    return (
                      <tr key={`empty-${group.br?.id}`} className="hover:bg-kumo-tint/40">
                        {brCell}
                        <td className="px-3 py-3 text-kumo-subtle text-xs border-b border-kumo-line/60" colSpan={4}>
                          — belum ada functional requirement
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={fr.id} className="hover:bg-kumo-tint/40">
                      {brCell}
                      <td className="px-3 py-2 border-b border-kumo-line/60 align-top">
                        <div className="group">
                          <button
                            onClick={() => callbacks.onEdit("fr", fr)}
                            className="flex items-start gap-1 text-left text-kumo-default hover:text-kumo-brand transition-colors"
                            title="Edit"
                          >
                            <span className="font-mono text-[11px] text-kumo-brand shrink-0 mt-0.5">{fr.code}</span>
                            <span className="text-xs">{fr.title}</span>
                            <PencilSimple size={10} className="opacity-0 group-hover:opacity-60 shrink-0 mt-0.5" />
                          </button>
                          <span className="mt-1 text-[10.5px] text-kumo-subtle whitespace-pre-wrap break-words leading-relaxed">{fr.description}</span>
                        </div>
                      </td>
                      <LinkCell
                        kind="design"
                        fr={fr}
                        linked={trace!.designLinkIds.map((id) => byId(data.designs).get(id)).filter(Boolean) as DesignSolution[]}
                        all={data.designs}
                        trace={trace!}
                        callbacks={callbacks}
                      />
                      <LinkCell
                        kind="test"
                        fr={fr}
                        linked={trace!.testLinkIds.map((id) => byId(data.tests).get(id)).filter(Boolean) as TestCase[]}
                        all={data.tests}
                        trace={trace!}
                        callbacks={callbacks}
                      />
                      <td className="px-3 py-2 border-b border-kumo-line/60 align-top">
                        <TraceStatus trace={trace!} />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TraceStatus({ trace }: { trace: FrTrace }) {
  const chips: React.ReactNode[] = [];
  if (!trace.brTraced) chips.push(<span key="br" className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">BR belum dipecah</span>);
  chips.push(
    <span key="ds" className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${trace.hasDesign ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
      {trace.hasDesign ? "Desain ✓" : "Desain ✗"}
    </span>,
  );
  chips.push(
    <span key="tc" className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${trace.hasTest ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
      {trace.hasTest ? "Test ✓" : "Test ✗"}
    </span>,
  );

  const rollup = {
    lengkap: { label: "Lengkap", cls: "text-green-400" },
    "test-kurang": { label: "Test kurang", cls: "text-amber-400" },
    "desain-kurang": { label: "Desain kurang", cls: "text-amber-400" },
    belum: { label: "Belum ditracing", cls: "text-red-400" },
  }[trace.status];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 flex-wrap">{chips}</div>
      <div className={`text-[11px] font-medium ${rollup.cls}`}>{rollup.label}</div>
    </div>
  );
}

function LinkCell({
  kind,
  fr,
  linked,
  all,
  trace,
  callbacks,
}: {
  kind: "design" | "test";
  fr: FunctionalRequirement;
  linked: (DesignSolution | TestCase)[];
  all: (DesignSolution | TestCase)[];
  trace: FrTrace;
  callbacks: RtmMatrixCallbacks;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const linkedIds = new Set(linked.map((e) => e.id));
  const available = all.filter((e) => !linkedIds.has(e.id));
  const kindLabel = kind === "design" ? "Design" : "Test";

  const q = search.trim().toLowerCase();
  const filtered = available.filter((e) => {
    if (!q) return true;
    const hay = [
      (e as any).code ?? "",
      (e as any).title ?? "",
      (e as any).description ?? "",
      (e as any).sourceRef ?? "",
      (e as any).steps ?? "",
      (e as any).expected ?? "",
    ].join("\n").toLowerCase();
    return hay.includes(q);
  });

  const toggleLink = (e: React.MouseEvent, entity: RtmEntity) => {
    e.stopPropagation();
    callbacks.onLink(fr.id, kind, entity.id);
  };

  return (
    <td className="px-3 py-2 border-b border-kumo-line/60 align-top">
      <div className="flex flex-col gap-1.5">
        {linked.length === 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full self-start ${trace.status === "lengkap" ? "bg-green-500/15 text-green-400" : "bg-kumo-elevated text-kumo-subtle"}`}>
            —
          </span>
        )}
        {linked.map((entity) => (
          <div
            key={entity.id}
            className="group/card rounded-lg border border-kumo-line/50 bg-kumo-elevated/30 px-2 py-1.5"
          >
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => callbacks.onEdit(kind as EntityKind, entity)}
                className="font-mono text-[10px] text-kumo-brand hover:text-kumo-default transition-colors shrink-0"
                title="Edit"
              >
                {(entity as any).code}
              </button>
              <button
                onClick={() => callbacks.onEdit(kind as EntityKind, entity)}
                className="flex-1 min-w-0 text-left text-[11px] font-medium text-kumo-default truncate hover:text-kumo-brand transition-colors"
                title="Edit"
              >
                {(entity as any).title}
              </button>
              <button
                onClick={(e) => toggleLink(e, entity)}
                className="opacity-0 group-hover/card:opacity-100 text-kumo-subtle hover:text-red-400 transition-all shrink-0"
                title={`Unlink ${(entity as any).code}`}
              >
                <X size={10} />
              </button>
            </div>

            {(entity as any).description && (
              <div className="mt-1 text-[10.5px] text-kumo-subtle whitespace-pre-wrap break-words leading-relaxed">
                {(entity as any).description}
              </div>
            )}

            {kind === "design" && (entity as any).sourceRef && (
              <div className="mt-1">
                <span className="inline-block max-w-full text-[9.5px] px-1.5 py-0.5 rounded-full bg-kumo-elevated text-kumo-subtle font-mono truncate" title={(entity as any).sourceRef}>
                  {(entity as any).sourceRef}
                </span>
              </div>
            )}

            {kind === "test" && ((entity as any).steps || (entity as any).expected) && (
              <div className="mt-1 space-y-0.5 text-[10.5px] text-kumo-subtle whitespace-pre-wrap break-words leading-relaxed">
                {(entity as any).steps && (
                  <div><span className="text-kumo-default/80 font-medium">Steps:</span> {(entity as any).steps}</div>
                )}
                {(entity as any).expected && (
                  <div><span className="text-kumo-default/80 font-medium">Expected:</span> {(entity as any).expected}</div>
                )}
              </div>
            )}
          </div>
        ))}

        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setSearch(""); setOpen((p) => !p); }}
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-dashed border-kumo-line text-kumo-subtle hover:text-kumo-default hover:border-kumo-brand/50 transition-colors self-start"
            title={`Link ${kindLabel}`}
          >
            <Plus size={9} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-30 w-64 rounded-lg border border-kumo-line bg-kumo-elevated shadow-xl p-1.5 max-h-64 overflow-hidden flex flex-col">
                <div className="flex items-center gap-1.5 px-1 pb-1.5 shrink-0">
                  <MagnifyingGlass size={11} className="text-kumo-subtle shrink-0" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
                    placeholder={`Cari ${kindLabel}…`}
                    className="w-full bg-kumo-recessed/60 border border-kumo-line rounded px-2 py-1 text-[11px] text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none"
                  />
                </div>
                <div className="overflow-y-auto flex-1 min-h-0">
                  {available.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-kumo-subtle">Semua {kindLabel} sudah ter-link</div>
                  ) : filtered.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-kumo-subtle">Tidak ada hasil untuk "{search}"</div>
                  ) : (
                    filtered.map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => { callbacks.onLink(fr.id, kind, entity.id); setOpen(false); }}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] rounded hover:bg-kumo-tint transition-colors"
                      >
                        <span className="font-mono text-kumo-brand shrink-0">{(entity as any).code}</span>
                        <span className="truncate text-kumo-default">{(entity as any).title}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="h-px bg-kumo-line/50 my-1 shrink-0" />
                <button
                  onClick={() => { setOpen(false); callbacks.onCreate(kind as EntityKind, fr.id); }}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] text-kumo-brand rounded hover:bg-kumo-tint transition-colors shrink-0"
                >
                  <Plus size={10} /> New {kindLabel}…
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </td>
  );
}
