# Diagram SVG — Templates

Copy-paste these fences into any markdown file (`input/fsd/*.md`, `output/docs/*.md`, `wiki/*.md`, `docs/blog/*.md`). They render in `MarkdownViewer` and export to DOCX.

## Pipeline — Full (6 steps, matches blog)

````md
```diagram-svg
{
  "type": "pipeline",
  "title": "PIPELINE — FSD → DELIVERY (Artifact-Driven)",
  "steps": [
    { "label": "FSD PDF/DOCX", "sub": "input/fsd/", "badge": "MARKITDOWN", "bg": "#e0f2fe", "stroke": "#0284c7" },
    { "label": "Markdown +", "sub": "Split FD1..FDn", "badge": "AGENT CLI", "bg": "#ffffff", "stroke": "#0ea5e9" },
    { "label": "Discovery", "sub": "Q & Assumption", "badge": "ALIGNED?", "bg": "#ffffff", "stroke": "#0ea5e9" },
    { "label": "ERD (DBML)", "sub": "output/erd/", "badge": "VALIDATE_ERD", "bg": "#e0f2fe", "stroke": "#0284c7" },
    { "label": "Spec API", "sub": "+ openapi.yaml", "badge": "VALIDATE_SPEC", "bg": "#e0f2fe", "stroke": "#0284c7" },
    { "label": "Tasks +", "sub": "Timeline", "badge": "COMPARE", "bg": "#ffffff", "stroke": "#0ea5e9" }
  ],
  "footerNote": "File adalah kebenaran · UI hanya viewer · Agent baca file langsung, bukan chat history"
}
```
````

## Pipeline — Minimal (3 steps)

````md
```diagram-svg
{"type":"pipeline","title":"PIPELINE — Checkout Flow","steps":[{"label":"BRD","sub":"Business"},{"label":"FSD","sub":"SA"},{"label":"ERD","sub":"DBML"}]}
```
````

## Pipeline — Custom colors per step

````md
```diagram-svg
{
  "type": "pipeline",
  "title": "MY PIPELINE — Custom Palette",
  "steps": [
    { "label": "Req", "sub": "BRD", "badge": "PM", "bg": "#fef3c7", "stroke": "#d97706" },
    { "label": "FSD", "sub": "Notion", "badge": "SA", "bg": "#ffffff", "stroke": "#64748b" },
    { "label": "ERD", "sub": "DBML", "badge": "DB", "bg": "#e0f2fe", "stroke": "#0284c7" },
    { "label": "API", "sub": "OpenAPI", "badge": "BE", "bg": "#dcfce7", "stroke": "#16a34a" },
    { "label": "Task", "sub": "Jira", "badge": "PM", "bg": "#fdf2f8", "stroke": "#db2777" },
    { "label": "SIT", "sub": "QC", "badge": "TEST", "bg": "#f5f3ff", "stroke": "#7c3aed" }
  ]
}
```
````

## Sidecar Architecture — Default

````md
```diagram-svg
{"type":"sidecar"}
```
````

## Sidecar — Custom title

````md
```diagram-svg
{
  "type": "sidecar",
  "title": "ARCHITECTURE — Onesist Desktop v2",
  "subtitle": "Tauri 2 + Bun 1.3 · SQLite WAL · SSE"
}
```
````

## Raw SVG — Hand-written (full control)

````md
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200" viewBox="0 0 900 200" role="img">
  <rect x="0" y="0" width="900" height="200" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>
  <rect x="40" y="60" width="200" height="80" rx="12" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.8"/>
  <text x="140" y="96" text-anchor="middle" font-family="Inter" font-size="13" font-weight="700" fill="#0f172a">My Box</text>
  <text x="140" y="116" text-anchor="middle" font-family="Inter" font-size="11" fill="#64748b">subtitle</text>
</svg>
```
````

> Keep SVGs self-contained: inline `<style>` or attributes only, no external `<image>` or web fonts, `viewBox` required for correct rasterization in DOCX.

## Reusing blog assets

`docs/blog/assets/pipeline-mermaid.svg` and `docs/blog/assets/arch-tauri-sidecar.svg` are the reference SVGs. Copy their `<svg>` content into a ```svg fence and edit labels/colors directly for one-off client docs.
