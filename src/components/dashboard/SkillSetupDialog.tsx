import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { InlineAlert } from "~/components/ui/InlineAlert";
import type { SkillInstallState } from "~/lib/use-skill-install";

interface SkillSetupDialogProps {
  state: SkillInstallState;
  onClose: () => void;
  onRetry: () => void;
}

export function SkillSetupDialog({ state, onClose, onRetry }: SkillSetupDialogProps) {
  const updating = state.status === "outdated";
  return (
    <DialogRoot open={state.status !== "idle"} onOpenChange={(open) => {
      if (!open && state.status !== "installing") onClose();
    }}>
      <Dialog>
        <div className="p-5 w-96 max-w-full">
          <DialogTitle>{updating ? "Skill update available" : "Project skill setup"}</DialogTitle>
          <DialogDescription className="mt-1">
            {updating ? (
              <>A newer version of the project skills is available. Updating brings <b>fsd-analyzer</b> and <b>markitdown</b> in <code className="text-[10px]">.agents/skills/</code> to the latest.</>
            ) : (
              <>The project requires the <b>fsd-analyzer</b> and <b>markitdown</b> skills to be installed into{" "}
              <code className="text-[10px]">.agents/skills/</code> before AI analysis can run.</>
            )}
          </DialogDescription>
          <div className="mt-4 space-y-2">
            {state.skills?.length ? state.skills.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  s.status === "installed" ? "bg-green-400"
                  : s.status === "installing" ? "bg-amber-400 animate-pulse"
                  : s.status === "outdated" ? "bg-blue-400"
                  : s.status === "failed" ? "bg-red-400"
                  : "bg-kumo-subtle"
                }`} />
                <span className="text-kumo-default font-medium">{s.name}</span>
                {s.version && s.latestVersion && s.version !== s.latestVersion ? (
                  <span className="text-kumo-subtle ml-auto">v{s.version} → v{s.latestVersion}</span>
                ) : (
                  <span className="text-kumo-subtle ml-auto">{s.status}</span>
                )}
              </div>
            )) : (
              <div className="text-xs text-kumo-subtle flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Checking / installing required skills…
              </div>
            )}
            {state.status === "failed" && state.error && (
              <InlineAlert kind="error" className="text-[11px] whitespace-pre-wrap">{state.error}</InlineAlert>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            {state.status === "failed" || updating ? (
              <>
                <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
                <Button variant="primary" size="sm" onClick={onRetry}>{updating ? "Update now" : "Retry install"}</Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" disabled>Please wait…</Button>
            )}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
