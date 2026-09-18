import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  Cube,
  Database,
  FileCode,
  FileCsv,
  FileDoc,
  FileHtml,
  FileImage,
  FilePdf,
  FilePpt,
  FileSql,
  FileText,
  FileXls,
  FolderSimple,
  type Icon,
} from "@phosphor-icons/react";
import { ArtifactPreview } from "~/components/chat/ArtifactPreview";
import type { ThreadFile } from "~/lib/use-chat";

/**
 * A file the agent wrote, shown as its own card (UJI-MANUAL C9b).
 *
 * The reference the user gave is the document card of a desktop AI assistant:
 * a type icon in a tinted square, the file name, a `kind · FORMAT` subtitle, and
 * a split "Open ⌄" button whose caret holds the alternatives. It replaces the
 * previous row of plain text links (`ERD · Buka · Finder`), which was there but
 * unreadable as a set of actions — asked directly, the user did not find them.
 *
 * Cards appear in the transcript at the end of the answer that wrote them, and
 * (for files recorded before the ledger knew which turn wrote them) in the
 * thread-level section above the composer. Both places render this component, so
 * a file always looks and behaves the same.
 */

/** Artifact tab for a ledger route. Mirrors what the route renders; kept here so
 *  every card can offer "open where it belongs" without a lookup table per
 *  surface. `timeline` is a view inside the Tasks tab, hence the duplicate. */
const ROUTE_TO_TAB: Record<string, { tab: string; label: string }> = {
  erd: { tab: "erd", label: "ERD" },
  spec: { tab: "spec", label: "API Spec" },
  task: { tab: "tasks", label: "Tasks" },
  td: { tab: "docs", label: "Docs" },
  rtm: { tab: "rtm", label: "Traceability" },
  sit: { tab: "sit", label: "SIT" },
  timeline: { tab: "tasks", label: "Timeline" },
  fsd: { tab: "fsd", label: "FSD" },
  sketch: { tab: "canvas", label: "Canvas" },
};

/** Subtitle half: what the file IS. Falls back to "Berkas" for anything the
 *  ledger could not classify, and to "Lampiran" for a file the user attached. */
const ROUTE_KIND: Record<string, string> = {
  erd: "ERD",
  spec: "API Spec",
  fsd: "FSD",
  td: "Dokumentasi",
  report: "Laporan",
  rtm: "Traceability",
  sit: "SIT",
  task: "Task",
  timeline: "Timeline",
  sketch: "Canvas",
  master: "Master",
};

/** Icon + colour per extension. Deliberately by EXTENSION, not by route: two
 *  `.md` artifacts from different tabs are the same kind of thing to look at. */
function look(ext: string): { Icon: Icon; tone: string } {
  switch (ext) {
    case ".dbml":
    case ".sql":
      return { Icon: Database, tone: "bg-sky-400/10 text-sky-400" };
    case ".md":
      return { Icon: FileText, tone: "bg-violet-400/10 text-violet-300" };
    case ".json":
    case ".yaml":
    case ".yml":
      return { Icon: FileCode, tone: "bg-amber-400/10 text-amber-400" };
    case ".csv":
    case ".xlsx":
    case ".xls":
      return { Icon: FileCsv, tone: "bg-emerald-400/10 text-emerald-400" };
    case ".pdf":
      return { Icon: FilePdf, tone: "bg-red-400/10 text-red-400" };
    case ".docx":
    case ".doc":
      return { Icon: FileDoc, tone: "bg-blue-400/10 text-blue-400" };
    case ".ppt":
    case ".pptx":
      return { Icon: FilePpt, tone: "bg-orange-400/10 text-orange-400" };
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".svg":
    case ".gif":
    case ".webp":
      return { Icon: FileImage, tone: "bg-pink-400/10 text-pink-400" };
    case ".html":
      return { Icon: FileHtml, tone: "bg-orange-400/10 text-orange-400" };
    case ".excalidraw":
    case ".mmd":
      return { Icon: Cube, tone: "bg-teal-400/10 text-teal-400" };
    default:
      return { Icon: FileText, tone: "bg-kumo-tint text-kumo-subtle" };
  }
}

/** Inside the Tauri shell? Same check the rest of the app uses — the OS actions
 *  below have no meaning in a browser build. */
const inDesktopShell = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Absolute path of a workspace-relative file, or null when the root is unknown. */
function absolutePathOf(root: string | null, rel: string): string | null {
  if (!root) return null;
  return `${root.replace(/[/\\]+$/, "")}/${rel}`;
}

const OP_NOTE: Record<ThreadFile["op"], string | null> = {
  create: "baru",
  update: null, // the common case adds nothing worth reading
  delete: "dihapus",
  rename: "dipindah",
};

export function FileCard({ file, root, projectId }: { file: ThreadFile; root: string | null; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"diff" | "content">("diff");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const ext = extensionOf(file.path);
  const { Icon, tone } = look(ext);
  const tab = file.route ? ROUTE_TO_TAB[file.route] : undefined;
  const opNote = OP_NOTE[file.op];
  const kind =
    (file.route ? ROUTE_KIND[file.route] : undefined) ?? (file.path.startsWith("input/uploads/") ? "Lampiran" : "Berkas");
  const abs = file.op === "delete" ? null : absolutePathOf(root, file.path);
  const canOsOpen = !!abs && inDesktopShell();
  const diff = file.diffJson ?? null;
  const canPreview = file.op !== "delete";

  /** Open with the OS default app / reveal in the file manager. Desktop only:
   *  a web build has no such channel, and the tab link stays the way to look. */
  async function openWithOs(mode: "open" | "reveal") {
    if (!abs || !inDesktopShell()) return;
    setMenu(false);
    try {
      const mod = await import("@tauri-apps/plugin-opener");
      if (mode === "open") await mod.openPath(abs);
      else await mod.revealItemInDir(abs);
    } catch {
      /* the OS refused (no handler for the type, permission) — the file is still
         reachable from its tab or from the workspace panel */
    }
  }

  function runAction(action: "tab" | "os" | "expand") {
    setMenu(false);
    if (action === "tab" && tab) {
      // Router navigation, NOT an `<a href>`: a full page load remounts the app,
      // closes the chat panel, and aborts this thread's stream.
      navigate({ to: `/projects/$id/${tab.tab}` as any, params: { id: projectId } } as any);
      return;
    }
    if (action === "os") {
      void openWithOs("open");
      return;
    }
    setView(diff ? "diff" : "content");
    setOpen(true);
  }

  const primary: "tab" | "os" | "expand" = tab ? "tab" : canOsOpen ? "os" : "expand";
  const primaryLabel = primary === "expand" ? "Lihat" : "Buka";
  const primaryTitle =
    primary === "tab"
      ? `Buka di tab ${tab!.label}`
      : primary === "os"
        ? `Buka ${basename(file.path)} dengan aplikasi default`
        : "Tampilkan berkas ini di sini";

  /** Menu entries, in the order they are useful. Only actions that exist here
   *  are offered — a web build has no Finder, a file with no route has no tab,
   *  and a deletion has nothing to preview. */
  const items: { label: string; icon: Icon; run: () => void }[] = [];
  if (tab) items.push({ label: `Buka di tab ${tab.label}`, icon: ArrowSquareOut, run: () => runAction("tab") });
  if (canOsOpen) {
    items.push({ label: "Buka dengan aplikasi default", icon: ArrowSquareOut, run: () => runAction("os") });
    items.push({ label: "Tampilkan di Finder", icon: FolderSimple, run: () => void openWithOs("reveal") });
  }
  if (diff) {
    items.push({
      label: "Lihat perubahan",
      icon: FileCode,
      run: () => {
        setView("diff");
        setOpen(true);
        setMenu(false);
      },
    });
  }
  if (canPreview) {
    items.push({
      label: "Lihat isi",
      icon: FileText,
      run: () => {
        setView("content");
        setOpen(true);
        setMenu(false);
      },
    });
  }

  return (
    <div className="rounded-xl ring ring-kumo-line bg-kumo-base overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className={`grid place-items-center size-9 shrink-0 rounded-lg ${tone}`}>
          <Icon size={17} weight="fill" />
        </span>

        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" title={file.path}>
          <span className="flex items-center gap-1.5 min-w-0">
            {/* Expand affordance, the same caret the file tree uses — without it
                the file name reads as a label and nobody finds the diff. */}
            <CaretRight size={10} weight="bold" className={`shrink-0 text-kumo-subtle transition-transform ${open ? "rotate-90" : ""}`} />
            <span className="truncate text-sm font-medium text-kumo-default">{basename(file.path)}</span>
          </span>
          <span className="block truncate pl-4 text-xs text-kumo-subtle">
            {kind} · {ext ? ext.slice(1).toUpperCase() : "FILE"}
            {opNote ? ` · ${opNote}` : ""}
          </span>
        </button>

        <div className="relative shrink-0" ref={menuRef}>
          <div className="flex items-center rounded-lg ring ring-kumo-line">
            <button
              onClick={() => runAction(primary)}
              title={primaryTitle}
              className="h-7 pl-2.5 pr-2 text-xs font-medium text-kumo-default hover:bg-kumo-tint rounded-l-lg"
            >
              {primaryLabel}
            </button>
            <button
              onClick={() => setMenu((v) => !v)}
              title="Pilihan lain"
              aria-label="Pilihan lain"
              aria-expanded={menu}
              className="h-7 px-1 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default border-l border-kumo-line rounded-r-lg"
            >
              <CaretDown size={11} weight="bold" />
            </button>
          </div>

          {menu ? (
            // Right-anchored: the panel is docked on the right edge of the window,
            // so a wide menu opened leftward stays inside the viewport.
            <div className="absolute bottom-full right-0 mb-1.5 z-30 w-56 rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-1.5">
              {items.length ? (
                items.map((it) => (
                  <button
                    key={it.label}
                    onClick={it.run}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-kumo-default hover:bg-kumo-elevated"
                  >
                    <it.icon size={13} className="text-kumo-subtle shrink-0" />
                    <span className="truncate">{it.label}</span>
                  </button>
                ))
              ) : (
                <p className="px-2.5 py-1.5 text-sm text-kumo-subtle">Tidak ada aksi untuk berkas ini.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="border-t border-kumo-line/60 px-3 py-2 grid gap-2">
          {/* Two views of the same file, never both at once: the panel is ~460px
              wide, and stacking a diff under a preview buries the transcript. */}
          <div className="flex rounded-lg ring ring-kumo-line p-0.5 w-fit">
            {(diff ? (["diff", "content"] as const) : (["content"] as const)).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2 py-0.5 text-xs ${view === v ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated"}`}
              >
                {v === "diff" ? "Perubahan" : "Isi"}
              </button>
            ))}
          </div>
          {view === "diff" && diff ? (
            <pre className="font-mono text-[0.8125rem] max-h-56 overflow-auto rounded-lg ring ring-kumo-line px-2.5 py-2 bg-kumo-recessed">
              {diff.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+")
                      ? "text-green-400"
                      : line.startsWith("-")
                        ? "text-red-400"
                        : line.startsWith("@@")
                          ? "text-kumo-brand"
                          : "text-kumo-subtle"
                  }
                >
                  {line || " "}
                </div>
              ))}
            </pre>
          ) : (
            <ArtifactPreview path={file.path} route={file.route} projectId={projectId} />
          )}
        </div>
      ) : null}
    </div>
  );
}
