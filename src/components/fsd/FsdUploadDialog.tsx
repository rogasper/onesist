import { useState, useRef } from "react";
import { X, UploadSimple, FileArrowUp, CheckCircle, XCircle } from "@phosphor-icons/react";

interface FsdUploadDialogProps {
  projectId: string;
  onClose: () => void;
  onUploaded: (session: any) => void;
}

const ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xls,.txt,.md,.html,.htm,.csv,.json,.xml,.epub,.png,.jpg,.jpeg,.gif,.webp";

export function FsdUploadDialog({ projectId, onClose, onUploaded }: FsdUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filename: btoa(file.name),
        title: title || file.name.replace(/\.[a-z0-9]+$/i, ""),
      });
      const res = await fetch(`/api/projects/${projectId}/fsd/upload?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        setUploading(false);
        return;
      }
      setDone(true);
      setUploading(false);
      onUploaded(data);
    } catch {
      setError("Upload failed — check server connection");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative w-96 rounded-lg border border-kumo-line bg-kumo-elevated p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-kumo-default">Upload document</span>
          <button onClick={onClose} className="text-kumo-subtle hover:text-kumo-default"><X size={14} /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={28} className="text-green-400 mb-2" />
            <p className="text-xs text-kumo-default">File uploaded</p>
            <p className="text-[10px] text-kumo-subtle mt-1">
              The original is saved under <code className="text-[9px] bg-kumo-elevated px-1 rounded">input/fsd/sources/</code>.
            </p>
            <p className="text-[10px] text-kumo-subtle mt-3">Select it from the FSD list to review or convert it later.</p>
          </div>
        ) : (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              className="border border-dashed border-kumo-line rounded-lg p-6 text-center cursor-pointer hover:border-kumo-brand transition-colors"
            >
              <FileArrowUp size={24} className="mx-auto text-kumo-subtle mb-2" />
              {file ? (
                <div>
                  <p className="text-xs text-kumo-default truncate">{file.name}</p>
                  <p className="text-[10px] text-kumo-subtle mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB — click to change</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-kumo-default">Click to choose a file</p>
                  <p className="text-[10px] text-kumo-subtle mt-1">PDF, DOCX, PPTX, XLSX, MD, images…</p>
                </div>
              )}
            </div>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />

            <div className="mt-3">
              <label className="text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">Title (optional)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={file ? file.name.replace(/\.[a-z0-9]+$/i, "") : "e.g. Customer Registration FSD"}
                className="w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1.5 text-xs text-kumo-default outline-none focus:border-kumo-brand"
              />
            </div>

            <p className="text-[10px] text-kumo-subtle mt-3 leading-relaxed">
              The original file is saved under <code className="text-[9px] bg-kumo-elevated px-1 rounded">input/fsd/sources/</code>.
              Non-Markdown files can be converted to editable Markdown afterwards with a
              manual <b>Convert to Markdown</b> action (opencode + markitdown skill).
            </p>

            {error && <p className="text-[10px] text-red-400 mt-2">{error}</p>}

            <div className="flex gap-2 mt-4">
              <button onClick={onClose} className="flex-1 px-3 py-1.5 text-xs text-kumo-subtle hover:text-kumo-default border border-kumo-line rounded transition-colors">
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-kumo-brand rounded hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <UploadSimple size={12} className={uploading ? "animate-pulse" : ""} />
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
