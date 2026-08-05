---
name: polish-ui
description: Run a UX polish checklist against any UI change — new components, new buttons/modals, or edits to existing UI — and auto-fix gaps before reporting done. The skill judges which items apply to the specific change, then fixes them inline (not as a follow-up). Accepts `mode=fast|balanced|production` to control depth (default: balanced); also accepts `include=` / `skip=` overrides. Trigger phrases and scenarios — "polish this", "give this a UX pass", "run the UX checklist on X", adding/editing a button, dialog, modal, popover, sheet, drawer, command palette, form submit, confirmation prompt, keyboard-driven action; "add a button", "build this modal", "wire up this dialog", "new form", any UI/UX work in .tsx/.jsx files. Skip for: pure backend, copy-only edits with no interaction change, type-only refactors.
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.


# UX Checklist

You (or a caller) just touched UI. Before reporting done, walk this checklist, decide which items apply to **this specific surface**, and fix gaps inline.

The list is designed to grow. Treat every item as load-bearing — each one exists because a user had to re-prompt for it.

---

## Two ways this skill runs

- **As a post-step.** `add-feature`, `modify-feature`, and `fix-bug` hand off here after a UI change. The surface is whatever the caller just touched — run the checklist against the diff and fix gaps inline. This is the concise voice: no preamble, one line per fix.
- **As a standalone pass** (`/polish-ui`, or `ship` routes POLISH here). No specific change was named, so first **scope the surface**: if which page/component/family to polish is ambiguous, confirm it with `AskUserQuestion`; inventory the surface's sibling instances for the conventions below; run the checklist; then **verify by exercising each fixed interaction** (open the modal, tab through it, submit the form, press the shortcut). See "Verify" below.

Either way: decide which items apply, fix gaps in the same pass, and report one line per fix. Skip silent items — no "N/A" padding.

---

## Modes

This skill accepts a `mode=` argument (default `balanced`). Callers gate *whether* to invoke polish-ui; `mode=` gates *how deep* the pass goes.

| Mode | Depth |
|---|---|
| `fast` | Run the checklist on the named surface only. Auto-fix mechanical gaps; report the rest. No sibling inventory. |
| `balanced` (default) | `fast` + a sibling-convention pass via the `ui-pattern-inspector` subagent for recurring families (Modal, Dialog, Drawer, Form, Command Palette) so the surface matches its siblings' hotkeys / focus / footer conventions instead of inventing new ones. |
| `production` | `balanced` + dispatch the `reviewer-accessibility-regression` and `reviewer-loading-states` subagents on the touched files and fold their `auto-fixable: true` findings into this pass; surface the rest. |

**`include=` / `skip=`** accept checklist item numbers (`1`–`5`) and the tokens `siblings` (the `ui-pattern-inspector` pass) and `a11y` / `loading` (the production reviewers). Example: `mode=fast include=siblings`.

**Run-ledger handoff.** When `/ship` passes `run-id=` and `run-ledger=`, update that ledger at every phase/subagent/reviewer transition. Record surface scope, finding dispositions, fixes, exercised interactions, and exact final verification evidence.

For balanced/production subagent fan-out, follow `playbooks/add-feature/references/subagent-playbook.md`: classify mandatory/advisory tasks, retry failed/malformed output once, use inline fallback, and block a required production pass with no valid report.

---

## Checklist

> **Growth contract:** When appending an item, give it three things — (1) the rule, (2) when it applies, (3) the fix. Items missing any of the three get skipped during evaluation.

### 1. Action buttons display their keyboard shortcut

If a button triggers an action that has (or should have) a keyboard shortcut, the shortcut must appear **in the visible button text**, not just as a `title`/`aria-keyshortcuts`.

**Convention:** mac glyphs, trailing the label, separated by a space.

- `Save ⌘S`
- `Submit ⌘↵`
- `Cancel ⎋`
- `Delete ⌫`

Glyph reference: `⌘` cmd · `⌥` opt · `⇧` shift · `⌃` ctrl · `↵` enter · `⎋` esc · `⌫` delete · `→ ← ↑ ↓` arrows.

**Applies when:** the button is a primary/secondary action with a clear shortcut (Save, Submit, Confirm, Cancel, Delete, Search, New). A button qualifies when its label is a verb and it triggers a single discrete action. Skip for icon-only buttons in toolbars where the label is already a tooltip, and for buttons inside a list row where per-row shortcuts don't make sense.

**Fix:** add the glyph to the label AND wire the actual key handler (the visible shortcut must work — a label without a binding is a lie).

**Conflicts:** if two visible actions on the same view want the same shortcut, the more frequent action wins; the other gets a modifier (`⇧⌘S`) or no shortcut.

### 2. Modals close on Esc and return focus to the trigger

Any modal/dialog/sheet/drawer/popover that traps attention must close on `Esc`.

**Applies when:** the change adds or edits an overlay surface that traps attention.

**Fix:** if using a primitive (Radix Dialog, shadcn Dialog, HeadlessUI, etc.), Esc-to-close is usually built in — verify it isn't disabled (`onEscapeKeyDown` preventing default, `closeOnEscape={false}`). If hand-rolled, add a `keydown` listener on `Escape` that calls the close handler, scoped to the modal's lifetime. Also verify focus returns to the trigger element after close — if the modal hijacks focus and never returns it, that's a bug even if Esc works. (Focus *on open* is item 4.)

### 3. Async actions show loading/disabled state and can't double-submit

**Rule:** any control that triggers an async action (form submit, mutation, save, delete-with-confirm) must disable itself while the action is in flight and show a loading affordance. A brand-new async surface with *no* loading state at all must get one.

**Applies when:** the change wires a mutation / submit / async handler to a button or form, or adds a new data-fetching surface that renders nothing while pending.

**Fix:** add `disabled={isPending}` (plus a spinner or label swap) on the trigger, and guard the handler so a second click while pending is a no-op. For a brand-new surface with zero loading state, introduce the project's loading primitive (skeleton/spinner matching siblings) — this is the "introduce missing loading primitives for a new surface" scope that `reviewer-loading-states` defers here.

### 4. Focus lands *inside* the surface on open

**Rule:** when a modal/dialog/drawer/popover/command-palette opens, focus must move into it — the first field, or the primary action — and be trapped for the surface's lifetime. Closing focus (item 2) is not enough; a surface the keyboard can't reach on open is unusable without a mouse.

**Applies when:** the change adds or edits an overlay surface that traps attention.

**Fix:** with a primitive (Radix/shadcn/HeadlessUI), set the initial focus target (`autoFocus` on the first input, or the primitive's `initialFocus`/`autoFocus` prop) and verify the focus trap isn't disabled. Hand-rolled: move focus on mount and trap Tab/Shift-Tab within the surface. Don't autofocus a destructive action (Delete) — default to the first input or the safe primary.

### 5. Footer / chrome parity with siblings

**Rule:** a new instance of a recurring surface (Modal, Dialog, Drawer, Form, Card) must match its siblings' footer and chrome — button order (which side cancel vs. confirm sits), primary-action emphasis, the kbd-hint line, spacing, and the close affordance.

**Applies when:** the change adds a new instance of a family that already has 2+ siblings in the codebase.

**Fix:** inventory 2–3 sibling instances (in `balanced`/`production` the `ui-pattern-inspector` subagent returns this) and match their footer/chrome by default. Deviate only with a stated reason — an off-convention modal reads as a bug to users who've learned the app's pattern.

---

## Verify (standalone passes)

After fixing, exercise each fixed interaction against the running surface and report what you exercised:

- Open the overlay — does focus land inside it (item 4)?
- Tab to the end — does the trap hold (item 4)?
- Submit while pending — is the double-submit blocked and the spinner shown (item 3)?
- Press each labeled shortcut — does the bound key actually fire (item 1)?
- Press `Esc` — does it close and return focus (item 2)?

A polish pass that only edits code without exercising it can ship a shortcut label that doesn't fire or a focus trap that never engaged — exactly the "the label is a lie" failure the NEVERs warn about. (Post-step passes inherit the caller's own verification; standalone passes own it.)

## Final candidate gate — standalone runs

For a standalone `/polish-ui` run, finish with a final candidate gate after every fix: run the relevant typecheck/lint/UI tests/build, execute the interaction checklist above, and run the canonical residue + hardcoded-secret sweep from `ship`'s `references/residue-sweep.md` with `include-working-tree`. If a repair changes code, repeat the gate. Report `locally-verified`, `partial`, or `blocked`; post-step invocations defer this combined-tree terminal state to their caller.

---

## NEVER

- **NEVER add a shortcut glyph to a label without binding the key handler**
  **Instead:** Wire the `keydown` listener (or framework equivalent) in the same edit. If you can't bind it, don't show it.
  **Why:** A visible `⌘S` that does nothing is worse than no hint — users press it, nothing happens, trust drops.

- **NEVER report a UI change as done while skipping this checklist**
  **Instead:** Run the filter step before your final message. Even a one-line button change qualifies.
  **Why:** The checklist exists because the user had to re-prompt. Skipping it reproduces the exact failure mode the skill was created to prevent.

- **NEVER list checklist gaps as "follow-up work"**
  **Instead:** Fix them in the same turn. If a gap is genuinely out of scope (e.g., requires a new dependency), surface it explicitly and ask — don't silently defer.
  **Why:** Deferred UX polish never gets done; it accumulates as the same re-prompt the user is trying to eliminate.

- **NEVER render mac glyphs without detecting platform** (when the app ships to non-mac users)
  **Instead:** Detect platform once (`navigator.platform`, `userAgent`, or a `usePlatform()` hook if the project has one) and swap to `Ctrl+S` / `Alt` / `Esc` text on Windows/Linux. If the project is mac-only, state that here and skip the swap.
  **Why:** `⌘` and `⌥` render as unfamiliar symbols (or boxes in missing fonts) on Windows/Linux, turning a hint into noise. The bind still works; the *label* lies about which key to press.

- **NEVER invent a modal/form convention when siblings already establish one**
  **Instead:** In `balanced`+, run the `ui-pattern-inspector` pass and match the sibling footer/chrome/hotkeys. Deviate only with a stated reason.
  **Why:** Every off-convention overlay makes the app feel assembled by different hands — the user re-learns the layout per surface instead of once.

- **NEVER force items that don't apply**
  **Instead:** Skip an item when the change has no surface for it (e.g., a backend-only tweak that touched a `.tsx` import). Padding with "N/A" wastes the user's attention.
  **Why:** Mechanical compliance erodes trust in the checklist's signal — every reported item should be a real fix.
