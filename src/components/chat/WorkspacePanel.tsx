import { useMemo, useState } from "react";
import { CaretRight, FolderOpen } from "@phosphor-icons/react";
import { FileTree, type FileTreeSection } from "~/components/ui/FileTree";
import type { ThreadFile } from "~/lib/use-chat";

/**
 * Workspace browser inside the chat panel (PRD §11).
 *
 * Scope note: the PRD describes this as a `FileTree` *beside* the chat. The chat
 * is a right-docked panel roughly 460px wide, so a permanently visible column
 * would leave neither the transcript nor the tree readable. It is therefore a
 * collapsible section that takes the top of the panel while open, and gives the
 * space back when closed — the same tree component, the same `input/` + `output/`
 * roots, just placed where it does not fight the transcript for width.
 *
 * The "changed in this conversation" filter is the reason this panel is worth its
 * space at all: the changed-files card already lists what the agent touched, but
 * only this view can answer "and where does that sit among the other artifacts".
 */

interface Props {
  files: { name: string; path: string }[];
  changed: ThreadFile[];
  /** Opens the file's own tab — the panel does not render artifact viewers. */
  onOpen: (path: string) => void;
}

/** Tab for a workspace path. Kept local on purpose: `lib/file-router`'s
 *  `detectRoute` reads the filesystem, so it cannot be pulled into the client
 *  bundle. The mapping mirrors the one the server uses for `route` badges. */
export function tabForPath(path: string): string | null {
  if (path.startsWith("input/fsd/")) return "fsd";
  if (path.startsWith("output/erd/")) return "erd";
  if (path.startsWith("output/spec/") || path.startsWith("output/api/")) return "spec";
  if (path.startsWith("output/task/")) return "tasks";
  if (path.startsWith("output/sit/")) return "sit";
  if (path.startsWith("output/rtm/")) return "rtm";
  if (path.startsWith("output/td/")) return "docs";
  if (path.startsWith("input/uploads/")) return null;
  if (/\.dbml$/i.test(path)) return "erd";
  if (/^MASTER_SPEC_API\.md$/i.test(path)) return "spec";
  if (/^MASTER_ERD\.md$/i.test(path)) return "erd";
  if (/^MASTER_.*\.md$/i.test(path)) return "docs";
  return null;
}

export function WorkspacePanel({ files, changed, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [changedOnly, setChangedOnly] = useState(false);

  const changedPaths = useMemo(() => new Set(changed.map((f) => f.path)), [changed]);

  const sections = useMemo<FileTreeSection[]>(() => {
    const visible = changedOnly ? files.filter((f) => changedPaths.has(f.path)) : files;
    const group = (prefix: string) =>
      visible
        .filter((f) => f.path.startsWith(`${prefix}/`))
        .map((f) => ({ name: f.name, path: f.path, size: 0 }));
    const roots = visible
      .filter((f) => !f.path.includes("/"))
      .map((f) => ({ name: f.name, path: f.path, size: 0 }));
    return [
      { dir: "input", files: group("input") },
      { dir: "output", files: group("output") },
      ...(roots.length ? [{ dir: ".", files: roots }] : []),
    ].filter((s) => s.files.length > 0);
  }, [files, changedOnly, changedPaths]);

  const total = files.length;
  const changedCount = changed.filter((f) => files.some((x) => x.path === f.path)).length;

  return (
    <div className="border-b border-kumo-line shrink-0">
      <div className="mx-auto w-full max-w-3xl px-6">
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-kumo-default hover:text-kumo-brand"
            title="Telusuri berkas project"
          >
            <CaretRight size={11} className={`text-kumo-subtle ${open ? "rotate-90" : ""}`} />
            <FolderOpen size={13} className="text-kumo-subtle" />
            Berkas
            <span className="text-kumo-subtle">
              {total} · {changedCount} berubah
            </span>
          </button>
          {open ? (
            <div className="ml-auto flex rounded-lg ring ring-kumo-line p-0.5">
              {[
                { value: false, label: "Semua" },
                { value: true, label: "Berubah" },
              ].map((o) => (
                <button
                  key={String(o.value)}
                  onClick={() => setChangedOnly(o.value)}
                  className={`rounded-md px-2 py-0.5 text-xs ${
                    changedOnly === o.value ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mx-auto w-full max-w-3xl px-6 pb-2 max-h-64 overflow-y-auto">
          <FileTree
            sections={sections}
            emptyText={changedOnly ? "Tidak ada berkas yang berubah di percakapan ini." : "Project ini belum punya berkas artefak."}
            onFileClick={(file) => onOpen(file.path)}
          />
        </div>
      ) : null}
    </div>
  );
}
