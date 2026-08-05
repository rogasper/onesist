---
name: modify-feature
metadata:
  audience: user
description: Modify an existing feature — add to it, change how it works, or wire a small new behavior into something that already exists. Use when the user says "modify", "modify this", "modify the X", "enhance", "extend", "add to existing X", "also do Y when Z", "make this also do…", "derive this from that", "add a new component/picker/widget that reads existing data", or proposes a tweak to a feature that already lives in the app. Lighter than add-feature (no full plan-approval gate), but still maps which contracts shift before editing so a small-feeling change doesn't silently break adjacent code. Includes conditional logic-first tests and integration-first observability for risky extensions. Accepts `mode=fast|balanced|production` to control depth (default: balanced); also accepts `include=` / `skip=` overrides. Skip for greenfield features (use add-feature), pure refactors, enum/state renames (use realign), and bug fixes (use fix-bug).
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.


# Modify Feature

A small extension is the most dangerous size of change: large enough to shift requirements and adjacent contracts, small enough that the agent skips the thinking a full feature would trigger. The user's proposed shape is one option, not the spec.

---

## Modes

This skill accepts a `mode=` argument. Default — when no `mode=` is specified — is `balanced`: the four-question pre-flight + contract audit below.

| Mode | Behavior |
|---|---|
| `fast` | Skip the four pre-flight questions. Implement the user's literal proposal. Use only when the user has explicitly locked the seam (e.g. `mode=fast` in their prompt) and the change is genuinely single-file. |
| `balanced` (default) | The full pre-flight: alternative seam, contract audit, scope check, edge cases. Then edit, verify, and run gated post-checks for contracts, concurrency, observability, and tests when triggered. |
| `production` | `balanced` + an explicit scope-confirm gate before editing if the Q2 contract audit surfaces 5+ affected sites, plus mandatory tests for logic/data/API changes and observability instrumentation for integration boundaries. Pause and ask via `AskUserQuestion` whether to proceed as an extension or escalate to `add-feature` / `realign`. |

**`include=` / `skip=` overrides.** Add or remove specific concerns on top of the mode default — `mode=fast include=q2` runs the contract audit even in fast mode; `mode=balanced skip=q1` skips the alternative-seam question. **Token set:** the four pre-flight questions `q1`–`q4`, and the lane tokens `logic-first` and `tests`.

**Headless mode (`headless=true`).** Also triggered by the word "headless" in the invocation, and forwarded by `/ship`. Headless removes user interaction, NOT rigor — it skips QUESTIONS, never QUALITY gates:

- Never call `AskUserQuestion`. Any of the four pre-flight questions that would have gone to the user become **recorded assumptions**: resolve each with best judgement and log it ("Assumed: X because Y") for the final report.
- `production` mode's scope-confirm gate (Q2 surfaces 5+ sites) converts to: record the scope finding and the extension-vs-escalate decision in the final report, then proceed with best judgement.
- Headless must NOT skip implementation, verification, the after-editing review dispatches, or tests — only the user-interaction points. All mode/gate rules still apply at the resolved mode.

**Version announcement.** At the start of a run (when invoked directly rather than via `/ship`, which announces it upstream), read the plugin version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` if that env var exists, else the `.claude-plugin/plugin.json` two directories above this skill file, and include it in the first status line — e.g. "modify-feature (agentsystem-core vX.Y.Z)". If the manifest can't be found, say "version unknown" rather than failing.

**Run-ledger handoff.** When `/ship` passes `run-id=` and `run-ledger=`, update that ledger at every pre-flight, subagent, reviewer, and verification transition. Record finding dispositions plus exact final verification evidence; never create a separate fixed ledger.

**Mode safety override.** If `mode=fast` is requested but the change hits any of the **risk signals** (canonical list in `ship`'s `references/risk-signals.md` — auth/permissions/payments/secrets/webhooks, schema migrations, destructive deletes, background jobs/queues/cron, external APIs, email/SMS/push, imports/exports, file writes, IPC, caching/invalidation, feature flags, analytics, concurrency-sensitive mutations), surface the conflict via `AskUserQuestion` and confirm before honoring. The `/ship` orchestrator enforces this upstream — direct manual callers may not. In headless mode, don't ask — auto-upgrade to the mode the risk signals demand and record the decision as an assumption.

**Phase-gated NEVER scope.** When `mode=fast` is in effect, two NEVERs are explicitly suspended for the run: *"NEVER implement the user's literal proposal without naming one alternative"* and *"NEVER agree with the user's framing of effort before completing Q2"*. The remaining NEVERs (contract audit, peer-data consumers, scope creep, manual-override, stop-action symmetry, rename-realign boundary) stay in force in every mode — they protect against silent breakage that fast mode shouldn't override.

---

## Before you touch code, answer four questions

**Always use the AskUserQuestion tool** (multi-question, structured choices) when you need clarification from the user — never present static numbered prompts they have to type answers to. Fall back to free-form prose only when the option space is genuinely open-ended.


1. **Is the user's proposal the best seam?** They named one approach. Find at least one alternative — different layer (UI vs server vs data), different trigger (push vs pull, eager vs lazy), different ownership (existing module vs new). State the tradeoff. If their proposal still wins, say why; if not, surface the alternative *before* implementing.

2. **What contracts shift?** List every place the *meaning* of something changes: types, API responses, persisted rows, UI states, user expectations, docs, tests asserting the old behavior. The extension is done when all of these are coherent, not when the new path works.

   **Audit order:** types → API/IPC surface → persisted rows/migrations → UI states & conditionals → runtime/lifecycle state (spawned processes, child terminals, timers, watchers, in-memory registries — and which UI surface projects each one's liveness) → tests asserting old behavior → user-facing docs/copy → peer consumers (other components/hooks/routes reading or caching this same entity) → live-update wiring (event subscriptions, query invalidations, refetch triggers, and runtime-state projections like status badges, indicator dots, "is alive" booleans — name what owns the truth and how each reader stays consistent with it). Walk the list in this order; later layers depend on earlier layers' decisions.

   **Peer-consumer audit runs in both directions.** The list above covers peer consumers reading the same entity; the reverse holds too: **if you change a shared consumer's required contract (component props, shared type), enumerate the unchanged producers that now violate it** — every page that mounts the component, every Inertia `render(...)` / loader / serializer / factory that builds its props, explicitly including files outside the diff. A green typecheck is not evidence here — a non-optional TS field on props the server constructs is an unenforced claim about producers.

3. **Where's the boundary?** If the change touches 3+ unrelated modules, renames a domain concept, or invalidates persisted data, it's not an extension — stop and recommend `realign` or a feature-build approach instead. **Scope-explosion fallback:** if the audit in Q2 surfaces more than ~10 affected sites, that itself is the signal — stop and re-scope, even if implementation has already started.

4. **What edge cases does the user's framing miss?** User overriding the derived value manually. Pre-existing rows that predate the extension. Failure of the new derivation step. Re-derivation when the source changes after the fact.

   **Symmetric data-flow:** when adding a new *reader* of shared data, list the mutations that must invalidate it; when adding a new *mutation*, list the readers that must refresh.

   **Cold-start reconciliation:** on process/app restart, what's the source of truth for this feature's runtime state — persisted disk, a runtime probe (is the child process actually alive?), or "assume offline until re-triggered"? Decide explicitly; default-persist is a decision, not an absence of one. Stale persisted state that outlives its underlying runtime (a "running" row pointing at a dead PID, a green dot for a terminal that no longer exists) is the canonical bug class here.

## Investigation subagents — dispatch before/while editing when the trigger matches

The same fresh-context subagents `add-feature` uses apply here whenever the extension matches. Dispatch them via the `Agent` tool; they return structured inventories, not advice, and keep search noise out of this window:

For every fan-out, follow `playbooks/add-feature/references/subagent-playbook.md`: classify mandatory/advisory tasks, record base SHA and file ownership, retry a failed/malformed task once, use the documented inline fallback, and fail closed when a mandatory gate has no valid output.

- **`crud-surface-mapper`** (`subagents/crud-surface-mapper.md`) — when the change **adds a field or behavior to an artifact/entity** (Task, Project, User, Workspace, …). It returns every create / edit / settings / bulk-import / duplicate surface for that entity, so the new field ships to *all* of them. This is the concrete guard against the Q2 "shipped to only one surface" failure — the most common incomplete-feature bug.
- **`ui-pattern-inspector`** (`subagents/ui-pattern-inspector.md`) — when the change **adds a new instance of a recurring UI family** (Modal, Dialog, Drawer, Sheet, Form, Card, Toast, Command Palette). It returns 2–3 sibling instances with their conventions (submit/cancel hotkeys, autofocus target, loading/disabled states, footer chrome) to match by default.
- **`utility-finder`** (`subagents/utility-finder.md`) — **before writing any new helper**, to surface an existing equivalent (reuse / extend / write-new verdict with file:line refs) instead of duplicating one that already exists.

In `production`, if the pre-flight finds 5+ affected sites, 3+ subsystems, persistence/public-contract changes, or parallel implementation seams, write the proposed change plan and dispatch **`plan-red-team`** (`subagents/plan-red-team.md`) before editing. Supply any known traffic/data-growth, availability, recovery, and cost constraints. Require explicit checks for relevant scalability, reliability/failure-isolation, performance/capacity, operability/observability, data-integrity/concurrency, security-boundary, deployment/rollback, and cost/complexity risks; irrelevant dimensions are `N/A`, while unknown requirements are `UNVERIFIED` or `BLOCKED`, never guessed. Reconcile its evidenced amendments against the code, then take any `BLOCKED` decision to the user. If the specialized agent is unavailable, read `subagents/plan-red-team.md` and run the same challenge inline; do not silently skip a triggered production gate.

## Logic-first lane

If the extension changes a deterministic parser, validator, pricing rule, permission rule, data transform, state machine, API/data contract, or non-trivial branch, write the expected behavior test before editing production code. In `production`, this is mandatory. In `balanced`, run it unless the project has no harness or the change is trivial UI wiring. In `fast`, run it only when the user passed `include=logic-first` or `include=tests`. **Invariant enumeration is mandatory whenever the change description states a rule or property** ("the frozen plan wins over later edits", "reruns re-apply the cap") — independent of mode: list the 1–3 invariants that DEFINE this change and write one test per invariant first, before covering the rest of the surface. A suite that covers happy path + auth but asserts none of the defining invariants verifies nothing the change is actually about.

## Integration-first lane

If the extension touches HTTP/webhook dispatch, queues, jobs, cron, IPC, MCP tool calls, file writes, env-var injection, spawned processes, external APIs, email/SMS/push, imports/exports, or cache invalidation, name the runtime contract before editing: trigger, dispatch site, receiver, persisted/visible outcome, and log/observation location. Dispatch the **`runtime-contract-tracer`** subagent (via `subagents/runtime-contract-tracer.md`) to extract the 4-link trace with file:line refs in a fresh context — the result is the input to your planning. After verification, invoke `playbooks/add-observability/PLAYBOOK.md` unless equivalent structured evidence already exists and you can name where it lives.

## After editing

1. Verify the changed code path, not just the build.
2. **Correctness code review of the diff.** Dispatch the **`reviewer-code`** subagent (via `subagents/reviewer-code.md`) with the diff — it carries the code-review checklist and reviews in a fresh context. `simplify` (post-step) covers smells and duplication, **not** correctness — without this pass a small extension gets no correctness gate at all. Apply auto-fixable items; surface the rest. (Host-portability fallback: read `add-feature`'s `code-review-checklist.md` and review inline.)
3. Dispatch the **`reviewer-contracts`** subagent (via `subagents/reviewer-contracts.md`) when the change crosses client/server, route/schema, IPC, DTO, generated-client, or API boundaries. Apply auto-fixable renames; surface structural mismatches.
4. Dispatch the **`reviewer-concurrency`** subagent (via `subagents/reviewer-concurrency.md`) when the change touches mutations, jobs, webhooks, retries, idempotency, transactions, or async UI writes. Apply auto-fixable items (AbortController injection); surface the rest.
5. Dispatch the **`reviewer-perf`** subagent (via `subagents/reviewer-perf.md`) when the change adds or alters DB queries, list rendering, loops over user-scale data, aggregations, image/upload-heavy routes, or known hot paths. An extension that quietly introduces an N+1 or an unindexed filter otherwise ships with no perf gate — `add-feature` would run one, so an equivalent modify-run must too. Apply auto-fixable items; surface the rest.
6. Dispatch the **`reviewer-observability-coverage`** subagent (via `subagents/reviewer-observability-coverage.md`) after critical-path async/error/integration changes; if it reports missing evidence, invoke `playbooks/add-observability/PLAYBOOK.md`.
7. Dispatch the **`reviewer-data-integrity`** subagent (via `subagents/reviewer-data-integrity.md`) when the change touches migrations, schema, persistence, imports/exports, deletes, denormalized data, or data-access invariants. The subagent returns a change classification (additive/mutating/destructive) plus severity-ranked findings; apply auto-fixable seed-fixture renames and surface the rest.
8. Dispatch the **`reviewer-security-regression`** subagent (via the bundled `subagents/reviewer-security-regression.md`) when the change touches backend execution, auth, payments, file upload, webhook signing, secrets/env, external APIs, unsafe redirects, or user-rendered HTML. The subagent runs read-only and returns a severity-ranked findings report; apply the `auto-fixable: true` items mechanically and surface the rest to the user. Dispatch the **`reviewer-authz`** subagent for **every added or changed server entry point** (TanStack server function, route handler, tRPC procedure, GraphQL resolver, webhook handler, queue worker, IPC handler), not only when authorization code is already visible in the diff. The security-regression auditor covers the broader surface but defers authorization to this auditor. The `playbooks/audit-authz/PLAYBOOK.md` skill remains available as a manual entry point.
9. Dispatch the **`reviewer-error-boundaries`** subagent (via `subagents/reviewer-error-boundaries.md`) when the change alters a user-facing async flow, route loader, form submit, server action surfaced in UI, or background failure path. Apply auto-fixable items; surface the rest.
10. Dispatch the **`reviewer-loading-states`** subagent (via `subagents/reviewer-loading-states.md`) when the change alters async UI (`useQuery`, `useSuspenseQuery`, `useMutation`, optimistic updates, submit pending state, polling, client fetches). Apply auto-fixable items; surface the rest.
11. Dispatch the **`reviewer-accessibility-regression`** subagent (via `subagents/reviewer-accessibility-regression.md`) after interactive UI mutation (buttons, forms, dialogs, focus, custom click targets, error messages). Apply auto-fixable items; surface the rest.
12. Dispatch the **`reviewer-client-bundle`** subagent (via `subagents/reviewer-client-bundle.md`) when client routes/components/hooks change, new dependencies are imported in UI, or server-only code might leak into the browser bundle.
13. Add or expand tests for backend logic, data transformations, permissions, contracts, persisted data, non-trivial branching, async behavior, and business rules — invoke `playbooks/write-tests/PLAYBOOK.md` so the new behavior is covered using the project's existing harness and conventions. When the extension changes a user-facing flow that warrants browser coverage and the project has Playwright (or the user approves installing it), also invoke `playbooks/add-e2e-test/PLAYBOOK.md`. In `production`, this step is mandatory; in `balanced`, run unless the change is trivial UI wiring; in `fast`, opt in only via `include=tests`.

**Also gated (dispatch when the trigger matches):**
- **`reviewer-boundary-validation`** (`subagents/reviewer-boundary-validation.md`) — when the change adds or alters a server entry point that reads external input (`req.body`/params/query, webhook payload, queue message, IPC arg) with no schema parse. Read-only sibling of `harden-types`; surface HIGH gaps and hand the boundary to `harden-types` to fix.
- **`reviewer-dependencies`** (`subagents/reviewer-dependencies.md`) — when the change touches `package.json`/lockfile or adds a dependency (advisories, install scripts, maintenance/license flags, and a hardcoded-secret sweep of the diff).
- **`reviewer-test-quality`** (`subagents/reviewer-test-quality.md`) — after `write-tests` runs, to gate the generated tests (assert-nothing, mock-the-unit, changed-lines-uncovered) before declaring the change done.

When 2+ reviewers ran, dispatch **`findings-reconciler`** (`subagents/findings-reconciler.md`) with every full report, the change plan, final diff, and the run/skip manifest. Fix or obtain user disposition for every surviving finding, rerun the owning reviewer after fixes, and reconcile again before closure. If unavailable, read `subagents/findings-reconciler.md` and build the same ledger inline; missing mandatory reports are coverage failures.

## Stack-conditional adjuncts

- **UI wiring:** use `playbooks/add-empty-error-states/PLAYBOOK.md` for newly wired data that needs empty/error states.
- **Backend schema:** invoke `playbooks/add-migration/PLAYBOOK.md` before editing migrations for schema changes, then dispatch the **`reviewer-data-integrity`** subagent.

## NEVER

- **NEVER implement the user's literal proposal without naming one alternative**
  **Instead:** Surface the alternative seam in one sentence, state the tradeoff, then ask or proceed with reasoning.
  **Why:** Users propose the solution shape from their current vantage point; the cleaner seam is often one layer up or down. Implementing literally locks in the wrong shape.

- **NEVER ship the new path without auditing adjacent contracts**
  **Instead:** Grep for callers/consumers of the changed type/field/state and decide explicitly whether each adapts, breaks, or is unaffected.
  **Why:** Extensions shift requirements; stale assumptions in adjacent code become silent bugs that surface later when no one remembers the change.

- **NEVER add a new consumer of shared data without checking how peers stay live**
  **Instead:** Grep for other readers of the same entity/endpoint (lists, current-user, settings, project/workspace metadata — anything fetched in more than one place). Verify they share a cache or each subscribe to the mutation signal. If neither, propose consolidating into a shared query/store before adding a second ad-hoc fetch.
  **Why:** Each ad-hoc `useState + fetch` becomes an island the next mutation has to remember to invalidate. Rename-style mutations (same id, no navigation) won't incidentally refresh peers — the bug ships silently and only surfaces in production.

- **NEVER expand scope to "while we're here" cleanups**
  **Instead:** Note the cleanup opportunity in the response and stop.
  **Why:** Extensions are dangerous because they're framed as small. Bundling cleanup makes the diff unreviewable and hides the requirement shift inside structural noise.

- **NEVER treat manual override as a future problem**
  **Instead:** Decide upfront: does the derived value lock the field, suggest into it, or fully replace user input? Make it explicit in the implementation.
  **Why:** "Auto-derive X" almost always collides with the user's existing ability to set X manually. Skipping this decision creates UX bugs the next session has to retro-fix.

- **NEVER agree with the user's framing of effort before completing Q2**
  **Instead:** Run the contract audit first, then confirm or push back on scope.
  **Why:** Small-feeling extensions routinely have 5x the contract surface the proposal implies. Agreeing early anchors scope incorrectly and locks the agent into a too-small mental budget for the real work.

- **NEVER add a stop/cancel/remove/disable action without enumerating every side-effect of its start/create/add/enable counterpart**
  **Instead:** List spawned children (processes, terminals, workers), persisted rows, in-memory registries/maps, UI badges and indicator state, event listeners, pollers, and any cached "is alive" derivations created by the start path. The stop path must address each — kill, delete, unregister, reset, unsubscribe — or explicitly defer with a reason.
  **Why:** Stop actions are framed as deletions but are really *reconciliations*. Missing one inverse leaves a zombie (orphan terminal still running, status dot still green, ghost row in a registry) that surfaces only after restart or the next interaction with the stale surface.

- **NEVER proceed when the change crosses into rename/realign territory**
  **Instead:** Stop and recommend the `realign` skill, or propose breaking the work into (a) extension and (b) follow-up rename.
  **Why:** A rename masquerading as an extension drags every leak site into one diff and gets misreviewed as a small change.

## When you're done

Before reporting completion, restate: (a) the contract that shifted, (b) the alternatives you considered and rejected, (c) the edge cases handled and the ones explicitly deferred. If you can't fill all three, you skipped the thinking — go back.

---

## Post-step: /simplify

After the extension lands, run `playbooks/simplify/PLAYBOOK.md` against the diff to catch newly-introduced duplication, parallel-pattern drift, missed reuse of existing utilities, and parameter sprawl from grafting onto the existing shape.

## Post-step: /polish-ui (UI changes only)

If the diff touches UI files (`src/components/**`, `src/routes/**`, `src/pages/**`, `app/**` — `.tsx`/`.jsx`), run `playbooks/polish-ui/PLAYBOOK.md` to verify kbd hints on hotkey-bound buttons, focus management, loading/disabled states, and footer/chrome consistency. Skip when the UI delta is a one-line copy or style tweak.

## Final candidate gate — AFTER every mutation

The earlier verification proves the initial edit, not the candidate after reviewer fixes, generated tests, `simplify`, or `polish-ui`. After all post-steps:

1. Re-run typecheck, lint, the full test suite, and production build where available.
2. Exercise the changed path again, including every unchanged producer/consumer identified by the contract audit.
3. Run the canonical residue + hardcoded-secret sweep from `ship`'s `references/residue-sweep.md` with `include-working-tree`; secret literals and merge markers hard-block completion.
4. Any code change made to repair this gate invalidates the result; repeat from step 1 and report the real commands/output.

For production work spanning 3+ subsystems, parallel writers, or persistence plus a runtime/client boundary, dispatch **`integration-verifier`** (`subagents/integration-verifier.md`) after the combined-tree checks. A failure must be repaired by the parent/owner and rechecked by a fresh verifier. If unavailable, read `subagents/integration-verifier.md` and execute its checklist inline.

Use terminal state `locally-verified` only when the combined tree passes. Otherwise report `partial` or `blocked` with the missing/failed evidence.
