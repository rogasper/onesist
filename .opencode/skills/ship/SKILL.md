---
name: "ship"
description: "The single entry point for the AgentSystem engineering pipeline. Invoke EXPLICITLY only — it must not auto-fire on generic build/fix requests. Classifies the goal as CREATE / EVOLVE / POLISH / REMOVE / FIX / AUDIT, infers a depth mode (`mode=fast|balanced|production`, with `include=`/`skip=` phase overrides forwarded downstream), announces the pipeline, then runs the matching bundled workflow playbook (add-feature / modify-feature / polish-ui / remove-feature / fix-bug / audit), which in turn dispatches the bundled reviewer subagents. STOPS at code-ready — never commits, pushes, or opens PRs. Trigger ONLY on explicit invocation — \"use ship skill\", \"ship\", \"/ship\", \"ship this\", \"autopilot this\". Skip for everything else, including pure git operations, planning-only requests, and questions about the codebase: if the user did not explicitly ask for ship, do not invoke it."
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.


# ship

The user gave you an engineering goal. Pick the right workflow, pick the right depth, announce both, run the workflow, report. Stop before git.

The tax on a vibe coder is choosing which skill to invoke and how thorough to be. This skill takes that tax off them — without hiding what was decided.

---

## Bundled reference resolution — read before executing anything

This plugin registers exactly **one** skill: `ship`. Every workflow and reviewer named in this file and in every playbook it loads — `add-feature`, `reviewer-code`, `write-tests`, `plan-red-team`, `findings-reconciler`, etc. — is a **bundled file inside this skill**, not a separately registered skill or agent. **Do not call the `Skill` tool for them and do not pass their names as `subagent_type`** — nothing but `ship` is registered, so both error.

Resolve every bundled reference by reading a file, relative to the **ship skill directory** (the directory holding THIS file; `${CLAUDE_PLUGIN_ROOT}/skills/ship/` when that env var is set):

- **`playbooks/<name>/PLAYBOOK.md`** — a workflow or sub-skill. **Read it and follow it inline** as your next phase of work, carrying the same args (`mode=`, `run-id=`, `run-ledger=`, `headless=`). Ship-root-relative.
- **`subagents/<name>.md`** — a reviewer / mapper / verifier / tracer. **Read it, then dispatch a fresh subagent** with the `Agent` tool using `subagent_type: "general-purpose"`, passing the file's body as the leading instructions followed by the concrete scope (diff, plan, artifact name, file list). These agents are read-only by role — tell them not to edit files. Dispatch several in one message to run them in parallel; that fan-out and their fresh-context isolation are the entire reason they are subagents rather than inline work — preserve both. Ship-root-relative.
- **`references/<file>`** — a checklist or reference doc. Relative to the **playbook currently being followed** (not ship-root). Read it in place. **Exception — shared references:** when a playbook cites a file as `ship`'s `references/<file>` (the shared `risk-signals.md` and `run-ledger.md`), resolve it at **ship-root** `references/`, not the playbook's own folder — those two are single-source and shared across playbooks.

If any instruction still shows an old `Skill(skill="X")` call or an `Agent(subagent_type=agentsystem-core:Y)` call, treat it as `playbooks/X/PLAYBOOK.md` / `subagents/Y.md` respectively.

---

## Run preamble — announce the plugin version

At the start of every run, read the plugin version from the plugin manifest — `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` if that env var exists, else the `.claude-plugin/plugin.json` two directories above this skill file — and announce it in the first status line, e.g.:

```
🚢 /ship (agentsystem-core v0.52.0) — pipeline: …
```

If the manifest can't be found, say "version unknown" rather than failing. The version line tells the user (and any later defect audit) exactly which generation of the gates ran.

---

## Step 1 — Classify intent

Read the user's prompt and map to one of six core skills:

| Phrasing in the prompt | Intent | Routes to |
|---|---|---|
| "add", "build", "implement", "create", "scaffold", "introduce", "set up" in an existing codebase | CREATE | `add-feature` |
| "update", "extend", "change", "also do X when Y", "make this also", "modify", "derive from" — request adds or shifts behavior on an existing feature; also handles small cosmetic/copy tweaks via `mode=fast` | EVOLVE | `modify-feature` |
| "polish this", "give this a UX pass", "polish the dashboard", "audit the polish on this page", "run the UX checklist on X" — apply UX checklist to existing UI without changing behavior | POLISH | `polish-ui` |
| "remove", "delete", "deprecate", "kill", "rip out", "get rid of" | REMOVE | `remove-feature` |
| "broken", "bug", "not working", "should have happened but didn't", "didn't trigger", "silent failure" | FIX | `fix-bug` |
| "audit the codebase", "tech-debt sweep", "deep clean", "full cleanup", "production-readiness pass", "find all the rot" | AUDIT | `audit` |

**EVOLVE vs POLISH boundary.** EVOLVE is one specific change the user named (whether it's a single-element cosmetic tweak or a behavior extension); POLISH is "apply the checklist" without a specified change. If the user names what to change, it's EVOLVE. If they ask for a pass, it's POLISH. For purely cosmetic single-element changes ("make this button green", "fix the alignment"), route to EVOLVE with `mode=fast`.

**Pre-classification probe (cheap, one search).** Verb-mapping alone misleads: "add a settings page" in a repo that *already has one* is EVOLVE, not CREATE. Before locking a CREATE vs EVOLVE decision, run one quick Glob/Grep for the named artifact — the route path, component name, table, or endpoint. If it already exists → almost always EVOLVE (`modify-feature`); if it genuinely doesn't → CREATE (`add-feature`). One probe is far cheaper than a wrong full-pipeline run the user only notices at Step 5. Skip the probe only when the verb is unambiguous ("delete X", "why didn't X fire").

**Ambiguous prompts** — when two intents are equally plausible (e.g., "rebuild auth" could be EVOLVE or REMOVE+CREATE), ask exactly one disambiguating `AskUserQuestion`. Don't guess.

**Multi-intent prompts** — if the user lists clearly separable goals ("add X and remove Y"), execute them sequentially as separate /ship routings, not one combined run. State the order before starting.

**Refactor / test-authoring prompts** — two common asks sit just outside the six intents but *do* have a home:
- "refactor this module", "clean this up", "DRY this", "find code smells" → route to `simplify` (pass `scope=<the named path>` so it isn't diff-limited). If the "refactor" actually changes behavior, it's EVOLVE → `modify-feature` instead.
- "write tests for X", "add test coverage", "cover this with tests" → route to `write-tests`.
Announce these like any other routing (Detected / Mode / Pipeline), then run the bundled playbook inline — read `playbooks/simplify/PLAYBOOK.md` or `playbooks/write-tests/PLAYBOOK.md` per **Bundled reference resolution**.

**No-match prompts** — if the user's request doesn't fit any intent above (e.g., explain code, document a flow, compare approaches, ask a question about the codebase, brainstorm features, or scaffold a new app from zero), /ship is the wrong tool. Stop and tell the user the request doesn't map to an engineering workflow this skill orchestrates, and — if the match is obvious — point at the matching tool directly (e.g., "review this PR" → `/review`, "explain this module" → no skill needed, just answer in the conversation).

---

## Step 2 — Infer the depth mode

Three modes — `fast`, `balanced`, `production`. Pick one before announcing.

**Risk signals (any one → `production`)** — the canonical list lives in [`references/risk-signals.md`](references/risk-signals.md); the mode-safety overrides in `add-feature` / `modify-feature` / `remove-feature` / `fix-bug` all cite that same file so the signals can't drift apart. In one line: auth / permissions / payments / secrets / external webhooks; schema migrations or persisted-data rewrites; destructive deletion of an external/public contract; background jobs / queues / cron / email / SMS / imports / exports / file writes / IPC / external APIs; caching / query-invalidation / feature flags / analytics / concurrency-sensitive mutations; or a multi-subsystem change (frontend + backend + DB together).

**Tiny-scope signals (all four → `fast`)**:
- Single file
- Cosmetic / copy / styling only
- No data layer touched
- No new public API surface

**Default → `balanced`**.

**Override:** explicit `mode=fast`, `mode=balanced`, or `mode=production` in the user's prompt always wins — except when it conflicts with a high-risk signal (see NEVER below).

**Headless option (`headless=true`).** Also triggered by the word "headless" anywhere in the invocation. Headless removes user interaction, NOT rigor — it skips QUESTIONS, never QUALITY gates:

- **Never call `AskUserQuestion`.** Every point where this skill would ask (intent disambiguation at Step 1, production "Proceed with this pipeline?" at Step 3, the mode-conflict prompt in NEVER) auto-resolves with best judgement instead. **Record each assumption** ("Assumed: EVOLVE over CREATE because the route already exists") in the per-run ledger and surface them all in the Step 5 report.
- **Forward `headless=true` to the routed skill** (add-feature / modify-feature / fix-bug / etc.) alongside `mode=`, so its own question points (plan approval, clarify phase) convert to logged-plan-and-proceed under the same contract.
- **Every verify/review gate still runs.** The routed skill's implementation, verification, gated reviews, and tests execute exactly as the resolved mode dictates. A headless run that shipped without its gates is a defect, not a feature.
- Mode-conflict handling: if `mode=fast` collides with a high-risk signal, auto-upgrade to the mode the risk demands and record the decision — don't silently honor the dangerous override, and don't ask.

---

## Step 3 — Announce the plan

Output a structured plan block before executing. Format:

```
Detected: <CREATE | EVOLVE | POLISH | REMOVE | FIX | AUDIT>
Risk:     <low | medium | high — one-line reason>
Mode:     <fast | balanced | production — one-line reason or "user-specified">
Pipeline:
  1. <phase>  → <core skill or sub-skill>
  2. <phase>  → <core skill or sub-skill>
  ...
```

Pipeline numbering must match what the routed core skill will actually run at the chosen mode (e.g., `add-feature mode=production` does Clarify → Explore → Design → Plan approval → Implement → Verify → Gated reviews → Tests → Post-steps). Do not invent phases the routed skill won't execute — those become a credibility hole at Step 5.

**Create the per-run ledger.** Read and follow [`references/run-ledger.md`](references/run-ledger.md). Generate a unique run ID and write the ledger under the session scratch directory, falling back to `.agentsystem/runs/<run-id>.md` only when no scratch location exists. Record the goal, intent/mode/risk, base SHA, initial worktree, locked decisions/assumptions, pipeline, and input hash where available.

Update phase/task/reviewer status at every transition. Record file ownership, retries/fallbacks, findings dispositions, exact verification evidence, and terminal state. Never use a fixed `.agentsystem/ship-run.md`: concurrent sessions would overwrite each other. Step 5 reads this ledger rather than reconstructing the run from memory.

**Confirmation gating depends on mode:**

| Mode | Gating |
|---|---|
| `production` | Use `AskUserQuestion` "Proceed with this pipeline?" before Step 4. Decline → stop. |
| `balanced` | Print the plan inline, then proceed to Step 4 in the same turn. User can abort with ESC or a new prompt before the routed skill begins. |
| `fast` | Print the plan inline as a one-line preamble, then execute immediately. No confirm prompt. |

In headless runs the `production` confirm prompt is skipped like the others: print the plan inline, record "proceeded without confirmation (headless)" in the run ledger, and continue.

---

## Step 4 — Execute the routed workflow

Routing is an **inline playbook read**, per **Bundled reference resolution** above — not a `Skill` call (the workflows are bundled files, not registered skills). Take the workflow name for the intent from Step 1 (`add-feature` for CREATE, `modify-feature` for EVOLVE, `polish-ui` for POLISH, `remove-feature` for REMOVE, `fix-bug` for FIX, `audit` for AUDIT), then:

1. **Read `playbooks/<workflow>/PLAYBOOK.md`** (ship-root-relative).
2. **Follow it inline** as your next phase of work, carrying:
   - the user's original goal
   - `mode=<resolved>`
   - `headless=true` when the run is headless — the playbook converts its own question points to recorded assumptions
   - `run-id=<id>` and `run-ledger=<absolute path>` — update phase, subagent, reviewer, finding-disposition, and verification records in this ledger
   - any `include=<csv>` / `skip=<csv>` overrides parsed from the user's prompt
3. The playbook dispatches its own reviewer subagents (`subagents/*.md`) through the `Agent` tool per the resolution rule. Those dispatches are where fresh-context isolation and fan-out parallelism live — let them happen; don't collapse them into your own context.

The playbook is the engine; /ship is the router. Read it fresh each run rather than reconstructing it from memory — that keeps the engine canonical after every update.

**Respect downstream gates.** `add-feature mode=production` has its own Plan-approval gate. Let it fire. Don't bypass it from /ship.

**One core skill per /ship run.** Don't fan out to multiple core skills in parallel — that's the user's job to compose with multiple /ship invocations, or the routed core skill's job to subagent-fan-out internally.

**Adjunct skills live downstream.** /ship only chooses the top-level workflow. The routed skill owns stack/plugin-specific handoffs (TanStack, UX, backend, release-risk, etc.) and must announce those adjuncts in its own pipeline when their gates match.

---

## Step 5 — Report and hand off to git

After the routed skill returns, output a visible-pipeline summary. **Read the completed-phase, reviewer coverage, findings-disposition, verification, and terminal-state records from the Step 3 per-run ledger** rather than reconstructing them from memory. Validate that the ledger's base SHA/input identity still matches this run before trusting it.

```
✔ <phase 1>  — <one-line outcome>
✔ <phase 2>  — <one-line outcome>
✔ <phase 3>  — <one-line outcome>
...

Findings:
  - <each finding the routed skill or its sub-skill audits surfaced>

Terminal state: <diagnosed | locally-verified | partial | blocked>
Evidence: <final commands and runtime observation, or the exact missing/failed gate>

When terminal state is locally-verified, publishing is yours to drive — this plugin stops at code-ready and does not commit, push, or open PRs. Hand the working tree off to your own git workflow.
```

Use exactly one terminal state:

- **`diagnosed`** — root cause or audit findings are established, but no code candidate was produced (including `fix-bug mode=regression` when it stops at root cause).
- **`locally-verified`** — the routed skill's final post-mutation gate passed and the changed runtime path was observed locally. This does not claim CI, staging, deploy, or production health.
- **`partial`** — code exists, but a required local command or runtime observation could not be completed. Name the missing evidence.
- **`blocked`** — a required gate failed, a mandatory reviewer was unavailable with no fallback, or a user decision is required before safe continuation.

Never print publication handoff commands for `diagnosed`, `partial`, or `blocked` as though the candidate were ready.

Surface findings, not just "done." If a sub-skill audit (security, perf, a11y, duplication) returned issues that the routed skill chose not to auto-fix, name them here so the user sees them before publishing. “Production-ready” is not a valid terminal state: this pipeline proves a local candidate, not CI, deployment, rollback, or production health.

**Do not commit. Do not push.** The user picks the publish path.

---

## NEVER

- **NEVER commit, push, or open PRs from inside this skill**
  **Instead:** Stop at Step 5 and hand off to the user's own git workflow.
  **Why:** Engineering rigor and release decisions run on different cadences. Auto-publishing from an autopilot run removes the user's chance to review the diff and forces a one-size-fits-all release path on every project.

- **NEVER bypass a routed core skill's own approval gate**
  **Instead:** Let the gate fire (e.g., `add-feature`'s Plan-approval gate in production mode). The user interacts with the core skill's gate, not with /ship.
  **Why:** Routing past a gate that the core skill author put there means the user gets a fast-mode experience while believing they're in production mode. Trust collapses on the first surprise side effect.

- **NEVER replicate the core skill's pipeline inline from memory**
  **Instead:** Always read the bundled playbook and follow it. Read `playbooks/<workflow>/PLAYBOOK.md` and follow that file verbatim — do not improvise the pipeline from your own recall of what `add-feature` or `fix-bug` "usually does". /ship is a router; the playbook is the engine.
  **Why:** Inlined pipelines drift from canonical core-skill behavior on every update. Two implementations of the same workflow guarantees one will be wrong after the next change to either. Reading the file each run keeps the engine canonical even when the `Skill` tool isn't available.

- **NEVER hide which mode and pipeline you picked**
  **Instead:** Announce in every mode. Even `fast` prints the one-line preamble. `production` requires an explicit confirm.
  **Why:** "It just worked" is indistinguishable from "it did the wrong thing silently." The product story is "AI engineering workflow," not "ChatGPT writes code." Visibility is the differentiator.

- **NEVER guess between two plausible intents**
  **Instead:** When the prompt is genuinely ambiguous (CREATE vs EVOLVE, EVOLVE vs REMOVE+CREATE), ask exactly one `AskUserQuestion`. One question, then commit.
  **Why:** A wrong intent cascades through the entire pipeline. The user only notices at Step 5 that the system rebuilt instead of patched, after the work is done. One disambiguation up-front is far cheaper than a wrong full-pipeline run.

- **NEVER honor a `mode=fast` override on a high-risk change without surfacing the conflict**
  **Instead:** If `mode=fast` is requested for work that hits a risk signal (auth/payments/migrations/jobs/webhooks/destructive deletes/etc.), pause and surface the conflict via `AskUserQuestion`: "Detected high-risk signals (e.g., payments). You requested fast mode — that skips the production gates. Confirm fast anyway, or upgrade to production?" Honor whichever the user picks.
  **Why:** Vibe coders bypass safety gates because they don't know what they're skipping. Surfacing the conflict gives them informed consent without removing their authority. Silent honor of a dangerous override breaks the "no surprises" contract.

---

## Appendix — Sub-skills the routed front doors hand off to

`/ship` itself is a router; the *adjunct* and *handoff* skills below are owned by the routed core skill (add-feature, modify-feature, fix-bug, remove-feature, audit). This appendix exists so users — and the announced pipeline at Step 3 — can see what the front door will likely invoke downstream when its gates trigger. The routed skill always has final say on whether a gate fires.

**Phrasing for Step 3 announcements:** when previewing the pipeline, name the most likely downstream sub-skills as `(routed: <core>) → may invoke <sub-skill>` rather than promising they'll run. The actual fire is gate-driven.

### CREATE → `add-feature` may invoke

- **Adversarial orchestration:** `plan-red-team` before approval for triggered production plans, including explicit scalability, reliability/failure-isolation, capacity, operability, rollback, and cost/complexity checks; `findings-reconciler` after 2+ reviewers; `integration-verifier` after all mutations for complex production changes.
- **UI scaffolding (when feature is user-facing):** `playbooks/add-empty-error-states/PLAYBOOK.md` (empty + error UI), `playbooks/polish-ui/PLAYBOOK.md` (post-step UX checklist), `playbooks/propagate-ui-pattern/PLAYBOOK.md` (when 3+ siblings of a recurring surface exist).
- **Backend scaffolding (when persisted data or schema changes):** `playbooks/add-migration/PLAYBOOK.md`, `playbooks/add-observability/PLAYBOOK.md` (integration-first lane), `playbooks/audit-authz/PLAYBOOK.md` (when the feature adds or changes server entry points with ownership/permission checks).
- **Tests (Phase 8):** `playbooks/write-tests/PLAYBOOK.md` (unit/integration), `playbooks/add-e2e-test/PLAYBOOK.md` (browser flows when Playwright is wired).
- **Audits (Phase 7 gates):** reviewer-* subagents (contracts, concurrency, data-integrity, security-regression, error-boundaries, loading-states, accessibility-regression, client-bundle, observability-coverage, perf, authz).
- **Cleanup (post-step):** simplify, polish-ui.

### EVOLVE → `modify-feature` may invoke

- **Adversarial orchestration:** production plan challenge when scope/risk triggers, including explicit scalability, reliability/failure-isolation, capacity, operability, rollback, and cost/complexity checks; findings reconciliation after parallel reviews; final integration verification for multi-subsystem/parallel work.
- **UI extensions:** `playbooks/add-empty-error-states/PLAYBOOK.md`, `playbooks/polish-ui/PLAYBOOK.md`.
- **Backend extensions:** `playbooks/add-migration/PLAYBOOK.md`, `playbooks/add-observability/PLAYBOOK.md`, `playbooks/audit-authz/PLAYBOOK.md` (when the extension touches server entry points with ownership/permission checks).
- **Tests:** `playbooks/write-tests/PLAYBOOK.md`, `playbooks/add-e2e-test/PLAYBOOK.md` when extension warrants browser coverage.
- **Contract / concurrency / data audits:** reviewer-* subagents (contracts, concurrency, observability-coverage, data-integrity, security-regression, error-boundaries, loading-states, accessibility-regression, client-bundle).
- **Cleanup:** simplify, polish-ui.

### POLISH → `polish-ui` may invoke

`polish-ui` runs the project's UX polish checklist against the surface and auto-fixes mechanical gaps (kbd hints on hotkey-bound buttons, focus management, loading/disabled states, footer/chrome consistency). It does not fan out — the work *is* the checklist.

### FIX → `fix-bug` may invoke

- **Adversarial orchestration:** findings reconciliation after parallel post-fix reviews and final integration verification for complex production patches.
- **Reviewers (gated by the patch surface):** reviewer-contracts, reviewer-authz, reviewer-concurrency, reviewer-data-integrity, reviewer-observability-coverage, reviewer-security-regression, reviewer-error-boundaries.
- **Backend / domain adjuncts:** `playbooks/add-migration/PLAYBOOK.md` (corrective migration), `playbooks/add-observability/PLAYBOOK.md` (missing evidence), `playbooks/realign/PLAYBOOK.md` (domain-model mismatch).
- **Regression pinning (balanced + production):** `playbooks/add-regression-test/PLAYBOOK.md`.
- **Cleanup:** `playbooks/simplify/PLAYBOOK.md` (always), `playbooks/polish-ui/PLAYBOOK.md` (if UI changed, non-copy).

### REMOVE → `remove-feature` may invoke

- **Schema cleanup:** `playbooks/add-migration/PLAYBOOK.md` (when removal drops columns/tables).
- **Verification:** reviewer-data-integrity and reviewer-contracts subagents.

### AUDIT → `audit` may invoke

- The reviewer-* subagent fleet across the repo (contracts, data-integrity, error-boundaries, loading-states, observability-coverage, perf, authz, security-regression, concurrency, client-bundle) plus `simplify`, `harden-types`, and `audit-a11y` (whole-app a11y). When 2+ reviewers run, `findings-reconciler` produces the deduplicated disposition ledger. See `playbooks/audit/PLAYBOOK.md` for exactly which auditors fire at each mode.

**Course-author note:** because these are gate-driven, a given /ship run will invoke only a subset. The Step 5 pipeline summary names exactly which ones did fire — that's the authoritative record, not this appendix.
