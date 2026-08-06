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
import { House, Folder } from "@phosphor-icons/react";
import { useEffect, useState, useRef } from "react";
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
  
  return (
    <Sidebar.Header>
      <div className={`flex items-center py-2.5 ${isCollapsed ? 'justify-center' : 'px-3 gap-2'}`}>
        <span className="rounded bg-kumo-info px-1.5 py-0.5 text-xs font-bold text-white shrink-0">OS</span>
        {!isCollapsed && <span className="text-sm font-semibold text-kumo-default truncate">ONESIST</span>}
      </div>
    </Sidebar.Header>
  );
}

function AppSidebarFooter() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;

  return (
    <Sidebar.Footer>
      <div className={`flex items-center p-2 ${isCollapsed ? 'justify-center' : ''}`}>
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
      fetch("/api/projects")
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
    <html suppressHydrationWarning data-theme="dark" className="h-svh overflow-hidden">
      <head><HeadContent /></head>
      <body suppressHydrationWarning className="flex flex-col h-svh overflow-hidden bg-kumo-recessed text-kumo-default antialiased">
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
            <main className="flex-1 overflow-auto p-5 min-w-0"><Outlet /></main>
          </Sidebar.Provider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
