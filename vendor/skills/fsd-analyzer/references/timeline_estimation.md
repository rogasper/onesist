# Timeline Estimation & Gantt Chart

Generate **development timeline** with Story Points, dependency tracking, critical path analysis, developer utilization, and a **self-contained HTML Gantt chart** for visualization.

---

## Story Point System

**Conversion: 1 SP = 4 hours**

### SP Scale

| SP | Hours | Criteria |
|----|-------|----------|
| **1 SP** | 4h | Single simple CRUD endpoint, no dependency, existing pattern reference |
| **2 SP** | 8h | 1 endpoint + medium logic (validation, 1-2 table join), or standard FE page |
| **3 SP** | 12h | Multi-related endpoints, medium business logic, light integration |
| **5 SP** | 20h | Full feature (BE + DB migration + seeding), multi-table, approval flow, complex FE page |
| **8 SP** | 32h | New module, third-party integration, complex state management, many edge cases |
| **13 SP** | 52h | Epic: cross-module impact, large data migration, architecture decision needed |

### SP per Role (per Sprint — 2 weeks / 10 working days)

| Level | SP per Sprint | Effective Hours | Calculation |
|-------|--------------|-----------------|-------------|
| **Senior** | 12-15 SP | 48-60h | 6h effective × 10 days = 60h |
| **Mid** | 8-12 SP | 32-48h | 5h effective × 10 days = 50h |
| **Junior** | 5-8 SP | 20-32h | 4h effective × 10 days = 40h |

### Buffer Factor

| Risk Level | Buffer | When to Use |
|------------|--------|-------------|
| Low | ×1.2 | Well-defined FSD, familiar tech, no integration |
| Medium | ×1.5 | Some ambiguity, new integration, moderate complexity |
| High | ×2.0 | High ambiguity, new tech, critical path, many dependencies |

---

## Dependency Types

| Type | Notation | Meaning |
|------|----------|---------|
| **Finish-to-Start (FS)** | `T1 → T2` | T1 must finish before T2 can start (**default, most common**) |
| **Start-to-Start (SS)** | `T1 ⇉ T2` | T1 must start before T2 can start (parallel with offset) |
| **Finish-to-Finish (FF)** | `T1 ⇁ T2` | T1 must finish before T2 can finish |

Unless explicitly stated, assume **FS (Finish-to-Start)**.

---

## Critical Path

The **longest chain of dependent tasks** — determines the minimum project duration.

### Calculation

1. Build dependency graph from all tasks
2. Forward pass: calculate earliest start/end per task
3. Backward pass: calculate latest start/end per task
4. Tasks where earliest = latest are on the **critical path** (zero slack)
5. Sum SP on critical path → minimum sprint count

### Critical Path Rules

- Any delay on critical path **delays the entire project**
- Assign **senior developers** to critical path tasks
- Add buffer only on non-critical path tasks (critical path already has inherent risk)
- If critical path exceeds deadline → must split tasks or add developers

---

## Developer Utilization

### Capacity Planning

```markdown
### Team Capacity

| Developer | Level | SP/Sprint | Available Sprints | Total Capacity |
|-----------|-------|----------|-------------------|----------------|
| Dev A | Senior | 15 SP | 3 | 45 SP |
| Dev B | Mid | 10 SP | 3 | 30 SP |
| Dev C | Junior | 7 SP | 3 | 21 SP |
| **Total** | — | **32 SP/sprint** | — | **96 SP** |
```

### Utilization Targets

| Utilization | Range | Color | Meaning |
|-------------|-------|-------|---------|
| **Under-utilized** | < 50% | 🟡 Yellow | Pull forward independent tasks or assign cross-training |
| **Optimal** | 50-85% | 🟢 Green | Healthy workload |
| **Overloaded** | > 85% | 🔴 Red | Redistribute tasks or extend timeline |

### Optimization Rules

1. **No idle developers** — if a dev has < 50% utilization in a sprint, find independent tasks to pull forward
2. **No blockers from sequencing** — if Dev B is waiting for Dev A, assign Dev B an independent task in parallel
3. **Critical path gets seniors** — senior devs handle critical path tasks to minimize delay risk
4. **Balance load** — redistribute tasks when any dev exceeds 85% utilization

---

## Task Fields Required for Timeline

Each task card must include these fields (in addition to existing fields in `task_format.md`):

```markdown
| Field | Detail |
|-------|--------|
| Story Point | 1 / 2 / 3 / 5 / 8 / 13 |
| Duration | Auto-calculated: SP × 4h |
| Developer | Assigned developer name |
| Depends On | Task IDs or "—" (no dependency) |
| Blocks | Task IDs or "—" |
| Critical Path | Yes / No |
| Risk Level | Low / Medium / High (affects buffer) |
```

---

## Timeline Output

### Output Files

| File | Format | Purpose |
|------|--------|---------|
| `timeline_{feature}.html` | HTML (self-contained) | Visual Gantt chart, open in browser |
| Inline in chat | Markdown tables | Quick summary for review |

### Markdown Summary (inline in chat)

```markdown
## Timeline: {Feature Name}

### Estimation Summary

| Metric | Value |
|--------|-------|
| Total Tasks | {n} |
| Total Story Points | {n} SP |
| Total Hours | {n}h |
| Buffer Factor | ×{n} |
| Total Hours (with buffer) | {n}h |
| Team Size | {n} developers |
| Team Capacity per Sprint | {n} SP |
| Estimated Sprints | {n} |
| Estimated Duration | {n} weeks |

### Critical Path

{Task chain with SP and hours}

### Sprint Breakdown

#### Sprint 1 ({date range})

| Task | Dev | SP | Hours | Depends On | Risk |
|------|-----|----|-------|------------|------|
| T1: DB Migration | Dev A | 1 | 4h | — | Low |
| T2: POST /users | Dev A | 2 | 8h | T1 | Low |
| ... | | | | | |

**Sprint Total:** {n} SP ({n}h)
**Dev Utilization:** Dev A {n}%, Dev B {n}%, Dev C {n}%

#### Sprint 2 ({date range})
...

### Risks & Warnings

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dev A is sole critical path handler | WARN | Cross-train Dev B on critical tasks |
| Sprint 2 overloaded (90%) | WARN | Move T7 to Sprint 3 |
| Task T5 blocks 4 other tasks | WARN | Prioritize T5, consider splitting |
```

---

## HTML Gantt Chart

Generate a **self-contained HTML file** (`timeline_{feature}.html`) with inline CSS and vanilla JS. No external dependencies. Open directly in any browser.

### HTML Template

The agent must generate the HTML file using the template below. Fill in the dynamic data from the task list, story points, and developer assignments.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Timeline - {PROJECT_NAME}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #334155;
    --border: #475569;
    --text: #e2e8f0;
    --text-dim: #94a3b8;
    --accent: #38bdf8;
    --critical: #f87171;
    --warn: #fbbf24;
    --success: #34d399;
    --dev-a: #38bdf8;
    --dev-b: #a78bfa;
    --dev-c: #fb923c;
    --dev-d: #f472b6;
    --dev-e: #34d399;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding: 24px;
  }

  .header { margin-bottom: 32px; }
  .header h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
  .header p { color: var(--text-dim); font-size: 0.875rem; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 32px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  .stat-card .label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
  .stat-card .sub { font-size: 0.75rem; color: var(--text-dim); margin-top: 2px; }

  .section-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .utilization-bar-container { margin-bottom: 32px; }
  .util-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .util-label {
    width: 120px;
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  .util-label .level { color: var(--text-dim); font-size: 0.6875rem; }
  .util-track {
    flex: 1;
    height: 24px;
    background: var(--surface2);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  .util-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
    display: flex;
    align-items: center;
    padding-left: 8px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--bg);
    min-width: 40px;
  }
  .util-fill.green { background: var(--success); }
  .util-fill.yellow { background: var(--warn); }
  .util-fill.red { background: var(--critical); }

  .gantt-container {
    overflow-x: auto;
    margin-bottom: 32px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .gantt { min-width: 800px; position: relative; }

  .gantt-header {
    display: flex;
    border-bottom: 2px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 2;
  }
  .gantt-header .col-label {
    padding: 12px 8px;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
    font-weight: 600;
  }
  .gantt-header .col-task { width: 280px; min-width: 280px; }
  .gantt-header .col-sprint {
    flex: 1;
    text-align: center;
    border-left: 1px solid var(--border);
  }

  .gantt-sprint-dividers {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 280px;
    right: 0;
    pointer-events: none;
    z-index: 1;
  }
  .sprint-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px dashed var(--border);
  }

  .gantt-row {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    position: relative;
    min-height: 44px;
  }
  .gantt-row:hover { background: rgba(56, 189, 248, 0.05); }

  .gantt-row .task-info {
    width: 280px;
    min-width: 280px;
    padding: 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .task-info .task-name { font-size: 0.8125rem; font-weight: 500; }
  .task-info .task-meta { font-size: 0.6875rem; color: var(--text-dim); }

  .gantt-row .timeline-area {
    flex: 1;
    position: relative;
    height: 44px;
    display: flex;
    align-items: center;
  }

  .gantt-bar {
    position: absolute;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.15s;
    z-index: 2;
    overflow: hidden;
    white-space: nowrap;
  }
  .gantt-bar:hover { opacity: 0.9; transform: scaleY(1.15); }
  .gantt-bar.critical { border: 2px solid var(--critical); }
  .gantt-bar .bar-label { color: var(--bg); }

  .dependency-line {
    position: absolute;
    z-index: 1;
    pointer-events: none;
  }

  .sprint-label-row {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--surface2);
  }
  .sprint-label-row .col-task { width: 280px; min-width: 280px; }
  .sprint-label-row .sprint-col {
    flex: 1;
    text-align: center;
    padding: 6px 8px;
    font-size: 0.6875rem;
    font-weight: 600;
    border-left: 1px solid var(--border);
  }

  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .badge-critical { background: var(--critical); color: var(--bg); }
  .badge-blocking { background: var(--warn); color: var(--bg); }

  .tooltip {
    display: none;
    position: fixed;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 0.8125rem;
    z-index: 100;
    max-width: 320px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .tooltip.visible { display: block; }
  .tooltip .tt-title { font-weight: 700; margin-bottom: 8px; }
  .tooltip .tt-row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 4px; }
  .tooltip .tt-label { color: var(--text-dim); }

  .critical-path-section { margin-bottom: 32px; }
  .cp-chain {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }
  .cp-task {
    background: var(--surface);
    border: 1px solid var(--critical);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .cp-arrow { color: var(--critical); font-weight: 700; }

  .warnings-section { margin-bottom: 32px; }
  .warning-item {
    background: var(--surface);
    border-left: 3px solid var(--warn);
    border-radius: 0 4px 4px 0;
    padding: 10px 16px;
    margin-bottom: 8px;
    font-size: 0.8125rem;
  }
  .warning-item.error { border-left-color: var(--critical); }
  .warning-item .warn-label { font-weight: 700; margin-right: 8px; }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 32px;
    font-size: 0.75rem;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-color {
    width: 16px;
    height: 16px;
    border-radius: 3px;
  }

  .sprint-summary-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    margin-bottom: 32px;
  }
  .sprint-summary-table th,
  .sprint-summary-table td {
    padding: 8px 12px;
    text-align: left;
    border: 1px solid var(--border);
  }
  .sprint-summary-table th {
    background: var(--surface2);
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  @media print {
    body { background: white; color: black; padding: 12px; }
    .stat-card, .gantt-container, .warning-item, .cp-task { border-color: #ccc; background: #f9f9f9; }
    .gantt-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .util-fill { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }

  @media (max-width: 768px) {
    body { padding: 12px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .gantt-row .task-info { width: 160px; min-width: 160px; }
    .gantt-header .col-task { width: 160px; min-width: 160px; }
    .sprint-label-row .col-task { width: 160px; min-width: 160px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>Timeline — {PROJECT_NAME}</h1>
  <p>Generated: {DATE} | Story Points: 1 SP = 4 hours</p>
</div>

<div class="stats-grid" id="statsGrid"></div>

<div class="section-title">Developer Utilization</div>
<div class="utilization-bar-container" id="utilBars"></div>

<div class="section-title">Gantt Chart</div>
<div class="legend" id="legend"></div>
<div class="gantt-container">
  <div class="gantt" id="ganttChart"></div>
</div>

<div class="critical-path-section">
  <div class="section-title">Critical Path</div>
  <div class="cp-chain" id="criticalPath"></div>
</div>

<div class="section-title">Sprint Summary</div>
<table class="sprint-summary-table" id="sprintSummary"></table>

<div class="warnings-section">
  <div class="section-title">Risks & Warnings</div>
  <div id="warnings"></div>
</div>

<div class="tooltip" id="tooltip">
  <div class="tt-title" id="ttTitle"></div>
  <div id="ttBody"></div>
</div>

<script>
(function() {
  // === DATA — Agent fills this section ===
  const PROJECT_NAME = "{PROJECT_NAME}";
  const SPRINT_DAYS = 10; // 2 weeks
  const SPRINT_LABELS = {SPRINT_LABELS_ARRAY}; // e.g., ["Sprint 1 (Apr 20 - May 3)", ...]
  const SPRINT_START_DATES = {SPRINT_START_DATES_ARRAY}; // e.g., ["2026-04-20", "2026-05-04", ...]

  const developers = {DEVELOPERS_ARRAY};
  // Format: [{ name: "Dev A", level: "Senior", spPerSprint: 15, color: "var(--dev-a)" }, ...]

  const tasks = {TASKS_ARRAY};
  // Format: [{
  //   id: "T1", name: "DB Migration", developer: "Dev A",
  //   sp: 1, hours: 4, sprint: 0, // 0-indexed sprint number
  //   dependsOn: [], blocks: ["T2", "T3"],
  //   critical: true, risk: "Low",
  //   startDay: 0, durationDays: 1, // within sprint (0-indexed day)
  //   type: "BE" // BE, FE, DB, Both
  // }, ...]

  const warnings = {WARNINGS_ARRAY};
  // Format: [{ severity: "WARN", message: "Dev A is critical path bottleneck" }, ...]

  // === END DATA ===

  const devMap = {};
  developers.forEach(d => devMap[d.name] = d);

  function getDevColor(name) { return devMap[name] ? devMap[name].color : '#888'; }
  function getUtilClass(pct) { return pct > 85 ? 'red' : pct < 50 ? 'yellow' : 'green'; }

  // === STATS ===
  const totalSP = tasks.reduce((s, t) => s + t.sp, 0);
  const totalHours = totalSP * 4;
  const totalSprints = SPRINT_LABELS.length;
  const teamCapPerSprint = developers.reduce((s, d) => s + d.spPerSprint, 0);
  const totalCapacity = teamCapPerSprint * totalSprints;
  const bufferFactor = 1.3;
  const estWeeks = totalSprints * 2;

  const statsData = [
    { label: "Total Tasks", value: tasks.length, sub: "" },
    { label: "Total Story Points", value: totalSP + " SP", sub: totalHours + "h raw" },
    { label: "Buffered Hours", value: Math.round(totalHours * bufferFactor) + "h", sub: "×" + bufferFactor + " buffer" },
    { label: "Team / Sprint", value: teamCapPerSprint + " SP", sub: developers.length + " developers" },
    { label: "Sprints", value: totalSprints, sub: estWeeks + " weeks" },
    { label: "Capacity", value: totalCapacity + " SP", sub: "total across sprints" }
  ];

  const statsGrid = document.getElementById('statsGrid');
  statsData.forEach(s => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = '<div class="label">' + s.label + '</div><div class="value">' + s.value + '</div><div class="sub">' + s.sub + '</div>';
    statsGrid.appendChild(card);
  });

  // === UTILIZATION BARS ===
  const utilContainer = document.getElementById('utilBars');
  developers.forEach(dev => {
    const devTasks = tasks.filter(t => t.developer === dev.name);
    const devSP = devTasks.reduce((s, t) => s + t.sp, 0);
    const pct = Math.round((devSP / (dev.spPerSprint * totalSprints)) * 100);

    const row = document.createElement('div');
    row.className = 'util-row';
    row.innerHTML =
      '<div class="util-label">' + dev.name + ' <span class="level">(' + dev.level + ')</span></div>' +
      '<div class="util-track"><div class="util-fill ' + getUtilClass(pct) + '" style="width:' + Math.min(pct, 100) + '%;background:' + dev.color + '">' + devSP + ' SP (' + pct + '%)</div></div>';
    utilContainer.appendChild(row);
  });

  // === LEGEND ===
  const legendContainer = document.getElementById('legend');
  developers.forEach(dev => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = '<div class="legend-color" style="background:' + dev.color + '"></div>' + dev.name + ' (' + dev.level + ')';
    legendContainer.appendChild(item);
  });
  const cpLegend = document.createElement('div');
  cpLegend.className = 'legend-item';
  cpLegend.innerHTML = '<div class="legend-color" style="border:2px solid var(--critical);background:transparent"></div>Critical Path';
  legendContainer.appendChild(cpLegend);

  // === GANTT CHART ===
  const ganttEl = document.getElementById('ganttChart');

  // Header
  const header = document.createElement('div');
  header.className = 'gantt-header';
  let headerHTML = '<div class="col-label col-task">Task</div>';
  SPRINT_LABELS.forEach((label, i) => {
    headerHTML += '<div class="col-label col-sprint">' + label + '</div>';
  });
  header.innerHTML = headerHTML;
  ganttEl.appendChild(header);

  // Sprint label row
  const sprintRow = document.createElement('div');
  sprintRow.className = 'sprint-label-row';
  let sprintHTML = '<div class="col-task"></div>';
  SPRINT_LABELS.forEach((_, i) => {
    const sprintTasks = tasks.filter(t => t.sprint === i);
    const sprintSP = sprintTasks.reduce((s, t) => s + t.sp, 0);
    sprintHTML += '<div class="sprint-col">' + sprintSP + ' SP (' + (sprintSP * 4) + 'h)</div>';
  });
  sprintRow.innerHTML = sprintHTML;
  ganttEl.appendChild(sprintRow);

  // Task rows
  tasks.forEach(task => {
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const dev = devMap[task.developer];
    const barColor = dev ? dev.color : '#888';

    let badges = '';
    if (task.critical) badges += ' <span class="badge badge-critical">CRITICAL</span>';
    if (task.blocks && task.blocks.length >= 2) badges += ' <span class="badge badge-blocking">⚠ BLOCKS ' + task.blocks.length + '</span>';

    const taskInfoHTML =
      '<div class="task-info">' +
        '<div class="task-name">' + task.id + ': ' + task.name + badges + '</div>' +
        '<div class="task-meta">' + task.developer + ' · ' + task.sp + ' SP (' + task.hours + 'h) · ' + task.risk + ' risk</div>' +
      '</div>';

    const sprintWidth = 100 / SPRINT_LABELS.length;
    const leftPct = (task.sprint * sprintWidth) + (task.startDay / SPRINT_DAYS * sprintWidth);
    const widthPct = (task.durationDays / SPRINT_DAYS * sprintWidth);

    const timelineHTML =
      '<div class="timeline-area">' +
        '<div class="gantt-bar' + (task.critical ? ' critical' : '') + '" ' +
          'style="left:' + leftPct + '%;width:' + widthPct + '%;background:' + barColor + '" ' +
          'data-task-id="' + task.id + '" ' +
          'onclick="showTooltip(event, \'' + task.id + '\')">' +
          '<span class="bar-label">' + task.sp + 'SP</span>' +
        '</div>' +
      '</div>';

    row.innerHTML = taskInfoHTML + timelineHTML;
    ganttEl.appendChild(row);
  });

  // === TOOLTIP ===
  const tooltipEl = document.getElementById('tooltip');
  const ttTitle = document.getElementById('ttTitle');
  const ttBody = document.getElementById('ttBody');

  window.showTooltip = function(e, taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    ttTitle.textContent = task.id + ': ' + task.name;
    ttBody.innerHTML =
      '<div class="tt-row"><span class="tt-label">Developer</span><span>' + task.developer + '</span></div>' +
      '<div class="tt-row"><span class="tt-label">Story Points</span><span>' + task.sp + ' SP (' + task.hours + 'h)</span></div>' +
      '<div class="tt-row"><span class="tt-label">Sprint</span><span>' + SPRINT_LABELS[task.sprint] + '</span></div>' +
      '<div class="tt-row"><span class="tt-label">Type</span><span>' + (task.type || 'BE') + '</span></div>' +
      '<div class="tt-row"><span class="tt-label">Risk</span><span>' + task.risk + '</span></div>' +
      '<div class="tt-row"><span class="tt-label">Depends On</span><span>' + (task.dependsOn.length ? task.dependsOn.join(', ') : '—') + '</span></div>' +
      '<div class="tt-row"><span class="tt-label">Blocks</span><span>' + (task.blocks.length ? task.blocks.join(', ') : '—') + '</span></div>' +
      '<div class="tt-row"><span class="tt-label">Critical Path</span><span>' + (task.critical ? 'Yes' : 'No') + '</span></div>';

    tooltipEl.style.left = Math.min(e.clientX + 12, window.innerWidth - 340) + 'px';
    tooltipEl.style.top = (e.clientY + 12) + 'px';
    tooltipEl.classList.add('visible');
  };

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.gantt-bar')) tooltipEl.classList.remove('visible');
  });

  // === CRITICAL PATH ===
  const cpContainer = document.getElementById('criticalPath');
  const cpTasks = tasks.filter(t => t.critical);
  if (cpTasks.length > 0) {
    cpTasks.forEach((task, i) => {
      const el = document.createElement('span');
      el.className = 'cp-task';
      el.textContent = task.id + ': ' + task.name + ' (' + task.sp + 'SP)';
      cpContainer.appendChild(el);
      if (i < cpTasks.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'cp-arrow';
        arrow.textContent = '→';
        cpContainer.appendChild(arrow);
      }
    });
    const cpSP = cpTasks.reduce((s, t) => s + t.sp, 0);
    const cpNote = document.createElement('div');
    cpNote.style.cssText = 'font-size:0.75rem;color:var(--text-dim);margin-top:8px;';
    cpNote.textContent = 'Total: ' + cpSP + ' SP (' + (cpSP * 4) + 'h) — Zero slack. Any delay impacts deadline.';
    cpContainer.appendChild(cpNote);
  }

  // === SPRINT SUMMARY TABLE ===
  const summaryTable = document.getElementById('sprintSummary');
  let tableHTML = '<thead><tr><th>Sprint</th>';
  developers.forEach(d => { tableHTML += '<th>' + d.name + '</th>'; });
  tableHTML += '<th>Total SP</th><th>Total Hours</th></tr></thead><tbody>';

  SPRINT_LABELS.forEach((label, i) => {
    const sprintTasks = tasks.filter(t => t.sprint === i);
    tableHTML += '<tr><td>' + label + '</td>';
    developers.forEach(dev => {
      const devSP = sprintTasks.filter(t => t.developer === dev.name).reduce((s, t) => s + t.sp, 0);
      const pct = Math.round((devSP / dev.spPerSprint) * 100);
      const color = pct > 85 ? 'var(--critical)' : pct < 50 ? 'var(--warn)' : 'var(--success)';
      tableHTML += '<td style="color:' + color + '">' + (devSP > 0 ? devSP + ' SP (' + pct + '%)' : '—') + '</td>';
    });
    const totalSPSprint = sprintTasks.reduce((s, t) => s + t.sp, 0);
    tableHTML += '<td><strong>' + totalSPSprint + ' SP</strong></td><td>' + (totalSPSprint * 4) + 'h</td></tr>';
  });
  tableHTML += '</tbody>';
  summaryTable.innerHTML = tableHTML;

  // === WARNINGS ===
  const warningsContainer = document.getElementById('warnings');
  if (warnings.length === 0) {
    warningsContainer.innerHTML = '<div class="warning-item" style="border-left-color:var(--success)"><span class="warn-label" style="color:var(--success)">✓ OK</span> No risks identified.</div>';
  } else {
    warnings.forEach(w => {
      const el = document.createElement('div');
      el.className = 'warning-item' + (w.severity === 'ERROR' ? ' error' : '');
      el.innerHTML = '<span class="warn-label">' + w.severity + '</span>' + w.message;
      warningsContainer.appendChild(el);
    });
  }

})();
</script>

</body>
</html>
```

### Agent Instructions for HTML Generation

When generating `timeline_{feature}.html`:

1. **Copy the full HTML template above**
2. **Replace placeholders** with actual data:

| Placeholder | Replace With |
|-------------|-------------|
| `{PROJECT_NAME}` | Feature/project name |
| `{DATE}` | Generation date (e.g., "2026-04-16") |
| `{SPRINT_LABELS_ARRAY}` | JSON array of sprint labels |
| `{SPRINT_START_DATES_ARRAY}` | JSON array of start dates |
| `{DEVELOPERS_ARRAY}` | JSON array of developer objects |
| `{TASKS_ARRAY}` | JSON array of task objects |
| `{WARNINGS_ARRAY}` | JSON array of warning objects |

3. **Calculate task positioning within sprints:**

```
For each task:
  sprintWidth = 100 / totalSprints (percentage)
  leftPct = (task.sprint × sprintWidth) + (task.startDay / SPRINT_DAYS × sprintWidth)
  widthPct = (task.durationDays / SPRINT_DAYS × sprintWidth)

  startDay = 0 (beginning of sprint) unless dependent tasks push it later
  durationDays = ceil(task.hours / effectiveHoursPerDay)
  effectiveHoursPerDay = 6 (senior), 5 (mid), 4 (junior)
```

4. **Auto-detect warnings:**

```javascript
// Single-point failure: 1 dev handles >60% of critical path SP
const criticalSP = tasks.filter(t => t.critical).reduce((s, t) => s + t.sp, 0);
developers.forEach(dev => {
  const devCriticalSP = tasks.filter(t => t.critical && t.developer === dev.name).reduce((s, t) => s + t.sp, 0);
  if (devCriticalSP / criticalSP > 0.6) addWarning("WARN", dev.name + " handles " + Math.round(devCriticalSP/criticalSP*100) + "% of critical path. Consider cross-training.");
});

// Blocking bottleneck: task blocking >= 3 others
tasks.forEach(task => {
  if (task.blocks && task.blocks.length >= 3) addWarning("WARN", task.id + " blocks " + task.blocks.length + " tasks. Prioritize or split.");
});

// Idle developer: < 50% utilization across all sprints
developers.forEach(dev => {
  const devSP = tasks.filter(t => t.developer === dev.name).reduce((s, t) => s + t.sp, 0);
  const totalCap = dev.spPerSprint * totalSprints;
  if (devSP / totalCap < 0.5) addWarning("INFO", dev.name + " underutilized (" + Math.round(devSP/totalCap*100) + "%). Consider assigning more independent tasks.");
});

// Overloaded sprint
SPRINT_LABELS.forEach((_, i) => {
  const sprintSP = tasks.filter(t => t.sprint === i).reduce((s, t) => s + t.sp, 0);
  if (sprintSP > teamCapPerSprint * 0.9) addWarning("WARN", "Sprint " + (i+1) + " overloaded: " + sprintSP + " SP / " + teamCapPerSprint + " SP capacity.");
});
```

5. **Write the file** using the Write tool as `timeline_{feature}.html`
6. **Also output the Markdown summary** inline in chat (see format above)

---

## Quality Checklist

- [ ] All tasks have Story Point estimates
- [ ] Dependencies mapped (Depends On / Blocks) for every task
- [ ] Critical path identified and highlighted
- [ ] Developer utilization calculated per sprint (no one idle or overloaded)
- [ ] Warnings auto-detected (bottlenecks, idle devs, overloaded sprints)
- [ ] HTML Gantt generated as self-contained file
- [ ] Markdown summary also provided in chat
- [ ] Sprint capacity realistic (SP per dev matches level)
- [ ] Buffer factor applied and documented
- [ ] Risk level assigned per task
- [ ] Optimization suggestions provided when imbalances detected
