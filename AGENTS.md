# SA Dashboard — Agent Instructions

This is the **SA Dashboard** web application — a full-stack React app that serves as the UI for System Analysts working with AI-generated artifacts (FSD, API specs, ERD, tasks, timelines).

## Tech Stack

- **Runtime:** Bun 1.3+
- **Framework:** React 19 + TanStack Start (SSR)
- **Router:** TanStack Router (file-based)
- **UI:** @cloudflare/kumo + Tailwind CSS 4
- **Editor:** CodeMirror 6 (+ @codemirror/lang-markdown)
- **Diagrams:** Mermaid 11, DBML (@dbml/core)
- **Database:** Drizzle ORM + Bun SQLite (file: `data.db`)
- **Terminal:** xterm.js (embedded agent terminal)
- **Build:** Vite 8, TypeScript 6

## Agent Configuration

Defined in `opencode.json`. Three agents:

| Agent | Model | Permission | Use |
|-------|-------|-----------|-----|
| `architecture-plan` | deepseek-v4-pro | read-only | Architecture design, planning, reasoning about code structure |
| `execute` | deepseek-v4-flash | edit + bash | Write code, run commands, implement features |
| `code-reviewer` | mimo-v2.5 | read-only | Review for security, performance, bugs, edge cases |

Use `execute` agent to make code changes. Use `architecture-plan` to reason about design before implementing.

## Project Structure

```
app/
├── opencode.json           # OpenCode agent config
├── package.json            # Dependencies + scripts
├── vite.config.ts          # Vite + plugins (TanStack, Tailwind, terminal server)
├── tsconfig.json           # TypeScript config (paths: ~/ → ./src)
├── data.db                 # SQLite database (Drizzle + auto-migrations)
├── src/
│   ├── server.ts           # TanStack Start fetch handler → API router
│   ├── client.tsx          # Client entry point
│   ├── ssr.tsx             # SSR entry point
│   ├── router.tsx          # Router configuration
│   ├── routeTree.gen.ts    # Auto-generated route tree
│   ├── styles.css          # Global styles + Tailwind
│   ├── shared/
│   │   └── types.ts        # Shared TypeScript interfaces (WikiPage, Task)
│   ├── server/
│   │   ├── db/
│   │   │   ├── client.ts   # Drizzle + SQLite initialization + migrations
│   │   │   ├── schema.ts   # Drizzle schema (projects, tasks, wiki, fsd, erd, etc.)
│   │   │   └── seed.ts     # Database seeder
│   │   ├── api-router.ts   # Monolithic API router (/api/* endpoints)
│   │   ├── events.ts       # SSE event bus for real-time updates
│   │   ├── file-watcher.ts # Polling file watcher for hot reload
│   │   ├── agent-runner.ts # Spawns OpenCode CLI as child process
│   │   ├── ws-terminal.ts  # WebSocket terminal handler
│   │   └── terminal-server.ts # xterm.js WebSocket server (port 4323)
│   ├── lib/
│   │   ├── agent-cli.ts    # Detect installed agents (opencode, claude, codex)
│   │   ├── agent-command.ts # Build agent CLI command strings
│   │   ├── agent-prompts.ts # Build prompts for generate/gap/td modes
│   │   ├── file-router.ts  # File scanning, routing, read/write utils
│   │   ├── spec-parser.ts  # Parse API spec markdown into structured modules/endpoints
│   │   ├── task-parser.ts  # Parse task markdown files into task cards
│   │   ├── markitdown.ts   # Document-to-markdown conversion (OpenCode + CLI)
│   │   ├── fsd-completeness.ts # FSD section completeness checker
│   │   ├── project-skills.ts   # Skill detection + installation for projects
│   │   ├── project-queries.ts  # Data loading for routes
│   │   ├── use-file-data.ts    # React hooks for file listing/content/watching
│   │   ├── erd-layout.ts       # Graphviz-based ERD node layout
│   │   ├── dbml.ts             # DBML to ERD node graph conversion
│   │   └── xterm-cache.ts      # Terminal session cache
│   ├── routes/
│   │   ├── __root.tsx           # Root layout (sidebar nav)
│   │   ├── index.tsx            # Projects dashboard (open/delete/create)
│   │   ├── projects.$id.tsx     # Project layout (tabs, overview, file browser)
│   │   ├── projects.$id.erd.tsx # ERD editor + DBML viewer
│   │   ├── projects.$id.spec.tsx # API spec viewer + search
│   │   ├── projects.$id.tasks.tsx # Task management (list/cards, search, filters)
│   │   ├── projects.$id.wiki.tsx  # Wiki page editor
│   │   ├── projects.$id.fsd.tsx   # FSD Analyzer (editor, completeness, upload, agent)
│   │   └── projects.$id.settings.tsx # Project settings
│   └── components/
│       ├── agent/          # Agent terminal, status, picker, stream components
│       ├── erd/            # ERD editor, canvas (ReactFlow), table editor, toolbar
│       ├── fsd/            # FSD editor (CodeMirror), sidebar, completeness, upload
│       ├── mermaid/        # Mermaid diagram renderer + markdown viewer
│       ├── spec/           # Spec endpoint cards, sidebar, module viewer
│       ├── tasks/          # Task list, task detail, timeline viewer
│       └── wiki/           # Wiki content viewer/editor
```

## API Endpoints

The monolithic router at `server/api-router.ts` handles all `/api/*` routes:

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/health` | GET | Health check |
| `/api/projects` | GET, POST, DELETE | CRUD projects |
| `/api/projects/:id/erd` | GET, POST | ERD management |
| `/api/projects/:id/specs` | GET, POST, DELETE | API spec management |
| `/api/projects/:id/specs/import` | POST | Import specs from output/ folder |
| `/api/projects/:id/tasks` | GET, POST, PUT, DELETE | Task CRUD |
| `/api/projects/:id/tasks/import` | POST | Import tasks from output/task/ folder |
| `/api/projects/:id/wiki` | GET, POST, PUT, DELETE | Wiki page CRUD |
| `/api/projects/:id/fsd` | GET, POST, PUT, DELETE | FSD session CRUD |
| `/api/projects/:id/fsd/scan` | POST | Scan input/fsd/ for new documents |
| `/api/projects/:id/fsd/upload` | POST | Upload files to input/fsd/ |
| `/api/projects/:id/fsd/:id/check` | POST | Check FSD completeness |
| `/api/projects/:id/fsd/:id/ready` | POST | Mark FSD as ready for analysis |
| `/api/projects/:id/fsd/:id/convert` | POST | Convert uploaded file to Markdown |
| `/api/projects/:id/fsd/convert-file` | POST | Manual file-to-MD conversion |
| `/api/projects/:id/skills` | GET | Detect project skills status |
| `/api/projects/:id/skills/install` | POST | Install missing project skills |
| `/api/files/list` | GET | List files in project directories |
| `/api/files/read` | GET | Read file contents |
| `/api/files/write` | POST | Write file contents |
| `/api/files/delete` | DELETE | Delete files |
| `/api/events` | GET | SSE stream for real-time updates |
| `/api/events/ticket` | POST | Get SSE ticket |
| `/api/agent/detect` | GET | List available CLI agents |
| `/api/agent/run` | POST | Start agent execution |
| `/api/agent/stop` | POST | Stop running agent |
| `/api/agent/status` | GET | Get running agent status |

## Key Conventions

- **File paths:** Use `readFile(rootPath, relPath)` from file-router, not raw fs reads
- **Database:** Use Drizzle queries through `db` instance from `server/db/client`. Runtime migrations add columns via `ALTER TABLE ... ADD COLUMN` in `client.ts`
- **API layer:** All routes go through `handleApiRequest` → delegates to `handleProjects` for `/api/projects/*` routes
- **Real-time updates:** SSE via `server/events.ts` event bus. File changes polled every 2s by `file-watcher.ts`
- **Agent execution:** `agent-runner.ts` spawns OpenCode CLI with `--format json --auto`. Log output parsed line-by-line as JSONL
- **Styles:** Use kumo tokens (`kumo-default`, `kumo-subtle`, `kumo-brand`, `kumo-elevated`, `kumo-line`). Avoid custom hex colors
- **TypeScript:** Strict mode. `bun run typecheck` before commits

## Dev Commands

```bash
cd app
bun install          # Install dependencies
bun run dev          # Start dev server (http://localhost:4321)
bun run typecheck    # tsc --noEmit
bun run build        # Production build
```

## UI Components

| Component | Tech | Location |
|-----------|------|----------|
| ERD canvas | @xyflow/react + @dagrejs/dagre | `components/erd/` |
| Spec viewer | Custom parser + ReactMarkdown | `components/spec/` |
| FSD editor | CodeMirror 6 + markdown lang | `components/fsd/FsdEditor.tsx` |
| Mermaid diagrams | mermaid + ReactMarkdown custom comp | `components/mermaid/` |
| Task management | Custom list + card views | `components/tasks/` |
| Embedded terminal | xterm.js + WebSocket | `components/agent/AgentTerminal.tsx` |
