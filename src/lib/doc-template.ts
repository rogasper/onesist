import DEFAULT_TEMPLATE from "./technical-documentation-template.md?raw";
import type { DocMeta } from "~/shared/types";

export { DEFAULT_TEMPLATE };

export const DOC_TEMPLATE_PATH = "templates/technical-documentation.md";
export const DOC_TEMPLATE_FILE = "technical-documentation.md";

export const DEFAULT_DOC_META: DocMeta = {
  customerName: "",
  projectName: "",
  projectId: "",
  version: "1.0.0",
  author: "",
};

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fillTemplatePlaceholders(
  template: string,
  meta: DocMeta,
  date: string = todayISO(),
): string {
  return template
    .replaceAll("{{customerName}}", meta.customerName || "N/A")
    .replaceAll("{{projectName}}", meta.projectName || "N/A")
    .replaceAll("{{projectId}}", meta.projectId || "N/A")
    .replaceAll("{{version}}", meta.version || "1.0.0")
    .replaceAll("{{author}}", meta.author || "N/A")
    .replaceAll("{{date}}", date);
}
