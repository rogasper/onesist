# Gap Analysis Instructions

Run **gap analysis** when the user compares a **new or updated FSD** against **existing** ERD and/or API specs.

## Inputs

1. **FSD** (file or pasted text) — source of truth for *desired* behavior.
2. **Existing artifacts** (tag e.g. `@output/erd/erd_now.md`, `@output/spec/spec_api.md`, or project-specific names).
3. Optional: **Figma** notes or link — flag mismatches as VISUAL_GAP.

## Steps

1. **Extract from FSD**
   - Entities / tables implied or named
   - Fields, enums, status values
   - Relationships (1-N, N-N, ownership)
   - Operations: CRUD, searches, reports, integrations
   - Actors / roles and what they may do

2. **Normalize** into a mental model: *required persistence* + *required APIs*.

3. **Diff vs existing ERD**
   - Missing tables
   - Missing columns / wrong types / wrong nullability
   - Missing indexes for stated filters/sorts
   - Missing FKs or broken refs

4. **Diff vs existing API spec**
   - Missing endpoints
   - Wrong method or path shape
   - Missing error cases implied by FSD
   - Missing pagination/filter when FSD lists data

5. **Output: Gap Report** (use this exact structure)

```markdown
## Gap Report: {FSD or feature name}

### Summary
- …

### Database changes required

| Table | Change type | Column / object | Data type | Reason (FSD ref) |
|-------|-------------|-----------------|-----------|------------------|
| | ADD TABLE / ADD COLUMN / ALTER / INDEX | | | |

### Missing or incomplete API endpoints

| Method | Path | Purpose | Priority (H/M/L) |
|--------|------|---------|------------------|
| | | | |

### FSD / design / implementation inconsistencies

| Type | Finding | Suggestion |
|------|---------|------------|
| FSD ambiguity | | |
| VISUAL_GAP (Figma) | | |

### Recommendations (ordered)
1. …
```

## Rules

- Cite **FSD section** or quote briefly for each gap.
- If information is missing in FSD, list as **QUESTION_FOR_BA** instead of inventing schema.
