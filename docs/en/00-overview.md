# 00 — Overview

This document explains **Onesist (SA Dashboard)** from the user's point of view: how the app helps System Analysts work, the philosophy behind it, and how the agent CLI acts as the main "engine" behind the app.

---

## 1. About the App

Onesist is a dashboard for **System Analysts** working with functional requirement documents and producing engineering artifacts:

| Artifact | Description | Default location |
|----------|-------------|------------------|
| **FSD (Functional Specification Document)** | Requirement documents (PDF/DOCX/PPTX/MD) converted to Markdown and split per feature (FD) | `input/fsd/` |
| **ERD** | Entity Relationship Diagram in **DBML** format | `output/erd/` |
| **API Spec** | Endpoint specification in Markdown + **openapi.yaml** (OpenAPI 3.0) | `output/spec/` |
| **Task Cards** | Developer task cards with Story Points, assignee, dependencies | `output/task/` |
| **Timeline** | HTML Gantt chart (week estimates, priorities, parallel work) | `output/timeline*.html` |
| **Technical Documentation** | Final SRS / TD document for the client | `output/td/` |
| **Master artifacts** | Rolling context: `MASTER_ERD.md`, `MASTER_SPEC_API.md` | project root |

## 2. Philosophy: Agent-CLI First

The workflow in this documentation **does not rely on UI action buttons**. All transformations are done by **giving commands (prompts) to the agent CLI** — usually **OpenCode** — which:

- runs **inside the project folder** (cwd = project root),
- uses installed skills: **`fsd-analyzer`** (produces SA artifacts) and **`markitdown`** (converts documents to Markdown),
- reads/writes files in `input/`, `output/`, and `MASTER_*` directly.

Why this approach:

1. **Full control** — you decide exactly what is generated, to which file, and in what format.
2. **Transparent** — all artifacts are plain Markdown/DBML/HTML files you can open in any editor.
3. **Avoid unstable UI** — some UI action buttons are still experimental; the agent-CLI flow is more reliable.

The UI (dashboard) is still useful as a **viewer**: files produced in `output/` are rendered automatically (via file watcher / SSE), e.g. ERD diagrams, spec cards, tasks, and timeline.

## 3. How the Embedded Terminal Works

The **Terminal** button (in the project header) opens a panel with an interactive **agent CLI** session:

```mermaid
flowchart LR
  UI[Dashboard terminal panel] -->|WebSocket| WS[Terminal Server]
  WS -->|PTY spawn| CLI[Agent CLI: opencode / claude / codex]
  CLI -->|cwd = project root| SK[Skills: fsd-analyzer, markitdown]
  SK -->|read/write files| FS[input/ output/ MASTER_*]
  FS -->|file watcher + SSE| UI2[Dashboard tabs auto-refresh]
```

- When the panel opens, an **`opencode`** session (or the project's default agent) is spawned in the project root.
- You type **prompts** directly into the terminal — no need to run `opencode run` manually (though you can, see §4).
- You can close and reopen the terminal without losing the running session (the session is reattached).
- Don't run the same agent externally at the same time for the same folder.

## 4. Alternative: Running from an External Terminal

To run from a regular OS terminal:

```bash
cd /path/to/project
opencode run "<prompt>" --auto --dir .
```

General form per agent:

| Agent | Command |
|-------|---------|
| opencode | `opencode run "<prompt>" --auto --dir <projectRoot>` |
| claude | `claude -p "<prompt>"` (run from project root) |
| codex | `codex exec "<prompt>"` (run from project root) |

> Important: run from the **project root** so the `.agents/skills/` skills and the `input/`, `output/`, `MASTER_*` files are found.

## 5. Prerequisites

- **Agent CLI installed** on the system (opencode recommended) — detected automatically when opening a project (the project tab warns if skills failed to install).
- **Project skills installed** into `.agents/skills/` (fsd-analyzer, markitdown) — auto-installed when a project is first opened.
- **Project folder** containing (or about to contain) `input/fsd/`, `output/`, and optionally `MASTER_ERD.md` / `MASTER_SPEC_API.md`.

---

Next: [01 — Quick Start](01-quickstart.md)
