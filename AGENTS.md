# SA Dashboard — Agent Instructions

This is the **SA Dashboard (Onesist)** application — a full-stack React app (web + Tauri desktop) that serves as the UI for System Analysts working with AI-generated artifacts (FSD, API specs, ERD, tasks, timelines).

## Tech Stack

- **Runtime:** Bun 1.3+
- **Framework:** React 19 + TanStack Start (SSR)
- **Router:** TanStack Router (file-based)
- **UI:** @cloudflare/kumo + Tailwind CSS 4
- **Editor:** CodeMirror 6 (+ @codemirror/lang-markdown), MDXEditor for FSD + wiki
- **Diagrams:** Mermaid 11, DBML (@dbml/core)
- **Database:** Drizzle ORM + Bun SQLite (file: `data.db`, WAL mode)
- **Terminal:** xterm.js (embedded agent terminal)
- **Desktop:** Tauri 2 (Rust shell) + compiled Bun sidecar
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
├── vendor/skills/          # Vendored agent skills (copied into projects)
├── src-tauri/              # Tauri desktop shell (Rust)
│   ├── src/lib.rs          # Window, sidecar startup, macOS app menu, exit handling
│   ├── src/sidecar.rs      # Spawn/kill/restart compiled server, port picking
│   ├── src/tray.rs         # Tray menu, close-to-tray, QUITTING flag
│   └── binaries/           # Compiled sidecar executables (gitignored)
├── src/
│   ├── server.ts           # TanStack Start fetch handler → API router + static assets
│   ├── client.tsx          # Client entry point
│   ├── ssr.tsx             # SSR entry point
│   ├── router.tsx          # Router configuration
│   ├── routeTree.gen.ts    # Auto-generated route tree
│   ├── styles.css          # Global styles + Tailwind + xterm/MDX overrides
│   ├── server/
│   │   ├── db/
│   │   │   ├── client.ts   # Drizzle + SQLite + runtime ALTER TABLE migrations + checkpointWal()
│   │   │   ├── schema.ts   # Drizzle schema (projects, tasks, wiki, fsd, erd, etc.)
│   │   │   └── migrations/ # Drizzle SQL migrations (MUST match schema.ts)
│   │   ├── api-router.ts   # HTTP entry: dispatch /api/* ke route modules
│   │   ├── http/           # HTTP infra: router.ts (mini Router), response.ts, route-utils.ts
│   │   ├── routes/         # Handler per-resource (/api/*): index, system, sse, files, projects/
│   │   ├── services/       # Business logic: fsd-service.ts, agent-runner.ts
│   │   ├── realtime/       # events.ts (SSE event bus) + file-watcher.ts (file:changed)
│   │   ├── terminal/       # terminal-server.ts (xterm.js WebSocket, port TERMINAL_PORT)
│   │   └── functions/      # TanStack createServerFn server functions
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
│   │   ├── project-queries.ts    # Data loading for routes (loadAllData, loadProjectRouteData)
│   │   ├── use-file-data.ts      # React hooks for file listing/content/watching
│   │   ├── use-file-context-menu.tsx # File-browser context menu + clipboard hook
│   │   ├── use-skill-install.ts  # Project skills install/status state machine
│   │   ├── erd-layout.ts         # Graphviz-based ERD node layout
│   │   ├── dbml.ts               # DBML to ERD node graph conversion
│   │   └── xterm-cache.ts        # Terminal session cache
│   ├── routes/
│   │   ├── __root.tsx           # Root layout (sidebar nav)
│   │   ├── index.tsx            # Projects dashboard (open/delete/create)
│   │   ├── projects.$id.tsx     # Project layout (tabs, overview, file browser)
│   │   ├── projects.$id.erd.tsx   # ERD editor + DBML viewer
│   │   ├── projects.$id.spec.tsx  # API spec viewer + search
│   │   ├── projects.$id.tasks.tsx # Task management (list/cards, search, filters)
│   │   ├── projects.$id.docs.tsx  # Technical documentation (metadata, template, export)
│   │   ├── projects.$id.wiki.tsx  # Wiki page editor
│   │   ├── projects.$id.fsd.tsx   # FSD Analyzer (editor, completeness, upload, agent)
│   │   └── projects.$id.settings.tsx # Project settings
│   └── components/
│       ├── agent/          # Agent terminal, status, picker, stream components
│       ├── dashboard/      # Dashboard dialogs (OpenProject, FolderBrowser, SkillSetup)
│       ├── erd/            # ERD editor, canvas (ReactFlow), table editor, toolbar
│       ├── fsd/            # FSD editor, upload, completeness
│       ├── mdx/            # Shared MDXEditor wrapper (MdxEditorClient + MdxEditorInner)
│       ├── mermaid/        # Mermaid diagram renderer + markdown viewer
│       ├── spec/           # Spec endpoint cards, sidebar, module viewer
│       ├── tasks/          # Task list, task detail, timeline viewer
│       ├── ui/             # Shared UI kit (ConfirmDialog, PageHeader, FileTree, etc.)
│       └── wiki/           # Wiki content viewer/editor
```

## Desktop Architecture (Tauri)

The desktop app runs the **same web server** as a compiled Bun executable (sidecar) inside a Tauri shell. WebView loads `http://127.0.0.1:{port}`.

```
Tauri shell (Rust) ──spawn──▶ onesist-server (compiled Bun)
      │                            │
      └── WebView ◀──http─── localhost:{PORT}  (SSR + /api/* + static assets)
```

- **Sidecar env vars** (set by `sidecar.rs`, all absolute paths — macOS GUI apps have CWD=`/`):
  - `SA_DB_PATH` → SQLite at appData
  - `SA_CLIENT_DIR` → client assets
  - `SA_MIGRATIONS_DIR` → Drizzle migrations
  - `SA_ROOT` → default project root (home dir)
  - `SA_VENDOR_SKILLS_DIR` → vendored skills copy
  - `SA_DESKTOP=1` → enables PPID watchdog (sidecar exits if shell dies)
- **Ports:** HTTP = first free of 4321 (checks IPv4 AND IPv6), terminal = first free of 4331
- **Windows terminal runtime:** the terminal server MUST run under **Node.js** on Windows (the vite plugin auto-resolves `node` from PATH). node-pty's ConPTY input socket uses `new net.Socket({ fd })`, which Bun doesn't support — output renders but every keypress dies with `ERR_SOCKET_CLOSED` (looks like a dead keyboard, it's actually local echo only). Bun+win32 falls back to the cmd.exe pipe (input works, no TUI); macOS/Linux keep Bun + Python PTY bridge.
- **Asset sync:** `ensure_server_dir` re-copies `web-dist` from resources on EVERY launch (stale assets = 404 = React never boots = "Loading..." forever)
- **Quit:** never rely on `app.exit()` on macOS with a tray icon (hangs). Tray Quit and `ExitRequested` both do: `mark_quitting()` → spawn detached thread `std::process::exit(0)` after 150ms → `state.stop()`.
- **Crash recovery:** sidecar auto-restarts max 3×/60s; memory watchdog exits the server if RSS > `SA_MAX_RSS_MB` (default 3000MB — dev shares the process with the Vite optimizer; a bare compiled server normally sits ~300MB, so a leak still gets caught quickly). In dev (`NODE_ENV=development`) the watchdog only warns — dev RSS (1.5-2GB with the bundler) is bloat, not a leak, and killing the dev session is worse.

## Auto-update (Phase 3)

- **Updater config** lives in `tauri.conf.json`: `plugins.updater` (pubkey + GitHub manifest endpoint) AND `bundle.createUpdaterArtifacts: true` — the latter is REQUIRED or Tauri produces installers with no `.sig`/`.tar.gz` updater bundles.
- **Frontend** `src/components/UpdateBanner.tsx` (`@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process`): checks on mount + every 6h, only active when `__TAURI_INTERNALS__` is present. No-op in web builds.
- **Signing key:** pass as `TAURI_SIGNING_PRIVATE_KEY` (base64 string contents of `~/.tauri/onesist.key`) + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The `_PATH` variant alone errors: "public key found but no private key". Backup `~/.tauri/onesist.key` — losing it breaks auto-update for all installed users.
- **macOS bundle targets** for updater must include `app` (`--bundles app,dmg`); `--bundles dmg` alone warns "no updater-enabled targets". Windows uses `--bundles nsis` (msi+nsis together → duplicate manifest keys).
- **CI** `.github/workflows/release.yml` (tag `v*`): matrix macos-14/macos-13/windows-latest, per-platform artifact dirs, generates `manifest.json` + uploads to release. Full setup + secrets in `plan/phase3-setup.md`.
- **Cross-platform build scripts** (Windows runners have no `cp -r`/`rm -rf`): `scripts/post-build.mjs` (migrations + vendor-skills + desktop-entry.ts) and `scripts/prepare-resources.mjs` (web-dist → src-tauri). `build:server` chain: vite build → terminal bundle → post-build → build-server-bin.
- **Windows WebView2:** `bundle.windows.webviewInstallMode: { type: "embedBootstrapper", silent: true }` bundles the runtime for Win 10 offline installs.

## API Endpoints

The API is split into route modules under `server/routes/`, composed by the entry at `server/api-router.ts` (declarative mini-router in `server/http/router.ts`). All `/api/*` routes:

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
| `/api/projects/:id/fsd/upload-image` | POST | Upload editor images to input/fsd/images/ |
| `/api/projects/:id/fsd/:id/check` | POST | Check FSD completeness |
| `/api/projects/:id/fsd/:id/ready` | POST | Mark FSD as ready for analysis |
| `/api/projects/:id/fsd/:id/convert` | POST | Convert uploaded file to Markdown |
| `/api/projects/:id/fsd/convert-file` | POST | Manual file-to-MD conversion |
| `/api/projects/:id/skills` | GET | Detect project skills status |
| `/api/projects/:id/skills/install` | POST | Install missing project skills |
| `/api/files/list` | GET | List files in project directories |
| `/api/files/read` | GET | Read file contents |
| `/api/files/image` | GET | Raw binary image serving (for `<img src>`) |
| `/api/files/write` | POST | Write file contents |
| `/api/files/rename` | POST | Rename files (also updates fsd_sessions markdownPath) |
| `/api/files/delete` | DELETE | Delete files |
| `/api/events` | GET | SSE stream for real-time updates |
| `/api/events/ticket` | POST | Get SSE ticket |
| `/api/agent/detect` | GET | List available CLI agents |
| `/api/agent/run` | POST | Start agent execution |
| `/api/agent/stop` | POST | Stop running agent |
| `/api/agent/status` | GET | Get running agent status |
| `/api/terminal/port` | GET | Terminal WebSocket port (env-driven) |

## Key Conventions

- **File paths:** Use `readFile(rootPath, relPath)` from file-router, not raw fs reads
- **Database:** Use Drizzle queries through `db` instance from `server/db/client`. Runtime migrations add columns via `ALTER TABLE ... ADD COLUMN` in `client.ts`
- **API layer:** All routes go through `handleApiRequest` → delegates to `handleProjects` for `/api/projects/*` routes
- **Real-time updates:** SSE via `server/realtime/events.ts` event bus. `server/realtime/file-watcher.ts` watches REGISTERED project roots (via `registerWatchRoot`) and emits `file:changed` — frontend listens, never polls
- **Agent execution:** `server/services/agent-runner.ts` spawns OpenCode CLI with `--format json --auto`. Log output parsed line-by-line as JSONL
- **UI reuse:** Repeated dialogs/headers/alerts/trees live in `components/ui/` (ConfirmDialog, PageHeader, InlineAlert, ExplorerShell, FileTree, SearchInput). Repeated logic goes in hooks under `lib/` (useFileList, useFileContent, useFileContextMenu, useSkillInstall). Don't copy-paste a pattern a 3rd time — extract it
- **Server data fetching:** Use the `useFileList`/`useFileContent` hooks (or a small wrapper) instead of raw `fetch("/api/files/...")`. Keep `{ cache: "no-store" }` on every API call
- **Styles:** Use kumo tokens (`kumo-default`, `kumo-subtle`, `kumo-brand`, `kumo-elevated`, `kumo-line`). Avoid custom hex colors
- **TypeScript:** Strict mode. `bun run typecheck` before commits
- **Desktop paths:** NEVER rely on `process.cwd()` for absolute paths — macOS launches with CWD=`/`. Always read from env (`SA_DB_PATH`, `SA_ROOT`, etc.) or resolve against `process.env.SA_ROOT`.

## Do's and Don'ts (from production bugs)

### Cache & freshness
- **DO** set `Cache-Control: no-store` on every new API response (the `json()` helper in `server/http/response.ts` already does this globally — don't remove it).
- **DO** pass `{ cache: "no-store" }` on every frontend `fetch("/api/...")`.
- **DON'T** add client-side polling when SSE events exist. If file changes don't arrive, fix the emitter (`registerWatchRoot`), don't add `setInterval`.
- **DO** refresh dynamic lists (agent detection, project list) when a dialog opens, not only on mount — mount-time fetch may run before the server is ready.

### Environment & paths (desktop vs web)
- **DON'T** hardcode `process.cwd()`-relative paths in server code — they break in the desktop sidecar (CWD=`/`).
- **DO** use env vars (`SA_DB_PATH`, `SA_ROOT`, `SA_CLIENT_DIR`, `SA_MIGRATIONS_DIR`, `SA_VENDOR_SKILLS_DIR`) with sensible fallbacks for web dev.
- **DO** resolve external CLI paths via the environment already passed to the sidecar — agent detection uses `execSync("which ...")` which depends on `PATH`.

### Ports & processes
- **DO** check BOTH IPv4 and IPv6 when picking free ports (Bun binds `localhost` IPv6-only; the old check missed it and two servers shared one port).
- **DO** kill stale processes of our own type before spawning (sidecar does `pkill onesist-server` / `pkill terminal-server.ts` on start).
- **DON'T** run `bun run dev` and the desktop app simultaneously — both want port 4321.

### SSE / EventSource
- **DO** add an error guard to any `new EventSource(...)`: close after ~5 errors, otherwise the WebView auto-reconnects forever and leaks memory.
- **DO** close `EventSource` in the effect cleanup — and make sure the cleanup actually runs (don't return the close from an inner `init()` that's never awaited).

### Memory safety
- **DO** prune unbounded Maps (`knownFiles` in file-watcher) when their owner (project root) is unregistered.
- **DO** call `checkpointWal()` periodically for long-running SQLite sessions (WAL journal grows without bound otherwise).
- **DON'T** restore `visible: false` window state on desktop launch — a hidden-but-rendering WebView leaks GBs. Only restore POSITION/SIZE/MAXIMIZED and always `window.show()`.

### Quit behavior (macOS desktop)
- **DON'T** call `app.exit()` on macOS when a tray icon exists — it hangs and the WebView keeps leaking memory.
- **DO** use the established pattern: `mark_quitting()` → detached thread with `std::process::exit(0)` after a short delay → `state.stop()`.

### Migrations & schema
- **DO** keep `server/db/migrations/*.sql` in sync with `schema.ts` — a fresh DB fails if CREATE TABLE is missing columns that schema references (this caused "failed to connect" on fresh installs).
- **DO** test with a fresh DB (`rm data.db && bun run dev`) before assuming migrations work — existing dev DBs hide missing-column bugs.

### FSD / file operations
- **DO** remember FSD documents live on disk in `input/fsd/` — the DB session is metadata (status, artifacts, completeness). Don't store content only in DB.
- **DO** keep `fsd_sessions.markdownPath` in sync when files are renamed/moved (the `/api/files/rename` handler updates it).
- **DON'T** use `window.prompt` for new UI — use kumo `Dialog` components like the rest of the app.

## Dev Commands

```bash
cd app
bun install          # Install dependencies
bun run dev          # Start web dev server (http://localhost:4321)
bun run typecheck    # tsc --noEmit
bun run build        # Production build (Vite)
bun run build:server # Build server bundle + compiled sidecar executable
bunx tauri dev       # Run desktop app in dev mode
bunx tauri build     # Build desktop app (release, .dmg/.msi)
bunx tauri build --debug  # Debug desktop build (faster)
```

**Reminder:** quit the desktop app (tray → Quit) before running `bun run dev`, and vice versa.

## UI Components

| Component | Tech | Location |
|-----------|------|----------|
| ERD canvas | @xyflow/react + @dagrejs/dagre | `components/erd/` |
| Spec viewer | Custom parser + ReactMarkdown | `components/spec/` |
| FSD editor | MDXEditor + MarkdownViewer (mermaid) | `components/fsd/FsdEditor.tsx` (shared editor in `components/mdx/`) |
| File tree | Custom, single-root + multi-root sections | `components/ui/FileTree.tsx` |
| Mermaid diagrams | mermaid + ReactMarkdown custom comp | `components/mermaid/` |
| Task management | Custom list + card views | `components/tasks/` |
| Embedded terminal | xterm.js + WebSocket | `components/agent/AgentTerminal.tsx` |
| Dashboard dialogs | kumo dialogs + web folder browser | `components/dashboard/` |
| Shared UI kit | kumo + Tailwind tokens | `components/ui/` (AppButton, ConfirmDialog, PageHeader, InlineAlert, ExplorerShell, SearchInput, Placeholder, ProjectNotFound, ContextMenu, FileRow, EmptyState, ErrorState, Skeleton) |
