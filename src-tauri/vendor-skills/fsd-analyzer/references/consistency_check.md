# Consistency Check Instructions

Run when the user asks to validate **ERD ↔ API spec ↔ task cards** (and optionally FSD).

## Checks

### 1. ERD vs API spec

- Every **persistent** field returned or accepted in API has a **column** (or documented JSON sub-schema).
- **FKs** have a sensible **read path** (join, expand, or separate GET).
- **Types** align (uuid ↔ string UUID, varchar(n) ↔ max length in validation, timestamps ISO-8601).
- **Enums/status** in API match DB constraints or note table.
- **Soft delete**: if `deleted_at` exists, list endpoints should filter consistently with spec.

### 2. API spec vs task cards

- Each endpoint in spec has a **task** (or grouped task with checklist of endpoints).
- **Flow logic** in tasks does not contradict spec (status codes, validation order).
- **Request/response** examples match field names in spec tables.

### 3. Optional: FSD coverage

- Each **must-have** FSD requirement maps to **API + data** (or explicit “handled offline”).

## Output: Consistency Report

```markdown
## Consistency Report: {scope}

### ERD vs API spec

| Severity            | Issue | ERD | API spec | Fix suggestion |
| ------------------- | ----- | --- | -------- | -------------- |
| ERROR / WARN / INFO |       |     |          |                |

### API spec vs task cards

| Severity | Issue | Spec | Task | Fix suggestion |
| -------- | ----- | ---- | ---- | -------------- |
|          |       |      |      |                |

### Summary

- ERROR count: n
- WARN count: n
- Next actions (bullets)
```

## Severity guide

- **ERROR** — Would cause wrong data, security hole, or broken contract.
- **WARN** — Likely bug or tech debt; clarify before build.
- **INFO** — Naming, docs, or optional hardening.
