# Style Tokens — Kumo + Tailwind neutrals for diagrams

Use these colors so diagrams match the Onesist UI (Kumo) and blog SVGs.

## Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| kumo-default bg | `#f8fafc` | Page/frame background |
| kumo-elevated | `#ffffff` | Card/box fill (neutral) |
| kumo-accent light | `#e0f2fe` | Accent card (sky-100) — use for `bg` when a step is "generated" |
| sky / violet / amber pastels | `#dcfce7` / `#f5f3ff` / `#fef3c7` | Per-phase custom `bg` |

## Strokes

| Token | Hex | Usage |
|-------|-----|-------|
| sky-600 | `#0284c7` | Accent stroke for FSD/ERD/Spec |
| sky-500 | `#0ea5e9` | Default stroke |
| amber-500 | `#f59e0b` | Bun / warm accent |
| purple | `#7c3aed` | Kafka / violet |
| gray | `#64748b` / `#94a3b8` | Arrows, dashed, footer |

## Text

| Token | Hex | Usage |
|-------|-----|-------|
| slate-900 | `#0f172a` | Title/label |
| slate-600 | `#475569` | Subtitle |
| sky-700 | `#0369a1` | Badge |
| muted | `#94a3b8` | Footer/hint |

## Typography

- Title: `Inter, ui-sans-serif` 12–13px, weight 700-800
- Label: `Inter` 12.5px, weight 600
- Sub: `Inter` 10–10.5px, `#475569`
- Badge: `Inter` 9px, weight 700, `#0369a1`
- Mono/code in nodes: `ui-monospace, Menlo` 9px, `#334155`

## Dimensions (keep these for consistency)

- Pipeline box: `118×68` (w×h), `rx=12`, gap `22`, top row `y=62`
- Sidecar columns: Tauri `260×210`, Bun `300×210`, WebView `216×210`
- Overall canvas: `900×320` (pipeline) / `900×360` (sidecar), `rx=16`

Do not invent new box sizes unless the step count changes.
