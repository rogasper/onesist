import { useState, useEffect, useRef, useCallback } from "react";
import { X, PencilSimple, Check, CopySimple } from "@phosphor-icons/react";
import { DialogTitle } from "@cloudflare/kumo";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { copyRich, escapeHtml, htmlToPlainText, markdownToHtml } from "~/lib/rich-copy";
import type { Task } from "~/shared/types";

interface TaskDetailProps {
  task: Task;
  developers: string[];
  phases?: string[];
  onSave: (id: string, data: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** Reports editing, so the modal can refuse an outside click that would drop the edits (U5). */
  onEditingChange?: (editing: boolean) => void;
}

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do", color: "text-blue-400/70 bg-blue-500/10" },
  { value: "in_progress", label: "In Progress", color: "text-amber-400/70 bg-amber-500/10" },
  { value: "done", label: "Done", color: "text-green-400/70 bg-green-500/10" },
];

function statusBadge(status: string) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${opt.color}`}>{opt.label}</span>;
}

export function TaskDetail({ task, developers, phases = [], onSave, onDelete, onClose, onEditingChange }: TaskDetailProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState(task.status);
  const [storyPoints, setStoryPoints] = useState(task.storyPoints?.toString() ?? "");
  const [assignee, setAssignee] = useState(task.assignee ?? "");
  const [module_, setModule] = useState(task.module ?? "");
  const [phase, setPhase] = useState(task.phase ?? "");
  const [archived, setArchived] = useState(task.archived ?? false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<"rich" | "prompt" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const code = task.code ?? task.title.split(":")[0]?.trim() ?? "";
  const displayTitle = task.code
    ? task.title.replace(`${task.code}:`, "").trim()
    : task.title.includes(":")
      ? task.title.slice(task.title.indexOf(":") + 1).trim()
      : task.title;

  const deps: string[] = task.dependenciesJson ? (JSON.parse(task.dependenciesJson) as string[]) : [];
  const blocks: string[] = (task as any).blocksJson ? (JSON.parse((task as any).blocksJson) as string[]) : [];
  const filesScope: string[] = (task as any).filesScopeJson ? (JSON.parse((task as any).filesScopeJson) as string[]) : [];
  const ac: string[] = (task as any).acceptanceCriteriaJson ? (JSON.parse((task as any).acceptanceCriteriaJson) as string[]) : [];

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setStoryPoints(task.storyPoints?.toString() ?? "");
    setAssignee(task.assignee ?? "");
    setModule(task.module ?? "");
    setPhase(task.phase ?? "");
    setArchived(task.archived ?? false);
    setEditing(false);
  }, [task.id, task.archived, task.phase]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(task.id, {
      title,
      description,
      status,
      storyPoints: storyPoints ? parseInt(storyPoints, 10) : null,
      assignee: assignee || null,
      module: module_ || null,
      phase: phase || null,
      archived,
    });
    setSaving(false);
    setEditing(false);
  };

  const handleToggleArchive = async () => {
    setSaving(true);
    await onSave(task.id, { archived: !task.archived });
    setSaving(false);
  };

  /** The copy for Monday and Jira (U5): the fields as a table, then the description as rendered. */
  const buildRichCopy = (): { html: string; text: string } => {
    const row = (label: string, value: string | null | undefined) =>
      value ? `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>` : "";
    const fields = [
      row("Assignee", task.assignee || "Unassigned"),
      row("Status", STATUS_OPTIONS.find((s) => s.value === task.status)?.label ?? task.status),
      row("Story Points", task.storyPoints != null ? String(task.storyPoints) : "—"),
      row("Module", task.module || "—"),
      row("Phase", task.phase),
      row("Depends On", deps.length ? deps.join(", ") : ""),
      row("Blocks", blocks.length ? blocks.join(", ") : ""),
      row("Risk", (task as any).risk),
      row("Critical", (task as any).critical ? "Yes" : ""),
      row("Files Scope", filesScope.length ? filesScope.join(", ") : ""),
      row("Spec Ref", (task as any).specRef),
      row("ERD Ref", (task as any).erdRef),
      row("Source", task.sourcePath),
    ].join("");
    const html = `<h2>${escapeHtml(`${code}: ${displayTitle}`)}</h2><table border="1" style="border-collapse:collapse"><tbody>${fields}</tbody></table>${markdownToHtml(task.description ?? "")}`;
    return { html, text: htmlToPlainText(html) };
  };

  const buildAgentPrompt = () => {
    const filesScopeStr = filesScope.length > 0 ? filesScope.join(", ") : "src/modules/{domain}/* (conceptual — no repo required)";
    const acStr = ac.length > 0 ? ac.map((a, i) => `${i + 1}. - [ ] ${a}`).join("\n") : "- [ ] Task completes as per Flow Logic";
    const desc = task.description || "";
    const flowMatch = desc.match(/###\s+Flow Logic[\s\S]*?((?:\d+\..*?\n)+)/i);
    const flow = flowMatch ? flowMatch[1].trim().slice(0, 1200) : desc.slice(0, 800);
    return `# Role: Senior ${(task.module || "Fullstack")} Developer — Task ${code}\n> Planner: Onesist (FSD → Spec → ERD → Task) — ready for external agent\n\n## Task\n**Code:** ${code}\n**Title:** ${displayTitle}\n**Module:** ${task.module || "—"} | **Phase:** ${task.phase || "—"} | **SP:** ${task.storyPoints ?? "—"} (${(task.storyPoints ?? 0) * 4}h) | **Risk:** ${(task as any).risk || "—"} | **Critical:** ${(task as any).critical ? "Yes" : "No"}\n\n## Files to modify\n${filesScopeStr}\n\n**Spec Ref:** ${(task as any).specRef || "—"}\n**ERD Ref:** ${(task as any).erdRef || "—"}\n**RTM Ref:** ${(task as any).rtmRef || "—"}\n\n## Dependencies\n- Depends On: ${deps.length > 0 ? deps.join(", ") : "—"}\n- Blocks: ${blocks.length > 0 ? blocks.join(", ") : "—"}\n\n## Steps — Flow Logic\n${flow}\n\n## Acceptance Criteria (Given-When-Then)\n${acStr}\n\n## Full Description\n${desc.slice(0, 3000)}\n`;
  };

  const handleCopy = async (kind: "rich" | "prompt") => {
    try {
      if (kind === "rich") await copyRich(buildRichCopy());
      else await navigator.clipboard.writeText(buildAgentPrompt());
      setCopied(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const copyBtn = (kind: "rich" | "prompt") => {
    const isCopied = copied === kind;
    const label = kind === "rich" ? "Copy" : "Copy Agent Prompt";
    const title = kind === "prompt" ? "Copy English prompt for external agent (one task per iteration)" : "Salin seperti tampilan — siap ditempel di Jira/Monday";
    return (
      <button
        onClick={() => handleCopy(kind)}
        className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors ${
          isCopied
            ? "border-green-500/40 text-green-400 bg-green-500/10"
            : kind === "prompt"
              ? "border-kumo-brand/40 text-kumo-brand hover:bg-kumo-brand/10"
              : "border-kumo-line text-kumo-subtle hover:text-kumo-default"
        }`}
        title={title}
      >
        <CopySimple size={11} className={isCopied ? "text-green-400" : kind === "prompt" ? "text-kumo-brand" : ""} />
        <span>{isCopied ? "Copied" : label}</span>
      </button>
    );
  };

  const contentMd = editing ? description : (task.description ?? "");

  return (
    <div className="flex flex-col min-h-0 max-h-[85vh] bg-kumo-base">


      {editing ? (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-kumo-line shrink-0">
            <DialogTitle className="text-xs font-medium text-kumo-default">Edit task</DialogTitle>
            <div className="flex gap-1">
              <button onClick={handleSave} disabled={saving}
                className="text-green-400 hover:text-green-300 transition-colors" title="Save">
                <Check size={14} />
              </button>
              <button onClick={() => setEditing(false)} className="text-kumo-subtle hover:text-kumo-default transition-colors" title="Close">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div>
              <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default outline-none focus:border-kumo-brand" />
            </div>
            <div>
              <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Content (markdown)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={16}
                className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default font-mono outline-none focus:border-kumo-brand resize-none leading-relaxed" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default outline-none focus:border-kumo-brand">
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Story Points</label>
                <input value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} type="number" min="0"
                  className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default outline-none focus:border-kumo-brand" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Phase</label>
                <input
                  value={phase}
                  onChange={(e) => setPhase(e.target.value)}
                  placeholder="e.g. Phase 1"
                  list="task-phases"
                  className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default outline-none focus:border-kumo-brand"
                />
                <datalist id="task-phases">
                  {phases.map((p) => <option key={p} value={p} />)}
                </datalist>
              </div>
              <div>
                <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Module</label>
                <input value={module_} onChange={(e) => setModule(e.target.value)} placeholder="e.g. auth"
                  className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default outline-none focus:border-kumo-brand" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Assignee</label>
              <input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Name"
                list="task-developers"
                className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default outline-none focus:border-kumo-brand"
              />
              <datalist id="task-developers">
                {developers.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-kumo-default cursor-pointer">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => setArchived(e.target.checked)}
                  className="rounded border-kumo-line text-kumo-brand focus:ring-kumo-brand"
                />
                <span>Archived</span>
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => onDelete(task.id)}
                className="flex-1 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-400/30 rounded transition-colors">
                Delete task
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-kumo-line shrink-0">
            <DialogTitle className="text-xs font-medium text-kumo-default">{code || "Task detail"}</DialogTitle>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)} className="text-kumo-subtle hover:text-kumo-default transition-colors" title="Edit">
                <PencilSimple size={13} />
              </button>
              <button onClick={onClose} className="text-kumo-subtle hover:text-kumo-default transition-colors" title="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-kumo-line shrink-0 space-y-1">
            <div className="text-sm font-medium text-kumo-default leading-snug">{displayTitle}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge(status)}
              {task.archived && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-400/90 bg-amber-500/10 border border-amber-500/30">
                  Archived
                </span>
              )}
              {task.storyPoints != null && (
                <span className="text-[10px] text-kumo-subtle font-mono">{task.storyPoints} SP</span>
              )}
              {task.assignee && (
                <span className="text-[10px] text-kumo-subtle">{task.assignee}</span>
              )}
              {task.module && (
                <span className="text-[10px] text-kumo-subtle bg-kumo-elevated/60 px-1.5 py-0.5 rounded">{task.module}</span>
              )}
            </div>
            {(task.phase || deps.length > 0 || blocks.length > 0 || filesScope.length > 0 || task.sourcePath || (task as any).specRef || (task as any).erdRef) && (
              <div className="space-y-0.5">
                {task.phase && <div className="text-[9px] text-kumo-subtle">Phase: {task.phase}</div>}
                {deps.length > 0 && <div className="text-[9px] text-kumo-subtle">Depends on: {deps.join(", ")}</div>}
                {blocks.length > 0 && <div className="text-[9px] text-kumo-subtle">Blocks: {blocks.join(", ")}</div>}
                {(task as any).risk && <div className="text-[9px] text-kumo-subtle">Risk: {(task as any).risk} {(task as any).critical ? "· Critical" : ""}</div>}
                {filesScope.length > 0 && <div className="text-[9px] text-kumo-subtle font-mono">Files: {filesScope.join(", ")}</div>}
                {(task as any).specRef && <div className="text-[9px] text-kumo-subtle font-mono">Spec: {(task as any).specRef}</div>}
                {(task as any).erdRef && <div className="text-[9px] text-kumo-subtle font-mono">ERD: {(task as any).erdRef}</div>}
                {task.sourcePath && <div className="text-[9px] text-kumo-subtle font-mono">{task.sourcePath}</div>}
              </div>
            )}
            <div className="flex items-center gap-1.5 pt-1 flex-wrap">
              {copyBtn("rich")}
              {copyBtn("prompt")}
              <button
                onClick={handleToggleArchive}
                disabled={saving}
                className="px-2 py-1 text-[10px] rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated transition-colors ml-auto"
                title={task.archived ? "Restore task to active" : "Archive task"}
              >
                {task.archived ? "Unarchive" : "Archive"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {contentMd ? (
              <div className="spec-markdown text-[13px] leading-relaxed p-3">
                <MarkdownViewer content={contentMd ?? ""} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-kumo-subtle italic p-3">
                No detail content available — click edit to write task spec.
              </div>
            )}
          </div>

          <div className="shrink-0 px-3 py-2 border-t border-kumo-line">
            <button onClick={() => onDelete(task.id)}
              className="w-full px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 border border-red-400/20 hover:border-red-400/50 rounded transition-colors">
              Delete task
            </button>
          </div>
        </>
      )}
    </div>
  );
}
