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

## Onesist canvas contract (required)

The Onesist **ERD** tab draws a file by parsing DBML, not Markdown tables. A file that only contains discussion notes renders an empty canvas and is marked **"tanpa DBML"** in the picker.

- **Always write `output/erd/<module>/erd.dbml`** next to `erd.md`. The `.dbml` is the canvas source; `erd.md` is the human-readable table/relationship document.
- A `.md` file is read only through its fenced `dbml` block. If the schema lives in `erd.md`, wrap it in **one** fenced `dbml` block; prose outside the fence is ignored.
- Keep the DBML valid: settings inside `[...]`, **one `ref:` per column**, and never put a `ref:` (or a table name that looks like one) inside a `note:` string.
- Run the validator before finishing and fix every `ERROR`:

  ```bash
  python scripts/validate_erd.py output/erd/<module>/erd.dbml
  ```

- **Never write discussion notes, questions, or Markdown tables into `output/erd/`.** Those belong in `input/`, `output/reports/`, or the chat; a note file in `output/erd/` is offered as an ERD and renders nothing.
- If a module has no persistence change, do not create an empty ERD file.

## Quality checklist

- Every FK in DBML exists on both sides.
- `output/erd/<module>/erd.dbml` exists, is valid DBML, and passes `scripts/validate_erd.py`.
- No discussion-note files in `output/erd/`.
- A schema written inside `erd.md` sits in exactly one `dbml` fence.
- Naming consistent with API resource names (pluralization policy documented once).
- Audit fields (`created_at`, `updated_at`, `deleted_at`) where FSD requires traceability.
- Enum/status values documented in Note Column or separate enum section.
