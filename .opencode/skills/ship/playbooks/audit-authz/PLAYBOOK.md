---
name: audit-authz
description: Audit authorization on every server-side entry point — TanStack Start server functions in `src/fn/`, HTTP route handlers, tRPC procedures, GraphQL resolvers, webhook handlers, queue workers, IPC handlers — for missing or wrong access checks. Detects: handlers with no auth check at all (anonymous access), handlers that check identity but not ownership (any logged-in user can read another user's data), handlers that grant by role-presence without resource scoping, IDOR (raw id from request body trusted without ownership lookup), public endpoints reading user-scoped data via session, and admin-route checks that depend on a client-supplied flag. Reports findings with severity (critical / high / medium / low) and the specific check that's missing. Never silently inserts checks — proposes the fix and lets the user confirm. Trigger phrases — "audit auth", "authz audit", "check authorization", "/audit-authz", "any auth holes", "review server functions for auth", "permission audit", "IDOR check". Skip for — pure frontend code, public-by-design endpoints (health, status, public read APIs explicitly marked), test fixtures.
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.


# Code Audit Authz

Every server entry point answers two questions: **who is this** (authentication) and **what may they
do with the resource they named** (authorization). The bug class this skill targets is the second —
present session, missing ownership.

This skill is the **interactive wrapper** around the `reviewer-authz` subagent. The subagent owns the
detector catalog and does the scan — one catalog, one owner — and this skill scopes the surface,
dispatches the subagent, and walks the user through applying fixes one at a time. Never silently
inserts checks.

---

## Phase 1 — Scope

Decide the surface to audit and state it back to the user:

- **Named handler(s) / directory** — the user pointed at `src/fn/` or a specific route group.
- **Diff** — "audit what this branch changed" → the touched handlers only.
- **Whole repo** — a full authorization sweep (the heavier default for "audit auth").

**Exit:** the scope (files or "whole repo") is fixed and stated.

---

## Phase 2 — Dispatch the authz scan

Dispatch the **`reviewer-authz`** subagent (`subagents/reviewer-authz.md`) with the Phase 1
scope. It enumerates every server-side entry point, classifies each (public / authenticated /
user-scoped / admin / service), and returns a severity-ranked markdown report
(`## Authz scan — <N> findings`) covering anonymous access, IDOR, role-not-resource-scoped,
client-supplied admin flags, weak service secrets, and post-side-effect auth checks — each with a
concrete fix snippet using the project's **existing** auth helpers, and each `auto-fixable: false`.
Webhook signature verification is deferred to `reviewer-security-regression` (which owns it at HIGH);
if the reviewer surfaces one under "Deferred", pass that pointer through.

**The detector catalog lives in the agent — this skill does not re-list it**, so the two can't drift.

**Host-portability fallback.** If the `Agent` tool isn't available, read
`subagents/reviewer-authz.md` and run its Phase 1–4 workflow inline over the
Phase 1 scope, producing the same report. State the degradation to the user.

**Exit:** the reviewer's severity-ranked findings are in hand.

---

## Phase 3 — Present and (optionally) apply, one at a time

Surface the findings grouped by severity. Applying auth fixes is this skill's unique value over the
raw subagent — but only on explicit request ("yes, apply the critical fixes"):

- Apply **one finding at a time**, using the project's existing auth helpers (never invent one — if
  none exists, surface that as its own finding and stop).
- After each, run typecheck and the relevant test (if any). Show the diff and stop for confirmation
  before the next finding.
- Never bulk-apply. Authorization fixes change behavior — every one needs a sanity check by someone
  who knows the resource model (the user, not the audit).

**Exit:** findings reported; only the fixes the user approved are applied, each verified.

---

## NEVER

- **NEVER silently insert auth checks.**
  **Instead:** report findings; apply only with explicit user approval and one at a time.
  **Why:** an auth check inserted in the wrong place either over-restricts (legitimate users get 403) or is bypassed at runtime by an earlier code path. The diff must be reviewed by someone who knows the resource model — that's the user, not the audit.

- **NEVER re-list the detector catalog in this skill.**
  **Instead:** the catalog is owned by `reviewer-authz`; dispatch it. If a detector is missing, add it to the agent, not here.
  **Why:** two copies of the catalog drift — the exact rot this consolidation removed (it already drifted three times: severity claims, the webhook-defer clause, alt-text policy).

- **NEVER trust user identity claims that come from the request body or query.**
  **Instead:** the user identity must come from the session / cookie / verified JWT. `input.userId` is a target, not a credential.
  **Why:** every IDOR begins with treating client-supplied identifiers as authoritative. The session is the only source of "who is calling".

- **NEVER conclude a handler is safe because it calls `requireUser()`.**
  **Instead:** verify that for every resource named in the input, ownership is checked. `requireUser()` proves identity, not authorization.
  **Why:** identity-only checks are the most common authz bug — every logged-in user becomes able to read or modify every other user's resources by changing one id in the request.

- **NEVER reason about authorization from the UI.**
  **Instead:** the audit examines server code only. Client-side hiding is not a security control.
  **Why:** the UI shipping or hiding a button changes nothing about who can call the endpoint.

- **NEVER recommend a fix that uses a helper not already in the codebase.**
  **Instead:** find and use the project's existing auth helper. If none exists, surface that as a separate finding and stop — do not invent one.
  **Why:** ad hoc auth helpers fragment the audit surface. The project has either a single reviewed helper or N inconsistent ones — the audit pushes toward the former.
