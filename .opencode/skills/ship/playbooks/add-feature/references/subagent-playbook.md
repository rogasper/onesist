# Subagent Fan-Out Playbook

Subagents speed work up *only* when the pieces are truly independent. The wrong fan-out is slower than serial because reconciling inconsistent outputs costs more than running them one after another.

---

## When to fan out

Fan out (parallel agents in a single message) when **all** are true:

1. The pieces touch different files with no shared edits.
2. No piece's API/contract shape determines another's.
3. Each piece can be briefed self-contained — file paths, contracts, constraints.
4. Outputs won't merge-conflict.

Common good fits:
- **Exploration:** "find how auth works" + "find how the job queue works" + "find existing pagination utilities" — three Explore agents in one message.
- **Reviews:** code review + security review + performance review on a finished diff.
- **Independent implementation:** a new DB migration AND an unrelated UI component AND a new doc snippet.

## Research waves

- Launch at most **four** research agents in the first wave, each with a disjoint lens and explicit non-goals. Agent count follows unknowns, not project importance.
- Give every researcher the same base SHA and locked user decisions. Require `file:line`, confidence, assumptions, and unresolved questions.
- A second wave is conditional: launch only for named gaps, contradictions, or a subsystem the first wave proved relevant. Each second-wave prompt must include the prior reports and state what it extends or challenges.
- If four lenses cannot cover the unknowns, serialize additional waves. A ten-agent first wave creates synthesis noise, not breadth.

---

## When NOT to fan out

- One piece's response shape determines another's (server contract → client consumer).
- All edits land in the same file.
- The work is iterative — you'll learn from piece 1 before knowing how to do piece 2.
- The pieces are small enough that orchestration overhead exceeds the savings.

When in doubt, serial.

---

## Briefing template (Explore agents)

```
Codebase exploration — report under 300 words.

Goal: [what we're trying to learn, and why]
Already known: [what you've already established — prevents duplicated work]
Specifically find:
  - [concrete question 1]
  - [concrete question 2]
Report format:
  - File paths with line numbers
  - One-line summary per finding
  - Flag anything surprising
```

## Briefing template (Implementation agents)

```
Implement [specific scoped piece]. Do NOT touch anything outside the listed files.

Context: [feature one-liner]
Run ID / base SHA: [stable identifiers]
Files you may create/edit: [explicit list]
Generated/lock/config files you own: [explicit list or none]
Files you must NOT edit: [adjacent areas owned by other agents]
Contract: [exact signatures, types, or response shapes — frozen]
Stable anchors: [symbols/routes/tables — line numbers are evidence only]
Constraints: [project conventions to follow]
Done when: [specific exit condition]
```

## Parallel implementation contract

Before launching writers, the parent freezes shared schemas, types, route/queue payloads, and public signatures in the run ledger. If a writer discovers that contract is wrong, it stops and reports; it does not silently redesign.

For each batch:

1. **One writer per file.** Every source, generated, snapshot, lockfile, formatter-owned config, and migration file has exactly one owner. Two items that share a file run in different batches.
2. **Base revision is explicit.** Every prompt carries the same base SHA and stable symbol anchors. Exact line numbers may drift and are never the sole edit target.
3. **Territory is enforced after return.** Capture changed paths before launch; after each writer returns, compare its changed paths to its allowlist. An undeclared path is a failed task until the parent inspects it.
4. **Shared checkout commands are serialized.** Writers may run targeted read-only checks for their territory. Full tests, builds, formatters, codegen, migrations, snapshot updates, and commands that share ports/caches/test databases run once by the parent after the batch—not concurrently.
5. **No implicit generated output.** If a command can rewrite routes, clients, schemas, snapshots, or lockfiles, those outputs must be owned by one writer or generated serially by the parent.
6. **Batch gate before dependency advance.** The parent checks the combined tree and frozen contracts before starting a dependent batch.

Prefer isolated worktrees when the host can create and deterministically merge them. File territories reduce collisions; they do not make a shared mutable checkout isolated.

## Briefing template (Review agents)

```
Review the diff at [branch/commit/files]. Apply [specific checklist file].

Report:
  - Findings ranked by severity (blocker / should-fix / nit)
  - File:line references
  - Concrete fix suggestion per finding
Do NOT fix anything — report only.
```

---

## After fan-out

Consolidate. Read every agent's report. Resolve contradictions explicitly — don't average them. If two reviews disagree, decide which is right and why.

The parent and user retain decision authority. Researchers propose, plan-red-team challenges, implementers execute, and reviewers verify; none may silently choose product behavior, compatibility policy, or accepted risk.

## Task failure policy

Classify each dispatch before launch:

- **Mandatory** — plan-red-team when its production trigger fires, always-on correctness review, triggered authz/contract/data-integrity gates, findings reconciliation, and integration verification. Failure blocks `locally-verified`.
- **Advisory** — optional discovery or polish whose absence does not invalidate a required safety claim. Failure is reported and may continue with warning.

For timeout, tool error, malformed output, missing evidence, or agent unavailability:

1. Record `FAILED` plus reason in the run ledger.
2. Retry once with a narrower prompt and the same base SHA/locked decisions.
3. If the retry fails, execute the documented inline fallback.
4. If a mandatory task has no successful report/fallback, stop with terminal state `blocked`.
5. If advisory, continue only after recording the uncovered lens and terminal warning.

Never treat a zero-length or malformed report as “no findings.” Never relaunch a writer blindly after partial edits: inspect its changed paths first, then either keep and reassign from the current tree or revert only with explicit user approval.

## Minimum task record

Every dispatch records:

- task ID, role, mandatory/advisory
- base SHA and input artifact paths/hashes
- locked decisions and file territory
- status: `PENDING | RUNNING | PASSED | FAILED | FALLBACK | CANCELLED`
- retry count and failure reason
- output location/summary
- verification/disposition owner

This record belongs in the `/ship` run ledger, not only in conversation context.
