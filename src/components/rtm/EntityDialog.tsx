import { useEffect, useState } from "react";
import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { Trash } from "@phosphor-icons/react";
import type { BusinessRequirement } from "~/shared/types";
import type { EntityKind, RtmEntity } from "./types";

export const RTM_PREFIX: Record<EntityKind, string> = { br: "BR", fr: "FR", design: "DS", test: "TC" };

const KIND_LABEL: Record<EntityKind, string> = {
  br: "Business Requirement",
  fr: "Functional Requirement",
  design: "Design Solution",
  test: "Test Case",
};

const INPUT_CLS =
  "w-full bg-kumo-elevated/60 border border-kumo-line rounded px-2.5 py-1.5 text-sm text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none";

interface EntityDialogProps {
  open: boolean;
  kind: EntityKind;
  /** Null = create mode. Set = edit mode. */
  initial: RtmEntity | null;
  brs: BusinessRequirement[];
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => void;
  onDelete?: (kind: EntityKind, entity: RtmEntity) => void;
  saving?: boolean;
}

export function EntityDialog({ open, kind, initial, brs, onClose, onSave, onDelete, saving }: EntityDialogProps) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brId, setBrId] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode((initial as any)?.code ?? "");
    setTitle((initial as any)?.title ?? "");
    setDescription((initial as any)?.description ?? "");
    setBrId((initial as any)?.brId ?? "");
    setSourceRef((initial as any)?.sourceRef ?? "");
    setSteps((initial as any)?.steps ?? "");
    setExpected((initial as any)?.expected ?? "");
  }, [open, initial]);

  const submit = () => {
    const values: Record<string, unknown> = { code: code.trim() || undefined, title: title.trim() || undefined };
    if (kind !== "test") values.description = description;
    if (kind === "fr") values.brId = brId || null;
    if (kind === "design") values.sourceRef = sourceRef;
    if (kind === "test") {
      values.description = description;
      values.steps = steps;
      values.expected = expected;
    }
    onSave(values);
  };

  return (
    <DialogRoot open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog>
        <div className="p-5 w-[480px] max-w-full">
          <DialogTitle>{initial ? `Edit ${KIND_LABEL[kind]}` : `New ${KIND_LABEL[kind]}`}</DialogTitle>
          <DialogDescription className="sr-only">{KIND_LABEL[kind]}</DialogDescription>
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] text-kumo-subtle mb-1">Code</span>
                <input className={INPUT_CLS} value={code} onChange={(e) => setCode(e.target.value)} placeholder={`${RTM_PREFIX[kind]}-00X`} />
              </label>
              <label className="block">
                <span className="block text-[11px] text-kumo-subtle mb-1">Title</span>
                <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nama requirement / solusi" autoFocus />
              </label>
            </div>

            {kind === "fr" && (
              <label className="block">
                <span className="block text-[11px] text-kumo-subtle mb-1">Business Requirement</span>
                <select className={INPUT_CLS} value={brId} onChange={(e) => setBrId(e.target.value)}>
                  <option value="">— Belum dipecah —</option>
                  {brs.map((br) => (
                    <option key={br.id} value={br.id}>{br.code} · {br.title}</option>
                  ))}
                </select>
              </label>
            )}

            {(kind === "br" || kind === "fr" || kind === "design" || kind === "test") && (
              <label className="block">
                <span className="block text-[11px] text-kumo-subtle mb-1">Description</span>
                <textarea className={`${INPUT_CLS} resize-y`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            )}

            {kind === "design" && (
              <label className="block">
                <span className="block text-[11px] text-kumo-subtle mb-1">Source (spec / ERD / section)</span>
                <input className={INPUT_CLS} value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="mis. API Spec /auth/login" />
              </label>
            )}

            {kind === "test" && (
              <>
                <label className="block">
                  <span className="block text-[11px] text-kumo-subtle mb-1">Steps</span>
                  <textarea className={`${INPUT_CLS} resize-y`} rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="1. Buka halaman login&#10;2. Input kredensial" />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-kumo-subtle mb-1">Expected</span>
                  <textarea className={`${INPUT_CLS} resize-y`} rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} />
                </label>
              </>
            )}
          </div>
          <div className="flex justify-between gap-2 mt-6">
            <div>
              {initial && onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(kind, initial)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash size={13} className="mr-1" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={submit} disabled={saving || !title.trim()}>
                {saving ? "Saving…" : initial ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
