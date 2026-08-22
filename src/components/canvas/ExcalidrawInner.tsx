import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
  convertToExcalidrawElements,
  restore,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { MermaidImportDialog } from "./MermaidImportDialog";
import { IconPicker } from "./IconPicker";
import {
  createBrowserFrame,
  createMobileFrame,
  createFormPreset,
  createModalPreset,
  createStickyNote,
} from "./WireframePresets";
import {
  createTechNode,
  createPostgresNode,
  createRedisNode,
  createBunNode,
  createReactNode,
  createTauriNode,
  createKafkaNode,
  createDockerNode,
  createNginxNode,
  createC4SystemBox,
  createVpcFrame,
  createMicroserviceLane,
} from "./ArchPresets";
import { resolveTechIcon } from "~/lib/arch-icons/tech-keyword-map";
import { getIconDataUrl } from "~/lib/arch-icons/registry";
import type { IconShape } from "~/lib/arch-icons/types";
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
  Sparkle,
  Shapes,
} from "@phosphor-icons/react";

interface ExcalidrawInnerProps {
  initialContent: string | null;
  fileName: string;
  projectId: string;
  onSave: (content: string) => Promise<boolean> | boolean;
}

function isMermaidText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return (
    /^(graph\s+[A-Za-z]+|flowchart\s+[A-Za-z]+|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline)\b/m.test(
      trimmed
    ) ||
    /^\s*(subgraph\s+|actor\s+|participant\s+|autonumber|section\s+)/m.test(trimmed)
  );
}

function sanitizeElements(elements: any[]): any[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((el) => {
    if (!el || typeof el !== "object") return el;
    // Excalidraw fractional indexing keys always follow a strict format (e.g. "a0", "a1", "a0V").
    // Non-standard index keys (like "zsepr", "z00bgr", etc.) will cause Excalidraw's validator to throw "invalid order key".
    // Removing the invalid `index` lets restore() generate fresh, valid fractional indices for all elements.
    const isStandardIndex =
      typeof el.index === "string" &&
      /^a[0-9a-zA-Z]{1,8}$/.test(el.index);

    if (!isStandardIndex && el.index !== undefined) {
      const copy = { ...el };
      delete copy.index;
      return copy;
    }
    return el;
  });
}

function getValidBackgroundColor(savedBg: string | undefined, theme: "dark" | "light"): string {
  if (!savedBg || savedBg === "transparent") {
    return theme === "dark" ? "#121212" : "#ffffff";
  }
  if (theme === "light" && (savedBg === "#121212" || savedBg === "#000000" || savedBg === "#1e1e1e")) {
    return "#ffffff";
  }
  return savedBg;
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
  const [isArchPresetsOpen, setIsArchPresetsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [compileToast, setCompileToast] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isCompilingMermaid, setIsCompilingMermaid] = useState(false);
  const [isPlantUmlLoading, setIsPlantUmlLoading] = useState(false);
  const [detectedMermaidCount, setDetectedMermaidCount] = useState(0);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const isInitialMountRef = useRef(true);

  const initialData = useMemo(() => {
    if (!initialContent || initialContent.trim().length === 0) {
      return {
        elements: [],
        appState: {
          isLoading: false,
          errorMessage: null,
          theme,
          viewBackgroundColor: theme === "dark" ? "#121212" : "#ffffff",
        },
        files: {},
      };
    }
    try {
      if (
        fileName.endsWith(".mmd") ||
        (fileName.endsWith(".md") && !initialContent.trim().startsWith("{"))
      ) {
        return undefined;
      }
      const parsed = JSON.parse(initialContent);
      const rawElements = parsed.elements || (Array.isArray(parsed) ? parsed : []);
      const cleanElements = sanitizeElements(rawElements);
      const restored = restore(
        { ...parsed, elements: cleanElements },
        null,
        null,
        { repairBindings: true }
      );
      const bgColor = getValidBackgroundColor(restored.appState?.viewBackgroundColor, theme);
      return {
        elements: restored.elements,
        appState: {
          ...restored.appState,
          isLoading: false,
          errorMessage: null,
          theme,
          viewBackgroundColor: bgColor,
        },
        files: restored.files || {},
      };
    } catch (e) {
      console.warn("Failed to restore canvas JSON:", e);
      return {
        elements: [],
        appState: {
          isLoading: false,
          errorMessage: null,
          theme,
          viewBackgroundColor: theme === "dark" ? "#121212" : "#ffffff",
        },
        files: {},
      };
    }
  }, [initialContent, fileName, theme]);

  const checkMermaidElements = useCallback((elements: readonly any[]) => {
    const count = elements.filter(
      (el) => el.type === "text" && !el.isDeleted && isMermaidText((el as any).text || (el as any).originalText || "")
    ).length;
    setDetectedMermaidCount(count);
  }, []);

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
    const isDark =
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(isDark ? "dark" : "light");

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      setTheme(dark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Initialize scene on API ready / file mount
  useEffect(() => {
    if (!excalidrawAPI) return;

    if (
      initialContent &&
      (fileName.endsWith(".mmd") ||
        (fileName.endsWith(".md") && !initialContent.trim().startsWith("{")))
    ) {
      const rawMermaid = initialContent.replace(/```mermaid\n?([\s\S]*?)```/, "$1").trim();
      parseMermaidToExcalidraw(rawMermaid)
        .then((res) => {
          if (res.files && Object.keys(res.files).length > 0) {
            const fileList = Object.values(res.files).map((f: any) => ({
              id: f.id,
              dataURL: f.dataURL,
              mimeType: f.mimeType || "image/svg+xml",
              created: f.created || Date.now(),
              lastRetrieved: f.lastRetrieved || Date.now(),
            }));
            excalidrawAPI.addFiles(fileList as any);
          }
          if (res.elements) {
            const converted = convertToExcalidrawElements(res.elements as any) as any;
            excalidrawAPI.updateScene({
              elements: converted,
              appState: {
                isLoading: false,
                errorMessage: null,
                theme,
                viewBackgroundColor: theme === "dark" ? "#121212" : "#ffffff",
              },
            });
            setTimeout(() => {
              excalidrawAPI.scrollToContent(converted, { fitToViewport: true });
            }, 60);
            checkMermaidElements(converted);
          }
        })
        .catch(() => {
          excalidrawAPI.updateScene({
            appState: { isLoading: false, theme },
          });
        });
      return;
    }

    if (initialData) {
      if (initialData.files && Object.keys(initialData.files).length > 0) {
        const fileList = Object.values(initialData.files).map((f: any) => ({
          id: f.id,
          dataURL: f.dataURL,
          mimeType: f.mimeType || "image/svg+xml",
          created: f.created || Date.now(),
          lastRetrieved: f.lastRetrieved || Date.now(),
        }));
        excalidrawAPI.addFiles(fileList as any);
      }

      excalidrawAPI.updateScene({
        elements: initialData.elements,
        appState: {
          ...initialData.appState,
          isLoading: false,
          errorMessage: null,
          theme,
        } as any,
      });

      checkMermaidElements(initialData.elements || []);

      if (initialData.elements && initialData.elements.length > 0) {
        const timer = setTimeout(() => {
          excalidrawAPI.scrollToContent(initialData.elements, { fitToViewport: true });
        }, 60);
        return () => clearTimeout(timer);
      } else {
        setDetectedMermaidCount(0);
      }
    }
  }, [excalidrawAPI, fileName, initialContent, initialData, theme, checkMermaidElements]);

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
      }
    } catch (err) {
      console.error("Failed to save sketch:", err);
    } finally {
      setIsSaving(false);
    }
  }, [excalidrawAPI, onSave]);

  // Handle Mermaid Import from Dialog
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
      excalidrawAPI.addFiles(fileList as any);
    }

    let newElements: any[] = convertToExcalidrawElements(res.elements as any) as any;
    try {
      const enriched = await enrichMermaidWithIcons(newElements);
      // enrich adds image elements and files via addFiles internally
      if (enriched.length > newElements.length) newElements = enriched;
    } catch {}
    if (replaceExisting) {
      excalidrawAPI.updateScene({ elements: newElements });
    } else {
      const current = excalidrawAPI.getSceneElements();
      const maxY = current.reduce((max, el) => Math.max(max, el.y + el.height), 0);
      const offsetY = current.length > 0 ? maxY + 60 : 0;
      const shifted = newElements.map((el) => ({ ...el, y: el.y + offsetY }));
      excalidrawAPI.updateScene({ elements: [...current, ...shifted] });
    }

    excalidrawAPI.scrollToContent(newElements, { fitToViewport: true });
    setIsDirty(true);
    checkMermaidElements(excalidrawAPI.getSceneElements());
  };

  // Compile Mermaid text elements on the canvas into interactive vector diagrams
  const handleCompileMermaid = async () => {
    if (!excalidrawAPI) return;
    setIsCompilingMermaid(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const mermaidTexts = elements.filter(
        (el) => el.type === "text" && !el.isDeleted && isMermaidText((el as any).text || (el as any).originalText || "")
      );
      if (mermaidTexts.length === 0) return;

      let updatedElements = [...elements];
      const newFiles: any[] = [];
      let compiledCount = 0;

      for (const textEl of mermaidTexts) {
        try {
          const anyEl = textEl as any;
          const rawCode = (anyEl.text || anyEl.originalText || "").trim();
          const res = await parseMermaidToExcalidraw(rawCode);
          if (res && res.elements && res.elements.length > 0) {
            if (res.files && Object.keys(res.files).length > 0) {
              const fileList = Object.values(res.files).map((f: any) => ({
                id: f.id,
                dataURL: f.dataURL,
                mimeType: f.mimeType || "image/svg+xml",
                created: f.created || Date.now(),
                lastRetrieved: f.lastRetrieved || Date.now(),
              }));
              newFiles.push(...fileList);
            }

            const minX = Math.min(...res.elements.map((e: any) => e.x));
            const minY = Math.min(...res.elements.map((e: any) => e.y));

            const offsetX = anyEl.x - minX;
            const offsetY = anyEl.y - minY;
            const converted = (convertToExcalidrawElements(res.elements as any) as any).map((e: any) => ({
              ...e,
              x: e.x + offsetX,
              y: e.y + offsetY,
            }));

            // Mark old text element (and its container frame if any) as deleted
            updatedElements = updatedElements.map((el) => {
              if (el.id === anyEl.id) return { ...el, isDeleted: true };
              if (anyEl.containerId && el.id === anyEl.containerId) return { ...el, isDeleted: true };
              return el;
            });

            updatedElements.push(...converted);
            compiledCount++;
          }
        } catch (err) {
          console.warn("Failed to compile mermaid element:", textEl.id, err);
        }
      }

      if (newFiles.length > 0) {
        excalidrawAPI.addFiles(newFiles);
      }

      const restored = restoreElements(updatedElements, null, { repairBindings: true });
      excalidrawAPI.updateScene({ elements: restored });
      setIsDirty(true);
      checkMermaidElements(restored);

      if (compiledCount > 0) {
        setCompileToast(true);
        setTimeout(() => setCompileToast(false), 3000);
      }
    } finally {
      setIsCompilingMermaid(false);
    }
  };

  // ── PlantUML via excaliplant (dual-engine) ──
  const isPlantUmlText = (text: string) =>
    /^\s*@startuml\b/i.test(text.trim()) || /^\s*@start(c4|nwdiag|archimate|salt|deployment|component|state)/i.test(text.trim());

  const handlePlantUmlImport = async (code: string, replaceExisting: boolean) => {
    if (!excalidrawAPI) return;
    setIsPlantUmlLoading(true);
    try {
      const res = await fetch("/api/canvas/plantuml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error || "PlantUML parse failed");
      const elements = data.elements || [];
      const files = data.files || {};
      if (files && Object.keys(files).length > 0) {
        const fileList = Object.values(files).map((f: any) => ({
          id: f.id as any,
          dataURL: f.dataURL as any,
          mimeType: f.mimeType || "image/svg+xml",
          created: f.created || Date.now(),
          lastRetrieved: f.lastRetrieved || Date.now(),
        }));
        excalidrawAPI.addFiles(fileList as any);
      }
      const converted = convertToExcalidrawElements(elements as any) as any;
      if (replaceExisting) {
        excalidrawAPI.updateScene({ elements: converted });
      } else {
        const current = excalidrawAPI.getSceneElements();
        const maxY = current.reduce((max: number, el: any) => Math.max(max, el.y + el.height), 0);
        const offsetY = current.length > 0 ? maxY + 60 : 0;
        const shifted = converted.map((el: any) => ({ ...el, y: el.y + offsetY }));
        excalidrawAPI.updateScene({ elements: [...current, ...shifted] });
      }
      excalidrawAPI.scrollToContent(converted, { fitToViewport: true });
      setIsDirty(true);
    } catch (e: any) {
      throw new Error(e?.message || "PlantUML parse failed");
    } finally {
      setIsPlantUmlLoading(false);
    }
  };

  // Enrich mermaid-converted elements with tech icons (placeholder box -> image)
  const enrichMermaidWithIcons = async (elements: any[]) => {
    if (!excalidrawAPI) return elements;
    const newFiles: any[] = [];
    const newImages: any[] = [];
    for (const el of elements) {
      if (el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond") {
        // Find bound text for this shape
        const bound = elements.find((t: any) => t.type === "text" && t.containerId === el.id);
        const label = (bound?.text || bound?.originalText || el.label || "") as string;
        if (!label) continue;
        const mapping = resolveTechIcon(label);
        if (!mapping) continue;
        try {
          const dataURL = await getIconDataUrl(mapping.file);
          const fileId = `icon_${Math.random().toString(36).slice(2, 9)}`;
          newFiles.push({ id: fileId, dataURL, mimeType: "image/svg+xml", created: Date.now(), lastRetrieved: Date.now() });
          newImages.push({
            id: `img_${Math.random().toString(36).slice(2, 9)}`,
            type: "image",
            x: el.x + 8,
            y: el.y + (el.height - 28) / 2,
            width: 28,
            height: 28,
            angle: 0,
            strokeColor: "transparent",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: el.groupIds || [],
            frameId: null,
            roundness: null,
            seed: Math.floor(Math.random() * 100000),
            version: 1,
            versionNonce: Math.floor(Math.random() * 100000),
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            fileId,
            status: "saved",
            scale: [1, 1] as [number, number],
            crop: null,
          });
        } catch {}
      }
    }
    if (newFiles.length > 0) excalidrawAPI.addFiles(newFiles as any);
    const restoredImages = newImages.length ? (restoreElements(newImages, null, null as any) as any) : [];
    return [...elements, ...restoredImages];
  };

  // Insert Architecture Presets (tech nodes + HLD containers)
  const insertArchPreset = async (type: string) => {
    if (!excalidrawAPI) return;
    const current = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const centerX = -appState.scrollX + window.innerWidth / 3;
    const centerY = -appState.scrollY + window.innerHeight / 3;
    let rawElements: any[] = [];
    let iconFile: string | null = null;
    switch (type) {
      case "tech-react": rawElements = createReactNode(centerX, centerY); iconFile = "developer/Frontend/reactjs.svg"; break;
      case "tech-bun": rawElements = createBunNode(centerX, centerY); iconFile = "developer/Backend/bunjs.svg"; break;
      case "tech-postgres": rawElements = createPostgresNode(centerX, centerY); iconFile = "developer/Database/postgresql.svg"; break;
      case "tech-redis": rawElements = createRedisNode(centerX, centerY); iconFile = "developer/Database/redis.svg"; break;
      case "tech-tauri": rawElements = createTauriNode(centerX, centerY); iconFile = "developer/Languages/rust-light.svg"; break;
      case "tech-kafka": rawElements = createKafkaNode(centerX, centerY); iconFile = "developer/Backend/kafka.svg"; break;
      case "tech-docker": rawElements = createDockerNode(centerX, centerY); iconFile = "developer/DevOps-AI-ML/docker.svg"; break;
      case "tech-nginx": rawElements = createNginxNode(centerX, centerY); iconFile = "developer/Infra/nginx.svg"; break;
      case "c4-system": rawElements = createC4SystemBox(centerX, centerY); break;
      case "vpc-frame": rawElements = createVpcFrame(centerX, centerY); break;
      case "micro-lane": rawElements = createMicroserviceLane(centerX, centerY); break;
      default: return;
    }
    let converted: any = convertToExcalidrawElements(rawElements as any) as any;
    // If preset has an icon, replace the placeholder rectangle (second element) with image
    if (iconFile) {
      try {
        const dataURL = await getIconDataUrl(iconFile);
        const fileId = `icon_${Math.random().toString(36).slice(2, 9)}`;
        excalidrawAPI.addFiles([{ id: fileId as any, dataURL: dataURL as any, mimeType: "image/svg+xml", created: Date.now(), lastRetrieved: Date.now() }]);
        // Find placeholder rect (10px offset from box)
        const placeholderIdx = converted.findIndex((e: any) => e.type === "rectangle" && e.width === 32 && e.height === 32);
        if (placeholderIdx !== -1) {
          const ph: any = converted[placeholderIdx];
          const img: any = {
            id: `img_${Math.random().toString(36).slice(2, 9)}`,
            type: "image",
            x: ph.x,
            y: ph.y,
            width: 32,
            height: 32,
            angle: 0,
            strokeColor: "transparent",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: ph.groupIds,
            frameId: null,
            roundness: null,
            seed: Math.floor(Math.random() * 100000),
            version: 1,
            versionNonce: Math.floor(Math.random() * 100000),
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            fileId,
            status: "saved",
            scale: [1, 1] as [number, number],
            crop: null,
          };
          // Use restore to ensure image element is valid before merging
          const restored = restoreElements([img], null, null as any) as any;
          const validImg = restored[0] || img;
          converted = [...converted.slice(0, placeholderIdx), validImg, ...converted.slice(placeholderIdx + 1)];
        }
      } catch {}
    }
    excalidrawAPI.updateScene({ elements: [...current, ...converted] });
    excalidrawAPI.scrollToContent(converted, { fitToViewport: true });
    setIsArchPresetsOpen(false);
    setIsDirty(true);
  };

  const insertIconShape = async (shape: IconShape) => {
    if (!excalidrawAPI) return;
    const current = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const cx = -appState.scrollX + window.innerWidth / 3;
    const cy = -appState.scrollY + window.innerHeight / 3;
    try {
      const dataURL = await getIconDataUrl(shape.file);
      const fileId = `icon_${shape.id}_${Math.random().toString(36).slice(2, 6)}`;
      excalidrawAPI.addFiles([{ id: fileId as any, dataURL: dataURL as any, mimeType: "image/svg+xml", created: Date.now(), lastRetrieved: Date.now() }]);
      const groupId = Math.random().toString(36).slice(2, 9);
      const box: any = {
        id: Math.random().toString(36).slice(2, 9),
        type: "rectangle",
        x: cx,
        y: cy,
        width: 140,
        height: 92,
        angle: 0,
        strokeColor: "#333333",
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [groupId],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
      };
      const img: any = {
        id: Math.random().toString(36).slice(2, 9),
        type: "image",
        x: cx + 42,
        y: cy + 10,
        width: 56,
        height: 56,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [groupId],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        fileId,
        status: "saved",
        scale: [1, 1] as [number, number],
        crop: null,
      };
      const label: any = {
        id: Math.random().toString(36).slice(2, 9),
        type: "text",
        x: cx + 10,
        y: cy + 72,
        width: 120,
        height: 14,
        angle: 0,
        strokeColor: "#111827",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        roughness: 1,
        opacity: 100,
        groupIds: [groupId],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: shape.label,
        originalText: shape.label,
        fontSize: 12,
        fontFamily: 1,
        textAlign: "center" as const,
        verticalAlign: "top" as const,
        baseline: 0,
        containerId: null,
        lineHeight: 1.25,
      };
      const convertedBoxLabel: any = convertToExcalidrawElements([box, label] as any) as any;
      const restoredImg = (restoreElements([img], null, null as any) as any)[0] || img;
      const converted = [...convertedBoxLabel, restoredImg];
      excalidrawAPI.updateScene({ elements: [...current, ...converted] });
      excalidrawAPI.scrollToContent(converted, { fitToViewport: true });
      setIsDirty(true);
      setIsIconPickerOpen(false);
    } catch (e) {
      console.error("Insert icon failed", e);
    }
  };

  // Insert Wireframe Presets
  const insertPreset = (type: "browser" | "mobile" | "form" | "modal" | "note") => {
    if (!excalidrawAPI) return;
    const current = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();

    const centerX = -appState.scrollX + window.innerWidth / 3;
    const centerY = -appState.scrollY + window.innerHeight / 3;

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

    const converted = convertToExcalidrawElements(rawElements as any) as any;
    excalidrawAPI.updateScene({ elements: [...current, ...converted] });
    excalidrawAPI.scrollToContent(converted, { fitToViewport: true });
    setIsPresetsOpen(false);
    setIsDirty(true);
  };

  // Export PNG
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

  // Export SVG
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
    setDetectedMermaidCount(0);
    setIsClearDialogOpen(false);
  };

  return (
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
          {/* Compile Mermaid Button (Shown when raw Mermaid code is detected on canvas) */}
          {detectedMermaidCount > 0 && (
            <AppButton
              variant="secondary"
              size="sm"
              onClick={handleCompileMermaid}
              disabled={isCompilingMermaid}
              icon={<Sparkle size={13} className="text-amber-400 animate-pulse" />}
              className="px-2.5 bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
              title="Convert detected Mermaid code boxes into vector diagrams"
            >
              {isCompilingMermaid ? "Compiling…" : `Compile Mermaid (${detectedMermaidCount})`}
            </AppButton>
          )}

          {/* Import Diagram (Mermaid + PlantUML dual-engine) */}
          <AppButton
            variant="chip"
            size="sm"
            onClick={() => setIsMermaidOpen(true)}
            icon={<GitBranch size={13} className="text-kumo-brand" />}
            className="px-2.5"
            title="Import Mermaid or PlantUML (excaliplant) → vector + tech icons"
          >
            Import Diagram
          </AppButton>

          {/* Architecture / Tech Stack Presets */}
          <div className="relative">
            <AppButton
              variant="chip"
              size="sm"
              active={isArchPresetsOpen}
              onClick={() => {
                setIsArchPresetsOpen((p) => !p);
                setIsPresetsOpen(false);
                setIsExportOpen(false);
              }}
              icon={<Shapes size={13} className="text-violet-400" />}
              className="px-2.5"
              title="High-level architecture presets with SVG icons"
            >
              Architecture
            </AppButton>
            {isArchPresetsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg border border-kumo-line bg-kumo-elevated p-1 shadow-xl z-50 text-xs max-h-[60vh] overflow-auto">
                <div className="px-2 py-1 text-[10px] font-semibold tracking-wide uppercase text-kumo-subtle">Tech Nodes</div>
                <button onClick={() => insertArchPreset("tech-react")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Shapes size={14} className="text-cyan-400" /> React 19
                </button>
                <button onClick={() => insertArchPreset("tech-bun")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Shapes size={14} className="text-amber-400" /> Bun Server
                </button>
                <button onClick={() => insertArchPreset("tech-postgres")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Shapes size={14} className="text-sky-400" /> PostgreSQL
                </button>
                <button onClick={() => insertArchPreset("tech-redis")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Shapes size={14} className="text-red-400" /> Redis
                </button>
                <button onClick={() => insertArchPreset("tech-kafka")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Shapes size={14} className="text-violet-400" /> Kafka
                </button>
                <button onClick={() => insertArchPreset("tech-docker")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Desktop size={14} className="text-blue-400" /> Docker
                </button>
                <button onClick={() => insertArchPreset("tech-nginx")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Desktop size={14} className="text-emerald-400" /> Nginx / Proxy
                </button>
                <button onClick={() => insertArchPreset("tech-tauri")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Desktop size={14} className="text-indigo-400" /> Tauri Desktop
                </button>
                <div className="my-1 border-t border-kumo-line" />
                <div className="px-2 py-1 text-[10px] font-semibold tracking-wide uppercase text-kumo-subtle">HLD Containers</div>
                <button onClick={() => insertArchPreset("vpc-frame")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Layout size={14} className="text-purple-400" /> VPC / Cloud Frame
                </button>
                <button onClick={() => insertArchPreset("c4-system")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Layout size={14} className="text-blue-400" /> C4 System Box
                </button>
                <button onClick={() => insertArchPreset("micro-lane")} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-kumo-default hover:bg-kumo-line transition-colors">
                  <Layout size={14} className="text-slate-400" /> Microservice Lane
                </button>
              </div>
            )}
          </div>

          {/* Icon Library */}
          <AppButton
            variant="chip"
            size="sm"
            onClick={() => setIsIconPickerOpen(true)}
            icon={<Shapes size={13} className="text-emerald-400" />}
            className="px-2.5"
            title="Browse 2100+ AWS/Azure/CNCF/Developer SVG icons"
          >
            Icons
          </AppButton>

          {/* Wireframe Presets Dropdown */}
          <div className="relative">
            <AppButton
              variant="chip"
              size="sm"
              active={isPresetsOpen}
              onClick={() => {
                setIsPresetsOpen((p) => !p);
                setIsArchPresetsOpen(false);
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
                setIsArchPresetsOpen(false);
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

          {/* Compile Toast Indicator */}
          {compileToast && (
            <span className="flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded animate-in fade-in">
              <Sparkle size={12} /> Diagrams Compiled!
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
          initialData={initialData}
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          theme={theme}
          onChange={(elements) => {
            if (isInitialMountRef.current) {
              isInitialMountRef.current = false;
            } else {
              setIsDirty(true);
            }
            checkMermaidElements(elements);
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

      {/* Diagram Import Dialog (Mermaid + PlantUML) */}
      <MermaidImportDialog
        open={isMermaidOpen}
        onClose={() => setIsMermaidOpen(false)}
        onImport={async (code, replace) => {
          if (isPlantUmlText(code)) {
            await handlePlantUmlImport(code, replace);
          } else {
            await handleMermaidImport(code, replace);
          }
        }}
        isPlantUmlLoading={isPlantUmlLoading}
      />

      {/* Icon Library Picker */}
      <IconPicker open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen} onSelect={insertIconShape} />

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
}
