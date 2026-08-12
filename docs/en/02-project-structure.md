# 02 — Project Structure & File Formats

Understand where artifacts live and what formats are expected. All paths below are **relative to the project root** (the folder chosen when opening a project).

---

## 1. Folder Layout

```text
<projectRoot>/
├── input/
│   └── fsd/
│       ├── sources/          # Original files (PDF, DOCX, PPTX, etc.) uploaded/placed manually
│       ├── images/           # Supporting FSD images (e.g. from the editor)
│       ├── fsd_001.md        # Converted / authored FSD
│       └── fd_001.md ...     # Per-feature split (FD1, FD2, ...) — free naming convention
├── output/
│   ├── spec/                 # API spec markdown + openapi.yaml
│   ├── erd/                  # ERD in .dbml (or markdown)
│   ├── task/                 # Task cards markdown
│   ├── td/                   # Technical Documentation / SRS
│   ├── reports/              # (optional) gap / consistency reports
│   └── timeline*.html        # Gantt chart (may also live directly in output/)
├── MASTER_ERD.md             # Rolling schema context (project root)
├── MASTER_SPEC_API.md        # Rolling API context (project root)
├── templates/
│   └── technical-documentation.md   # TD template (for the documentation workflow)
└── .agents/
    └── skills/               # Project skills (fsd-analyzer, markitdown)
```

> The dashboard watches `input/fsd`, `output/spec`, `output/erd`, `output/task`, and `output/td`. Changed files trigger an auto-refresh in the relevant tabs.

## 2. Artifact Formats

### 2.1 FSD / FD (Markdown)

Requirement documents in plain Markdown. Heading structure acts as the module/feature separator. Recommended naming:

- `input/fsd/fsd_<no>.md` — full FSD document
- `input/fsd/fd_<no>.md` — per feature (result of the split)

### 2.2 ERD (DBML)

The **ERD** tab renders `.dbml` files from `output/erd/`. DBML format:

```dbml
Project MyProject {
  database_type: 'PostgreSQL'
  Note: 'Schema following MASTER_ERD'
}

Table mst_customer {
  id integer [pk, increment]
  name varchar(100) [not null]
  email varchar(255) [unique]
  created_at timestamp [default: `now()`]
}

Ref: trn_order.customer_id > mst_customer.id
```

Quick DBML rules the agent uses:

- `Table <name> { ... }` — table definition
- Column: `name type [modifier]` — common modifiers: `pk`, `increment`, `not null`, `unique`, `default: ...`
- `Ref: tableA.col > tableB.col` — foreign key relationship

### 2.3 API Spec (Markdown)

Endpoint specs are written in Markdown with a Method | Path | Purpose | Body | Response table, grouped per module (heading). Short example:

```markdown
# Customer Module

| Method | Path | Purpose | Body | Response |
|--------|------|---------|------|----------|
| GET | /api/customers | List customers | - | 200: array |
| POST | /api/customers | Create customer | {name, email} | 201: customer |
```

The **API Spec** tab parses these files into endpoint cards (Cards/Document views). The agent can also generate **`openapi.yaml`** (OpenAPI 3.0) in `output/spec/` — the tab shows it via Swagger UI.

### 2.4 Task Cards (Markdown)

Each task is a card with a standard structure (per the `fsd-analyzer` skill):

- **Code** — unique task code
- **Title** — short title
- **Story Points** — 1 SP = 4 hours
- **Assignee** — developer name / level (e.g. `BE Senior`, `FE Mid`)
- **Module / Phase** — module and work phase
- **Dependency** — `Depends On`, `Blocks`, `Critical Path`
- **Description / Goals / Scope / Out of scope / Acceptance Criteria**
- **Flow Logic** — numbered logic steps
- **SQL** — basic query example (```sql block)
- **Request/Response** — JSON example

The **Tasks** tab parses tasks from `output/task/`.

### 2.5 Timeline (HTML)

A **self-contained HTML** Gantt chart (openable directly in a browser). The **Tasks → Timeline** tab renders files:

- `output/timeline*.html`
- or any path containing `timeline` / `gantt` / `roadmap` / `schedule`

### 2.6 Technical Documentation (Markdown)

SRS documents in `output/td/td_<timestamp>.md`, following the template `templates/technical-documentation.md`: Cover → Approvals → Introduction → Scope → Effort Estimation → System Overview (mermaid) → Requirement Detail per FD → ERD Appendix (mermaid) → Data Specification.

## 3. Master Artifacts (Rolling Context)

`MASTER_ERD.md` and `MASTER_SPEC_API.md` are the **single source of truth**, updated incrementally per FSD. This matters when working FSD-per-section so the agent doesn't have to read all legacy files every time.

- `MASTER_ERD.md` structure: `## Baseline` → `## Changelog` → `## Detail per module` → ` ```dbml ` block
- `MASTER_SPEC_API.md` structure: `## Baseline` → `## API summary` (table) → `## Detail endpoint` → `## Changelog`

> Rule: the agent must **not modify the master files without your explicit instruction** (see [09 — Best Practices](09-best-practices.md)).

---

Next: [03 — FSD Workflow](03-fsd-workflow.md)
