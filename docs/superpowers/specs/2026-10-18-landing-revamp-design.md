# Landing page revamp for v0.4.0 — design

Date: 2026-10-18 · Branch: `landing` · Site: https://onesist.rogasper.com

## Intent

The landing page still sells Onesist as "Planner, not executor … no code gen, nothing to execute". Since v0.4.0 that is no longer the product. Onesist is now a workspace where analysts and developers turn one functional spec into every downstream artifact, **with the CLI agents they already use working inside the project** (Claude Code, Codex, Pi, Antigravity, OpenCode) and native API providers. Task **execution** (agents running planned tasks against a repo) does not exist yet; it is planned for next month and must appear only as "coming soon".

Success: someone who lands on the page understands within ~10 seconds that Onesist takes an FSD to ERD / API spec / tasks / RTM / SIT / handoff, and that their own agent does the drafting under their approval. Then they download.

## Audience

System analysts, business analysts, TPMs, and developers — anyone who deals with requirements documentation.

## Goals

- New positioning and copy throughout (user decided).
- Show what v0.4.0 added that matters to this audience: agents in chat, approval per action, workspaces/worktrees, split view and separate windows, MCP server.
- Real, current screenshots from the app, including the agent chat.
- Fix stale facts on the page.

## Non-goals

- No redesign of the visual language (user chose "A — evolution of the current style").
- No new pages, blog, docs site, i18n, or pricing.
- No change to analytics, hosting, or the deploy setup.

## Anti-goals

- Claiming task execution exists. It may appear only as "Execution — coming soon", with no date.
- Overstating untested runtimes beyond what the app ships (Antigravity and Codex are shipped; do not add "beta" claims or guarantees either way).
- Publishing anything from the user's other projects. Only project `experiment` may appear in screenshots (user decided).

## Constraints

- **Language:** English (user decided).
- **Visual style:** light, glass cards, brand purple `#6d7cff`, Geist, existing `styles.css` utilities (`glass`, `glass-strong`, `specular`). User chose this over a dark product-first and an editorial direction.
- **Stack stays:** Vite 8 + React 19 + Tailwind 4 in `landing/`, single `App.tsx` is fine to split into components under `landing/src/`.
- **Deploy:** Dokploy watches branch `landing` (on push, build path `/`, Nixpacks). Root `nixpacks.toml` builds `landing/` and serves `landing/dist` with `serve --single`. Keep `nixpacks.toml` unchanged. **Every push to `landing` is live** — push only with the user's explicit go-ahead.
- **Back to `main` (user decided):** after the revamp is live, open a PR `landing` → `main` so a branch recreated from `main` never loses the landing page again.
- **Version and changelog** stay live from `CHANGELOG.md` on `main` (raw.githubusercontent, then jsDelivr, then the Releases API). The changelog parser must keep working with the v0.4.0 heading format: `## v0.4.0 — Title`.
- Page must work at phone width (no horizontal scroll) and keep the existing Umami `track()` calls on download/GitHub clicks.

## Page structure (user approved, in this order)

1. **Nav** — logo, links: Features · Agents · How it works · Screens · Changelog · GitHub, and a Download button. Remove the "Planner, not executor" tagline.
2. **Hero** — headline "From FSD to handoff." with a muted second line "Your agents in the loop." Sub-copy along the lines of: "ERD, API spec, tasks, RTM and SIT from one functional spec — with Claude Code, Codex, Pi or OpenCode working inside your project. You approve every write." Buttons: Download Desktop (macOS · Windows), View on GitHub. Version pill from CHANGELOG. Right side: a **real screenshot** (agent chat with an approval card next to a document) in the existing glass frame, replacing the fake skeleton UI.
3. **Built for** — four cards: System Analysts (FSD → ERD, spec, tasks), Business Analysts (requirements → RTM), TPMs (tasks, story points, timeline), Developers (clear spec + handoff prompts).
4. **How it works** — "One spec in. Every artifact out." Flow FSD → ERD → API spec → Tasks → RTM · SIT → Handoff → *Execution · coming soon* (dashed, amber). Keep the "with outputs" idea: each step shows a sample file path and a short snippet.
5. **Agents (new in v0.4.0)** — "Bring the agent you already use." Chips: Claude Code, Codex, Pi, Antigravity, OpenCode, plus API providers (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Ollama, and more). Three points: approve every write (allow once / always allow / deny, per action); own workspace (a thread can work in a Git worktree outside the project); switch, fork, continue (change agent mid-thread, branch a thread, continue in the terminal).
6. **Workspace** — Split view (up to 4 panes), Separate windows (one writer per document), MCP server (agents in your own terminal read project data, read-only).
7. **Screens** — carousel of new screenshots (see below).
8. **Coming soon** — one small card: "Execution — tasks that run." Planned tasks will be run by an agent against your repo. No date.
9. **Download · Changelog · Footer** — macOS `.dmg`, Windows `.exe`; links still go to the Releases page; three latest changelog entries live from CHANGELOG.md; footer MIT + Umami.

## Screenshots

- Capture from the current app (v0.4.0 UI) using project **`experiment`** only (user decided).
- Wanted: hero (agent chat with an approval card beside a document); carousel: split view, a separate pane window, ERD, API spec, tasks, timeline, dashboard.
- **Hero approval card (user decided):** run one new agent turn in project `experiment` (one model call, one new thread in the user's real database) that triggers a write, capture the approval card, then **deny** the action so no file changes. Do not write anything else to the project.
- The project already has one thread ("Analisa FSD di input/fsd dan buatkan spec API, ERD", 15 messages) usable for chat/tool-card shots. The app UI itself is Indonesian; that is fine on an English page.
- Replace the outdated files in `landing/public/screenshots/`. Regenerate the OG image (1200×630 JPEG, plus the PNG fallback) so its text no longer says "Planner, not executor".
- The page currently tells visitors to "run `bun run screenshots`"; no such script exists. Remove that line (builder's call, see below).

## Stale facts to fix

- Windows download is labelled `.msi`; releases ship NSIS `.exe`.
- Hard-coded fallback changelog shows v0.1.38 – v0.1.35; update to the latest entries (v0.4.0, v0.3.0, …).
- `index.html` title, description, OG and Twitter text still say "Planner, not executor".
- The hero badge says "Desktop for macOS & Windows • MIT" — keep, it is still true.

## Left to the builder

- How to split `App.tsx` into components.
- Exact copy within the approved structure and tone (short, concrete, no hype), as long as it stays true to the shipped app.
- Screenshot tooling (desktop app or dev server) and image sizes/formats; keep images lazy-loaded and reasonably small.
- Icons or logos for agent chips (text chips are acceptable).

## Calls I made (not discussed with the user)

- Remove the "run `bun run screenshots`" tip, since the script does not exist.
- Download buttons keep pointing at the Releases page rather than direct asset URLs (asset names change per release).
- Windows button label becomes "Windows .exe".
- No "beta" label on any runtime.
