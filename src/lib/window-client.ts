/**
 * This window's client id (Fase 5E): sent when the SSE stream opens and with every document
 * lock request, so the server knows which window holds a document. One per page load.
 */
let id: string | null = null;

export function windowClientId(): string {
  if (!id) id = crypto.randomUUID().replace(/-/g, "");
  return id;
}
