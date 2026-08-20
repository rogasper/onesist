import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  MagnifyingGlass,
  X,
  FileText,
  Database,
  Code,
  ListChecks,
  LinkSimple,
  Flask,
  Palette,
  BookOpen,
  Article,
  ArrowRight,
  PencilSimple,
} from "@phosphor-icons/react";
import type { FileSearchResult } from "~/lib/file-router";

type SearchMode = "all" | "filename" | "content";

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; color: string; route: string }
> = {
  erd: { label: "ERD", icon: Database, color: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30", route: "erd" },
  spec: { label: "SPEC", icon: Code, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", route: "spec" },
  task: { label: "TASK", icon: ListChecks, color: "text-blue-400 bg-blue-500/15 border-blue-500/30", route: "tasks" },
  fsd: { label: "FSD", icon: FileText, color: "text-violet-400 bg-violet-500/15 border-violet-500/30", route: "fsd" },
  rtm: { label: "RTM", icon: LinkSimple, color: "text-amber-400 bg-amber-500/15 border-amber-500/30", route: "rtm" },
  sit: { label: "SIT", icon: Flask, color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30", route: "sit" },
  sketch: { label: "CANVAS", icon: Palette, color: "text-purple-400 bg-purple-500/15 border-purple-500/30", route: "canvas" },
  doc: { label: "DOC", icon: BookOpen, color: "text-orange-400 bg-orange-500/15 border-orange-500/30", route: "docs" },
  wiki: { label: "WIKI", icon: Article, color: "text-teal-400 bg-teal-500/15 border-teal-500/30", route: "wiki" },
  master: { label: "MASTER", icon: Code, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", route: "spec" },
  other: { label: "FILE", icon: FileText, color: "text-zinc-400 bg-zinc-500/15 border-zinc-500/30", route: "overview" },
};

export function QuickOpenModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("all");
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Extract active project id from path (/projects/:id/...)
  const match = location.pathname.match(/\/projects\/([^/]+)/);
  const currentProjectId = match ? match[1] : null;

  // Global shortcut: Cmd+P, Ctrl+P, Cmd+K, Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === "p" || e.key === "P" || e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-quick-search", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-quick-search", handleCustomOpen);
    };
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Handle query change & search
  useEffect(() => {
    if (!isOpen) return;

    // Detect prefix mode switch: # or ? switches to content mode
    let cleanQuery = query.trim();
    let effectiveMode = mode;
    if (cleanQuery.startsWith("#") || cleanQuery.startsWith("?")) {
      effectiveMode = "content";
      cleanQuery = cleanQuery.slice(1).trim();
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (cleanQuery) params.set("q", cleanQuery);
        if (effectiveMode !== "all") params.set("mode", effectiveMode);
        if (currentProjectId) params.set("projectId", currentProjectId);
        params.set("limit", "40");

        const res = await fetch(`/api/files/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setResults(data);
            setSelectedIndex(0);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          // ignore aborts
        }
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, mode, isOpen, currentProjectId]);

  const handleSelectResult = useCallback(
    (item: FileSearchResult, openInEditor = false) => {
      if (!currentProjectId) {
        setIsOpen(false);
        return;
      }

      setIsOpen(false);

      const typeConfig = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;

      if (openInEditor || typeConfig.route === "overview") {
        // Open in markdown editor tab
        window.dispatchEvent(
          new CustomEvent("open-project-file", {
            detail: { path: item.path, name: item.name },
          })
        );
        void navigate({
          to: "/projects/$id",
          params: { id: currentProjectId },
        } as any);
      } else {
        // Navigate to dedicated module tab
        void navigate({
          to: `/projects/$id/${typeConfig.route}` as any,
          params: { id: currentProjectId },
        } as any);
      }
    },
    [currentProjectId, navigate]
  );

  // Keyboard navigation inside modal
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelectResult(results[selectedIndex], e.shiftKey);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Cycle modes: all -> filename -> content -> all
      setMode((m) => (m === "all" ? "filename" : m === "filename" ? "content" : "all"));
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const activeMode = query.startsWith("#") || query.startsWith("?") ? "content" : mode;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette Container */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-2xl bg-kumo-elevated rounded-2xl border border-kumo-line shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-in zoom-in-95 duration-150 z-10"
      >
        {/* Search Header */}
        <div className="p-3 border-b border-kumo-line flex items-center gap-2 bg-kumo-recessed/30">
          <MagnifyingGlass size={16} className="text-kumo-brand shrink-0 ml-1" weight="bold" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              activeMode === "content"
                ? "Search text content in project files..."
                : "Search files by name or type # to search content (⌘P)..."
            }
            className="flex-1 bg-transparent text-sm text-kumo-default placeholder:text-kumo-subtle outline-none font-medium"
          />

          {/* Mode Selector Chips */}
          <div className="flex items-center gap-1 shrink-0">
            {(["all", "filename", "content"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors ${
                  activeMode === m
                    ? "bg-kumo-brand/20 border-kumo-brand/40 text-kumo-brand"
                    : "bg-kumo-elevated border-kumo-line/60 text-kumo-subtle hover:text-kumo-default hover:border-kumo-line"
                }`}
              >
                {m === "all" ? "All" : m === "filename" ? "Files" : "Content"}
              </button>
            ))}
          </div>

          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 text-kumo-subtle hover:text-kumo-default rounded transition-colors"
            >
              <X size={13} weight="bold" />
            </button>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 p-1.5 divide-y divide-kumo-line/30">
          {loading && results.length === 0 ? (
            <div className="py-12 text-center text-xs text-kumo-subtle">
              <span className="inline-block animate-spin mr-2">⟳</span>
              Searching project files…
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-xs text-kumo-subtle">
              {query ? (
                <>
                  <p className="text-kumo-default font-medium mb-1">No matches found for "{query}"</p>
                  <p className="text-[11px] text-kumo-subtle">
                    Try typing with <span className="font-mono text-kumo-brand">#</span> to search inside file content
                  </p>
                </>
              ) : (
                <div className="space-y-1">
                  <p className="text-kumo-default font-medium">Quick Open Files & Content</p>
                  <p className="text-[11px] text-kumo-subtle">
                    Type a file name, or prefix with <span className="font-mono text-kumo-brand">#</span> to grep inside text files
                  </p>
                </div>
              )}
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
              const IconComp = typeCfg.icon;

              return (
                <div
                  key={`${item.path}-${idx}`}
                  data-index={idx}
                  onClick={() => handleSelectResult(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group px-3 py-2 rounded-lg cursor-pointer transition-all flex flex-col gap-1 ${
                    isSelected
                      ? "bg-kumo-tint/80 border border-kumo-brand/30 shadow-xs"
                      : "hover:bg-kumo-tint/40 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Type Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-wider border shrink-0 uppercase ${typeCfg.color}`}
                    >
                      <IconComp size={10} weight="bold" />
                      {typeCfg.label}
                    </span>

                    {/* File Name */}
                    <span className="text-xs font-semibold text-kumo-default truncate flex-1 min-w-0">
                      {item.name}
                    </span>

                    {/* Target Route Pill */}
                    <span className="text-[10px] text-kumo-subtle group-hover:text-kumo-brand font-medium flex items-center gap-1 shrink-0 transition-colors">
                      <span>{typeCfg.route === "overview" ? "Editor" : `${typeCfg.label} Tab`}</span>
                      <ArrowRight size={10} />
                    </span>

                    {/* Secondary Edit Action */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectResult(item, true);
                      }}
                      title="Open in Markdown Editor Tab (Shift+Enter)"
                      className="p-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <PencilSimple size={12} />
                    </button>
                  </div>

                  {/* Path */}
                  <div className="text-[10.5px] text-kumo-subtle truncate pl-1 font-mono">
                    {item.path}
                  </div>

                  {/* Content Matches Preview */}
                  {item.matches && item.matches.length > 0 && (
                    <div className="mt-1 pl-2 border-l-2 border-kumo-brand/40 space-y-0.5">
                      {item.matches.map((m, mIdx) => (
                        <div key={mIdx} className="text-[11px] font-mono text-kumo-subtle flex items-start gap-2 truncate">
                          <span className="text-kumo-brand shrink-0 text-[10px]">:{m.line}</span>
                          <span className="truncate text-kumo-default/90">{m.preview}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcuts Hint */}
        <div className="px-3 py-2 border-t border-kumo-line bg-kumo-recessed/50 flex items-center justify-between text-[11px] text-kumo-subtle">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-kumo-elevated border border-kumo-line/80 font-mono text-[10px]">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-kumo-elevated border border-kumo-line/80 font-mono text-[10px]">↵</kbd>
              <span>Open Module</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-kumo-elevated border border-kumo-line/80 font-mono text-[10px]">⇧↵</kbd>
              <span>Raw Editor</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-kumo-elevated border border-kumo-line/80 font-mono text-[10px]">Tab</kbd>
              <span>Switch Mode</span>
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-kumo-elevated border border-kumo-line/80 font-mono text-[10px]">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
