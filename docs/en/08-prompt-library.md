# 08 — Prompt Library

A collection of **copy-paste ready** prompt templates per phase. Run them in the embedded terminal (agent session in the project root) or via `opencode run "<prompt>" --dir <root>`.

Replace `<...>` placeholders with your project values.

---

## How to Run

**In the embedded terminal** (Terminal panel in the project):
- Type the prompt and press Enter. The agent runs in the project root with the `fsd-analyzer` / `markitdown` skills installed.

**From an OS terminal (alternative):**
```bash
cd /path/to/project
opencode run "<prompt>" --auto --dir .
```

---

## P1 — Convert a Document to Markdown (markitdown)

```text
You are a Senior System Analyst. Use the markitdown skill.

Convert the file `<input/fsd/sources/fdd_001.pdf>` into Markdown.
Write the result to `<input/fsd/fsd_001.md>`.
Preserve heading structure, tables, lists, and text diagrams.
Note at the end any parts that could not be read (images/OCR).
DO NOT modify other files.
```

**Batch:**
```text
Convert ALL files in `input/fsd/sources/` into Markdown.
Write each result to `input/fsd/<filename>.md`.
Report the list of succeeded and failed files.
```

---

## P2 — Split FSD into FDs per Module/Feature

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

Read `<input/fsd/fsd_001.md>` and split it into Functional Designs (FDs)
per module/feature. Create one file per FD:
- input/fsd/fd_001.md — <module/feature 1>
- input/fsd/fd_002.md — <module/feature 2>
- (etc.)

Each FD must be complete and self-contained. Create `input/fsd/FD_INDEX.md`
listing all FDs + a one-line description each. DO NOT modify other files.
```

---

## P3 — Discovery & Business Discussion (before generating)

```text
You are a Senior System Analyst. Use the fsd-analyzer skill in DISCOVERY/DISCUSSION mode.

Read all FDs in input/fsd/ (start from FD_INDEX.md).
DO NOT generate ERD, spec, or tasks yet.

Analyze the business needs and produce:
1. QUESTION_FOR_BA — questions that must be answered before final design
   (flow, business rules, required data, roles/authorization, edge cases).
2. ASSUMPTION — assumptions you take + reasons.
3. Understanding summary per FD (main flow, actors, data involved).

Write to output/reports/discovery_<timestamp>.md.
DO NOT modify other files.
```

**Follow-up discussion:**
```text
Answers to the questions:
- <question 1>: <answer>
- <question 2>: <answer>

Update your understanding and rewrite the discovery report. Confirm if there
are still critical open questions before I approve generating.
```

---

## P4 — Generate ERD from FDs (DBML)

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

From the following FDs:
- input/fsd/fd_001.md
- input/fsd/fd_002.md
- (etc., or: refer to input/fsd/FD_INDEX.md)

Build a complete ERD:
- Entities/tables + columns (type, not null, default)
- Primary keys & foreign keys (Ref: ...)
- Indexes & unique constraints
- Relations between tables (1-N, N-M) per the business flow

Write to `output/erd/erd_<module>.dbml` in DBML format.
Follow existing naming conventions (mst_*, trn_*) — if none, add a NOTE.
DO NOT modify other files (including MASTER_ERD.md).
```

**Revision:**
```text
ERD `output/erd/erd_<module>.dbml`: <list of changes, e.g. add table X,
make column Y unique, remove Z, add index (a, b)>. Update the file.
```

---

## P5 — Generate API Spec (Markdown)

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

From the final FDs and ERD:
- input/fsd/FD_INDEX.md (+ relevant fd_*.md)
- output/erd/erd_<module>.dbml

Build a complete API Spec for module <module>:
- Endpoint list per resource (Method | Path | Purpose)
- Per endpoint: request body, query params, response (success + error),
  validation, status codes, auth/role requirements
- Follow project API conventions (envelope, pagination, error catalog) —
  if none, use common standards and note them

Write to `output/spec/spec_<module>.md`.
DO NOT modify other files.
```

---

## P6 — Generate openapi.yaml (OpenAPI 3.0)

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

Generate an OpenAPI 3.0 file from ALL specs in output/spec/:
- Combine all endpoints, unique paths, no duplicates
- Every operation MUST have: summary, description, tags,
  requestBody/parameters, responses
- Endpoint status: x-status: done (complete) or in-develop (changing);
  if a phase is mentioned (e.g. "Phase 2"), write x-phase: <number>
- info.title = <project name>, info.version = 1.0.0

Write to `output/spec/openapi.yaml`.
DO NOT modify markdown files or any other files.
```

**Spec revision + sync:**
```text
Update the spec `<output/spec/spec_<module>.md>`:
<endpoint/body/response changes>.
Afterwards update `output/spec/openapi.yaml` to stay in sync.
```

---

## P7 — Generate Task Cards

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

From the finalized ERD and API Spec:
- output/erd/erd_<module>.dbml
- output/spec/spec_<module>.md

Build developer Task Cards for module <module>:
- Break down into sub-tasks: DB, Backend (BE), Frontend (FE), Integration, Test
- Each task: Code, Title, Description, Goals, Scope, Out of scope,
  Acceptance Criteria, Flow Logic (numbered steps), Story Points (1 SP = 4h),
  Assignee (level: BE/FE Senior/Mid/Junior), Module/Phase,
  Dependency (Depends On, Blocks), basic SQL (sql block),
  Request/Response example (json block), QC Checklist
- Summary table at the top (Code | Task | SP | Assignee | Dependency)

Write to `output/task/task_<module>.md`.
DO NOT modify other files.
```

---

## P8 — Estimation & Parallel Timeline

```text
You are a Senior System Analyst. Use the fsd-analyzer skill (timeline estimation mode).

Read all tasks in output/task/ (task_*.md).

Build the development estimation & timeline:
1. Estimate per task & per module (person-days / weeks) from Story Points.
2. Team assumption: <number> developers at level <BE/FE Senior/Mid/Junior> — the mix.
3. Because work is PARALLEL, produce:
   - Priority order (what goes first, what runs together)
   - Dependencies & critical path
   - Developer utilization (no idle/overload)
4. Generate a self-contained HTML Gantt chart to `output/timeline_<module>.html`.
5. Write the estimation summary + team assumptions + risks to
   output/reports/estimation_<timestamp>.md.

DO NOT modify task files or any other files.
```

**Timeline revision:**
```text
Change the team mix: <2 BE Mid + 1 FE Senior>. Priority: auth module first.
Regenerate the timeline and estimation report.
```

---

## P9 — Generate Technical Documentation (SRS)

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

Build the final Technical Documentation / SRS from all artifacts:
- FD: input/fsd/ (FD_INDEX.md + fd_*.md)
- ERD: output/erd/*.dbml and/or MASTER_ERD.md
- API Spec: output/spec/*.md and openapi.yaml
- Tasks: output/task/*.md (for Effort Estimation)

Metadata:
- Customer Name: <customer name>
- Project Name: <project name>
- Project ID: <id>
- Version: <version>
- Author: <author>

Follow the template `templates/technical-documentation.md`:
- Replace ALL placeholders ({{customerName}}, {{projectName}}, {{projectId}},
  {{version}}, {{author}}, {{date}}) with the metadata + today's date.
- Keep the structure & <!-- pagebreak --> markers. Do not remove sections.
- Requirement Detail: break down per FD separately, grouped per numbered
  module; per FD: Front End spec, Back End spec, and per endpoint a 2-column
  table (Field | Value) with Type, Status, Description, Endpoint, Method,
  Request, Response, Table Related (+ Note/Validation/Logic when needed).
- System Overview & ERD Appendix: replace placeholder mermaid blocks with real
  diagrams (business flowchart + erDiagram from the final tables).
- Effort Estimation: from story points, per module/phase, in person-days/weeks.

Write to `output/td/td_<timestamp>.md`.
Use English for descriptive text, keep technical terms in English.
DO NOT modify source artifact files.
```

---

## P10 — Update Master Artifacts (post-finalization)

```text
Merge the finalized artifacts into the rolling context:
- ERD: output/erd/erd_<module>.dbml -> MASTER_ERD.md
- Spec: output/spec/spec_<module>.md -> MASTER_SPEC_API.md

Add a short changelog (date + FD number) to each master file.
Do not remove existing sections.
```

---

## P11 — Gap / Consistency Check (optional, per new FSD)

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

Gap analysis: compare `input/fsd/<new_fsd>.md` with
MASTER_ERD.md and MASTER_SPEC_API.md.
Report: missing tables/columns, missing endpoints, design conflicts,
and migration requirements. Write to output/reports/gap_<timestamp>.md.
```

```text
You are a Senior System Analyst. Use the fsd-analyzer skill.

Consistency check: compare ERD (output/erd/), API Spec (output/spec/),
and Tasks (output/task/). Report inconsistencies (entity vs field vs endpoint).
Write to output/reports/consistency_<timestamp>.md.
```

---

## General Prompt Notes

- **Always state the role + skill**: `You are a Senior System Analyst. Use the fsd-analyzer skill.`
- **State full file paths** (relative to the project root) — not just names.
- **State the output path + format** — the agent should not guess.
- **Add constraints**: `DO NOT modify other files.` / `DO NOT modify MASTER_* without instruction.`
- **One focus per prompt** — e.g. don't mix "generate ERD and Spec" in a single prompt.
- **Iterate the review** — always review generated output, then revise via a follow-up prompt before declaring it final.

---

Back to [00 — Overview](00-overview.md) | Next: [09 — Best Practices](09-best-practices.md)
