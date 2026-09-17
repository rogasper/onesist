import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@cloudflare/kumo";
import { ArrowUp, CaretDown, Check, Info, ListChecks, Paperclip, ShieldCheck, Stop, X } from "@phosphor-icons/react";
import { MentionTextarea, type MentionFile, type MentionTrigger } from "~/components/docs/MentionTextarea";
import { ModelPicker } from "~/components/chat/ModelPicker";
import { formatCost, formatTokens, type ChatProviderOption, type ChatSkillOption, type ProjectActionFile, type ResolvedChatAction } from "~/lib/use-chat";

/**
 * Chat composer (FR-B, FR-C10, FR-C11, ADR-001 D8).
 *
 * Contents: the explicit context entry path (`@` files via MentionTextarea,
 * plus file attachments from disk), the selector for how far the agent may
 * act (Answer/Do + permission mode), the model picker, and the job status.
 *
 * Attachments are saved into the project workspace (see the attachment
 * route), then referenced as `@…` paths in the message — not inlined as
 * text into the message. Consequences: file contents live in exactly one
 * place (disk), the agent reads them via `read_file` so the untrusted
 * content rules (FR-K1) apply automatically, and the files can be pointed
 * at again in later messages.
 *
 * Layout: the toolbar (attach, mode, actions, permission, model, send) lives
 * in one row docked to the bottom of the textarea's own box (`@container/
 * composer`), not as a separate row above it. That box's actual rendered
 * width — the chat panel can be much narrower than the viewport — drives
 * container-query variants (`@sm/composer:`, `@md/composer:`) that reveal
 * text labels once there's room; below that only icons + a `title` tooltip
 * are shown, so the row never wraps onto a second line.
 */

export interface Attachment {
  path: string;
  name: string;
  size: number;
}

/** Monospace, dim, capped height: the full text of a project action, readable
 *  but never allowed to push the rest of the popover out of view. */
const MONO_ACTION_PROMPT = "font-mono text-[11px] leading-snug text-kumo-subtle whitespace-pre-wrap max-h-24 overflow-y-auto mt-0.5";

/** Shared trigger style for the icon(+label) toolbar buttons docked under
 *  the textarea (Aksi / Izin), so they stay visually identical. */
const TOOLBAR_BUTTON = "flex items-center gap-1.5 rounded-lg px-2 h-8 shrink-0 hover:bg-kumo-tint text-sm text-kumo-default";
const TOOLBAR_LABEL = "hidden @md/composer:inline whitespace-nowrap";

interface Props {
  projectId: string;
  input: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  streaming: boolean;
  onStop: () => void;
  disabled: boolean;
  mentions: MentionFile[];
  providerReady: boolean;
  providers: ChatProviderOption[];
  providerId: string;
  model: string | null;
  onSelectModel: (providerId: string, model: string | null) => void;
  onOpenProviders: () => void;
  /** "ask" = answer without tools · "plan" = read-only plan to be approved ·
   *  "agent" = allowed to use tools. */
  threadMode: string;
  onThreadMode: (mode: string) => void;
  /** ask | auto | readonly */
  permissionMode: string;
  onPermissionMode: (mode: string) => void;
  tokensUsed: number;
  /** Token masuk/keluar + perkiraan biaya thread ini (Fase 5.5). */
  usage?: { tokensIn: number; tokensOut: number; estimate: { amount: number; currency: "usd"; partial: boolean } | null } | null;
  hasSummary: boolean;
  attachments: Attachment[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (path: string) => void;
  attachBusy: boolean;
  attachError: string | null;
  /** Ready-made jobs: built-ins merged with the project's own file (FR-C14). */
  actions: ResolvedChatAction[];
  actionFile: ProjectActionFile;
  /** Skills for the `$` trigger (FR-F4). */
  skills: ChatSkillOption[];
}

export function Composer(props: Props) {
  const {
    input,
    onInput,
    onSubmit,
    streaming,
    onStop,
    disabled,
    mentions,
    skills,
    providerReady,
    providers,
    providerId,
    model,
    onSelectModel,
    onOpenProviders,
    threadMode,
    onThreadMode,
    permissionMode,
    onPermissionMode,
    tokensUsed,
    usage,
    hasSummary,
    attachments,
    onAttach,
    onRemoveAttachment,
    attachBusy,
    attachError,
    actions,
    actionFile,
  } = props;

  const fileRef = useRef<HTMLInputElement>(null);
  const [showActions, setShowActions] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const permRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!permOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!permRef.current?.contains(e.target as Node)) setPermOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [permOpen]);

  const permOptions = useMemo(
    () => [
      { value: "ask", label: "Tanya dulu", hint: "Setiap tulis berkas menunggu persetujuan" },
      { value: "auto", label: "Otomatis", hint: "Boleh menulis, kecuali path terproteksi" },
      { value: "no-shell", label: "Tanpa shell", hint: "Boleh menulis berkas, tapi tidak diberi akses shell" },
      { value: "readonly", label: "Hanya baca", hint: "Tidak boleh mengubah apa pun" },
    ],
    [],
  );
  const permLabel = permOptions.find((o) => o.value === permissionMode)?.label ?? "Izin";

  /** Two triggers, one field: `@` for project files, `$` for skills (FR-F4).
   *  Skills are listed by their resolved layer, so the popup shows exactly the
   *  version the agent's system prompt describes — including which layer won. */
  const mentionTriggers = useMemo<MentionTrigger[]>(
    () => [
      {
        char: "@",
        label: "Berkas project",
        // Insert the NAME, not the path: the field then shows a compact chip
        // (`@chat.ts`) instead of a long path, and ChatSurface expands it to the
        // full `@dir/chat.ts` when the message is sent — the model still receives
        // a path it can act on. The popup keeps listing paths, so a duplicate name
        // is still distinguishable before choosing.
        items: mentions.map((f) => ({ name: f.name, path: f.path, insert: `@${f.name}` })),
      },
      {
        // Slash commands (FR-5.4) come from the SAME list as the `Aksi` popover, so
        // typing `/sit` and clicking the action produce identical text. Two entry
        // points, one registry — that is what keeps them from drifting.
        char: "/",
        label: "Perintah · mengisi instruksi siap pakai",
        items: actions.map((a) => ({
          name: `/${a.command}`,
          path: a.command,
          // `/sit` fills the composer with that action's instruction. Same text as
          // the Aksi popover inserts — see the registry comment in chat-actions.ts.
          insert: a.prompt,
          hint: a.label,
          tag: a.source === "project" ? "project" : undefined,
        })),
      },
      {
        char: "$",
        label: "Skill · menentukan format artefak",
        items: skills.map((s) => ({
          name: s.name,
          path: s.name,
          hint: s.description,
          tag: skillSourceLabel(s.source),
        })),
      },
    ],
    // `actions` MUST be here: it arrives from an async fetch, and without the
    // dependency the `/` popup kept whatever the list was on the last
    // mentions/skills change — usually empty, which renders as nothing at all
    // (MentionTextarea hides the popup when it has no items).
    [mentions, skills, actions],
  );

  return (
    <div className="border-t border-kumo-line shrink-0">
      <div className="mx-auto w-full max-w-3xl px-6 pt-3.5 pb-4">
        {!providerReady ? (
          <div className="mb-3 rounded-xl ring ring-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-sm text-kumo-default">
            Belum ada provider yang bisa dipakai.{" "}
            <button className="underline" onClick={onOpenProviders}>
              Tambahkan provider
            </button>{" "}
            dulu supaya agent bisa berjalan.
          </div>
        ) : null}

        {attachments.length ? (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((a) => (
              <span
                key={a.path}
                className="flex items-center gap-1.5 rounded-lg ring ring-kumo-line bg-kumo-elevated pl-2 pr-1 py-1 text-xs text-kumo-default"
                title={a.path}
              >
                <Paperclip size={11} className="text-kumo-subtle shrink-0" />
                <span className="font-mono truncate max-w-[220px]">{a.name}</span>
                <button
                  onClick={() => onRemoveAttachment(a.path)}
                  className="rounded p-0.5 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
                  title="Buang lampiran"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {attachError ? <p className="mb-2 text-sm text-red-400">{attachError}</p> : null}

        {/* Unified composer box: textarea + its own toolbar row, so attach /
           mode / actions / permission / model / send read as one control
           instead of a separate bar stacked above the text field. */}
        <div className="@container/composer rounded-xl ring ring-kumo-line bg-kumo-elevated focus-within:ring-kumo-brand">
          <MentionTextarea
            value={input}
            onChange={onInput}
            files={mentions}
            triggers={mentionTriggers}
            rows={2}
            disabled={disabled}
            onSubmit={onSubmit}
            onFilesDropped={onAttach}
            autoGrow
            maxHeightPx={176}
            placeholder={streaming ? "Agent sedang bekerja…" : "Tulis instruksi · / perintah · @ berkas · $ skill"}
            className="block w-full resize-none overflow-y-auto min-h-[52px] max-h-44 text-sm leading-6 px-3.5 pt-2.5 pb-1.5 bg-transparent focus:outline-none text-kumo-default"
          />

          <div className="flex items-center gap-1 px-2 pb-2 pt-0.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={attachBusy}
              title="Lampirkan berkas ke percakapan"
              className="h-8 w-8 shrink-0 rounded-lg hover:bg-kumo-tint text-kumo-subtle disabled:opacity-50 flex items-center justify-center"
            >
              <Paperclip size={15} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onAttach(files);
                e.target.value = "";
              }}
            />

            <Segmented
              value={threadMode}
              options={[
                { value: "ask", label: "Jawab", hint: "Menjawab tanpa memakai tool" },
                { value: "plan", label: "Rencana", hint: "Menyusun rencana read-only, lalu disetujui untuk dijalankan" },
                { value: "agent", label: "Kerjakan", hint: "Boleh memakai tool dan mengubah berkas" },
              ]}
              onChange={onThreadMode}
            />

            <div className="relative shrink-0">
              <button onClick={() => setShowActions((v) => !v)} className={TOOLBAR_BUTTON} title="Pekerjaan yang paling sering diminta">
                <ListChecks size={13} className="text-kumo-subtle shrink-0" />
                <span className={TOOLBAR_LABEL}>Aksi</span>
                <CaretDown size={10} weight="bold" className={`${TOOLBAR_LABEL} text-kumo-subtle`} />
              </button>
              {showActions ? (
                // Anchored to the trigger's RIGHT edge: the chat panel is docked on
                // the right of the window, so a wide popover opened leftward from a
                // left-anchored trigger would be clipped by the viewport edge.
                <div className="absolute bottom-full right-0 mb-2 z-30 w-[340px] max-h-[70vh] overflow-y-auto rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-1.5">
                  {actions.map((a) => (
                    <button
                      key={`${a.source}:${a.id}`}
                      onClick={() => {
                        onInput(a.prompt);
                        setShowActions(false);
                      }}
                      className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-kumo-elevated"
                    >
                      <span className="grid gap-1 min-w-0 w-full">
                        <span className="flex items-center gap-2">
                          <span className="text-sm text-kumo-default">{a.label}</span>
                          {a.source === "project" ? (
                            // The file ships with the repo, so its text is untrusted
                            // content (FR-K1). Marking it keeps a repository from
                            // passing its own instructions off as shipped defaults.
                            <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ring ring-amber-400/40 text-amber-400">
                              dari project
                            </span>
                          ) : null}
                        </span>
                        {a.hint ? <span className="text-sm text-kumo-subtle">{a.hint}</span> : null}
                        {a.source === "project" ? (
                          // Show the whole sentence before it is inserted: a project
                          // action is the one kind of action the user did not write.
                          <pre className={MONO_ACTION_PROMPT}>{a.prompt}</pre>
                        ) : null}
                      </span>
                    </button>
                  ))}
                  {actionFile.problem ? (
                    <p className="flex items-start gap-1.5 px-2.5 py-2 text-xs text-amber-400">
                      <Info size={12} className="mt-0.5 shrink-0" />
                      {actionFile.problem}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="relative shrink-0" ref={permRef}>
              <button
                onClick={() => setPermOpen((v) => !v)}
                title={`Izin: ${permLabel} — seberapa jauh agent boleh bertindak tanpa bertanya`}
                className={`${TOOLBAR_BUTTON} max-w-[6.5rem] @lg/composer:max-w-[9rem]`}
              >
                <ShieldCheck size={13} className="text-kumo-subtle shrink-0" />
                <span className="hidden @lg/composer:inline truncate whitespace-nowrap">{permLabel}</span>
                <CaretDown size={10} weight="bold" className="hidden @lg/composer:inline text-kumo-subtle shrink-0" />
              </button>
              {permOpen ? (
                <div className="absolute bottom-full right-0 mb-2 z-30 w-[260px] rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-1.5">
                  {permOptions.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => {
                        onPermissionMode(o.value);
                        setPermOpen(false);
                      }}
                      className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left ${o.value === permissionMode ? "bg-kumo-elevated" : "hover:bg-kumo-elevated"}`}
                    >
                      <span className="w-4 shrink-0 text-kumo-brand">{o.value === permissionMode ? <Check size={13} weight="bold" /> : null}</span>
                      <span className="grid gap-0.5 min-w-0">
                        <span className="text-sm text-kumo-default">{o.label}</span>
                        <span className="text-sm text-kumo-subtle">{o.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <ModelPicker providers={providers} providerId={providerId} model={model} onSelect={onSelectModel} onOpenProviders={onOpenProviders} />

            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <span className="hidden @2xl/composer:inline text-xs text-kumo-subtle whitespace-nowrap">

                {hasSummary ? " · konteks diringkas" : ""}
              </span>

              {streaming ? (
                <Button variant="secondary" shape="circle" size="sm" icon={Stop} aria-label="Hentikan" title="Hentikan agent" onClick={onStop} />
              ) : (
                <Button
                  variant="primary"
                  shape="circle"
                  size="sm"
                  icon={ArrowUp}
                  aria-label="Kirim"
                  title="Kirim pesan"
                  onClick={onSubmit}
                  disabled={!input.trim() || !providerReady}
                />
              )}
            </div>
          </div>
        </div>

        {/* Token + biaya thread diletakkan di baris petunjuk, bukan di baris
            toolbar: di panel selebar ini baris toolbar sudah penuh (Jawab/Kerjakan,
            Aksi, Izin, Model), dan sebelumnya span ini terender dengan lebar 0 —
            jadi angkanya tidak pernah terlihat. */}
        <p className="mt-1.5 text-xs text-kumo-subtle flex items-center gap-2">          
          <span className="ml-auto shrink-0">
            {usage && (usage.tokensIn || usage.tokensOut)
              ? `↑${formatTokens(usage.tokensIn)} ↓${formatTokens(usage.tokensOut)}`
              : tokensUsed
                ? `${formatTokens(tokensUsed)} token`
                : ""}
            {formatCost(usage?.estimate) ? ` · ${formatCost(usage?.estimate)}` : ""}
          </span>
        </p>
      </div>
    </div>
  );
}

/** Segmented control for enum choices — faster to scan than a `<select>`,
 *  and it does not pop up a system menu outside the app's design language
 *  (ADR-001 D8). */
function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center h-8 shrink-0 rounded-lg ring ring-kumo-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.hint}
          className={`h-full flex items-center whitespace-nowrap rounded-md px-2.5 text-sm ${
            value === o.value ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Where a skill came from, in words the user can act on. The distinction
 *  matters: `project` skills are that repository's own conventions, while the
 *  others were added outside the project — including skills installed by a tool
 *  like `npx skills add` into a global folder. */
function skillSourceLabel(source: ChatSkillOption["source"]): string {
  switch (source) {
    case "project":
      return "project";
    case "vendor":
      return "bawaan";
    case "user":
      return "global";
    default:
      return source;
  }
}
