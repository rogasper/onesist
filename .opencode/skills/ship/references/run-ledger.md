# `/ship` Run Ledger Contract

The ledger is the durable control plane for one `/ship` run. It survives context compaction, prevents concurrent runs from overwriting each other, and distinguishes verified evidence from remembered narration.

## Identity and location

Create a unique run ID: `<UTC timestamp>-<short-random-or-task-id>`.

Preferred location: the host's session scratch directory:

```
<session-scratch>/agentsystem/runs/<run-id>.md
```

Fallback when no session scratch path exists:

```
.agentsystem/runs/<run-id>.md
```

Never use a fixed `.agentsystem/ship-run.md`; concurrent sessions overwrite it. Before using the repo-local fallback, ensure `.agentsystem/` is ignored or ask before adding it to version control. Do not store secrets, raw credentials, full environment dumps, or sensitive user data in the ledger.

## Header

```
# AgentSystem run <run-id>

- Status: PLANNED | RUNNING | DIAGNOSED | LOCALLY_VERIFIED | PARTIAL | BLOCKED | CANCELLED
- Started: <ISO-8601>
- Updated: <ISO-8601>
- Goal: <user request>
- Intent / mode / risk: <values and reason>
- Base SHA: <sha>
- Initial worktree: <clean | paths already modified>
- Input hash: <hash of normalized goal + base SHA, when available>
- Routed skill: <name>
- Headless: <yes/no>
```

## Required sections

### Locked decisions and assumptions

Record user-approved choices, headless assumptions, non-goals, and any mode override. Downstream prompts receive these verbatim and may not reopen them.

### Phase checklist

Each row records phase, status, start/end timestamps, output/evidence, and retry/fallback notes. Update it immediately after each transition rather than reconstructing it at report time.

### Contract and ownership

For parallel work, record frozen schemas/types/routes/event payloads, stable symbol anchors, dependency batches, and one owner for every source/generated/lockfile.

### Subagent manifest

For each dispatch record:

- task ID and role
- mandatory/advisory
- base SHA and input artifact/hash
- locked decisions and file territory
- `PENDING | RUNNING | PASSED | FAILED | FALLBACK | CANCELLED`
- retry count/failure reason
- report path or concise output pointer

### Reviewer coverage

List expected, triggered, run, skipped, failed, and fallback reviewers with reasons. Link the reconciled findings ledger and track each finding disposition/closure evidence.

### Verification evidence

Record exact commands, exit status, runtime smoke action/observation, worktree status before/after, and the final verifier verdict when triggered. “Ran tests” is not sufficient.

### Waivers and blockers

Record the owner, reason, severity, scope, and timestamp for every accepted risk. The agent cannot create a waiver on the user's behalf.

## Checkpoint and resume rules

1. Write updates atomically when the host supports it; otherwise write a complete section at each transition.
2. On resume, verify run ID, base SHA, current worktree status, and input hash before continuing.
3. If the base or owned files changed unexpectedly, mark `BLOCKED` and reconcile the new state; never continue from stale file/line assumptions.
4. `RUNNING` tasks with no live agent become `FAILED` with reason `interrupted`; apply the normal retry/fallback policy.
5. Resume from the first non-passed phase. Never rerun a mutating phase merely because conversation memory is incomplete.
6. The final user report is rendered from the ledger, not reconstructed from chat.

## Terminal-state rules

- `DIAGNOSED`: evidence/root cause exists, no candidate was produced.
- `LOCALLY_VERIFIED`: all mandatory local gates and runtime observation passed after the final mutation.
- `PARTIAL`: candidate exists, but required local evidence could not be collected.
- `BLOCKED`: a gate failed, mandatory capability/fallback failed, or a user decision is required.
- `CANCELLED`: user stopped or replaced the request.

These states do not imply CI, deployment, rollback, canary, or production health.
