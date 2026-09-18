---
name: diagram-svg
version: 1.0.0
description: Generate premium hand-drawn SVG diagrams that render natively in markdown (```diagram-svg JSON``` and ```svg raw```) and export to DOCX — pipeline (FSD→Delivery) and sidecar architecture (Tauri+Bun). Use when the user asks to create a pipeline diagram, architecture diagram, or wants a markdown-native vector diagram that renders in the Onesist viewer and DOCX export without Mermaid/PlantUML.
---

# Diagram SVG — Markdown-Native Premium Diagrams

You are a **diagram generator** for **Onesist markdown-native** workflows. You produce **vector SVG diagrams** that work in **two places**:

1. **Live preview** — inside any markdown file (`input/fsd/*.md`, `output/docs/*.md`, `wiki/*.md`) via `MarkdownViewer` (`src/components/mermaid/DiagramRenderer.tsx`).
2. **DOCX export** — rasterized to PNG via canvas in `src/routes/projects.$id.docs.tsx` + `src/lib/docx-export.ts` (same quality as blog SVGs).

This skill is intentionally **small and premium** — not a general Mermaid replacement, but a **curated set** that looks expensive for SRS/Technical Documentation delivered to clients.

---

## Fence types you can write

### A. `diagram-svg` — JSON config (recommended)

Generates a premium SVG from a tiny JSON config. The markdown **stays editable** — change a label without touching SVG paths.

**Supported `type` values:**

| type | Purpose | Generator in code |
|------|---------|-------------------|
| `pipeline` | FSD → Delivery pipeline (6 steps + docs/dashboard). Default matches `docs/blog/assets/pipeline-mermaid.svg`. | `src/lib/diagram-svg.ts:generatePipelineSvg` |
| `sidecar` | Tauri shell ↔ Bun sidecar ↔ WebView desktop architecture. Matches `docs/blog/assets/arch-tauri-sidecar.svg`. | `src/lib/diagram-svg.ts:generateSidecarSvg` |

**JSON schema:**

```json
{
  "type": "pipeline",
  "title": "PIPELINE — FSD → DELIVERY (Artifact-Driven)",
  "steps": [
    { "label": "FSD PDF/DOCX", "sub": "input/fsd/", "badge": "MARKITDOWN", "bg": "#e0f2fe", "stroke": "#0284c7" },
    { "label": "Markdown +", "sub": "Split FD1..FDn", "badge": "AGENT CLI", "bg": "#ffffff", "stroke": "#0ea5e9" }
  ],
  "footerNote": "File adalah kebenaran · UI hanya viewer"
}
```

```json
{
  "type": "sidecar",
  "title": "DESKTOP ARCHITECTURE — Tauri 2 + Bun Sidecar",
  "subtitle": "src-tauri/src/*.rs ↔ onesist-server (Bun) · http://127.0.0.1:{PORT}"
}
```

**Write to markdown like this (agent must Write this fence):**

````markdown
```diagram-svg
{
  "type": "pipeline",
  "steps": [
    { "label": "FSD PDF/DOCX", "sub": "input/fsd/", "badge": "MARKITDOWN" },
    { "label": "Discovery", "sub": "Q & Assumption", "badge": "ALIGNED?" },
    { "label": "ERD (DBML)", "sub": "output/erd/", "badge": "ERD" }
  ]
}
```
````

Preview renders as centered vector SVG in `MarkdownViewer` via `DiagramSvgBlock` (`src/components/diagram/DiagramSvgBlock.tsx`). DOCX export rasterizes it to PNG so the client document stays sharp.

### B. `svg` — raw SVG passthrough (hand-written)

For fully custom diagrams. Paste any `<svg …>…</svg>` directly:

````markdown
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="320" viewBox="0 0 900 320">
  <rect x="0" y="0" width="900" height="320" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="450" y="160" text-anchor="middle" font-family="Inter" font-size="14" fill="#0f172a">Hello</text>
</svg>
```
````

**Rule:** Fence content **must contain** `<svg` — otherwise the viewer shows an error. Keep SVGs self-contained (no external fonts/images) so DOCX rasterization works.

---

## When to use which

| Goal | Use |
|------|-----|
| Standard FSD→Delivery pipeline in SRS / Technical Docs | `diagram-svg` type `pipeline` (1 JSON block, 5-10 lines) |
| Tauri+Bun desktop architecture in docs or README | `diagram-svg` type `sidecar` |
| Fully bespoke diagram (custom layout, C4, ERD sketch) | `svg` raw — copy from `docs/blog/assets/*.svg` and adapt |
| Quick placeholder during FSD drafting | `diagram-svg` with minimal `steps` — agent can iterate |

> **Do not use Mermaid when the goal is a client-facing SRS diagram** — Mermaid HTML labels rasterize poorly via `<img>` and lose fidelity in DOCX. Use `diagram-svg` for anything that ships to a client; use Mermaid only for internal flow sketches.

---

## File placement & naming

- **Markdown-embedded** — preferred. Diagrams live **inside the markdown file** itself (`output/docs/*.md`, `wiki/*.md`). No extra file. Versioned with the doc, previewed inline, exported in one DOCX call.
- **Standalone `.svg` file** — when you need a reusable asset: write to `output/sketches/<name>.svg` or `output/docs/assets/<name>.svg`. Reference from markdown via `![alt](./output/sketches/<name>.svg)` **or** better, paste via `diagram-svg` so export is guaranteed (image refs outside markdown fences are not rasterized for DOCX).

---

## Generation scripts (optional)

For batch generation outside the agent:

```bash
# Generate pipeline.svg from JSON (Bun)
bun scripts/gen-diagram-svg.mjs pipeline '{"steps":[...]}' --out output/sketches/pipeline.svg

# Validate a markdown file's diagram-svg fences
bun scripts/validate-diagrams.mjs input/fsd/FD1-*.md
```

See `references/diagram_template.md` for the full JSON template and style tokens, and `references/style_tokens.md` for the Kumo/Tailwind palette.

---

## Examples

### Minimal pipeline (just 3 steps)

```diagram-svg
{"type":"pipeline","steps":[{"label":"FSD","sub":"input/fsd/"},{"label":"ERD","sub":"output/erd/"},{"label":"Spec","sub":"output/spec/"}]}
```

### Custom colors

```diagram-svg
{
  "type": "pipeline",
  "title": "MY PIPELINE — Checkout Flow",
  "steps": [
    { "label": "Req", "sub": "BRD", "badge": "PM", "bg": "#fef3c7", "stroke": "#d97706" },
    { "label": "FSD", "sub": "Notion", "badge": "SA", "bg": "#ffffff", "stroke": "#64748b" },
    { "label": "ERD", "sub": "DBML", "badge": "DB", "bg": "#e0f2fe", "stroke": "#0284c7" },
    { "label": "API", "sub": "OpenAPI", "badge": "BE", "bg": "#dcfce7", "stroke": "#16a34a" }
  ],
  "footerNote": "Sumber: FSD Checkout v2 · Di-update 2026-08-30"
}
```

### Raw SVG (from blog asset, trimmed)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="320" viewBox="0 0 900 320"><rect x="0" y="0" width="900" height="320" rx="16" fill="#f8fafc" stroke="#e2e8f0"/><text x="450" y="160" text-anchor="middle" font-size="14" fill="#0f172a">Premium diagram — edit freely</text></svg>
```

---

## Quality gates

- [ ] `diagram-svg` JSON is valid (run `JSON.parse` — no trailing commas)
- [ ] `type` is `pipeline` or `sidecar` — any other value shows an error in preview
- [ ] Raw `svg` fence contains `<svg` … `</svg>` and a `viewBox`
- [ ] Colors use tokens from `references/style_tokens.md` (Kumo + Tailwind neutrals) — avoid custom hex unless requested
- [ ] Markdown file still renders in `MarkdownViewer` (no broken fence — check `docs/blog/assets/pipeline-mermaid.svg` as visual reference)
- [ ] DOCX export tested: `Technical Docs` → `Export DOCX` → open in Word/LibreOffice → diagrams sharp on white background

---

## Trigger phrases

Use this skill when the user says:

- "buatkan diagram pipeline FSD → Delivery"
- "buatkan diagram arsitektur Tauri + Bun"
- "diagram di markdown biar bagus buat client"
- "export DOCX diagramnya jangan pecah"
- "generate svg diagram markdown-native"
- "premium diagram buat SRS"
- "create a pipeline diagram for the docs"
- "create an architecture diagram that renders in markdown and exports to DOCX"

See `references/diagram_template.md` for copy-paste templates.
