# OpenAPI 3.0 Generation

Run **OpenAPI generation** when the user asks to consolidate all spec artifacts into a single machine-readable `openapi.yaml`, e.g. "generate openapi.yaml", "bikin openapi dari spec", "consolidate semua endpoint jadi openapi".

## Inputs

Read artifacts from the project root (no need to @-mention them):

1. **`MASTER_SPEC_API.md`** at project root, if present — the rolling API spec (all endpoints).
2. **`output/spec/*.md`** — per-module API specs.

## Output

Write **EXACTLY ONE file** to **`output/spec/openapi.yaml`** — a complete OpenAPI 3.0 document for ALL endpoints found (merged from master + per-module specs, unique paths, no duplicates). Do NOT modify any other file.

## Rules

- `openapi: 3.0.x`, `info.title` = project name, `info.version: 1.0.0`.
- One path + operation per endpoint. Group by tag when useful.
- Per operation include:
  - `summary` — short endpoint title
  - `description` — condensed from the spec's Purpose/Body/Response
  - `tags` — `[Done]` if ready, `[In Develop]` if still changing
  - `requestBody` / `parameters` when the spec mentions a body/query (text description; schema may be empty `{}`)
  - `x-status: done` when the spec is complete/ready; `x-status: in-develop` when still changing
  - `x-phase: <number>` when the spec names a phase (e.g. "Phase 2", "P2", "Fase 3")
- Keep the YAML valid and parseable — no placeholders, no trailing junk.
- Only write `output/spec/openapi.yaml`. Do NOT modify any markdown file.
