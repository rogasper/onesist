/** The transcript as the UI reads it: stored rows, then big tool outputs shortened (see tool-output.ts). */
import { toUIMessages, type MessageRow } from "~/server/agent/store";
import { pruneToolOutputsForView } from "~/server/agent/tool-output";

export function viewMessages(rows: MessageRow[]) {
  return pruneToolOutputsForView(toUIMessages(rows));
}
