# Requirement Traceability Matrix (RTM)

Run **RTM generation** when the user asks to trace **business requirements** down to the technical side (design solution + test case), e.g. "Generate RTM", "bikin traceability matrix", "trace requirement ke design dan test case".

## Scope (one RTM, multi-FD)

A scope is one RTM (default → `RTM.md`, or a named scope → `RTM_<name>.md`). One FSD/BRD may be split into several feature files (FDs) to keep files small; the scope name is decided by the user (e.g. `P2`, `BRD01`, `Phase 3` — not inferred):

- The prompt tells you the **scope name** and the **selected FD list** (the files to trace). Trace only those FDs into one RTM for the scope.
- No FDs listed = trace all FSD/FD documents in `input/fsd/`.
- Default (no scope): one RTM covering all FSD/FD documents.

## Inputs

Read artifacts from the project root (no need to @-mention them):

1. **`input/fsd/*.md`** — the FSD(s) for the active scope. When scoped, read ONLY the selected FD files (the ones the prompt lists), not every FSD.
2. **`output/spec/*.md`** — generated API specs (design solutions). When scoped, prefer the files matching the selected features.
3. **`output/erd/*.md` / `.dbml`** — generated ERD (design solutions). Same scoped filtering.
4. **`output/task/*.md`** — generated task cards (design solutions + test case hints). Same scoped filtering.
5. **`MASTER_SPEC_API.md`** + **`MASTER_ERD.md`** at project root, if present (project-wide context).

Respect a total prompt budget (~48KB): read up to ~8 files per folder, cap each file's content (FSD 5KB, spec 4KB, ERD 4KB, task 2.5KB, master files 4KB). Stop adding artifacts once the budget is spent.

## Output

Write **EXACTLY ONE file**:

- Default scope → **`output/rtm/RTM.md`**
- Scoped (e.g. scope `P2`) → **`output/rtm/RTM_P2.md`** (scope name is whatever the prompt says)

The dashboard watches these paths and auto-refreshes after you finish.

## Structure

Indonesian for titles/descriptions, English for technical terms. Use this exact structure:

```markdown
# Requirement Traceability Matrix

## Business Requirements
| ID | Title | Description |
|----|-------|-------------|
| BR-001 | Login & Autentikasi | Pengguna dapat masuk ke aplikasi |

## Design Solutions
| ID | Title | Source | Description |
|----|-------|--------|-------------|
| DS-001 | AuthService.login | API Spec /auth/login | Endpoint login dengan validasi kredensial |

## Test Cases
| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-001 | Login berhasil | 1. Buka halaman login 2. Input email & password benar 3. Klik Login | Masuk ke dashboard |

## Functional Requirements
| ID | BR | Title | Description | Design Solution | Test Case |
|----|----|-------|-------------|-----------------|-----------|
| FR-001 | BR-001 | Login | Sistem memvalidasi kredensial pengguna | DS-001 | TC-001 |
```

## Rules

- Every functional requirement **MUST** reference a business requirement (BR column).
- Design Solution / Test Case cells reference the codes defined above (semicolon-separated if multiple).
- Use sequential IDs: BR-001, FR-001, DS-001, TC-001, ... (restart per scope/RTM file).
- Each FR should be traced to **at least one design solution**; add test cases where derivable from the artifacts.
- If a requirement has no design or no test yet, **leave the cell empty** — that gap is what the dashboard highlights.
- Write ONLY the scoped RTM file (e.g. `output/rtm/RTM_P2.md`). Do NOT modify any other file.
