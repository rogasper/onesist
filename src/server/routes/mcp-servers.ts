/**
 * External MCP servers endpoint (CRUD, test connection, list tools).
 */
import { json } from "../http/response";
import { Router } from "../http/router";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { mcpServers } from "~/server/db/schema";
import { fetchServerTools, getMcpClient, closeServerClient } from "~/server/mcp/client";
import { beginOAuth, completeOAuth, hasPendingOAuth, isRegistrationUnsupported } from "~/server/mcp/oauth";
import { ghStatus, readGhToken } from "~/server/mcp/gh";
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
  if (!name) return json({ error: "Nama server MCP tidak boleh kosong." }, 400);

  const existing = db.select().from(mcpServers).all();
  if (existing.some((s: typeof mcpServers.$inferSelect) => s.name.trim().toLowerCase() === name.toLowerCase())) {
    return json({ error: `Nama "${name}" sudah dipakai server MCP lain.` }, 409);
  }

  const presetId = String(body.preset ?? "custom");
  const preset = getMcpPreset(presetId);
  const id = newId("mcp");

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
        authKind: (body.authKind as any) ?? preset?.authKind ?? "none",
        authHeader: body.authHeader ? String(body.authHeader).trim() : preset?.authHeader || null,
        authValue: body.authValue !== undefined && body.authValue !== null ? String(body.authValue) : null,
        readOnly: readBoolean(body.readOnly, false),
        enabled: readBoolean(body.enabled, true),
        instructions: body.instructions ? String(body.instructions) : null,
      })
      .run();
  } catch (err) {
    return json({ error: redactSecrets(err) }, 500);
  }

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
    if (!name) return json({ error: "Nama server tidak boleh kosong." }, 400);
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
  if (body.authValue !== undefined && body.authValue !== null && String(body.authValue) !== "") {
    patch.authValue = String(body.authValue);
  }
  if (body.readOnly !== undefined) patch.readOnly = readBoolean(body.readOnly, row.readOnly);
  if (body.enabled !== undefined) patch.enabled = readBoolean(body.enabled, row.enabled);
  if (body.instructions !== undefined) patch.instructions = body.instructions ? String(body.instructions) : null;

  db.update(mcpServers).set(patch).where(eq(mcpServers.id, row.id)).run();
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
  const candidate = {
    ...row,
    ...(body.url !== undefined ? { url: body.url ? String(body.url) : null } : {}),
    ...(body.authKind !== undefined ? { authKind: body.authKind as any } : {}),
    ...(body.authHeader !== undefined ? { authHeader: body.authHeader ? String(body.authHeader) : null } : {}),
    ...(body.authValue !== undefined && body.authValue !== null && String(body.authValue) !== "" ? { authValue: String(body.authValue) } : {}),
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

// POST /api/mcp-servers/:id/gh/connect — adopt the gh CLI token for this server.
router.post("mcp-servers/:id/gh/connect", async (ctx) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, ctx.params.id)).get();
  if (!row) return json({ error: "Server MCP tidak ditemukan." }, 404);

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

  db.update(mcpServers)
    .set({
      authKind: "header",
      authHeader: "Authorization",
      authValue: token,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(mcpServers.id, row.id))
    .run();
  await closeServerClient(row.id);

  return json({ ok: true, account: status.account, tokenPrefix: status.tokenPrefix });
});

// POST /api/mcp-servers/:id/oauth/start — begin the MCP OAuth flow (FR: external MCP)
//
// The authorization URL comes from the server's own metadata (dynamic client
// registration + PKCE), so it is not something we can build by hand: a
// hardcoded provider URL is what produced the earlier 404.
router.post("mcp-servers/:id/oauth/start", async (ctx) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, ctx.params.id)).get();
  if (!row) return json({ error: "Server MCP tidak ditemukan." }, 404);
  const url = row.url?.trim();
  if (!url) return json({ error: "Endpoint server MCP belum diisi." }, 400);

  try {
    const authorizationUrl = await beginOAuth(row.id, url);
    if (!authorizationUrl) return json({ authorized: true, message: "Token yang tersimpan masih berlaku." });
    return json({ authorized: false, authorizationUrl });
  } catch (err: any) {
    // A provider that refuses to register us cannot be fixed by retrying, so the
    // UI gets a distinct answer and points at a personal access token instead.
    if (isRegistrationUnsupported(err)) {
      return json(
        {
          error:
            `Server ini tidak menerima pendaftaran klien otomatis (OAuth dinamis ditolak ${row.name}). ` +
            "Pakai Manual Configuration dengan Personal Access Token dari akun Anda.",
          registrationUnsupported: true,
        },
        409,
      );
    }
    return json({ error: redactSecrets(err?.message ?? String(err), row.authValue) }, 502);
  }
});

// GET /api/mcp-servers/oauth/callback — the browser lands here after approval.
router.get("mcp-servers/oauth/callback", async (ctx) => {
  const code = ctx.query.get("code");
  const state = ctx.query.get("state");
  const failed = ctx.query.get("error");

  const page = (title: string, body: string) =>
    new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
        `<body style="font-family:system-ui;padding:2rem;background:#111;color:#eee">` +
        `<h2>${title}</h2><p>${body}</p>` +
        `<script>setTimeout(function(){window.close()},1500)</script></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  if (failed) return page("Otorisasi ditolak", `Server MCP menolak permintaan: ${failed}.`);
  if (!code || !state || !hasPendingOAuth(state)) {
    return page("Otorisasi gagal", "Parameter OAuth tidak lengkap atau sesi sudah kedaluwarsa.");
  }

  try {
    await completeOAuth(state, code);
    return page("Otorisasi berhasil", "Token sudah disimpan. Jendela ini akan tertutup.");
  } catch (err: any) {
    return page("Otorisasi gagal", String(err?.message ?? err));
  }
});

// POST /api/mcp-servers/test-draft — test unsaved draft
router.post("mcp-servers/test-draft", async (ctx) => {
  const body = (await ctx.body()) as Record<string, unknown>;
  const candidate = {
    id: "draft",
    name: String(body.name ?? "Draft"),
    transport: (body.transport as any) ?? "http",
    url: body.url ? String(body.url) : null,
    command: body.command ? String(body.command) : null,
    argsJson: parseJson(body, "argsJson"),
    envJson: parseJson(body, "envJson"),
    authKind: (body.authKind as any) ?? "none",
    authHeader: body.authHeader ? String(body.authHeader) : null,
    authValue: body.authValue ? String(body.authValue) : null,
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
