---
name: simplify
user-invocable: false
metadata:
  audience: handoff
description: Internal handoff target invoked as a post-step by add-feature, modify-feature, fix-bug, remove-feature, and realign to clean up freshly-changed code — and by `audit` (Phase 4) with a caller-passed `scope=` to run the same review over a whole-repo scope. Reviews the git diff for DRY violations, duplicate code, oversized files/functions/components, magic numbers, poor naming, tight coupling, missed reuse of existing utilities, and inefficient patterns; refactors in place without breaking behavior. Writes a safety-net test first when the refactor risks behavior change. Default scope is changed files (or the caller's `scope=`); expands to siblings only when a flagged smell points there. Trigger phrases for routing: "simplify", "clean this up", "DRY this", "find code smells", "any duplication", "split this up". Skip for type-only edits, pure formatting, generated files, and changes the user has explicitly scoped to "no refactor".
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.

> **Mode-less.** This skill takes no `mode=` — callers gate *whether* to invoke it, not how deep it runs. If you are tempted to add a mode table here, that depth decision belongs to the calling skill.


# Code Simplify

Refactor freshly-changed code into a smaller, drier, better-named, less-coupled version — without changing behavior. Default scope is the working-tree diff against the merge-base of the current branch and its upstream/base.

---

## Phase 1 — Scope

1. Determine scope. If a **caller passed `scope=<path>`** (e.g., `audit` running repo-wide), use that path as the scope and read the files under it. Otherwise run `git diff --name-only` and `git diff --merge-base <base>` to identify changed files; if there's no diff, ask the user which files to scope.
2. Read each in-scope file in full (plus the diff hunks when working from a diff). Note imports — utilities the new code might duplicate often live next to or one directory up from the changed file.
3. State the scope back to the caller/user as a list before reviewing: "Reviewing N files: [list]. Will reach into siblings only if a flagged smell points there."
4. **Scope guard.** With **no** caller-passed `scope=`: if the diff names >50 files or spans an unrelated branch base (e.g., the user just rebased onto a different upstream), STOP and ask the user to narrow scope before reviewing — /simplify is a focused pass; aimed at a whole `src/` it produces noise instead of fixes. When a **caller passed `scope=`** (audit's repo-wide pass), that caller already owns the scope decision — do **not** stop; proceed over the given scope, processing it in file-group batches if it's very large.

---

## Phase 2 — Safety Net (before any structural refactor)

Decide per change:

- **Mechanical fix** (rename a single-file local symbol, extract pure constant for magic number, swap inline logic for an existing util, delete a dead comment, collapse an unnecessary wrapper) → no test required; apply directly in Phase 4. **Exclusion:** renaming an *exported* symbol crosses module boundaries — every importer must update — so route it through the structural-fix gate, not the mechanical path.
- **Structural fix** (extract function across module boundary, split a component, move logic between layers, replace a duplicated block with a shared helper) → behavior could shift. If the touched code path has no covering test, invoke `playbooks/write-tests/PLAYBOOK.md` for that path BEFORE refactoring. The test must run green against the current code first; that's the safety net.

If `write-tests` cannot wire a test (no harness, third-party-only path, UI without test infra), STOP and ask the user: "(a)pply mechanical fixes only / (b)refactor without a test net / (q)uit". Default to (a).

---

## Phase 3 — Parallel Review Fan-Out

> **Trigger question for every duplicate block flagged:** "Do these two callsites change for the same reason?" If no, leave them duplicated — premature DRY couples unrelated callers and is worse than copy-paste.

**MANDATORY — READ [`references/code-smells.md`](references/code-smells.md)** before launching the agents. The headline list below is the high-leverage subset; the reference file holds the full catalog each agent should scan against.

Launch the reuse lookup (Agent 1, via `utility-finder`) and the two review agents (Agents 2–3) concurrently in a single message. Pass Agents 2 and 3 the full diff, the list of changed file paths, and a pointer to `references/code-smells.md`; pass `utility-finder` each new helper's signature.

### Agent 1 — Code Reuse (dispatch `utility-finder`)

Don't re-describe utility-finder's job — dispatch the real subagent. For each genuinely new function/helper the diff introduces, dispatch `utility-finder` (`subagents/utility-finder.md`) with the function's signature/behavior (or a noun phrase like "format duration"); it returns ranked existing equivalents with file:line refs and a reuse / extend / write-new verdict. Batch the independent lookups into parallel dispatches in one message.

Separately — without a subagent — flag duplicate code blocks **within the diff itself** (copy-paste of 3+ lines with minor variation) and inline logic that obviously duplicates a standard utility. That's local to the diff and doesn't need a repo-wide search.

### Agent 2 — Code Quality

Headline items (full list in `references/code-smells.md`):
- **DRY violations** — near-duplicate blocks encoding the same rule
- **Long files / functions / giant UI components** — split at natural seams
- **Magic numbers and strings** — name by business meaning
- **Poor naming** — non-self-describing variables, functions, booleans
- **Tight coupling / API duplication** — pull repeated cross-module logic into a helper
- **Nested conditionals 3+ deep** — flatten with early returns or a lookup table

### Agent 3 — Efficiency

Headline items (full list in `references/code-smells.md`):
- **Unnecessary work** — redundant computation, duplicate I/O, N+1 patterns
- **Missed concurrency** — independent ops run sequentially
- **Hot-path bloat** — blocking work added to startup or per-render paths
- **Recurring no-op updates** — unconditional notifications in loops/handlers
- **Memory** — unbounded structures, missing cleanup, listener leaks

---

## Phase 4 — Apply Findings (gated)

Consolidate findings into a numbered list grouped by file. Each item: severity (critical / suggested / nit), category, location, proposed fix.

Apply via `skill-forge-hitl`-style per-item gate when available; otherwise:

- **Auto-apply** (no per-item prompt): mechanical fixes only — magic-number → named constant, swap inline logic for an existing util the agent confirmed exists, rename a single-file local variable, delete dead comment, collapse a one-child wrapper.
- **Prompt before apply**: every structural fix (extract, split, decouple, move). Show before/after intent in one sentence; user replies `(a)pply / (s)kip / (q)uit`.

Run the safety-net test from Phase 2 after each structural fix. If it goes red, revert that fix and surface why.

---

## Phase 5 — Re-Verify and Report

1. Run the project's typecheck and the safety-net tests once more.
2. Print a summary: applied N fixes, skipped M, surfaced K (couldn't auto-fix). Group by category.
3. If any Agent 1 finding pointed to siblings outside the diff with the same smell, list them and ask: "Expand scope to fix these too? (y/N)". Do not silently expand.

---

## NEVER

- **NEVER refactor structural code without a covering test running green first**
  **Instead:** invoke `playbooks/write-tests/PLAYBOOK.md` for the touched path, confirm green, then refactor.
  **Why:** "looks equivalent" refactors regularly break behavior in branches the diff doesn't cover; the test is the only proof.

- **NEVER expand scope beyond the diff (or the caller's `scope=`) silently**
  **Instead:** surface the sibling smell as a question with file paths and ask before touching. **Exception:** a caller-passed `scope=` (from `audit`) is an explicit, wider scope grant — operate within it without re-asking, but still never reach outside *it* silently.
  **Why:** users invoke /simplify expecting a focused pass on what they just wrote — a 40-file rewrite shatters trust and conflicts with in-flight work. `audit` is the one caller that has already negotiated a wider scope with the user, so honoring its `scope=` isn't a silent expansion.

- **NEVER replace a magic number with a constant whose name restates the value**
  **Instead:** name it after the business meaning (`MAX_RETRY_ATTEMPTS`, not `THREE`).
  **Why:** `const FIVE = 5` is the same code with extra steps; the value of extraction is encoding intent.

- **NEVER extract a "shared helper" from two near-duplicate blocks without confirming they'll evolve together**
  **Instead:** if the two callsites have different reasons to change, leave them duplicated. Extract only when the duplication encodes one rule.
  **Why:** premature DRY couples unrelated callers — every future change to one forces a fork or a flag, which is worse than copy-paste.

- **NEVER split a file just because it's long**
  **Instead:** split when there's a natural seam (independent concern, separately-tested unit, separately-imported export). A 400-line file with one cohesive concern is fine.
  **Why:** splitting cohesive code scatters context and makes navigation worse, not better.

- **NEVER apply structural fixes in batch without per-fix verification**
  **Instead:** apply one structural fix, run the test, then move to the next.
  **Why:** batched refactors hide which change broke the test; isolating each restores bisectability.

- **NEVER add comments while refactoring to explain what you did**
  **Instead:** let the rename / extraction / structure speak. If a future reader still needs WHY, add one line.
  **Why:** "// extracted from X" rots immediately and pollutes the file; the git history holds the trail.
