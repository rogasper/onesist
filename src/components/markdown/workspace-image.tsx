import { createContext, useContext } from "react";
import { workspaceImageSrc } from "~/lib/workspace-image";

/**
 * Which project's workspace the markdown being rendered belongs to.
 *
 * A context rather than a prop because every markdown surface needs it (FSD,
 * Wiki, Docs, Spec, Tasks, chat answers) and threading a prop through all of
 * them would touch each renderer and every one of their callers. The project
 * layout sets it once.
 */
const ProjectIdContext = createContext<string | null>(null);

export function ProjectIdProvider({ projectId, children }: { projectId: string | null; children: React.ReactNode }) {
  return <ProjectIdContext.Provider value={projectId}>{children}</ProjectIdContext.Provider>;
}

export function useProjectId(): string | null {
  return useContext(ProjectIdContext);
}

/**
 * `<img>` for markdown content.
 *
 * A document stores project-relative paths (`input/assets/mockup.png`), so the
 * browser would resolve them against the current SPA route and show a broken
 * image. Here they become a request to the app's raw-image route; absolute and
 * `data:` URLs pass through untouched. Rendered WITHOUT a project (e.g. markdown
 * outside any project) everything simply stays as written.
 */
export function WorkspaceImage({ src, alt, className = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const projectId = useProjectId();
  const resolved = typeof src === "string" ? workspaceImageSrc(src, projectId) : src;
  return (
    <img
      {...props}
      src={resolved}
      alt={alt ?? ""}
      loading="lazy"
      // Content, not decoration: stay inside the column, keep the corners
      // concentric with the cards around it.
      className={`max-w-full h-auto rounded-lg ${className}`}
    />
  );
}
