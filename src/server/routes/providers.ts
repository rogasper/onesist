/**
 * BYOK provider endpoint (FR-A, FR-L).
 *
 * Rule that must never be broken in this file: `api_key` **never** leaves in
 * raw form. Every response carrying a provider MUST go through
 * `toPublicProvider()` (FR-A8).
 */
import { json } from "../http/response";
import { Router } from "../http/router";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { llmProviders } from "~/server/db/schema";
import {
  ENV_PROVIDER_ID,
  configFingerprint,
  discoverModels,
  envBootstrapProvider,
  getProvider,
  isProviderUsable,
  listProviders,
  maskApiKey,
  redactSecrets,
  testConnection,
  type ProviderRow,
} from "~/server/agent/config";
import { PROVIDER_PRESETS, getPreset, presetRequiresApiKey } from "~/server/agent/presets";
import { newId } from "~/server/agent/store";

export const router = new Router();

/** Harga per juta token (Fase 5.5). Angka non-negatif, selain itu dianggap kosong —
 *  harga negatif atau NaN akan menghasilkan biaya yang salah arah, dan lebih baik
 *  tidak menampilkan biaya sama sekali. */
function readPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}


/**
 * Provider shape for the UI. Replaces `api_key` with a masked version and adds
 * derived results so the UI does not have to compute them itself.
 */
function toPublicProvider(row: ProviderRow) {
  return {
    id: row.id,
    name: row.name,
    preset: row.preset,
    presetLabel: getPreset(row.preset)?.label ?? row.preset,
    apiStyle: row.apiStyle,
    endpoint: row.endpoint,
    /** Not the key. The UI only needs to know whether a key is set. */
    apiKeyMasked: maskApiKey(row.apiKey),
    hasApiKey: !!row.apiKey?.trim(),
    authMethod: row.authMethod,
    model: row.model,
    modelsJson: row.modelsJson,
    customHeadersJson: row.customHeadersJson,
    proxyUrl: row.proxyUrl,
    skipTlsVerify: row.skipTlsVerify,
    enableThinking: row.enableThinking,
    effortCapabilityJson: row.effortCapabilityJson,
    maxOutputTokens: row.maxOutputTokens,
    inputPricePerMTok: row.inputPricePerMTok ?? null,
    outputPricePerMTok: row.outputPricePerMTok ?? null,
    contextWindow: row.contextWindow,
    cliAgent: row.cliAgent,
    cliPath: row.cliPath,
    /** Env can hold secrets, so only its names are sent. */
    cliEnvKeys: (() => {
      try {
        return Object.keys(JSON.parse(row.cliEnvJson ?? "{}"));
      } catch {
        return [];
      }
    })(),
    isDefault: row.isDefault,
    lastTestOk: row.lastTestOk,
    lastTestedAt: row.lastTestedAt,
    lastTestLatencyMs: row.lastTestLatencyMs,
    lastTestErrorCategory: row.lastTestErrorCategory,
    /** user | env — the UI marks which ones come from the environment (FR-A17). */
    source: row.source,
    /** Worth offering in the model picker? (FR-L3) */
    usable: isProviderUsable(row),
    /** Config fingerprint — used by the UI to judge whether the last test
     *  result still applies (FR-L5). */
    fingerprint: configFingerprint(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseList(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function readBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === 0 || v === 1) return v === 1;
  return fallback;
}

// GET /api/providers/presets — preset list for the picker (FR-L1)
router.get("providers/presets", async () =>
  json({
    presets: PROVIDER_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      apiStyle: p.apiStyle,
      authMethod: p.authMethod,
      endpoint: p.endpoint,
      cliAgent: p.cliAgent,
      defaultModel: p.defaultModel,
      defaultMaxOutputTokens: p.defaultMaxOutputTokens,
      requiresApiKey: p.requiresApiKey,
      hint: p.hint,
    })),
  }),
);

// GET /api/providers
router.get("providers", async () => {
  const rows = listProviders();
  const env = envBootstrapProvider();
  return json({
    providers: [
      ...rows.map(toPublicProvider),
      // Environment providers are shown separately and CLEARLY marked, so there
      // is no confusion about which key is in use (FR-A17).
      ...(env ? [toPublicProvider(env)] : []),
    ],
    envBootstrapActive: !!env && rows.length === 0,
  });
});

// POST /api/providers
router.post("providers", async (ctx) => {
  const body = await ctx.body();
  const name = String(body.name ?? "").trim();
  if (!name) return json({ error: "Nama konfigurasi wajib diisi." }, 400);

  const existing = listProviders();
  if (existing.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
    return json({ error: `Nama "${name}" sudah dipakai konfigurasi lain.` }, 409);
  }

  const presetId = String(body.preset ?? "custom-openai");
  const preset = getPreset(presetId);
  const apiStyle = String(body.apiStyle ?? preset?.apiStyle ?? "completions");
  const apiKey = body.apiKey === undefined || body.apiKey === null ? null : String(body.apiKey);

  const id = newId("prov");
  try {
    db.insert(llmProviders)
      .values({
        id,
        name,
        preset: presetId,
        apiStyle,
        endpoint: body.endpoint ? String(body.endpoint).replace(/\/+$/, "") : preset?.endpoint || null,
        apiKey,
        authMethod: String(body.authMethod ?? preset?.authMethod ?? "bearer"),
        model: body.model ? String(body.model).trim() : preset?.defaultModel ?? null,
        modelsJson: parseList(body, "models"),
        customHeadersJson: parseList(body, "customHeaders"),
        proxyUrl: body.proxyUrl ? String(body.proxyUrl) : null,
        skipTlsVerify: readBoolean(body.skipTlsVerify, false),
        enableThinking: readBoolean(body.enableThinking, false),
        effortCapabilityJson: parseList(body, "effortCapability"),
        inputPricePerMTok: readPrice(body.inputPricePerMTok),
        outputPricePerMTok: readPrice(body.outputPricePerMTok),
        maxOutputTokens:
          typeof body.maxOutputTokens === "number" && body.maxOutputTokens > 0
            ? body.maxOutputTokens
            : preset?.defaultMaxOutputTokens ?? null,
        contextWindow: typeof body.contextWindow === "number" ? body.contextWindow : null,
        cliAgent: preset?.cliAgent ?? (body.cliAgent ? String(body.cliAgent) : null),
        cliPath: body.cliPath ? String(body.cliPath) : null,
        cliEnvJson: parseList(body, "cliEnv"),
        isDefault: readBoolean(body.isDefault, existing.length === 0),
        source: "user",
      })
      .run();
  } catch (err) {
    return json({ error: redactSecrets(err) }, 500);
  }
  return json({ provider: toPublicProvider(getProvider(id)!) }, 201);
});

// PUT /api/providers/:id
router.put("providers/:id", async (ctx) => {
  const row = getProvider(ctx.params.id);
  if (!row) return json({ error: "Provider tidak ditemukan." }, 404);
  const body = await ctx.body();

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return json({ error: "Nama konfigurasi tidak boleh kosong." }, 400);
    const others = listProviders().filter((p) => p.id !== row.id);
    if (others.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      return json({ error: `Nama "${name}" sudah dipakai konfigurasi lain.` }, 409);
    }
  }

  const patch: Partial<typeof llmProviders.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.preset === "string") patch.preset = body.preset;
  if (typeof body.apiStyle === "string") patch.apiStyle = body.apiStyle;
  if (body.endpoint !== undefined) patch.endpoint = body.endpoint ? String(body.endpoint).replace(/\/+$/, "") : null;
  if (typeof body.authMethod === "string") patch.authMethod = body.authMethod;
  if (body.model !== undefined) patch.model = body.model ? String(body.model).trim() : null;
  if (body.maxOutputTokens !== undefined) patch.maxOutputTokens = body.maxOutputTokens === null ? null : Number(body.maxOutputTokens);
  if (body.inputPricePerMTok !== undefined) patch.inputPricePerMTok = readPrice(body.inputPricePerMTok);
  if (body.outputPricePerMTok !== undefined) patch.outputPricePerMTok = readPrice(body.outputPricePerMTok);
  if (body.contextWindow !== undefined) patch.contextWindow = body.contextWindow === null ? null : Number(body.contextWindow);
  if (body.proxyUrl !== undefined) patch.proxyUrl = body.proxyUrl ? String(body.proxyUrl) : null;
  if (body.skipTlsVerify !== undefined) patch.skipTlsVerify = readBoolean(body.skipTlsVerify, false);
  if (body.enableThinking !== undefined) patch.enableThinking = readBoolean(body.enableThinking, false);
  if (body.isDefault !== undefined) patch.isDefault = readBoolean(body.isDefault, false);
  if (body.cliPath !== undefined) patch.cliPath = body.cliPath ? String(body.cliPath) : null;
  for (const key of ["models", "customHeaders", "effortCapability", "cliEnv"] as const) {
    if (body[key] !== undefined) {
      const column = { models: "modelsJson", customHeaders: "customHeadersJson", effortCapability: "effortCapabilityJson", cliEnv: "cliEnvJson" }[key];
      (patch as any)[column] = parseList(body, key);
    }
  }

  // The API key only changes when the field is actually sent and non-empty —
  // so a form that omits the key does not wipe it by accident.
  if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    patch.apiKey = body.apiKey.trim();
    // Config changed → the previous test result no longer applies (FR-L5).
    patch.lastTestOk = null;
    patch.lastTestedAt = null;
    patch.lastTestLatencyMs = null;
    patch.lastTestErrorCategory = null;
  }
  if (body.clearApiKey === true) patch.apiKey = null;

  const configKeys = ["preset", "apiStyle", "endpoint", "authMethod", "model", "customHeaders", "proxyUrl", "skipTlsVerify"];
  if (configKeys.some((k) => body[k] !== undefined)) {
    patch.lastTestOk = null;
    patch.lastTestedAt = null;
  }

  // Only one provider may be the default.
  if (patch.isDefault === true) {
    db.update(llmProviders).set({ isDefault: false }).run();
  }

  db.update(llmProviders).set(patch).where(eq(llmProviders.id, row.id)).run();
  return json({ provider: toPublicProvider(getProvider(row.id)!) });
});

// DELETE /api/providers/:id
router.delete("providers/:id", async (ctx) => {
  const row = getProvider(ctx.params.id);
  if (!row) return json({ error: "Provider tidak ditemukan." }, 404);
  db.delete(llmProviders).where(eq(llmProviders.id, row.id)).run();
  return json({ deleted: true });
});

// POST /api/providers/:id/test — rich result, not a boolean (FR-A5)
router.post("providers/:id/test", async (ctx) => {
  const row = ctx.params.id === ENV_PROVIDER_ID ? envBootstrapProvider() : getProvider(ctx.params.id);
  if (!row) return json({ error: "Provider tidak ditemukan." }, 404);

  const body = await ctx.body().catch(() => ({}) as Record<string, unknown>);
  // When the form sends an unsaved config, test that — so the user can test
  // before saving.
  const candidate: ProviderRow =
    body && Object.keys(body).length > 0
      ? ({ ...row, ...(body as Partial<ProviderRow>) } as ProviderRow)
      : row;

  const result = await testConnection(candidate);

  // Store the result only for real DB rows, and only when the tested config is
  // the stored one (FR-L5).
  if (row.source === "user" && (!body || Object.keys(body).length === 0)) {
    try {
      db.update(llmProviders)
        .set({
          lastTestOk: result.success,
          lastTestedAt: new Date().toISOString(),
          lastTestLatencyMs: result.latencyMs ?? null,
          lastTestErrorCategory: result.errorCategory ?? null,
        })
        .where(eq(llmProviders.id, row.id))
        .run();
    } catch {
      /* a test result that fails to save is no reason to fail the response */
    }
  }
  return json({ result });
});

// POST /api/providers/test-draft — test an UNSAVED configuration (FR-A5).
//
// Why it exists: `Test` used to be available only for a SAVED provider, and the
// only way to test a new one was to press Test — which silently CREATED it
// (POST /api/providers, then a second call to test). So "test before apply" was
// impossible: either you saved a config you had not verified, or you never saw
// the result. This route maps the draft with the SAME field mapping as
// POST /api/providers and persists nothing, so what it tests is exactly what
// saving would produce.
router.post("providers/test-draft", async (ctx) => {
  const body = (await ctx.body()) as Record<string, unknown>;
  const presetId = String(body.preset ?? "custom-openai");
  const preset = getPreset(presetId);
  const candidate: ProviderRow = {
    id: "draft",
    name: String(body.name ?? "").trim() || "Draft",
    preset: presetId,
    apiStyle: String(body.apiStyle ?? preset?.apiStyle ?? "completions"),
    endpoint: body.endpoint ? String(body.endpoint).replace(/\/+$/, "") : preset?.endpoint || null,
    apiKey: body.apiKey === undefined || body.apiKey === null || body.apiKey === "" ? null : String(body.apiKey),
    authMethod: String(body.authMethod ?? preset?.authMethod ?? "bearer"),
    model: body.model ? String(body.model).trim() : preset?.defaultModel ?? null,
    modelsJson: parseList(body, "models"),
    customHeadersJson: parseList(body, "customHeaders"),
    proxyUrl: body.proxyUrl ? String(body.proxyUrl) : null,
    skipTlsVerify: readBoolean(body.skipTlsVerify, false),
    enableThinking: readBoolean(body.enableThinking, false),
    effortCapabilityJson: parseList(body, "effortCapability"),
    inputPricePerMTok: readPrice(body.inputPricePerMTok),
    outputPricePerMTok: readPrice(body.outputPricePerMTok),
    maxOutputTokens:
      typeof body.maxOutputTokens === "number" && body.maxOutputTokens > 0
        ? body.maxOutputTokens
        : preset?.defaultMaxOutputTokens ?? null,
    contextWindow: typeof body.contextWindow === "number" ? body.contextWindow : null,
    cliAgent: preset?.cliAgent ?? (body.cliAgent ? String(body.cliAgent) : null),
    cliPath: body.cliPath ? String(body.cliPath) : null,
    cliEnvJson: parseList(body, "cliEnv"),
    isDefault: false,
    lastTestOk: null,
    lastTestedAt: null,
    lastTestLatencyMs: null,
    lastTestErrorCategory: null,
    source: "user",
    createdAt: null,
    updatedAt: null,
  };
  const result = await testConnection(candidate);
  return json({ result });
});

// GET /api/providers/:id/models — discovery merged with stored models (FR-L4)
router.get("providers/:id/models", async (ctx) => {
  const row = ctx.params.id === ENV_PROVIDER_ID ? envBootstrapProvider() : getProvider(ctx.params.id);
  if (!row) return json({ error: "Provider tidak ditemukan." }, 404);
  const result = await discoverModels(row);
  return json(result);
});

// POST /api/providers/models — discovery with an as-yet-UNSAVED config.
//
 // Without this, the "Fetch list" button would only work for already-saved
// providers — meaning when ADDING a new provider (exactly when the model list
// is most needed for choosing) the model field would have to be typed manually.
// Its body is the same draft shape as the form.
router.post("providers/models", async (ctx) => {
  const body = (await ctx.body()) as Record<string, unknown>;
  const base = body.id && body.id !== ENV_PROVIDER_ID ? getProvider(String(body.id)) : undefined;
  const candidate = {
    ...(base ?? envBootstrapProvider() ?? {}),
    ...body,
    id: base?.id ?? "draft",
  } as ProviderRow;

  if (!candidate.endpoint?.trim() && candidate.apiStyle !== "cli") {
    return json({ models: [], supported: false, message: "Isi endpoint dulu supaya daftar model bisa diambil." });
  }
  const result = await discoverModels(candidate);
  return json(result);
});

// GET /api/providers/:id
router.get("providers/:id", async (ctx) => {
  const row = ctx.params.id === ENV_PROVIDER_ID ? envBootstrapProvider() : getProvider(ctx.params.id);
  if (!row) return json({ error: "Provider tidak ditemukan." }, 404);
  return json({ provider: toPublicProvider(row), requiresApiKey: presetRequiresApiKey(row.preset) });
});
