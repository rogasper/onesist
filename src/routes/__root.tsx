import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Sidebar, useSidebar } from "@cloudflare/kumo";
import { House, Folder } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import "~/styles.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SA Dashboard" },
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
        <span className="rounded bg-kumo-elevated px-1.5 py-0.5 text-xs font-bold text-kumo-brand shrink-0">SA</span>
        {!isCollapsed && <span className="text-sm font-semibold text-kumo-default truncate">Dashboard</span>}
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

function RootComponent() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

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
            <Sidebar>
              <AppSidebarHeader />
              <Sidebar.Content>
                <Sidebar.Group>
                  <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    <Sidebar.MenuButton icon={House} tooltip="Dashboard">
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
                      <Sidebar.MenuButton key={p.id} icon={Folder} tooltip={p.name}>
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
