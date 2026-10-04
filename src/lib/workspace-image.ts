/**
 * Display-side resolution of image paths in workspace markdown.
 *
 * Documents store a path relative to the PROJECT ROOT (`input/assets/foo.png`):
 * readable by the agent, by the task card a developer picks up, and by any other
 * markdown tool — and still correct when the document itself moves. Only the app
 * needs a URL, and this is the single place that decision lives: the editor's
 * `imagePreviewHandler`, the read-only `MarkdownViewer`, and the spec viewer all
 * call it.
 *
 * Left alone: absolute URLs (`http(s)://`, `//`), `data:` URLs, and anything
 * already pointing at our own API — so running it twice changes nothing.
 */
export function workspaceImageSrc(src: string, projectId?: string | null): string {
  const raw = (src ?? "").trim();
  if (!raw) return raw;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("/api/")) return raw;

  // A `#fragment` or `?query` belongs to the URL, not to the file path.
  const cut = raw.search(/[?#]/);
  const pathPart = (cut === -1 ? raw : raw.slice(0, cut)).replace(/^\.\//, "");
  const suffix = cut === -1 ? "" : raw.slice(cut);
  if (!pathPart) return raw;

  const params = new URLSearchParams({ path: pathPart.replace(/\\/g, "/") });
  if (projectId) params.set("projectId", projectId);
  return `/api/files/image?${params.toString()}${suffix}`;
}
