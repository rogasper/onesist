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
├── public/images/          # Agent CLI logos (opencode/claude/codex/antigravity.png)
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
│   │   ├── services/       # Business logic: fsd-service.ts, agent-task.ts (Generate OpenAPI/RTM/SIT as chat threads)
│   │   ├── agent/runtime/  # CliRuntime contract (types.ts) + registry.ts (provider → runtime, capabilities)
│   │   ├── agent/cli/      # CLI agents in chat: start-cli-turn.ts + opencode/ (runtime, server, target, client, mcp, sse, rules, stream-mapper, turn)
│   │   ├── realtime/       # events.ts (SSE event bus) + file-watcher.ts (file:changed)
│   │   ├── mcp/            # MCP server for outside agent CLIs: protocol.ts (JSON-RPC), token.ts, registry.ts (5 read-only tools)
│   │   ├── terminal/       # terminal-server.ts (xterm.js WebSocket, port TERMINAL_PORT)
│   │   └── functions/      # TanStack createServerFn server functions
│   ├── lib/
│   │   ├── split-layout.ts # Split view model: URL params (panes/pdir/pr), pane ops, arrangement (pure)
│   │   ├── pane-file-lock.ts # One writer per document across split panes (+ use-file-claim.ts hook)
│   │   ├── agent-cli.ts    # Detect installed agents (opencode, claude, codex, agy)
│   │   ├── agent-command.ts # Build agent CLI command strings + agentLogo() helper
│   │   ├── page-helpers.ts # Per-page Help popup content (bilingual id/en)
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
│       ├── erd/            # ERD editor, canvas (ReactFlow), table editor, toolbar, ErdView (tab content)
│       ├── fsd/            # FSD editor, upload, completeness, FsdView (tab content)
│       ├── layout/         # RightDock, split view (SplitWorkspace, SplitDivider, PaneBody)
│       ├── mdx/            # Shared MDXEditor wrapper (MdxEditorClient + MdxEditorInner)
│       ├── mermaid/        # Mermaid diagram renderer + markdown viewer
│       ├── spec/           # Spec endpoint cards, sidebar, module viewer
│       ├── tasks/          # Task list, task detail, timeline viewer
│       ├── ui/             # Shared UI kit (ConfirmDialog, PageHeader, PageHelpButton, FileTree, etc.)
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
- **Windows terminal runtime:** the terminal server MUST run under **Node.js** on Windows (shared resolver in `src/lib/resolve-node.ts`; the vite plugin and packaged `server.ts` both use it). node-pty's ConPTY input socket uses `new net.Socket({ fd })`, which Bun doesn't support — output renders but every keypress dies with `ERR_SOCKET_CLOSED` (looks like a dead keyboard, it's actually local echo only). Bun+win32 falls back to the cmd.exe pipe (input works, no TUI); macOS/Linux keep Bun + Python PTY bridge. Node resolution checks the nvm-windows layout directly (`%NVM_HOME%`/`%APPDATA%\nvm` `v<version>` folders + `current` junction) and standard install dirs BEFORE PATH — GUI-launched apps inherit a stale Explorer PATH (nvm use after login, no Explorer restart), so `node` can exist on the machine yet be invisible to a bare `spawn("node")`. The cmdpipe fallback surfaces a warning banner in the terminal panel (`AgentTerminal.tsx` `showFallbackNotice`) plus clear server logs, so the degradation is never silent.
- **Asset sync:** `ensure_server_dir` re-copies `web-dist` from resources on EVERY launch (stale assets = 404 = React never boots = "Loading..." forever)
- **Quit:** never rely on `app.exit()` on macOS with a tray icon (hangs). Tray Quit and `ExitRequested` both do: `mark_quitting()` → spawn detached thread `std::process::exit(0)` after 150ms → `state.stop()`. **macOS Dock Quit / Cmd+Q do NOT reliably fire `ExitRequested`** (tauri-apps/tauri#9198) — they arrive as `RunEvent::Exit`, which only marks quitting and calls `state.stop_quiet()`. **Never emit an event to the WebView from the terminate path** (which `stop()` does and `stop_quiet()` doesn't): the WebView is already being torn down, the delivery blocks the main thread on a semaphore inside tao's `applicationWillTerminate`, and a quit took 123s before this was fixed (`sample` shows `semaphore_wait_trap` at the bottom of the emit stack). For the same reason `tray::watch_sidecar_status` skips forwarding while `QUITTING` is set — the sidecar's own `sidecar-terminated` event is emitted from a worker thread on the way out. Without `quit_observer.rs`, close-to-tray would hide the window instead of exiting and the app would linger with a hidden WebView leaking memory (observed 80-100 GB); it observes `NSApplicationWillTerminateNotification` (objc2) and hard-exits, unless `RESTARTING` is set (update relaunch path, so Tauri can spawn the new instance).
- **Crash recovery:** sidecar auto-restarts max 3×/60s; memory watchdog exits the server if RSS > `SA_MAX_RSS_MB` (default 3000MB — dev shares the process with the Vite optimizer; a bare compiled server normally sits ~300MB, so a leak still gets caught quickly). In dev (`NODE_ENV=development`) the watchdog only warns — dev RSS (1.5-2GB with the bundler) is bloat, not a leak, and killing the dev session is worse. The **main process** (Tauri shell + WebView, `src-tauri/src/memory.rs`) has its own watchdog: samples its RSS every 10s and exits past `SA_MAX_MAIN_RSS_MB` (default 6000MB) — the sidecar's watchdog can't see the WebView, which leaked to 80GB during update install/relaunch on macOS. The restart path (`ExitRequested` with code `i32::MAX`) destroys the window first so the WebView frees memory before the new instance spawns.

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
| `/api/projects/:id/rtm/import/preview` | POST | Parse output/rtm/*.md without writing |
| `/api/projects/:id/rtm/import/apply` | POST | Parse output/rtm/*.md and upsert into DB |
| `/api/projects/:id/wiki` | GET, POST, PUT, DELETE | Wiki page CRUD |
| `/api/projects/:id/fsd` | GET, POST, PUT, DELETE | FSD session CRUD |
| `/api/projects/:id/fsd/scan` | POST | Scan input/fsd/ for new documents |
| `/api/projects/:id/fsd/upload` | POST | Upload files to input/fsd/ |
| `/api/projects/:id/assets/upload` | POST | Upload editor images to input/assets/ (answers with the root-relative path the markdown stores) |
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
| `/api/terminal/port` | GET | Terminal WebSocket port (env-driven) |
| `/api/mcp/projects/:id` | POST | MCP endpoint (Streamable HTTP, stateless, JSON-RPC). Bearer token from `mcp-token.secret`; GET/DELETE → 405 |
| `/api/projects/:id/mcp` | GET | MCP URL, token and copy-ready config for the Settings panel |
| `/api/providers/:id/status` | GET | CLI runtime status (installed / logged in / reachable); API providers answer `ready` |
| `/api/providers/:id/model-options` | GET | `?model=` → option descriptors of one model (OpenCode variants) |
| `/api/projects/:id/agent-tasks` | POST | `{ mode: openapi\|rtm\|sit, fsd?, fds? }` → new chat thread + the prompt the chat sends in it |
| `/api/chat/threads/:id/tool-output/:toolCallId` | GET | Whole stored output of one tool call (the transcript carries outputs over 16K shortened) |
| `/api/chat/threads/:id/fork` | POST | `{ messageId }` → `{ threadId, mode: native\|portable }`: a branch with lineage; the OpenCode session is forked natively at the latest message |
| `/api/chat/threads/:id/merge-back` | POST | Brings a branch's own work since the last merge to its parent as a framed, budgeted message + `mergeNotice` |
| `/api/chat/threads/:id/terminal-command` | GET | `opencode --session <id>` for "Lanjutkan di terminal"; 409 when the thread has no OpenCode session |

## Key Conventions

- **Language:** source code is written in **English** — comments, identifiers, log lines, and internal error messages. What the *user* sees stays **Indonesian**: UI copy, and every string that reaches a user or the model, which includes `json({ error })` messages and tool `description:` fields. A comment-only change must never alter a string literal; if a user-facing string needs English, that is an i18n decision, not a language sweep.
- **File paths:** Use `readFile(rootPath, relPath)` from file-router, not raw fs reads
- **Database:** Use Drizzle queries through `db` instance from `server/db/client`. Runtime migrations add columns via `ALTER TABLE ... ADD COLUMN` in `client.ts`
- **API layer:** All routes go through `handleApiRequest` → delegates to `handleProjects` for `/api/projects/*` routes
- **Real-time updates:** SSE via `server/realtime/events.ts` event bus. `server/realtime/file-watcher.ts` watches REGISTERED project roots (via `registerWatchRoot`) and emits `file:changed` — frontend listens, never polls
- **Agent execution:** Generate OpenAPI/RTM/SIT run as chat threads (`agent-runner` was retired in Fase 3C): the page calls `POST /api/projects/:id/agent-tasks`, the chat opens the thread through `lib/chat-task.ts` and sends the prompt once (`ChatSurface` `autoSend`), and the page refreshes on that thread's `chat:run` done event (`lib/use-agent-task.ts`). Task threads start in permission mode `ask` — do not change that to `auto`. The CLI detector (`/api/agent/detect`) and the copy-prompt route (`/api/agent/prompt`) stay. AGY (antigravity) keeps its interactive keyring login; resume uses `--conversation <conversation_id>`. Chat threads on a CLI provider (`apiStyle: "cli"`, `cliAgent: "opencode"`) do NOT use agent-runner: `server/agent/cli/opencode/` spawns one `opencode serve` (127.0.0.1, random password, Basic auth user `opencode`), keeps the OpenCode session id in `chat_threads.cli_session_id`, and maps its events to AI SDK stream parts so `routes/chat.ts` stores the turn like a native one. `SA_OPENCODE_URL`/`SA_OPENCODE_PASSWORD` attach to a running server instead. Permission requests become questions (`awaitQuestion`). Run OpenCode with `--auto` in any non-interactive call: without it a permission request waits forever. CLI runtimes sit behind `server/agent/runtime/` (`CliRuntime`: `probe`, `listModels`, `startTurn`, `capabilities`); the chat route, model discovery, the Test button and the status/model-options routes go through `cliRuntimeFor(provider)` — add a CLI by adding a runtime there, not by branching on `cliAgent` elsewhere. CLI provider settings reuse provider columns (`cliPath` = binary, `endpoint` = the user's own server URL, `apiKey` = that server's password) and the form renders them from `lib/cli-settings.ts`. A thread's per-model options (OpenCode variant) live in `chat_threads.model_options_json` and are cleared when the model changes. Before each OpenCode turn Onesist adds its own MCP server for the project folder (`PUT /api/experimental/mcp/onesist?location[directory]=…`, `codemode: false`, never written to the user's OpenCode config); the URL comes from the last loopback origin seen (`server/self-origin.ts`) — never from a non-loopback Host.
- **Tab content:** a tab's page body lives in `components/<tab>/<Tab>View.tsx` and takes `projectId` as a prop; the route file only reads params/loader data and renders the View. Split panes render the same Views, so a View must not call `Route.useParams()`/`useLoaderData()` or navigate the main route.
- **Moving a thread between providers:** native providers read the stored history every turn and need nothing. A CLI provider keeps its own session per thread in `chat_provider_sessions` (`known_upto_seq` = how far it has seen). `prepareCliTurn` (`server/agent/cli/prepare-turn.ts`) decides `fresh`/`reuse`/`handoff`/`delta` with `server/agent/handoff.ts`: a new session gets a budgeted slice of the real transcript (16K; last user → last answer → first user → newest back; items dropped whole; shell commands as Command/Exit code/Output; a pointer to `onesist_thread_read` for the rest), and a returning session only what happened since it left. The session is recorded only after the runtime takes the prompt, and its own reply is marked seen once stored, so a refused prompt is handed over again and a delta never repeats the session's own answer. The transcript shows a `handoffNotice` divider.
- **Forks and merge back (Fase 4B):** `forkThread` records lineage on `chat_threads` (`parent_thread_id`, `relationship_to_parent`, `root_thread_id`, `forked_at_seq`, `merged_upto_seq`; no foreign key, so a parent can be deleted). `forkForChat` (`server/agent/fork.ts`) forks the CLI session natively (`CliRuntime.forkSession`, OpenCode `POST /api/session/:id/fork`) only at the latest message the session has seen; otherwise the branch has no session and 4A hands it the copied transcript. `mergeBackIntoParent` (`server/agent/merge-back.ts`) sends only the branch's work since `merged_upto_seq`, through the 4A handoff rules, as one user message framed as history; it refuses while the parent runs.
- **Tool output size:** `server/agent/tool-output.ts` caps a tool output at 256K when a message is stored (`appendMessage`) and shortens outputs over 16K in the two transcript routes only (`viewMessages`), keeping short fields like exit codes; a card loads the rest from `tool-output/:toolCallId`. The model's history is built from stored rows with `toUIMessages` — never route it through the view layer.
- **Continue in terminal:** "Lanjutkan di terminal" runs `opencode --session <id>` in the embedded terminal. Sessions created by Onesist's `opencode serve` are visible to the user's OpenCode background service (shared storage), so the TUI continues the thread.
- **MCP surface:** read-only on purpose. A new MCP tool goes through `server/mcp/registry.ts`, is built from an AI SDK tool via `mcpToolFromAi`, is named `onesist_*`, and never writes (an outside agent's own permission prompt is not Onesist's approval flow). Results are capped at `MCP_RESULT_MAX_CHARS`. OpenCode threads get these tools automatically (`onesist_onesist_<tool>` in OpenCode, shown as `onesist_<tool>`); `rules.ts` allows `onesist_*` without asking because they never write.
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
- **DO** keep the schema guard working: `client.ts` runs drizzle → `applyMigrations()` → `repairMissingSchema()`. The last one replays the migration files idempotently (skipping DROP/RENAME/INSERT/UPDATE/DELETE) because **drizzle never re-runs a revision it has already recorded** — that is what heals a `data.db` that travelled between machines as a zipped copy (zipped while the app was running, or without its `-wal`/`-shm`), where the journal claims tables the file no longer has. Without it the app dies with a permanent `no such table`. Cost measured: 0.5 ms on a healthy DB, ~3 ms when the replay runs.

### Deleting a project (foreign keys)
- **DO** delete every child before the `projects` row: `PRAGMA foreign_keys = ON` turns any missed child into a hard `FOREIGN KEY constraint failed` — HTTP 500, project stays put. Children keyed by the **parent row id** (`erd_snapshots.erd_id`, `api_snapshots`/`api_endpoints.spec_id`, `wiki_snapshots.page_id`, `task_snapshots.task_id`) must be deleted by those ids, not by the project id.
- **DO** remember the chat tables are a separate family: `chat_threads.project_id` also points at `projects.id`, and none of the artifact deletes touches it. Reuse `deleteThread()` (`server/agent/store.ts`) per thread — including archived ones — so messages, tool calls, files, reads, runs, provider sessions and FTS rows go with it.
- **DO** clear the FK-less index tables (`index_files`/`chunks`/`symbols`/`index_fts`) with `clearProject()`; nothing cascades and nothing complains, so they linger forever otherwise.
- **DO** keep section G of `verify-api.ts` green — it reproduces this exact 500 and is what catches the next missed child table.

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
| Shared UI kit | kumo + Tailwind tokens | `components/ui/` (AppButton, ConfirmDialog, PageHeader, PageHelpButton, InlineAlert, ExplorerShell, SearchInput, Placeholder, ProjectNotFound, ContextMenu, FileRow, EmptyState, ErrorState, Skeleton) |
| Help popup | kumo Dialog + curated tips | `components/ui/PageHelpButton.tsx` + content in `lib/page-helpers.ts` (bilingual, distilled from `docs/`) |
| Agent logos | static PNGs served at `/images/*` | `public/images/` (lookup via `agentLogo()` in `lib/agent-command.ts`) |
