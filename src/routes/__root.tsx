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
import { House, Folder, Sun, Moon, ArrowUp } from "@phosphor-icons/react";
import { useEffect, useState, useRef } from "react";
import { applyTheme, getStoredTheme, toggleTheme, type AppTheme } from "~/lib/theme";
import { UpdateBanner, requestUpdateCheck } from "~/components/UpdateBanner";
import { InstanceWatch } from "~/components/system/InstanceWatch";
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

function AppSidebarHeader() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const isDesktop =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return (
    <Sidebar.Header>
      <div className={`flex items-center py-2.5 ${isCollapsed ? 'justify-center' : 'px-3 gap-2'}`}>
        <span className="rounded bg-kumo-info px-1.5 py-0.5 text-xs font-bold text-white shrink-0">OS</span>
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

  useEffect(() => {
    writeStored(SIDEBAR_OPEN_KEY, state !== "collapsed" ? "true" : "false");
  }, [state]);

  useEffect(() => {
    if (state === "expanded") writeStored(SIDEBAR_WIDTH_KEY, String(width));
  }, [state, width]);

  return null;
}

function RootComponent() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const location = useLocation();
  const pathname = location.pathname;
  const isDashboardActive = pathname === "/";

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

  return (
    <html suppressHydrationWarning data-mode={getStoredTheme() === "dark" ? "dark" : undefined} className="h-svh overflow-hidden">
      <head><HeadContent /></head>
      <body suppressHydrationWarning className="flex flex-col h-svh overflow-hidden bg-kumo-recessed text-kumo-default antialiased">
        <UpdateBanner />
        <InstanceWatch />
        <div className="flex flex-1 min-h-0">
          <Sidebar.Provider defaultOpen collapsible="icon" resizable defaultWidth={220} minWidth={48} maxWidth={320}>
            <SidebarPersistence />
            <Sidebar>
              <AppSidebarHeader />
              <Sidebar.Content>
                <Sidebar.Group>
                  <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    <Sidebar.MenuButton active={isDashboardActive} icon={House} tooltip="Dashboard">
                      <Link to="/" className="no-underline text-inherit">Dashboard</Link>
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
            <main className="flex-1 overflow-y-auto p-5 min-w-0"><div className="mx-auto h-full w-full max-w-[1600px]"><Outlet /></div></main>
          </Sidebar.Provider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
