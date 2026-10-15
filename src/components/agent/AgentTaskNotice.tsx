/** Where a Generate task runs now: a note with a way back to its chat thread, or its start error. */
import { InlineAlert } from "~/components/ui/InlineAlert";
import type { AgentTaskState } from "~/lib/use-agent-task";

export function AgentTaskNotice({ task }: { task: AgentTaskState }) {
  if (task.error) return <InlineAlert>{task.error}</InlineAlert>;
  if (!task.running) return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      Sedang berjalan di chat.
      <button onClick={task.openChat} className="underline hover:text-amber-300">
        Buka chat
      </button>
    </div>
  );
}
