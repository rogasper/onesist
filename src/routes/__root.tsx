import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  Link,
  useLocation,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Sidebar, useSidebar } from "@cloudflare/kumo";
import { House, Folder, Sun, Moon, ArrowUp, MagnifyingGlass, SidebarSimple } from "@phosphor-icons/react";
import { useEffect, useState, useRef } from "react";
import { applyTheme, getStoredTheme, toggleTheme, type AppTheme } from "~/lib/theme";
import { useGlobalDropGuard } from "~/lib/file-drop";
import { useRunNotifications } from "~/lib/use-run-notifications";
import { useClientErrorReporting } from "~/lib/use-client-error-report";
import { UpdateBanner, requestUpdateCheck } from "~/components/UpdateBanner";
import { InstanceWatch } from "~/components/system/InstanceWatch";
import { QuickOpenModal } from "~/components/ui/QuickOpenModal";
import { RIGHT_DOCK_ID } from "~/components/layout/RightDock";
import { getSidebarChoice, isSidebarToggleKey, setSidebarOpen, useSidebarChoice, useSidebarOpen } from "~/lib/sidebar-state";
import "~/styles.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Onesist" },
    ],
  }),
  component: RootComponent,
});

function AppSidebarHeader({ overlay }: { overlay: boolean }) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const isDesktop =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return (
    <Sidebar.Header>
      {/* One control slot, ChatGPT-style: while the sidebar is visible this square is the
          collapse control; when it is closed the same square (same position, same size) is
          the floating logo button below. Only on non-overlay windows — the overlay build
          keeps its toggle in the title bar strip instead. setSidebarOpen, not the kumo
          setter, so the click counts as the user's choice and is remembered. */}
      <div className={`flex items-center gap-2 py-2 ${overlay ? 'px-3' : 'pl-2 pr-3'} ${isCollapsed ? 'justify-center' : ''}`}>
        {overlay ? (
          /* The brand mark doubles as the collapse control: hover swaps it to the panel
             icon so it reads as clickable instead of a dead logo, click collapses. */
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            title="Sembunyikan sidebar (Ctrl/⌘B)"
            aria-label="Sembunyikan sidebar"
            className="group/logo relative grid size-7 shrink-0 place-items-center rounded hover:bg-kumo-elevated/60 transition-colors cursor-pointer"
          >
            <img
              src="/logo-icon.png"
              alt="Onesist"
              className="h-6 w-6 object-contain transition-opacity group-hover/logo:opacity-0"
            />
            <SidebarSimple
              size={14}
              className="absolute text-kumo-subtle opacity-0 transition-opacity group-hover/logo:opacity-100"
            />
          </button>
        ) : (
          <img src="/logo-icon.png" alt="Onesist" className="h-6 w-6 object-contain shrink-0" />
        )}
        {!isCollapsed && <span className="text-sm font-semibold text-kumo-default truncate flex-1 min-w-0">ONESIST</span>}
        {isDesktop && !isCollapsed && (
          <button
            type="button"
            onClick={() => requestUpdateCheck()}
            title="Check for updates"
            className="flex items-center justify-center size-7 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/60 transition-colors cursor-pointer shrink-0"
          >
            <ArrowUp size={14} />
          </button>
        )}
      </div>
    </Sidebar.Header>
  );
}

function AppSidebarFooter() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());

  const onToggleTheme = () => {
    void toggleTheme().then(setTheme);
  };

  return (
    <Sidebar.Footer>
      <div className={`flex items-center gap-1 ${isCollapsed ? 'justify-center' : ''}`}>
        {!isCollapsed && (
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center gap-2 px-2 py-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/60 transition-colors cursor-pointer"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span className="text-xs">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        )}
        <Sidebar.Trigger />
      </div>
    </Sidebar.Footer>
  );
}

const SIDEBAR_OPEN_KEY = "onesist:sidebar:open";
const SIDEBAR_WIDTH_KEY = "onesist:sidebar:width";
// Height of the overlay title bar strip on the macOS main window (traffic lights + toggle).
const TITLEBAR_H = 32;
// Which window gets the overlay title bar UI, decided once, synchronously: the macOS desktop
// main window only. Secondary windows (win-*/pane-*) keep their native title bar, the browser
// has none. Synchronous on purpose — an async "is this main?" state once left a gap where the
// strip was missing while the overlay shell was already up, and the sidebar fell back to
// hover-only behavior the user explicitly rejected.
const IS_MAC_MAIN =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window &&
  /Macintosh/.test(navigator.userAgent) &&
  (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
    .__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main";

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch {}
}

function SidebarPersistence() {
  const { state, width, setOpen, setWidth } = useSidebar();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const open = readStored(SIDEBAR_OPEN_KEY);
    if (open !== null) setOpen(open === "true");
    const w = readStored(SIDEBAR_WIDTH_KEY);
    if (w !== null) {
      const n = Number(w);
      if (Number.isFinite(n) && n > 0) setWidth(n);
    }
  }, [setOpen, setWidth]);

  // The user's choice is remembered, not the state on screen: a fold made by the chat is not a choice.
  const choice = useSidebarChoice();
  useEffect(() => {
    writeStored(SIDEBAR_OPEN_KEY, choice ? "true" : "false");
  }, [choice]);

  useEffect(() => {
    if (state === "expanded") writeStored(SIDEBAR_WIDTH_KEY, String(width));
  }, [state, width]);

  return null;
}

function RootComponent() {
  // The update banner's height. kumo fixes the desktop sidebar to the top of the window, so the
  // sidebar starts below the banner through `--update-banner-h` (see styles.css).
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const root = document.documentElement;
    // The overlay title bar strip is part of the offset: the fixed sidebar starts below
    // strip + banner, not just below the banner.
    const apply = () =>
      root.style.setProperty("--update-banner-h", `calc(var(--onesist-titlebar, 0px) + ${el.offsetHeight}px)`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--update-banner-h", "calc(var(--onesist-titlebar, 0px) + 0px)");
    };
  }, []);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  // Controlled, so the project's chat can fold it on a narrow window (P3.2).
  const sidebarOpen = useSidebarOpen();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const targetEditable = !!target?.closest?.(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], .cm-editor, .ProseMirror, [role="textbox"]',
      );
      if (!isSidebarToggleKey({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, targetEditable })) return;
      e.preventDefault();
      setSidebarOpen(!getSidebarChoice());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const location = useLocation();
  const pathname = location.pathname;
  const isDashboardActive = pathname === "/";

  // Desktop notifications for finished/blocked chat runs (FR-B16). Lives at the
  // root so a run started in one project still reaches the user while they are
  // working somewhere else (or with the window hidden to the tray).
  useRunNotifications();

  // Client-side failures go into the server log, which is the only log a local
  // app has (see the module comment).
  useClientErrorReporting();

  // A file dropped outside a drop zone must not replace the app with the
  // dropped file — the desktop shell no longer swallows OS drags (see
  // `src/lib/file-drop.ts`).
  useGlobalDropGuard();

  useEffect(() => {
    const fetchProjects = () => {
      fetch("/api/projects", { cache: "no-store" })
        .then((r) => r.json())
        .then((data: { id: string; name: string }[]) => {
          if (Array.isArray(data)) setProjects(data);
        })
        .catch(() => {});
    };

    fetchProjects();
    window.addEventListener("projects-updated", fetchProjects);
    return () => window.removeEventListener("projects-updated", fetchProjects);
  }, []);

  // Fase 5E: a tab opened in its own window shows only the tab — no sidebar, tab bar or dock.
  if (pathname.startsWith("/pane/")) {
    return (
      <html suppressHydrationWarning data-mode={getStoredTheme() === "dark" ? "dark" : undefined} className="h-svh overflow-hidden">
        <head><HeadContent /></head>
        <body suppressHydrationWarning className="flex flex-col h-svh overflow-hidden bg-kumo-recessed text-kumo-default antialiased">
          <Outlet />
          <Scripts />
        </body>
      </html>
    );
  }

  return (
    <html
      suppressHydrationWarning
      data-mode={getStoredTheme() === "dark" ? "dark" : undefined}
      className="h-svh overflow-hidden"
      style={IS_MAC_MAIN ? ({ "--onesist-titlebar": `${TITLEBAR_H}px` } as React.CSSProperties) : undefined}
    >
      <head><HeadContent /></head>
      <body
        suppressHydrationWarning
        className="flex flex-col h-svh overflow-hidden bg-kumo-recessed text-kumo-default antialiased"
        style={IS_MAC_MAIN ? { paddingTop: TITLEBAR_H } : undefined}
      >
        <div ref={bannerRef} className="relative z-[60] shrink-0">
          <UpdateBanner />
        </div>
        <InstanceWatch />
        <QuickOpenModal />
        {/* The overlay title bar strip (macOS main window): dragging moves the window,
            double-clicking zooms it. One slot next to the traffic lights switches content:
            the toggle while the sidebar shows, the Onesist logo while it is hidden — so the
            logo never disappears, and clicks pin or collapse; nothing closes on hover. */}
        {IS_MAC_MAIN && (
          <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-[70]" style={{ height: TITLEBAR_H }}>
            <button
              type="button"
              onClick={() => setSidebarOpen(!getSidebarChoice())}
              title={sidebarOpen ? "Sembunyikan sidebar (Ctrl/⌘B)" : "Tampilkan sidebar (Ctrl/⌘B)"}
              aria-label={sidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}
              className="group/logo absolute left-[76px] top-1/2 -translate-y-1/2 flex items-center justify-center size-7 rounded-md text-kumo-subtle hover:bg-kumo-elevated/60 hover:text-kumo-default transition-colors cursor-pointer"
            >
              {sidebarOpen ? (
                <SidebarSimple size={15} />
              ) : (
                <>
                  <img
                    src="/logo-icon.png"
                    alt="Onesist"
                    className="h-5 w-5 object-contain transition-opacity group-hover/logo:opacity-0"
                  />
                  <SidebarSimple
                    size={15}
                    className="absolute opacity-0 transition-opacity group-hover/logo:opacity-100"
                  />
                </>
              )}
            </button>
          </div>
        )}
        {/* Floating logo, non-overlay windows only (web, Windows, secondary windows): the
            overlay build keeps its toggle in the title bar strip instead. Click opens the
            sidebar for good — no hover peek, the sidebar never depends on the pointer. */}
        {!sidebarOpen && !IS_MAC_MAIN && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            title="Tampilkan sidebar (Ctrl/⌘B)"
            aria-label="Tampilkan sidebar"
            className="fixed left-2 top-2 z-50 flex items-center justify-center size-8 rounded bg-kumo-elevated/80 border border-kumo-line hover:bg-kumo-elevated transition-colors cursor-pointer"
          >
            <img src="/logo-icon.png" alt="" className="h-5 w-5 object-contain" />
          </button>
        )}
        <div className="flex flex-1 min-h-0">
          <Sidebar.Provider open={sidebarOpen} onOpenChange={setSidebarOpen} collapsible="offcanvas" resizable defaultWidth={220} minWidth={48} maxWidth={320}>
            <SidebarPersistence />
            <Sidebar>
              <AppSidebarHeader overlay={IS_MAC_MAIN} />
              <Sidebar.Content className="overflow-y-auto scrollbar-thin">
                <Sidebar.Group>
                  <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    <Sidebar.MenuButton active={isDashboardActive} icon={House} tooltip="Dashboard">
                      <Link to="/" className="no-underline text-inherit">Dashboard</Link>
                    </Sidebar.MenuButton>
                    <Sidebar.MenuButton
                      onClick={() => window.dispatchEvent(new CustomEvent("open-quick-search"))}
                      icon={MagnifyingGlass}
                      tooltip="Quick Open (⌘P)"
                    >
                      <span className="flex items-center justify-between w-full">
                        <span>Quick Open</span>
                        <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-kumo-elevated text-kumo-subtle border border-kumo-line/60">⌘P</kbd>
                      </span>
                    </Sidebar.MenuButton>
                  </Sidebar.Menu>
                </Sidebar.Group>
                <Sidebar.Group>
                  <Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    {projects.length === 0 ? (
                      <Sidebar.MenuButton disabled icon={Folder} tooltip="No projects">No projects</Sidebar.MenuButton>
                    ) : projects.map((p) => (
                      <Sidebar.MenuButton key={p.id} active={pathname.startsWith(`/projects/${p.id}`)} icon={Folder} tooltip={p.name}>
                        <Link to="/projects/$id" params={{ id: p.id }} className="no-underline text-inherit">{p.name}</Link>
                      </Sidebar.MenuButton>
                    ))}
                  </Sidebar.Menu>
                </Sidebar.Group>
              </Sidebar.Content>
              <AppSidebarFooter />
            </Sidebar>
            <main data-app-main className="flex-1 overflow-y-auto p-5 min-w-0"><div className="mx-auto h-full w-full max-w-[1600px]"><Outlet /></div></main>
            {/* The right dock: chat and terminal panels portal in here (see RightDock), so they run the
                full window height at the right edge, outside the page's padding and centred column. */}
            <div id={RIGHT_DOCK_ID} className="flex h-full shrink-0" />
          </Sidebar.Provider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
