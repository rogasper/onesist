# API Specification Output Format (spec_api.md)

Use this structure when generating or reviewing **API specifications** from an FSD. Output is **Markdown** first (easy to copy into spreadsheets or tools).

## Spreadsheet-oriented columns (per endpoint)

| Column           | Description                               |
| ---------------- | ----------------------------------------- |
| No               | Sequential number                         |
| Service          | Path / resource (e.g. `users/list`)       |
| Method           | GET, POST, PUT, PATCH, DELETE             |
| Status           | Draft / Ready / Deprecated (optional)     |
| Purpose          | One-line business purpose                 |
| Parameter Input  | Query, path, headers                      |
| Action           | High-level behavior                       |
| Parameter Output | Key response fields                       |
| Request Body     | JSON example                              |
| Response Success | JSON example (200/201)                    |
| Response Failed  | JSON error envelope + codes               |
| Notes            | Auth, idempotency, pagination, edge cases |

## Markdown block template (per endpoint)

````markdown
### NO: {n} — {Method} `{Service}`

- **Service:** `{path}`
- **Method:** {METHOD}
- **Purpose:** {text}
- **Parameter Input:** {query/path/headers}
- **Action:** {summary}

**Flow Logic**

1. Validate JWT / role (if applicable) → 401/403
2. Parse & validate body/query
3. DB / external calls (include SQL or pseudo-SQL where helpful)
4. Map to response DTO
5. Errors → consistent error shape

- **Parameter Output:** {fields}
- **Request Body:**

```json
{}
```
````

- **Response Success:**

```json
{}
```

- **Response Failed:**

```json
{}
```

- **Notes:** {auth, rate limits, soft delete, etc.}

```

## Quality checklist

- Every FSD-deriving operation has a matching endpoint (or explicit “N/A — batch/cron”).
- Error codes and messages align with project conventions.
- List endpoints specify pagination (`page`, `perPage`, `meta`).
- Sensitive fields never returned in clear text.
```
