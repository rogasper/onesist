import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Brain, FolderOpen, Warning, X } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo";
import { FileCard } from "~/components/chat/FileCard";
import { MemoryEditor } from "~/components/chat/MemoryPanel";
import { tabForPath, WorkspaceFiles } from "~/components/chat/WorkspacePanel";
import { relTime } from "~/lib/rel-time";
import { useMentionFiles, type ThreadDetail } from "~/lib/use-chat";

/**
 * The chat's side sheet: Berkas (what the project and this conversation touched) and Memori
 * (what the agent remembers). It covers the transcript and composer while open, so the
 * stream underneath keeps running, and it is opened from two buttons in the chat header.
 */

export type SidePanelView = "files" | "memory";

const MONO = "font-mono text-[0.8125rem]";

export function ChatSidePanel({
  view,
  detail,
  projectId,
  onClose,
}: {
  view: SidePanelView;
  detail: ThreadDetail;
  projectId: string;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Focus moves into the sheet so Escape reaches it, and so a keyboard user lands on it.
  useEffect(() => {
    rootRef.current?.focus();
  }, [view]);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="absolute inset-0 z-20 flex flex-col min-h-0 bg-kumo-base outline-none"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-kumo-line shrink-0">
        {view === "files" ? <FolderOpen size={14} className="text-kumo-subtle" /> : <Brain size={14} className="text-kumo-subtle" />}
        <span className="text-sm font-medium text-kumo-default">{view === "files" ? "Berkas" : "Memori"}</span>
        <Button variant="ghost" onClick={onClose} className="ml-auto" title="Tutup (Esc)" aria-label="Tutup">
          <X size={14} />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {view === "files" ? <FilesBody detail={detail} projectId={projectId} /> : <MemoryEditor projectId={projectId} />}
      </div>
    </div>
  );
}

function FilesBody({ detail, projectId }: { detail: ThreadDetail; projectId: string }) {
  const navigate = useNavigate();
  const { files } = useMentionFiles(projectId, detail.rootPath ?? null);
  const unattributed = detail.files.filter((f) => !f.messageId);
  const stale = detail.staleReads ?? [];

  return (
    <div className="grid gap-6 content-start">
      {stale.length ? (
        <Section title="Perlu perhatian" icon={<Warning size={13} className="text-amber-400" />}>
          <p className="text-xs text-kumo-subtle">Berubah di luar agent sejak terakhir dibaca — konteksnya bisa sudah tidak sesuai.</p>
          <div className="grid gap-0.5">
            {stale.map((r) => (
              <p key={r.path} className="flex items-center gap-2 text-sm">
                <span className={`${MONO} text-kumo-default truncate flex-1`} title={r.path}>
                  {r.path}
                </span>
                <span className="text-kumo-subtle shrink-0">{r.readAt ? `dibaca ${relTime(r.readAt)}` : ""}</span>
              </p>
            ))}
          </div>
        </Section>
      ) : null}

      {unattributed.length ? (
        <Section title={`${unattributed.length} berkas berubah`}>
          <p className="text-xs text-kumo-subtle">
            <span className="text-green-400">+{unattributed.reduce((n, f) => n + (f.linesAdded ?? 0), 0)}</span>{" "}
            <span className="text-red-400">−{unattributed.reduce((n, f) => n + (f.linesRemoved ?? 0), 0)}</span> · dari sebelum berkas punya
            penanda jawaban
          </p>
          <div className="grid gap-2">
            {unattributed.map((f) => (
              <FileCard key={f.id} file={f} root={detail.rootPath ?? null} projectId={projectId} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Semua berkas">
        <WorkspaceFiles
          files={files}
          changed={detail.files}
          onOpen={(filePath) => {
            // Router navigation, not `window.location.href` — a full page load would abort a
            // run that is still streaming in this panel.
            const tab = tabForPath(filePath);
            navigate({ to: (tab ? `/projects/$id/${tab}` : "/projects/$id") as any, params: { id: projectId } } as any);
          }}
        />
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
