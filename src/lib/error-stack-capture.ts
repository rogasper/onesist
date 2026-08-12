/**
 * Client-side capture of React's component stack for caught/uncaught errors.
 *
 * React only exposes `errorInfo.componentStack` via the root's
 * onCaughtError/onUncaughtError options — commit-phase errors do NOT carry it
 * on error.componentStack. client.tsx sets this; the ErrorStack UI reads it.
 *
 * Kept in its OWN module (no DOM, no hydrateRoot) so it is safe to import from
 * server-rendered components (ErrorStack is used as the router's
 * defaultErrorComponent, which SSR also renders).
 */
let lastComponentStack = "";

export function getLastComponentStack(): string {
  return lastComponentStack;
}

export function setLastComponentStack(stack: string): void {
  lastComponentStack = stack;
}
