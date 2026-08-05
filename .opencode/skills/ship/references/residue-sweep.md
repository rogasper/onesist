# Canonical residue + secrets sweep

The single source for the pre-ship residue + hardcoded-secret sweep. The core workflow playbooks (add-feature, modify-feature, fix-bug, remove-feature, polish-ui) and the `integration-verifier` / `reviewer-dependencies` subagents all defer to *this* list rather than keeping their own copy — that duplication is exactly how merge-marker and secret-literal checks drift apart across modes. When the sweep changes, edit it **here**.

Scope the sweep to **this branch's added/changed lines**, including uncommitted + staged + untracked working-tree changes (a caller that runs before a commit exists depends on that coverage — otherwise the gate verifies only committed history and misses the tree about to ship). Report each hit with `file:line`.

## Warnings (report, do not auto-delete — sometimes intentional)

- `console.log`, `console.debug`, `console.dir` (allow `console.error` / `console.warn` if the project uses them for genuine error logging)
- `debugger;` / `breakpoint()`
- `.only(` and `.skip(` in test files; `it.todo(` left in
- `// TODO` / `// FIXME` / `// XXX` newly added in this branch
- `package.json` `dependencies` / `devDependencies` changed without a lockfile change
- unintended large or binary file additions

## Hard blocks (never a warning)

- **Merge-conflict markers** — `<<<<<<<`, `=======`, `>>>>>>>`
- **Hardcoded-secret literals** (surface `file:line` and treat as a credential leak until the user confirms a false positive): `sk_live_…`, `AKIA[0-9A-Z]{16}`, `ghp_…` / `ghs_…` / `gho_…`, `xox[bopas]-…`, PEM private-key headers (`-----BEGIN … PRIVATE KEY-----`), and 32+ char hex/base64 assigned to a name containing `secret|key|token|password`

## NEVER

- **NEVER scan the whole file for residue patterns** — only this branch's added/changed lines. Pre-existing `console.log`s in a touched file are not this change's responsibility; reporting them is alert fatigue.
- **NEVER strip `console.error` / `console.warn` from the allowlist without checking the project's logging conventions.** Allow them by default; if the project forbids `console.*` in favor of a structured logger, treat all `console.*` as residue.
