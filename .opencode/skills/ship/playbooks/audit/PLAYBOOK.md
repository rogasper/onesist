---
name: audit
description: Whole-codebase tech-debt sweep. First maps architecture and data flow, then orchestrates every available audit/harden/cleanup skill (duplication, type safety, data integrity, security, contracts, error boundaries, loading states, a11y, concurrency, client-bundle, observability, perf, simplify) across the repo — not just the diff — to find and remove accumulated tech-debt. Produces an architecture summary, severity-ranked findings report, refactoring strategy, then applies mechanical fixes inline and gates structural fixes per-item. Accepts `scope=<path>`, `mode=fast|balanced|production`, and `include=`/`skip=` (audit-skill names). Use when the user says "audit the codebase", "understand this codebase", "refactor without behavior changes", "tech-debt sweep", "deep clean", "/audit", "find all the rot", "production-readiness pass", "full cleanup", or when ship routes here for a production-grade hardening pass. Skip for — focused diff-only reviews (use simplify), single-concern audits (call the specific `audit-*` skill directly), and any context where the user only wants a quick fix.
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.


# Audit

A whole-codebase tech-debt sweep. The diff-scoped `simplify` and the per-concern `audit-*` / `harden-*` skills each cover a slice; this skill runs the full battery against the whole repo, deduplicates findings, and walks the user through fixes. It is heavier than `simplify` and slower than any single `audit-*` — invoke it deliberately.

---

## Phase 1 — Scope and confirm

1. Detect repo root, primary language(s), frameworks (TanStack/Next/Electron/etc.), and rough size: `git ls-files | wc -l`.
2. If the working tree is dirty, surface it: an audit on top of in-progress changes will tangle findings with WIP. Ask via `AskUserQuestion`: "(s)tash and audit clean tree / (a)udit current state / (q)uit". Default `s`.
3. If the repo has >2000 source files, ask the user to narrow scope (a directory, a feature area, a route group) before running. A whole-monorepo audit produces noise instead of signal.
4. Announce the battery of audit skills that will run (Phase 4) so the user knows what's coming and can `skip=` any.

**Inputs accepted from caller (e.g., `ship`):**
- `scope=<path>` — narrow to a directory
- `include=<csv>` — comma-separated audit-skill names to force-include even below their default mode tier
- `skip=<csv>` — comma-separated list of audit skill names to skip
- `mode=fast|balanced|production` — `fast` runs only `simplify` + `harden-types` + typecheck/lint (the two "always" audits from Phase 4); `balanced` adds the high-leverage audits; `production` runs everything. Default `balanced` when invoked directly; honor caller-supplied mode otherwise.

**Run-ledger handoff.** When `/ship` passes `run-id=` and `run-ledger=`, update that ledger at every phase/subagent/reviewer transition. Record scope/baseline decisions, every auditor task and fallback, finding dispositions from the reconciled ledger, applied fixes, and exact final verification evidence.

---

## Phase 2 — Architecture and data-flow map

Before judging structure, understand it:

1. Identify app entry points, route/server boundaries, state stores, data-access modules, job/worker entry points, and external integration boundaries.
2. Trace the main data flow for 2–3 representative user actions: UI/input -> validation -> API/server function -> domain/use-case -> persistence/external service -> cache invalidation/refetch -> rendered state.
3. Name ownership boundaries: which modules own domain rules, persistence, UI composition, infrastructure concerns, and cross-cutting utilities.
4. Record architecture smells separately from code smells: mixed UI/data access, duplicate domain rules, unclear source of truth, circular dependencies, cross-layer imports, stale cache patterns, overgrown modules.
5. **Structural hygiene pass.** Walk the directory tree and flag layout rot — *don't* fix it here, just record findings for Phase 5:
   - Directories with mixed concerns (UI components next to data-access next to domain logic with no separation).
   - Files that have outgrown their location (a single 800-line file holding three unrelated features; a `utils.ts` that has become a junk drawer).
   - Naming drift (sibling files using inconsistent casing/conventions; "v2"/"new"/"old" suffixes that stuck around).
   - Misplaced files (tests not co-located with the convention; types floating in random folders; one-off scripts in `src/`).
   - Dead directories (empty folders, or folders whose last meaningful change is ancient and whose contents look orphaned).
   If layout issues are material, the Phase 5 report should call them out and recommend a separate file-reorganization pass as a follow-up — *after* the in-place fixes land, so the move diff isn't tangled with content changes.

Output a short architecture summary before running the audit battery. If you cannot name the data flow, keep exploring; otherwise the findings will be local observations without system context.

---

## Phase 3 — Baseline gates

Run first, in parallel via Bash:
- Project typecheck (e.g., `tsc --noEmit`, `pyright`, `cargo check`)
- Linter (e.g., `eslint`, `ruff`, `clippy`)
- Formatter check (no auto-fix yet)
- Test suite (smoke only — full run gated to Phase 7)

Baseline failures get fixed first. Stacking refactors on top of a red baseline buries the signal.

---

## Phase 4 — Parallel audit fan-out

Dispatch the reviewer-* auditors **concurrently via the `Agent` tool** (parallel fan-out) and run the skill-based audits (`simplify`, `harden-types`) via the `Skill` tool. Note the mechanics: **`Skill` invocations are sequential — only `Agent` subagent dispatches run in parallel** — so the reviewer fan-out parallelizes while the two skill audits run one after the other. Scope every audit to the agreed Phase 1 scope (not just the diff): pass `scope=<Phase 1 path>` to the skills and describe the scope to each subagent. Tell each auditor it is running **repo-wide in report-only mode** — findings are consolidated in Phase 5 and applied under the Phase 6 gate, never auto-fixed inline here.

Apply the failure/recording policy in `playbooks/add-feature/references/subagent-playbook.md`: classify each audit as mandatory for the selected mode or advisory, retry failed/malformed output once, use the inline fallback, and treat a mandatory audit with no valid output as a blocked audit rather than a clean scan.

**Host-portability fallback.** If the `Skill` tool is not available in the current session (OpenAI Codex and other non-Claude-Code hosts), Read each applicable skill's PLAYBOOK.md at `playbooks/<skill-name>/PLAYBOOK.md` and execute them sequentially in this turn, treating each as the next phase of work. Reviewer subagents (`reviewer-*`) still go through the `Agent` tool — most CLIs that lack `Skill` still have a general-purpose agent primitive, and you can pass the reviewer's PLAYBOOK.md path to it. Surface the degradation up-front: tell the user "Skill tool unavailable — audits will run inline, sequentially, without subagent isolation." Inline sequential execution is slower and loses fan-out parallelism, but the findings are still produced.

**Always (every mode):**
- `simplify` — DRY, magic numbers, naming, oversized files, parallel-enum drift, repeated literals. Invoke with `scope=<Phase 1 scope>` so it audits the agreed repo-wide scope instead of the diff (simplify accepts a caller-passed `scope=` for exactly this — no scope deadlock).
- `harden-types` — strip `any`, dangerous casts, missing return types, missing boundary validation

**Balanced and production:**
- **`reviewer-data-integrity`** (subagent — dispatch via the bundled `subagents/reviewer-data-integrity.md`).
- **`reviewer-error-boundaries`** (subagent — dispatch via `subagents/reviewer-error-boundaries.md`).
- **`reviewer-loading-states`** (subagent — dispatch via `subagents/reviewer-loading-states.md`).
- **`reviewer-contracts`** (subagent — dispatch via the bundled `subagents/reviewer-contracts.md`).
- **`reviewer-observability-coverage`** (subagent — dispatch via `subagents/reviewer-observability-coverage.md`).
- **`reviewer-perf`** (subagent — dispatch via the bundled `subagents/reviewer-perf.md`; isolates the read-heavy perf audit from the parent context).

**Production only (additionally):**
- **`reviewer-authz`** (subagent — dispatch via `subagents/reviewer-authz.md`). Missing-auth/IDOR is the **highest-severity class a production-readiness audit can find**, and `reviewer-security-regression` explicitly defers authorization — so authz must run as its own pass or it stays structurally invisible.
- **`reviewer-security-regression`** (subagent — dispatch via the bundled `subagents/reviewer-security-regression.md`; isolates the read-heavy security audit from the parent context).
- **`reviewer-concurrency`** (subagent — dispatch via the bundled `subagents/reviewer-concurrency.md`).
- **`reviewer-client-bundle`** (subagent — dispatch via `subagents/reviewer-client-bundle.md`).
- **`audit-a11y`** (skill — whole-app accessibility, invoked with `scope=<Phase 1 scope>`). Use `audit-a11y`, **not** `reviewer-accessibility-regression`, for the repo-wide pass: the reviewer is documented as changed-files-only and would under-scan a whole-repo audit.

**Stack-conditional (auto-include when the stack matches):**
- TanStack Start present → promote `reviewer-contracts` (route ↔ loader/server-fn data drift) and `reviewer-client-bundle` (server/client layer boundary) into the fan-out even in balanced mode, since route-data and layer bugs are the dominant TanStack failure class.

Honor `include=` and `skip=` from the caller — `include=` force-adds a named audit even below its default mode tier; `skip=` removes one. Do not run audits the user explicitly excluded.

---

## Phase 5 — Consolidate findings

Each audit returns a list. When 2+ reviewer agents ran, dispatch **`findings-reconciler`** (`subagents/findings-reconciler.md`) with every full report, the architecture map/objective, scope/base SHA, and a manifest of expected/run/skipped auditors with reasons. It deduplicates by root cause, resolves conflicting fixes against code, preserves CRITICAL/HIGH/MEDIUM/LOW, and produces the disposition ledger used by Phase 6.

If the specialized agent is unavailable, read `subagents/findings-reconciler.md` and perform the same reconciliation inline. A missing or malformed mandatory auditor report is a coverage failure, not a zero-finding result.

Merge skill-audit output into that ledger, grouped by **severity** (CRITICAL / HIGH / MEDIUM / LOW), then category and file. Deduplicate findings that multiple audits flagged (e.g., a `Promise.all` miss flagged by both `reviewer-perf` and `simplify`) — keep one entry and cite every source.

Print the architecture summary and consolidated report **before** applying anything. Format:

```
Architecture summary
  entry points: <routes/server/jobs>
  data flow:    <core path in one line>
  boundaries:   <what owns UI/domain/data/infrastructure>

Audit summary — N findings across K categories
  critical: <count>  — <one-line headline>
  high: <count>
  medium: <count>
  low: <count>

By category:
  type-safety (12):    <top 1–2 examples with file:line>
  duplication (8):     <top examples>
  data-integrity (3):  ...
  ...

Refactoring strategy:
  1. <mechanical chunk>
  2. <type/data-flow chunk>
  3. <structural item requiring approval>
```

---

## Phase 6 — Apply (gated)

Two paths, mirroring `simplify`:

- **Auto-apply (no per-item prompt):** mechanical fixes only — magic-number → named constant, swap inline logic for a confirmed existing util, single-file local rename, dead-comment delete, formatter auto-fix, lint auto-fix.
- **Per-item gate (via `skill-forge-hitl` when available, else `(a)pply / (s)kip / (q)uit` per item):** every structural fix, every cross-module rename, every behavior-adjacent change.

Before any structural fix on a code path with no covering test, invoke `write-tests` for that path and confirm green — same safety-net rule as `simplify`.

Apply in this order to keep the diff bisectable:
1. Formatter / lint auto-fixes (one commit-shaped chunk)
2. Type hardening (one chunk)
3. Mechanical simplifications
4. Structural refactors — one at a time, re-run typecheck + targeted tests after each

---

## Phase 7 — Re-verify and report

1. Re-run typecheck, linter, full test suite, and production build where available; run the canonical residue + hardcoded-secret sweep from `ship`'s `references/residue-sweep.md` with `include-working-tree`.
2. If Phase 6 changed code, exercise each changed behavior path (or the smallest representative runtime path for a structural refactor) and record the observed result. Static gates alone cannot establish `locally-verified`.
3. Print final summary: architecture risks addressed, applied N, skipped M, surfaced K (couldn't auto-fix).
4. List remaining surfaced findings the user must decide on (architectural, design-input-needed, out-of-scope-but-flagged).
5. Report `locally-verified` only when all applied changes pass the final tree gate **and** runtime smoke evidence exists. Use `diagnosed` for report-only audits, `partial` for missing local/runtime evidence, and `blocked` for failed mandatory gates.
6. **Do not commit.** Hand off to the user's own git workflow only for a locally verified changed candidate.

---

## NEVER

- **NEVER run all audits silently in the background without announcing the battery**
  **Instead:** Phase 1 must list which audits will run at the chosen mode so the user can `skip=` any.
  **Why:** A 12-audit fan-out that surprises the user looks like runaway tooling. Visibility is the whole point of the orchestrator.

- **NEVER batch-apply structural fixes across categories**
  **Instead:** apply the formatter/lint pass, then types, then mechanical, then one structural fix at a time with verification between.
  **Why:** When a typecheck or test goes red after a batch, you've lost which change caused it; bisectability is the only cheap path to recovery.

- **NEVER expand the audit beyond the agreed Phase 1 scope without asking**
  **Instead:** if a finding points to siblings outside scope, surface them in Phase 7 and ask before touching.
  **Why:** the user agreed to a scope; silently auditing more files turns a 30-minute pass into a multi-hour rewrite they didn't ask for.

- **NEVER honor `mode=fast` on a request that explicitly says "deep dive" or "production"**
  **Instead:** surface the conflict via `AskUserQuestion` and let the user pick informed.
  **Why:** the autopilot caller may pass `fast` based on a heuristic that's wrong for an explicit audit request; the user's wording wins.

- **NEVER auto-apply a fix that one audit flagged but another would conflict with**
  **Instead:** during Phase 5 reconciliation, mark conflicting findings and route them through the gate even if each individually looks mechanical.
  **Why:** "extract this helper" from `simplify` can collide with "inline this for bundle size" from the `reviewer-client-bundle` subagent; the user decides which wins.

- **NEVER skip the baseline gates in Phase 3**
  **Instead:** fix typecheck/lint/test failures first, then audit.
  **Why:** stacking refactors on a red baseline means every subsequent failure is ambiguous — was it the audit fix or the pre-existing break?
