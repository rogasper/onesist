/**
 * External MCP servers endpoint (CRUD, test connection, list tools).
 */
import { json } from "../http/response";
import { Router } from "../http/router";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { mcpServers } from "~/server/db/schema";
import { fetchServerTools, getMcpClient, closeServerClient } from "~/server/mcp/client";
import { beginOAuth, completeOAuth, hasPendingOAuth, isRegistrationUnsupported, peekOAuthTokens, takeOAuthTokens } from "~/server/mcp/oauth";
import { peekCredential, putCredential, takeCredential } from "~/server/mcp/credentials";
import { ghStatus, readGhToken } from "~/server/mcp/gh";
import { UnsafeMcpUrlError } from "~/server/mcp/url-guard";
import { MCP_PRESETS, getMcpPreset } from "~/server/agent/mcp-presets";
import { newId } from "~/server/agent/store";
import { maskApiKey, redactSecrets } from "~/server/agent/config";

export const router = new Router();

function toPublicServer(row: typeof mcpServers.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    preset: row.preset,
    presetLabel: getMcpPreset(row.preset)?.label ?? row.preset,
    transport: row.transport,
    url: row.url,
    command: row.command,
    argsJson: row.argsJson,
    envJson: row.envJson,
    authKind: row.authKind,
    authHeader: row.authHeader,
    authValueMasked: maskApiKey(row.authValue),
    hasAuthValue: !!row.authValue?.trim(),
    readOnly: row.readOnly,
    enabled: row.enabled,
    instructions: row.instructions,
    toolCount: row.toolCount,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    lastCheckedAt: row.lastCheckedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseJson(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function readBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === 0 || v === 1) return v === 1;
  return fallback;
}

/**
 * The name becomes the tool prefix (`<name>__<tool>`), and the approval gate
 * reads the prefix back to find the server's read-only flag. So it must never
 * contain `__` itself, or a crafted name could point the lookup at another row.
 */
function nameProblem(name: string): string | null {
  if (!name) return "Nama server MCP tidak boleh kosong.";
  if (name.includes("__")) return "Nama server MCP tidak boleh mengandung \"__\".";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    return "Nama server MCP hanya boleh berisi huruf, angka, \"-\" dan \"_\", maksimal 64 karakter.";
  }
  return null;
}

/**
 * Turns the reference the UI holds into the credential it stands for.
 *
 * The browser never sees an acquired token, so a save sends a reference and the
 * value is looked up here. A reference that has expired resolves to nothing, and
 * the caller must then leave the stored credential alone rather than blank it.
 */
function credentialFrom(body: Record<string, unknown>): { authKind?: "header" | "oauth"; authHeader?: string | null; authValue?: string } {
  const ref = body.credentialRef ? String(body.credentialRef) : null;
  if (ref) {
    const fromOAuth = peekOAuthTokens(ref);
    if (fromOAuth) return { authKind: "oauth", authHeader: null, authValue: fromOAuth };
    const pending = peekCredential(ref);
    if (pending) return { authKind: pending.authKind, authHeader: pending.authHeader, authValue: pending.authValue };
  }
  if (typeof body.authValue === "string" && body.authValue !== "") {
    return { authValue: body.authValue };
  }
  return {};
}

// GET /api/mcp-servers/presets
router.get("mcp-servers/presets", async () => json({ presets: MCP_PRESETS }));

// GET /api/mcp-servers
router.get("mcp-servers", async () => {
  const rows = db.select().from(mcpServers).all();
  return json({ servers: rows.map(toPublicServer) });
});

// POST /api/mcp-servers
router.post("mcp-servers", async (ctx) => {
  const body = (await ctx.body()) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const problem = nameProblem(name);
  if (problem) return json({ error: problem }, 400);

  const existing = db.select().from(mcpServers).all();
  if (existing.some((s: typeof mcpServers.$inferSelect) => s.name.trim().toLowerCase() === name.toLowerCase())) {
    return json({ error: `Nama "${name}" sudah dipakai server MCP lain.` }, 409);
  }

  const presetId = String(body.preset ?? "custom");
  const preset = getMcpPreset(presetId);
  const id = newId("mcp");
  const credential = credentialFrom(body);

  try {
    db.insert(mcpServers)
      .values({
        id,
        name,
        preset: presetId,
        transport: (body.transport as any) ?? preset?.transport ?? "http",
        url: body.url ? String(body.url).trim() : preset?.url || null,
        command: body.command ? String(body.command).trim() : null,
        argsJson: parseJson(body, "argsJson"),
        envJson: parseJson(body, "envJson"),
        authKind: credential.authKind ?? (body.authKind as any) ?? preset?.authKind ?? "none",
        authHeader: credential.authHeader !== undefined ? credential.authHeader : body.authHeader ? String(body.authHeader).trim() : preset?.authHeader || null,
        authValue: credential.authValue ?? null,
        readOnly: readBoolean(body.readOnly, false),
        enabled: readBoolean(body.enabled, true),
        instructions: body.instructions ? String(body.instructions) : null,
      })
      .run();
  } catch (err) {
    return json({ error: redactSecrets(err) }, 500);
  }

  takeCredential(body.credentialRef ? String(body.credentialRef) : null);
  takeOAuthTokens(body.credentialRef ? String(body.credentialRef) : null);

  const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get()!;
  return json({ server: toPublicServer(row) }, 201);
});

// PUT /api/mcp-servers/:id
router.put("mcp-servers/:id", async (ctx) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, ctx.params.id)).get();
  if (!row) return json({ error: "Server MCP tidak ditemukan." }, 404);
  const body = (await ctx.body()) as Record<string, unknown>;

  if (typeof body.name === "string") {
    const name = body.name.trim();
    const problem = nameProblem(name);
    if (problem) return json({ error: problem }, 400);
    const others = db.select().from(mcpServers).all().filter((s: typeof mcpServers.$inferSelect) => s.id !== row.id);
    if (others.some((s: typeof mcpServers.$inferSelect) => s.name.trim().toLowerCase() === name.toLowerCase())) {
      return json({ error: `Nama "${name}" sudah dipakai server MCP lain.` }, 409);
    }
  }

  const patch: Partial<typeof mcpServers.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.preset === "string") patch.preset = body.preset;
  if (typeof body.transport === "string") patch.transport = body.transport;
  if (body.url !== undefined) patch.url = body.url ? String(body.url).trim() : null;
  if (body.command !== undefined) patch.command = body.command ? String(body.command).trim() : null;
  if (body.argsJson !== undefined) patch.argsJson = parseJson(body, "argsJson");
  if (body.envJson !== undefined) patch.envJson = parseJson(body, "envJson");
  if (typeof body.authKind === "string") patch.authKind = body.authKind as any;
  if (body.authHeader !== undefined) patch.authHeader = body.authHeader ? String(body.authHeader).trim() : null;

  // A credential is written only when the form actually acquired a new one. An
  // empty field means "leave what is stored", so a save after editing an
  // unrelated field cannot wipe the token.
  const credential = credentialFrom(body);
  if (credential.authKind) patch.authKind = credential.authKind;
  if (credential.authHeader !== undefined) patch.authHeader = credential.authHeader;
  if (credential.authValue !== undefined) patch.authValue = credential.authValue;

  if (body.readOnly !== undefined) patch.readOnly = readBoolean(body.readOnly, row.readOnly);
  if (body.enabled !== undefined) patch.enabled = readBoolean(body.enabled, row.enabled);
  if (body.instructions !== undefined) patch.instructions = body.instructions ? String(body.instructions) : null;

  db.update(mcpServers).set(patch).where(eq(mcpServers.id, row.id)).run();
  takeCredential(body.credentialRef ? String(body.credentialRef) : null);
  takeOAuthTokens(body.credentialRef ? String(body.credentialRef) : null);
  await closeServerClient(row.id);

  const updated = db.select().from(mcpServers).where(eq(mcpServers.id, row.id)).get()!;
  return json({ server: toPublicServer(updated) });
});

// DELETE /api/mcp-servers/:id
router.delete("mcp-servers/:id", async (ctx) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, ctx.params.id)).get();
  if (!row) return json({ error: "Server MCP tidak ditemukan." }, 404);
  await closeServerClient(row.id);
  db.delete(mcpServers).where(eq(mcpServers.id, row.id)).run();
  return json({ ok: true });
});

// POST /api/mcp-servers/:id/test — test connection and refresh tool list
router.post("mcp-servers/:id/test", async (ctx) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, ctx.params.id)).get();
  if (!row) return json({ error: "Server MCP tidak ditemukan." }, 404);

  const body = (await ctx.body()) as Record<string, unknown>;
  const credential = credentialFrom(body);
  const candidate = {
    ...row,
    ...(body.url !== undefined ? { url: body.url ? String(body.url) : null } : {}),
    ...(body.authKind !== undefined ? { authKind: body.authKind as any } : {}),
    ...(body.authHeader !== undefined ? { authHeader: body.authHeader ? String(body.authHeader) : null } : {}),
    ...(credential.authKind ? { authKind: credential.authKind } : {}),
    ...(credential.authValue !== undefined ? { authValue: credential.authValue } : {}),
  };

  const started = Date.now();
  try {
    const { tools, count, instructions } = await fetchServerTools(candidate as any);
    const now = new Date().toISOString();
    db.update(mcpServers)
      .set({
        toolCount: count,
        lastStatus: "ok",
        lastError: null,
        lastCheckedAt: now,
        ...(instructions ? { instructions } : {}),
        updatedAt: now,
      })
      .where(eq(mcpServers.id, row.id))
      .run();

    return json({
      success: true,
      message: `Berhasil terhubung. Ditemukan ${count} tool.`,
      latencyMs: Date.now() - started,
      toolCount: count,
      tools: Object.keys(tools),
    });
  } catch (err: any) {
    const msg = redactSecrets(err?.message ?? String(err), row.authValue);
    const now = new Date().toISOString();
    db.update(mcpServers)
      .set({
        lastStatus: "error",
        lastError: msg,
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(mcpServers.id, row.id))
      .run();

    return json({
      success: false,
      message: `Gagal terhubung: ${msg}`,
      latencyMs: Date.now() - started,
    });
  }
});

// GET /api/mcp-servers/gh/status — is the `gh` CLI installed and logged in?
//
// GitHub MCP has no dynamic client registration, so its "auto connect" is the
// gh CLI's existing authorization rather than a browser flow. The UI shows this
// state and refreshes it on demand.
router.get("mcp-servers/gh/status", async () => json(await ghStatus()));

// POST /api/mcp-servers/gh/token — hand the gh CLI token to the form.
//
// Nothing is written: the token goes back to the UI as an unsaved credential and
// only becomes a row when the user presses Simpan. A token acquired and then
// discarded (Batal, or a preset change) must leave no trace.
router.post("mcp-servers/gh/token", async () => {
  const status = await ghStatus();
  if (!status.installed) {
    return json({ error: "gh CLI tidak ditemukan. Pasang dulu: https://cli.github.com" }, 400);
  }
  if (!status.authenticated) {
    return json({ error: "gh CLI belum login. Jalankan `gh auth login` di terminal, lalu muat ulang status." }, 400);
  }

  let token: string;
  try {
    token = await readGhToken();
  } catch (err: any) {
    return json({ error: redactSecrets(err?.message ?? String(err)) }, 400);
  }

  const credentialRef = putCredential({ authKind: "header", authHeader: "Authorization", authValue: token });
  return json({ ok: true, account: status.account, credentialRef });
});

// POST /api/mcp-servers/oauth/start — begin the MCP OAuth flow (FR: external MCP)
//
// The authorization URL comes from the server's own metadata (dynamic client
// registration + PKCE), so it is not something we can build by hand: a
// hardcoded provider URL is what produced the earlier 404.
//
// This takes a URL, not a row id: connecting must work on an unsaved draft, and
// nothing is written here. The credential is handed back by reference and only
// becomes a row when the user saves.
router.post("mcp-servers/oauth/start", async (ctx) => {
  const body = (await ctx.body()) as Record<string, unknown>;
  const url = body.url ? String(body.url).trim() : "";
  if (!url) return json({ error: "Endpoint server MCP belum diisi." }, 400);

  try {
    const { authorizationUrl, state } = await beginOAuth(url);
    if (!authorizationUrl) return json({ authorized: true, state });
    return json({ authorized: false, authorizationUrl, state });
  } catch (err: any) {
    // A provider that refuses to register us cannot be fixed by retrying, so the
    // UI gets a distinct answer and points at a personal access token instead.
    if (isRegistrationUnsupported(err)) {
      return json(
        {
          error:
            "Server ini tidak menerima pendaftaran klien otomatis (OAuth dinamis ditolak). " +
            "Pakai Manual Configuration dengan Personal Access Token dari akun Anda.",
          registrationUnsupported: true,
        },
        409,
      );
    }
    if (err instanceof UnsafeMcpUrlError) {
      return json({ error: err.message }, 400);
    }
    return json({ error: redactSecrets(err?.message ?? String(err)) }, 502);
  }
});

// POST /api/mcp-servers/oauth/result — the credential a finished flow produced.
//
// The UI polls this with the flow's state while the browser window is open, so
// it can fill the form the moment the user approves. `pending` is the normal
// answer until then.
router.post("mcp-servers/oauth/result", async (ctx) => {
  const body = (await ctx.body()) as Record<string, unknown>;
  const state = body.state ? String(body.state) : "";
  const authValue = peekOAuthTokens(state);
  if (!authValue) return json({ pending: true });
  // Only the reference travels: the token itself stays on the server until the
  // row is saved (see `credentialFrom`).
  return json({ pending: false, credentialRef: state, authKind: "oauth" as const, authHeader: null });
});

// GET /api/mcp-servers/oauth/callback — the browser lands here after approval.
router.get("mcp-servers/oauth/callback", async (ctx) => {
  const code = ctx.query.get("code");
  const state = ctx.query.get("state");
  const failed = ctx.query.get("error");

  // Everything below is user/provider controlled (`failed` comes straight from
  // the query string), so it is escaped before it reaches the document.
  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

  const page = (title: string, body: string, success: boolean) => {
    const safeTitle = escapeHtml(title);
    const safeBody = escapeHtml(body);
    const accent = success ? "#6d7cff" : "#f87171";
    return new Response(
      `<!doctype html>
      <html lang="id">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${safeTitle} — Onesist</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
            padding: 16px; background: #09090b; color: #f4f4f5;
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          }
          .card {
            position: relative; width: 100%; max-width: 420px; padding: 24px;
            background: #18181b; border: 1px solid #27272a; border-radius: 16px;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45); animation: fade-in 300ms ease-out;
          }
          .card::before {
            content: ""; position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
            width: 96px; height: 3px; border-radius: 999px;
            background: linear-gradient(90deg, transparent, ${accent}, transparent);
          }
          .top { display: flex; align-items: flex-start; gap: 16px; }
          .icon {
            flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
            border: 1px solid #27272a; border-radius: 12px; background: ${success ? "rgba(109,124,255,0.1)" : "rgba(248,113,113,0.1)"};
            color: ${accent};
          }
          h1 { margin: 0; font-size: 16px; letter-spacing: -0.01em; }
          p { margin: 6px 0 0; font-size: 14px; line-height: 1.55; color: #a1a1aa; word-break: break-word; }
          .foot {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a;
            font-size: 12px; color: #a1a1aa;
          }
          button {
            flex: none; cursor: pointer; padding: 6px 12px; border-radius: 8px;
            border: 1px solid #27272a; background: transparent; color: #f4f4f5;
            font: inherit; transition: border-color 150ms, background 150ms;
          }
          button:hover { border-color: ${accent}; background: #1f1f23; }
          @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="top">
            <div class="icon">${
              success
                ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`
                : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
            }</div>
            <div>
              <h1>${safeTitle}</h1>
              <p>${safeBody}</p>
            </div>
          </div>
          <div class="foot">
            <span>${
              success
                ? `Jendela ini akan tertutup dalam <span id="countdown">2</span> detik…`
                : "Silakan tutup jendela ini atau coba lagi."
            }</span>
            <button onclick="window.close()">Tutup Jendela</button>
          </div>
        </div>
        ${
          success
            ? `<script>
                let seconds = 2;
                const el = document.getElementById("countdown");
                const timer = setInterval(() => {
                  seconds--;
                  if (el) el.textContent = String(seconds);
                  if (seconds <= 0) { clearInterval(timer); window.close(); }
                }, 1000);
              </script>`
            : ""
        }
      </body>
      </html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  };

  if (failed) return page("Otorisasi ditolak", `Server MCP menolak permintaan: ${failed}.`, false);
  if (!code || !state || !hasPendingOAuth(state)) {
    return page("Otorisasi gagal", "Parameter OAuth tidak lengkap atau sesi sudah kedaluwarsa.", false);
  }

  try {
    await completeOAuth(state, code);
    return page("Otorisasi berhasil", "Token sudah disimpan. Jendela ini akan tertutup.", true);
  } catch (err: any) {
    return page("Otorisasi gagal", String(err?.message ?? err), false);
  }
});

// POST /api/mcp-servers/test-draft — test unsaved draft
router.post("mcp-servers/test-draft", async (ctx) => {
  const body = (await ctx.body()) as Record<string, unknown>;
  const credential = credentialFrom(body);
  const candidate = {
    id: "draft",
    name: String(body.name ?? "Draft"),
    transport: (body.transport as any) ?? "http",
    url: body.url ? String(body.url) : null,
    command: body.command ? String(body.command) : null,
    argsJson: parseJson(body, "argsJson"),
    envJson: parseJson(body, "envJson"),
    authKind: credential.authKind ?? ((body.authKind as any) ?? "none"),
    authHeader: body.authHeader ? String(body.authHeader) : null,
    authValue: credential.authValue ?? null,
  };

  const started = Date.now();
  try {
    const { tools, count } = await fetchServerTools(candidate as any);
    return json({
      success: true,
      message: `Berhasil terhubung. Ditemukan ${count} tool.`,
      latencyMs: Date.now() - started,
      toolCount: count,
      tools: Object.keys(tools),
    });
  } catch (err: any) {
    return json({
      success: false,
      message: `Gagal terhubung: ${redactSecrets(err?.message ?? String(err), candidate.authValue)}`,
      latencyMs: Date.now() - started,
    });
  }
});
