/**
 * The managed browser window for design links (P4.3): its status, opening it to sign in, and
 * forgetting its sign-ins. Nothing here reads or stores a password.
 */
import fs from "node:fs";
import { json } from "../http/response";
import { Router } from "../http/router";
import { BrowserError, browserRunning, clearProfile, locateBrowser, openForLogin, profileDir } from "~/server/browser/manager";

export const router = new Router();

const DEFAULT_LOGIN_URL = "https://www.figma.com/login";

router.get("browser/status", async () => {
  const choice = locateBrowser();
  return json({
    browser: choice ? { name: choice.name, path: choice.path } : null,
    running: browserRunning(),
    profileExists: fs.existsSync(profileDir()),
  });
});

/** Opens a page (Figma's sign-in by default) in the managed window and leaves it open. */
router.post("browser/login", async (ctx) => {
  const body = await ctx.body();
  const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : DEFAULT_LOGIN_URL;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return json({ error: "URL tidak valid." }, 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return json({ error: "Hanya URL http/https." }, 400);
  try {
    await openForLogin(parsed.toString());
    return json({ opened: true });
  } catch (err) {
    const message = err instanceof BrowserError ? err.message : `Gagal membuka browser: ${(err as Error).message}`;
    return json({ error: message }, 500);
  }
});

/** Forgets the sign-ins: closes the window and deletes its profile folder. */
router.post("browser/reset", async () => {
  clearProfile();
  return json({ reset: true });
});
