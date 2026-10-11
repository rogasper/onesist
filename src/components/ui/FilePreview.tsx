import type { ReactNode } from "react";
import { ArrowSquareOut, FileText } from "@phosphor-icons/react";
import { inDesktopShell, openWithOs } from "~/lib/desktop-shell";

/**
 * Shows one project file in the viewer that fits it: PDF in the WebView's own viewer, a picture
 * as an image, and text in the caller's editor. Office and archive files are not text, so they
 * get a note and a way to open them in their own app, instead of being read as garbage.
 */

export type PreviewKind = "text" | "pdf" | "image" | "binary";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]);
const BINARY_EXT = new Set([".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".zip", ".epub", ".key", ".numbers"]);

export function previewKindOf(path: string): PreviewKind {
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
  if (ext === ".pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  if (BINARY_EXT.has(ext)) return "binary";
  return "text";
}

/** Project file bytes through the raw route (PDF and pictures only). */
export function rawFileUrl(path: string, projectId: string): string {
  return `/api/files/raw?path=${encodeURIComponent(path)}&projectId=${encodeURIComponent(projectId)}`;
}

interface FilePreviewProps {
  path: string;
  projectId: string;
  /** Absolute project root, for "open in another app" on the desktop. */
  root?: string | null;
  /** The text viewer, used only for text files. */
  text: ReactNode;
}

export function FilePreview({ path, projectId, root, text }: FilePreviewProps) {
  const kind = previewKindOf(path);
  const name = path.split("/").pop() ?? path;
  const absolute = root ? `${root.replace(/[/\\]+$/, "")}/${path}` : null;
  const canOpenOs = !!absolute && inDesktopShell();

  if (kind === "text") return <>{text}</>;

  const openButton = canOpenOs ? (
    <button
      type="button"
      onClick={() => void openWithOs(absolute!, "open")}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-kumo-line/80 text-xs text-kumo-default hover:border-kumo-brand/50 transition-colors shrink-0"
    >
      <ArrowSquareOut size={12} />
      Buka di aplikasi lain
    </button>
  ) : null;

  if (kind === "pdf") {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-kumo-line/50 shrink-0">
          <span className="text-xs text-kumo-subtle truncate min-w-0 flex-1" title={path}>{path}</span>
          {openButton}
        </div>
        <iframe src={rawFileUrl(path, projectId)} title={name} className="flex-1 min-h-0 w-full border-0 bg-kumo-base" />
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-kumo-line/50 shrink-0">
          <span className="text-xs text-kumo-subtle truncate min-w-0 flex-1" title={path}>{path}</span>
          {openButton}
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
          <img src={rawFileUrl(path, projectId)} alt={name} className="max-w-full h-auto object-contain" />
        </div>
      </div>
    );
  }

  // binary: nothing to show inside the app; the file opens in the app that owns it.
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
      <FileText size={28} className="text-kumo-subtle" />
      <div className="text-sm text-kumo-default">{name}</div>
      <p className="text-xs text-kumo-subtle max-w-sm">
        Berkas ini tidak ditampilkan di dalam aplikasi.{canOpenOs ? "" : " Buka aplikasi desktop untuk membukanya di aplikasi lain."}
      </p>
      {openButton}
    </div>
  );
}
