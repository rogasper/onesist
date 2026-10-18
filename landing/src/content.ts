/**
 * Every piece of copy and data the landing page shows. Components only lay it out, so the rules
 * in content.test.ts (execution is only "coming soon") cover the whole page.
 */

export const LINKS = {
  repo: "https://github.com/rogasper/onesist",
  releases: "https://github.com/rogasper/onesist/releases",
  changelog: "https://github.com/rogasper/onesist/blob/main/CHANGELOG.md",
  docs: "https://github.com/rogasper/onesist/tree/main/docs",
};

export const HERO_IMAGE = "/screenshots/hero-agent-approval.png";

export const AUDIENCE: { title: string; line: string }[] = [
  { title: "System Analysts", line: "FSD → ERD, spec, tasks" },
  { title: "Business Analysts", line: "Requirements → RTM" },
  { title: "TPMs", line: "Tasks, story points, timeline" },
  { title: "Developers", line: "Clear spec + handoff prompts" },
];

export const PIPELINE: { step: string; file: string; snippet: string; soon?: true }[] = [
  { step: "FSD", file: "input/fsd/fsd_loan.md", snippet: "## Flow\n1. Customer runs a simulation\n2. Submits an application" },
  { step: "ERD", file: "output/erd/erd.md", snippet: "Table leads {\n  id uuid [pk]\n  status varchar\n}" },
  { step: "API spec", file: "output/spec/spec_api.md", snippet: "POST /api/v1/leads\n- Body: { name, phone }\n- 201: { leadId }" },
  { step: "Tasks", file: "output/task/tasks.md", snippet: "T-07 Lead Capture API + FE Form\n3 SP · depends on T-03" },
  { step: "RTM · SIT", file: "output/rtm/RTM.md", snippet: "FR-LD-01 → POST /leads → TC01\nFR-LD-02 → GET /leads → TC02" },
  { step: "Handoff", file: "output/sit/TC01.md", snippet: "Spec + ERD + tasks + prompts,\nready for the dev team or an agent" },
  { step: "Execution", file: "", snippet: "", soon: true },
];

export const AGENTS = ["Claude Code", "Codex", "Pi", "Antigravity", "OpenCode"];
export const API_PROVIDERS = ["OpenAI", "Anthropic", "Gemini", "DeepSeek", "OpenRouter", "Ollama"];

export const AGENT_POINTS: { title: string; body: string }[] = [
  { title: "Approve every write", body: "Allow once, always allow, or deny — per action. Read-only modes never change a file." },
  { title: "Own workspace", body: "A thread can work in a Git worktree outside your project, so drafts never collide." },
  { title: "Switch, fork, continue", body: "Change agent mid-thread, branch a thread, or continue the same session in the terminal." },
];

export const WORKSPACE_POINTS: { title: string; body: string }[] = [
  { title: "Split view", body: "Up to 4 panes: the FSD next to the ERD, the spec next to the tasks." },
  { title: "Separate windows", body: "Pop a tab into its own window. One writer per document; the others wait read-only." },
  { title: "MCP server", body: "Agents in your own terminal can read project data. Read-only by design." },
];

export const SLIDES: { label: string; title: string; desc: string; file: string }[] = [
  { label: "Agents", title: "Agent chat with approvals", desc: "Claude Code drafts, you approve each write.", file: "hero-agent-approval.png" },
  { label: "Split", title: "Split view", desc: "FSD and ERD side by side, up to four panes.", file: "split-view.png" },
  { label: "Windows", title: "A tab in its own window", desc: "Spread documents across screens.", file: "pane-window.png" },
  { label: "Projects", title: "Projects dashboard", desc: "Every project, its files and skills in one place.", file: "dashboard.png" },
  { label: "ERD", title: "ERD Studio", desc: "Interactive canvas with live DBML.", file: "erd.png" },
  { label: "Spec", title: "API spec", desc: "Endpoint cards with search and OpenAPI export.", file: "spec.png" },
  { label: "Tasks", title: "Tasks", desc: "Story points, dependencies and handoff prompts.", file: "tasks.png" },
  { label: "Timeline", title: "Timeline", desc: "Developer load and a sprint Gantt.", file: "timeline.png" },
];

export const COMING_SOON = {
  title: "Execution — tasks that run.",
  body: "Next up: the tasks you plan in Onesist, run by an agent against your repo, with the same approvals.",
};
