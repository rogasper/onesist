/**
 * Types and shapes for subagents (FR-G).
 *
 * The panel owns its own fetching (see `SubagentsPanel`); what lives here are the
 * shapes, so the panel and any future surface agree on them.
 */

export interface SubagentView {
  name: string;
  description: string;
  /** Our tool names — always read-only (FR-G6). */
  tools: string[];
  /** `project` = markdown file in the workspace · `app` = created through the UI ·
   *  `builtin` = shipped with the app. Only `app` rows are editable here. */
  source: "project" | "app" | "builtin";
  maxSteps: number;
  /** Database id, present only for `app` rows. */
  id: string | null;
  /** Present for `app` rows in the edit form; not sent in list payloads. */
  instructions?: string;
}

export interface SubagentDraft {
  id: string | null;
  name: string;
  description: string;
  tools: string[];
  instructions: string;
  maxSteps: number | null;
}

export interface RejectedSubagentView {
  name: string;
  source: string;
  reason: string;
}
