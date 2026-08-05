# Risk signals — the canonical list

This is the **single source of truth** for the high-risk signals that force a production-depth
pass (and that a `mode=fast` override must not silently bypass). `ship`'s Step 2 depth inference
and the mode-safety overrides in `add-feature`, `modify-feature`, `remove-feature`, and `fix-bug`
all reference *this* list rather than re-inlining their own copy — so the signals can't drift
apart across skills.

**Any one of these → treat the change as high-risk (`production` depth; a `mode=fast` request
must be surfaced for confirmation before it's honored):**

- Touches **auth, permissions, payments, billing, secrets**, or **external webhooks**.
- **Schema migration** or persisted-data rewrite.
- **Destructive deletion or deprecation of an external/public contract** (package exports, public
  URLs, webhook payload shapes, DB columns other services read).
- **Background jobs, queues, cron, retries, email/SMS/push, imports/exports, file writes,
  spawned processes, IPC, or external APIs.**
- **Caching, query invalidation, feature flags, analytics/business reporting**, or
  concurrency-sensitive mutations.
- **Multi-subsystem in the same change** (frontend + backend + DB together).

## How each caller uses it

- **`ship` Step 2** — any signal present → infer `mode=production`. An explicit `mode=fast` that
  collides with a signal is surfaced via `AskUserQuestion` (informed consent), never silently honored.
- **`add-feature` / `modify-feature` / `remove-feature` / `fix-bug`** — the "Mode safety override"
  in each skill refuses or confirms a `mode=fast` request when the change hits any signal above.

When this list changes, edit **only this file** — the callers cite it by reference.
