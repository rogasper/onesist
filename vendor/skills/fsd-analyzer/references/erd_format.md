# ERD Output Format (erd.md + DBML)

Artifacts can be **Markdown tables** (spreadsheet-friendly) and/or **DBML** for [dbdiagram.io](https://dbdiagram.io).

## Markdown / spreadsheet columns (per table)

| Column | Description |
|--------|-------------|
| Table Name | Logical table name |
| Column | Column name |
| Index | true / false (or checked / unchecked) |
| Type Data | uuid, varchar(n), int, timestamp, boolean, jsonb, etc. |
| Nullable | TRUE / FALSE (or T / F) |
| Function Field | Business meaning |
| Default Value | Literal or `current_timestamp`, etc. |
| Note Column | Constraints, enum values |
| Note Table | Table-level rules |
| Description | Extra context |

## Table block template

```markdown
## Table: `{table_name}`

| Column | Index | Type Data | Nullable | Function Field | Default | Notes |
|--------|-------|-----------|----------|----------------|---------|-------|
| id | true | uuid | F | PK | | |
| ... | | | | | | |

**Relationships:** `{this_table}.{fk}` → `{other_table}.{pk}`

**Indexes:** (list composite/partial if any)
```

## DBML snippet (for dbdiagram.io)

After stabilizing the schema, emit a **` ```dbml `** fenced block the user can paste into dbdiagram:

```dbml
Table users {
  id uuid [pk]
  email varchar(255) [not null, unique]
  // ...
}

Ref: login_history.user_id > users.id
```

## Quality checklist

- Every FK in DBML exists on both sides.
- Naming consistent with API resource names (pluralization policy documented once).
- Audit fields (`created_at`, `updated_at`, `deleted_at`) where FSD requires traceability.
- Enum/status values documented in Note Column or separate enum section.
