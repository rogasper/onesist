import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { CaretDown, CaretRight, Folder, File, ArrowDownLeft, ArrowUpRight } from "@phosphor-icons/react";
import { FileRow } from "~/components/ui/FileRow";
import { SearchInput } from "~/components/ui/SearchInput";

interface TreeFile {
  name: string;
  path: string;
  size: number;
}

interface TreeNode {
  name: string;
  path: string;
  type: "folder" | "file";
  children?: TreeNode[];
  file?: TreeFile;
}

export interface FileTreeSection {
  dir: string;
  files: TreeFile[];
}

export interface FileTreeHandle {
  /** Put a file row into inline-rename mode (used from a context menu). */
  requestRename: (path: string) => void;
}

interface FileTreeProps {
  /** Single-root mode: flat file entries for `rootDir`. */
  files?: TreeFile[];
  rootDir?: string;
  /** Multi-root mode: sections with per-root collapsible headers. */
  sections?: FileTreeSection[];
  activePath?: string | null;
  /** Empty-state text when the directory has no files. */
  emptyText?: string;
  /** Disable rows whose file fails this predicate (e.g. non-md). */
  isDisabled?: (file: TreeFile) => boolean;
  onFileClick: (file: TreeFile) => void;
  onFileContextMenu: (e: React.MouseEvent, file: TreeFile) => void;
  onDirContextMenu?: (e: React.MouseEvent, dir: string) => void;
  /** Called when an inline rename commits (Enter/blur). newName is raw user input. */
  onRename: (path: string, newName: string) => void;
}

function buildFileTree(rootDir: string, entries: TreeFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const ensureFolder = (parts: string[]): TreeNode[] => {
    let level = root;
    let acc = rootDir;
    for (const part of parts) {
      acc += "/" + part;
      let node = folderMap.get(acc);
      if (!node) {
        node = { name: part, path: acc, type: "folder", children: [] };
        folderMap.set(acc, node);
        level.push(node);
      }
      level = node.children ?? [];
    }
    return level;
  };

  for (const f of entries) {
    if (f.name.startsWith(".")) continue;
    const rel = f.path.slice(rootDir.length + 1);
    const parts = rel.split("/");
    const folder = ensureFolder(parts.slice(0, -1));
    folder.push({ name: parts[parts.length - 1], path: f.path, type: "file", file: f });
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.children) sortNodes(n.children);
    return nodes;
  };
  return sortNodes(root);
}

function dirLabel(dir: string): React.ReactNode {
  if (dir.startsWith("input/")) {
    return (
      <span className="inline-flex items-center gap-1">
        <ArrowDownLeft size={12} weight="bold" />
        {dir.slice(6)}
      </span>
    );
  }
  if (dir.startsWith("output/")) {
    return (
      <span className="inline-flex items-center gap-1">
        <ArrowUpRight size={12} weight="bold" />
        {dir.slice(7)}
      </span>
    );
  }
  return dir;
}

function RenameInput({ initial, onCommit }: { initial: string; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      const dot = initial.lastIndexOf(".");
      el.setSelectionRange(0, dot === -1 ? initial.length : dot);
    }
  }, [initial]);

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCommit(initial);
      }}
      className="w-full bg-kumo-elevated border border-kumo-brand rounded px-1.5 py-0.5 text-xs text-kumo-default focus:outline-none"
    />
  );
}

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree({
  files,
  rootDir,
  sections,
  activePath,
  emptyText = "(empty)",
  isDisabled,
  onFileClick,
  onFileContextMenu,
  onDirContextMenu,
  onRename,
}: FileTreeProps, ref) {
  const sectionsMode = !!sections && sections.length > 0;
  const resolved = useMemo(
    () => (sectionsMode ? (sections as FileTreeSection[]) : [{ dir: rootDir ?? "", files: files ?? [] }]),
    [sections, sectionsMode, rootDir, files],
  );

  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    requestRename: (path: string) => setRenaming(path),
  }));

  const query = searchQuery.trim().toLowerCase();
  const searchResults = query
    ? resolved.flatMap((s) =>
        s.files
          .filter((f) => f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
          .map((f) => ({ dir: s.dir, ...f }))
      )
    : [];

  const trees = useMemo(
    () => resolved.map((s) => ({ dir: s.dir, nodes: buildFileTree(s.dir, s.files) })),
    [resolved],
  );

  const toggleCollapse = (dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const toggleSection = (dir: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const countFiles = (node: TreeNode): number =>
    node.type === "file" ? 1 : (node.children ?? []).reduce((n, c) => n + countFiles(c), 0);

  const renderTreeNodes = (nodes: TreeNode[], depth: number): React.ReactNode[] =>
    nodes.map((node) => {
      if (node.type === "folder") {
        const isCollapsed = collapsedDirs.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggleCollapse(node.path)}
              onContextMenu={(e) => onDirContextMenu?.(e, node.path)}
              className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer whitespace-nowrap"
              style={{ paddingLeft: `${8 + depth * 9}px` }}
            >
              {isCollapsed ? <CaretRight size={10} /> : <CaretDown size={10} />}
              <Folder size={11} className="opacity-60" />
              <span className="text-xs flex-1 min-w-0 truncate" title={node.name}>{node.name}</span>
              <span className="text-[10px] text-kumo-subtle ml-auto shrink-0">{countFiles(node)}</span>
            </button>
            {!isCollapsed && (
              <div className="ml-[6px] pl-[4px] border-l border-kumo-line/25">{renderTreeNodes(node.children ?? [], depth + 1)}</div>
            )}
          </div>
        );
      }
      const f = node.file!;
      const isActive = activePath === f.path;
      const disabled = isDisabled?.(f) ?? false;
      return (
        <div key={f.path}>
          {renaming === f.path ? (
            <div className="my-0.5 mx-1.5" style={{ paddingLeft: `${12 + depth * 9}px` }}>
              <RenameInput
                initial={f.name}
                onCommit={(name) => {
                  setRenaming(null);
                  onRename(f.path, name);
                }}
              />
            </div>
          ) : (
            <FileRow
              depth={depth}
              icon={<File size={11} />}
              active={isActive}
              disabled={disabled}
              onClick={() => !disabled && onFileClick(f)}
              onContextMenu={(e) => onFileContextMenu(e, f)}
            >
              <span className="whitespace-nowrap" title={f.name}>{f.name}</span>
            </FileRow>
          )}
        </div>
      );
    });

  const renderSection = (section: { dir: string; nodes: TreeNode[] }) => {
    const isCollapsed = collapsedSections.has(section.dir);
    const total = section.nodes.reduce((n, c) => n + countFiles(c), 0);
    return (
      <div key={section.dir}>
        <button
          type="button"
          onClick={() => toggleSection(section.dir)}
          onContextMenu={(e) => onDirContextMenu?.(e, section.dir)}
          className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer whitespace-nowrap"
        >
          {isCollapsed ? <CaretRight size={10} /> : <CaretDown size={10} />}
          <span className="text-xs flex-1 min-w-0 truncate">{dirLabel(section.dir)}</span>
          <span className="text-[10px] text-kumo-subtle ml-auto shrink-0">{total}</span>
        </button>
        {!isCollapsed && (
          section.nodes.length === 0 ? (
            <div className="pl-4 py-1 text-[11px] text-kumo-subtle">(empty)</div>
          ) : (
            <div>{renderTreeNodes(section.nodes, 0)}</div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1.5 border-b border-kumo-line shrink-0">
        <SearchInput variant="compact" value={searchQuery} onChange={setSearchQuery} placeholder="Search files…" />
      </div>

      <div className="flex-1 overflow-y-auto py-1" onContextMenu={(e) => { e.preventDefault(); }}>
        {query ? (
          searchResults.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-kumo-subtle">No files match</div>
          ) : (
            searchResults.map((f) => {
              const disabled = isDisabled?.(f) ?? false;
              return (
                <div key={f.path}>
                  <FileRow
                    icon={<File size={10} />}
                    active={activePath === f.path}
                    disabled={disabled}
                    onClick={() => !disabled && onFileClick(f)}
                    onContextMenu={(e) => onFileContextMenu(e, f)}
                  >
                    <span className="truncate">{f.name}</span>
                  </FileRow>
                  <div className="pl-6 pr-2 -mt-0.5 text-[10px] text-kumo-subtle truncate">
                    {sectionsMode ? dirLabel(f.dir) : f.path.slice(0, f.path.lastIndexOf("/"))}
                  </div>
                </div>
              );
            })
          )
        ) : sectionsMode ? (
          trees.map(renderSection)
        ) : (
          trees[0]?.nodes.map((node) => {
            if (node.type === "folder") {
              const isCollapsed = collapsedDirs.has(node.path);
              return (
                <div key={node.path}>
                  <button
                    type="button"
                    onClick={() => toggleCollapse(node.path)}
                    onContextMenu={(e) => onDirContextMenu?.(e, node.path)}
                    className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer whitespace-nowrap"
                  >
                    {isCollapsed ? <CaretRight size={10} /> : <CaretDown size={10} />}
                    <span className="text-xs flex-1 min-w-0 truncate">{dirLabel(node.path)}</span>
                    <span className="text-[10px] text-kumo-subtle ml-auto shrink-0">{countFiles(node)}</span>
                  </button>
                  {!isCollapsed && <div>{renderTreeNodes(node.children ?? [], 0)}</div>}
                </div>
              );
            }
            // Top-level file (directly inside rootDir) — render as a row.
            const f = node.file!;
            const isActive = activePath === f.path;
            const disabled = isDisabled?.(f) ?? false;
            return (
              <div key={f.path}>
                {renaming === f.path ? (
                  <div className="my-0.5 mx-1.5" style={{ paddingLeft: `${12 + 0 * 9}px` }}>
                    <RenameInput
                      initial={f.name}
                      onCommit={(name) => {
                        setRenaming(null);
                        onRename(f.path, name);
                      }}
                    />
                  </div>
                ) : (
                  <FileRow
                    icon={<File size={11} />}
                    active={isActive}
                    disabled={disabled}
                    onClick={() => !disabled && onFileClick(f)}
                    onContextMenu={(e) => onFileContextMenu(e, f)}
                  >
                    <span className="whitespace-nowrap" title={f.name}>{f.name}</span>
                  </FileRow>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
