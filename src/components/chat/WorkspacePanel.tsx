import { useMemo, useState } from "react";
import { FileTree, type FileTreeSection } from "~/components/ui/FileTree";
import type { ThreadFile } from "~/lib/use-chat";

/**
 * The project's file tree, shown in the chat's Berkas sheet (ChatSidePanel).
 *
 * The "changed in this conversation" filter is the reason this view is worth its
 * space at all: the changed-files section already lists what the agent touched,
 * but only this tree can answer "and where does that sit among the other artifacts".
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

export function WorkspaceFiles({ files, changed, onOpen }: Props) {
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

  return (
    <div className="grid gap-2">
      <div className="flex w-fit rounded-lg ring ring-kumo-line p-0.5">
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
      <FileTree
        sections={sections}
        emptyText={changedOnly ? "Tidak ada berkas yang berubah di percakapan ini." : "Project ini belum punya berkas artefak."}
        onFileClick={(file) => onOpen(file.path)}
      />
    </div>
  );
}
