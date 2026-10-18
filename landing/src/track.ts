/** Umami event, if the script loaded. Never throws: analytics must not break a click. */
export function track(name: string, data?: Record<string, string>): void {
  try {
    (window as any).umami?.track(name, data);
  } catch {
    /* analytics unavailable */
  }
}
