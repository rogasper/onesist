import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { MermaidImportDialog } from "./MermaidImportDialog";
import {
  createBrowserFrame,
  createMobileFrame,
  createFormPreset,
  createModalPreset,
  createStickyNote,
} from "./WireframePresets";
import { AppButton } from "~/components/ui/AppButton";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import {
  FloppyDisk,
  GitBranch,
  Layout,
  DownloadSimple,
  CheckCircle,
  Clock,
  DeviceMobile,
  Desktop,
  Textbox,
  NotePencil,
  Eraser,
  ArrowsOutSimple,
  ArrowsInSimple,
  Check,
} from "@phosphor-icons/react";

interface ExcalidrawInnerProps {
  initialContent: string | null;
  fileName: string;
  projectId: string;
  onSave: (content: string) => Promise<boolean> | boolean;
}

export default function ExcalidrawInner({
  initialContent,
  fileName,
  projectId,
  onSave,
}: ExcalidrawInnerProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isMermaidOpen, setIsMermaidOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const initialLoadedRef = useRef<string | null>(null);

  // Esc key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        e.preventDefault();
        e.stopPropagation();
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isFullscreen]);

  // Recalculate Excalidraw bounds when entering/exiting fullscreen
  useEffect(() => {
    const handleResize = () => {
      window.dispatchEvent(new Event("resize"));
      if (excalidrawAPI) {
        excalidrawAPI.refresh();
      }
    };
    const t1 = setTimeout(handleResize, 30);
    const t2 = setTimeout(handleResize, 120);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isFullscreen, excalidrawAPI]);

  // Detect theme from DOM (Kumo theme)
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(isDark ? "dark" : "light");

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      setTheme(dark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Parse initial content into scene
  useEffect(() => {
    if (!excalidrawAPI || initialContent === null) return;
    if (initialLoadedRef.current === initialContent) return;
    initialLoadedRef.current = initialContent;

    try {
      if (initialContent.trim().length > 0) {
        // If the file is markdown or raw mermaid, try to parse as mermaid
        if (
          fileName.endsWith(".mmd") ||
          (fileName.endsWith(".md") && !initialContent.trim().startsWith("{"))
        ) {
          const rawMermaid = initialContent.replace(/```mermaid\n?([\s\S]*?)```/, "$1").trim();
          parseMermaidToExcalidraw(rawMermaid).then((res) => {
            if (res.files && Object.keys(res.files).length > 0) {
              const fileList = Object.values(res.files).map((f: any) => ({
                id: f.id,
                dataURL: f.dataURL,
                mimeType: f.mimeType || "image/svg+xml",
                created: f.created || Date.now(),
                lastRetrieved: f.lastRetrieved || Date.now(),
              }));
              excalidrawAPI.addFiles(fileList);
            }
            if (res.elements) {
              const converted = convertToExcalidrawElements(res.elements);
              excalidrawAPI.updateScene({ elements: converted });
              excalidrawAPI.scrollToContent(converted, { fitToViewport: true });
            }
          }).catch(() => {
            // If fail, just ignore
          });
        } else {
          // Standard Excalidraw JSON format
          const parsed = JSON.parse(initialContent);
          const elements = parsed.elements || (Array.isArray(parsed) ? parsed : []);
          const appState = parsed.appState || {};
          const files = parsed.files || {};
          if (Object.keys(files).length > 0) {
            const fileList = Object.values(files).map((f: any) => ({
              id: f.id,
              dataURL: f.dataURL,
              mimeType: f.mimeType || "image/svg+xml",
              created: f.created || Date.now(),
              lastRetrieved: f.lastRetrieved || Date.now(),
            }));
            excalidrawAPI.addFiles(fileList);
          }
          const converted = convertToExcalidrawElements(elements);
          excalidrawAPI.updateScene({
            elements: converted,
            appState: { ...appState, theme },
          });
          excalidrawAPI.scrollToContent(converted, { fitToViewport: true });
        }
      } else {
        excalidrawAPI.resetScene();
      }
      setIsDirty(false);
    } catch (e) {
      console.warn("Failed to load initial sketch scene:", e);
    }
  }, [excalidrawAPI, initialContent, fileName, theme]);

  // Handle Save
  const handleSave = useCallback(async () => {
    if (!excalidrawAPI) return;
    setIsSaving(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const jsonStr = serializeAsJSON(elements, appState, files, "local");
      const ok = await onSave(jsonStr);
      if (ok) {
        setIsDirty(false);
        setLastSavedTime(new Date());
        initialLoadedRef.current = jsonStr;
      }
    } catch (err) {
      console.error("Failed to save sketch:", err);
    } finally {
      setIsSaving(false);
    }
  }, [excalidrawAPI, onSave]);

  // Handle Mermaid Import
  const handleMermaidImport = async (code: string, replaceExisting: boolean) => {
    if (!excalidrawAPI) return;
    const res = await parseMermaidToExcalidraw(code);
    if (!res || !res.elements) {
      throw new Error("No elements could be extracted from this Mermaid diagram.");
    }

    if (res.files && Object.keys(res.files).length > 0) {
      const fileList = Object.values(res.files).map((f: any) => ({
        id: f.id,
        dataURL: f.dataURL,
        mimeType: f.mimeType || "image/svg+xml",
        created: f.created || Date.now(),
        lastRetrieved: f.lastRetrieved || Date.now(),
      }));
      excalidrawAPI.addFiles(fileList);
    }

    const newElements = convertToExcalidrawElements(res.elements);
    if (replaceExisting) {
      excalidrawAPI.updateScene({ elements: newElements });
    } else {
      const current = excalidrawAPI.getSceneElements();
      // Calculate offset so new diagram doesn't overlap perfectly
      const maxY = current.reduce((max, el) => Math.max(max, el.y + el.height), 0);
      const offsetY = current.length > 0 ? maxY + 60 : 0;
      const shifted = newElements.map((el) => ({ ...el, y: el.y + offsetY }));
      excalidrawAPI.updateScene({ elements: [...current, ...shifted] });
    }

    excalidrawAPI.scrollToContent(newElements, { fitToViewport: true });
    setIsDirty(true);
  };

  // Insert Wireframe Presets
  const insertPreset = (type: "browser" | "mobile" | "form" | "modal" | "note") => {
    if (!excalidrawAPI) return;
    const current = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();

    // Center insertion on the viewport
    const centerX = -appState.scrollX + (window.innerWidth / 3);
    const centerY = -appState.scrollY + (window.innerHeight / 3);

    let rawElements: any[] = [];
    switch (type) {
      case "browser":
        rawElements = createBrowserFrame(centerX, centerY);
        break;
      case "mobile":
        rawElements = createMobileFrame(centerX, centerY);
        break;
      case "form":
        rawElements = createFormPreset(centerX, centerY);
        break;
      case "modal":
        rawElements = createModalPreset(centerX, centerY);
        break;
      case "note":
        rawElements = createStickyNote(centerX, centerY, "SA Note / Wireframe Annotation");
        break;
    }

    const converted = convertToExcalidrawElements(rawElements);
    excalidrawAPI.updateScene({ elements: [...current, ...converted] });
    excalidrawAPI.scrollToContent(converted);
    setIsDirty(true);
    setIsPresetsOpen(false);
  };

  // Export to PNG Blob / Download
  const handleExportPng = async () => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    const blob = await exportToBlob({
      elements,
      appState: { ...appState, exportWithDarkMode: theme === "dark" },
      files,
      mimeType: "image/png",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^/.]+$/, "")}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setIsExportOpen(false);
  };

  // Export to SVG / Download
  const handleExportSvg = async () => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    const svg = await exportToSvg({
      elements,
      appState: { ...appState, exportWithDarkMode: theme === "dark" },
      files,
    });

    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^/.]+$/, "")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    setIsExportOpen(false);
  };

  // Copy SVG / PNG to Clipboard
  const handleCopyToClipboard = async () => {
    if (!excalidrawAPI) return;
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportWithDarkMode: theme === "dark" },
        files,
        mimeType: "image/png",
      });

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setIsExportOpen(false);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    } catch (e) {
      console.error("Clipboard copy error:", e);
    }
  };

  // Clear Canvas confirmed action
  const handleConfirmClear = () => {
    if (!excalidrawAPI) return;
    excalidrawAPI.resetScene();
    setIsDirty(true);
    setIsClearDialogOpen(false);
  };

  const canvasContent = (
    <div
      className={`w-full h-full flex flex-col overflow-hidden bg-kumo-base ${
        isFullscreen
          ? "fixed inset-0 z-[99999] w-screen h-screen m-0 p-0 shadow-2xl"
          : "relative"
      }`}
    >
      {/* Top Toolbar Overlay */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-kumo-line bg-kumo-elevated/95 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          {isFullscreen && (
            <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-kumo-brand/20 text-kumo-brand border border-kumo-brand/30">
              Zen Mode
            </span>
          )}
          <span className="text-xs font-medium text-kumo-default truncate max-w-[200px]" title={fileName}>
            {fileName}
          </span>
          {isDirty ? (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium bg-amber-400/10 px-2 py-0.5 rounded">
              <Clock size={12} /> Unsaved
            </span>
          ) : lastSavedTime ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
              <CheckCircle size={12} /> Saved
            </span>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Import Mermaid */}
          <AppButton
            variant="chip"
            size="sm"
            onClick={() => setIsMermaidOpen(true)}
            icon={<GitBranch size={13} className="text-kumo-brand" />}
            className="px-2.5"
            title="Import Mermaid syntax into editable vector elements"
          >
            Import Mermaid
          </AppButton>

          {/* Wireframe Presets Dropdown */}
          <div className="relative">
            <AppButton
              variant="chip"
              size="sm"
              active={isPresetsOpen}
              onClick={() => {
                setIsPresetsOpen((p) => !p);
                setIsExportOpen(false);
              }}
              icon={<Layout size={13} className="text-blue-400" />}
              className="px-2.5"
            >
              Wireframes
            </AppButton>

            {isPresetsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg border border-kumo-line bg-kumo-elevated p-1 shadow-xl z-50 text-xs">
                <button
                  onClick={() => insertPreset("browser")}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  <Desktop size={14} className="text-indigo-400" /> Browser Window
                </button>
                <button
                  onClick={() => insertPreset("mobile")}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  <DeviceMobile size={14} className="text-emerald-400" /> Mobile Frame
                </button>
                <button
                  onClick={() => insertPreset("form")}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  <Textbox size={14} className="text-amber-400" /> Form Input Card
                </button>
                <button
                  onClick={() => insertPreset("modal")}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  <Layout size={14} className="text-purple-400" /> Dialog / Modal
                </button>
                <div className="my-1 border-t border-kumo-line" />
                <button
                  onClick={() => insertPreset("note")}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  <NotePencil size={14} className="text-yellow-400" /> Sticky Note
                </button>
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <AppButton
              variant="chip"
              size="sm"
              active={isExportOpen}
              onClick={() => {
                setIsExportOpen((p) => !p);
                setIsPresetsOpen(false);
              }}
              icon={<DownloadSimple size={13} />}
              className="px-2.5"
            >
              Export
            </AppButton>

            {isExportOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-kumo-line bg-kumo-elevated p-1 shadow-xl z-50 text-xs">
                <button
                  onClick={handleExportPng}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  Download PNG
                </button>
                <button
                  onClick={handleExportSvg}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  Download SVG
                </button>
                <button
                  onClick={handleCopyToClipboard}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors"
                >
                  Copy to Clipboard
                </button>
              </div>
            )}
          </div>

          {/* Copied Toast Indicator */}
          {copiedToast && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded animate-in fade-in">
              <Check size={12} /> Copied!
            </span>
          )}

          {/* Clear Scene */}
          <button
            type="button"
            onClick={() => setIsClearDialogOpen(true)}
            title="Clear canvas scene"
            className="p-1.5 text-kumo-subtle hover:text-amber-400 hover:bg-kumo-line rounded transition-colors"
          >
            <Eraser size={14} />
          </button>

          {/* Fullscreen Toggle */}
          <AppButton
            variant="chip"
            size="sm"
            active={isFullscreen}
            onClick={() => setIsFullscreen((p) => !p)}
            icon={isFullscreen ? <ArrowsInSimple size={13} /> : <ArrowsOutSimple size={13} />}
            className="px-2.5"
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen / Zen Mode (Esc to exit)"}
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </AppButton>

          {/* Save Button */}
          <AppButton
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            icon={<FloppyDisk size={13} />}
            className="px-3"
          >
            {isSaving ? "Saving…" : "Save"}
          </AppButton>
        </div>
      </div>

      {/* Excalidraw Canvas Area */}
      <div className="flex-1 w-full h-full relative">
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          theme={theme}
          onChange={() => {
            if (!isDirty && initialLoadedRef.current !== null) {
              setIsDirty(true);
            }
          }}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: true,
              clearCanvas: false,
              loadScene: false,
              saveAsImage: false,
              saveToActiveFile: false,
              toggleTheme: true,
            },
          }}
        />
      </div>

      {/* Mermaid Import Dialog */}
      <MermaidImportDialog
        open={isMermaidOpen}
        onClose={() => setIsMermaidOpen(false)}
        onImport={handleMermaidImport}
      />

      {/* Clear Canvas Confirmation Dialog */}
      <ConfirmDialog
        open={isClearDialogOpen}
        onOpenChange={setIsClearDialogOpen}
        title="Clear Canvas Scene"
        onConfirm={handleConfirmClear}
        confirmLabel="Clear Canvas"
        destructive
      >
        Are you sure you want to clear all elements from this canvas? Any unsaved drawings will be reset.
      </ConfirmDialog>
    </div>
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(canvasContent, document.body);
  }

  return canvasContent;
}
