/**
 * Which changed files fall outside a task's file scope. A scope entry names a file, or a folder
 * whose files are all in scope. Pure: the validation service runs it on git's file list.
 */
export function outsideScope(changed: string[], scope: string[]): string[] {
  const entries = scope.map((s) => s.replace(/\/+$/, "")).filter((s) => s !== "");
  return changed.filter((file) => !entries.some((entry) => file === entry || file.startsWith(`${entry}/`)));
}
