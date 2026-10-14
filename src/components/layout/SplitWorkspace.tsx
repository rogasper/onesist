import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowsLeftRight, X } from "@phosphor-icons/react";
import {
  SPLIT_TABS,
  SPLIT_TAB_LABELS,
  arrangementFor,
  setPaneTab,
  setRatio,
  type SplitState,
  type SplitTab,
} from "~/lib/split-layout";
import { PaneBody } from "./PaneBody";
import { SplitDivider } from "./SplitDivider";

export interface SplitWorkspaceProps {
  projectId: string;
  /** The route's own content (Outlet or Overview). */
  main: ReactNode;
  state: SplitState;
  onChange: (next: SplitState) => void;
  /** The parent decides (it may ask about unsaved edits first). */
  onRequestClose: (index: number) => void;
  /** Undefined when the main tab cannot be swapped into a pane. */
  onSwap?: (index: number) => void;
  onPaneDirtyChange: (index: number, dirty: boolean) => void;
}

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * The project page body: the main pane plus up to three extra panes, arranged by
 * `arrangementFor`. Ratios are percentages of the measured container, so dragging a
 * divider only changes `state.ratios` and the parent writes it to the URL.
 */
export function SplitWorkspace({ projectId, main, state, onChange, onRequestClose, onSwap, onPaneDirtyChange }: SplitWorkspaceProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const width = useElementWidth(rootRef);
  const arrangement = arrangementFor(state.panes.length, state.dir, width);
  const [r0, r1] = state.ratios;

  const ratio0 = useCallback((v: number) => onChange(setRatio(state, 0, v)), [state, onChange]);
  const ratio1 = useCallback((v: number) => onChange(setRatio(state, 1, v)), [state, onChange]);

  const pane = (index: number) => (
    <ExtraPane
      key={`${index}-${state.panes[index]}`}
      index={index}
      tab={state.panes[index]}
      projectId={projectId}
      onTabChange={(tab) => onChange(setPaneTab(state, index, tab))}
      onClose={() => onRequestClose(index)}
      onSwap={onSwap ? () => onSwap(index) : undefined}
      onDirtyChange={(dirty) => onPaneDirtyChange(index, dirty)}
    />
  );
  const mainPane = <div className="min-w-0 min-h-0 h-full overflow-auto">{main}</div>;

  let body: ReactNode;
  switch (arrangement) {
    case "single":
      // No wrapper: with no extra panes the page renders exactly as before.
      body = main;
      break;
    case "cols":
      body = (
        <div className="flex h-full min-h-0">
          <div style={{ flexBasis: `${r0 * 100}%` }} className="min-w-0 min-h-0 shrink-0">{mainPane}</div>
          <SplitDivider axis="x" containerRef={rootRef} onRatio={ratio0} />
          <div className="flex-1 min-w-0 min-h-0">{pane(0)}</div>
        </div>
      );
      break;
    case "rows":
      body = (
        <div className="flex flex-col h-full min-h-0">
          <div style={{ flexBasis: `${r0 * 100}%` }} className="min-w-0 min-h-0 shrink-0">{mainPane}</div>
          <SplitDivider axis="y" containerRef={rootRef} onRatio={ratio0} />
          <div className="flex-1 min-w-0 min-h-0">{pane(0)}</div>
        </div>
      );
      break;
    case "main-stack":
      body = (
        <div className="flex h-full min-h-0">
          <div style={{ flexBasis: `${r0 * 100}%` }} className="min-w-0 min-h-0 shrink-0">{mainPane}</div>
          <SplitDivider axis="x" containerRef={rootRef} onRatio={ratio0} />
          <div ref={stackRef} className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div style={{ flexBasis: `${r1 * 100}%` }} className="min-h-0 shrink-0">{pane(0)}</div>
            <SplitDivider axis="y" containerRef={stackRef} onRatio={ratio1} />
            <div className="flex-1 min-h-0">{pane(1)}</div>
          </div>
        </div>
      );
      break;
    case "grid":
      body = (
        <div className="flex flex-col h-full min-h-0">
          <div style={{ flexBasis: `${r1 * 100}%` }} className="flex min-h-0 shrink-0">
            <div style={{ flexBasis: `${r0 * 100}%` }} className="min-w-0 min-h-0 shrink-0">{mainPane}</div>
            <SplitDivider axis="x" containerRef={rootRef} onRatio={ratio0} />
            <div className="flex-1 min-w-0 min-h-0">{pane(0)}</div>
          </div>
          <SplitDivider axis="y" containerRef={rootRef} onRatio={ratio1} />
          <div className="flex flex-1 min-h-0">
            <div style={{ flexBasis: `${r0 * 100}%` }} className="min-w-0 min-h-0 shrink-0">{pane(1)}</div>
            <SplitDivider axis="x" containerRef={rootRef} onRatio={ratio0} />
            <div className="flex-1 min-w-0 min-h-0">{pane(2)}</div>
          </div>
        </div>
      );
      break;
    case "stack":
      body = (
        <div className="flex flex-col gap-2 h-full min-h-0 overflow-y-auto">
          <div className="min-h-[360px] shrink-0">{mainPane}</div>
          {state.panes.map((_, i) => (
            <div key={`${i}-${state.panes[i]}`} className="min-h-[360px] shrink-0">{pane(i)}</div>
          ))}
        </div>
      );
      break;
  }

  return <div ref={rootRef} className="h-full min-h-0 min-w-0">{body}</div>;
}

interface ExtraPaneProps {
  index: number;
  tab: SplitTab;
  projectId: string;
  onTabChange: (tab: SplitTab) => void;
  onClose: () => void;
  onSwap?: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function ExtraPane({ index, tab, projectId, onTabChange, onClose, onSwap, onDirtyChange }: ExtraPaneProps) {
  return (
    <section className="h-full min-h-0 flex flex-col rounded-lg border border-kumo-line bg-kumo-elevated/20 overflow-hidden">
      <header className="flex items-center gap-1 px-2 py-1 border-b border-kumo-line shrink-0">
        <select
          value={tab}
          onChange={(e) => onTabChange(e.target.value as SplitTab)}
          className="text-xs bg-transparent text-kumo-default border border-kumo-line rounded px-1.5 py-0.5"
          aria-label="Tab di pane ini"
        >
          {SPLIT_TABS.map((t) => (
            <option key={t} value={t}>{SPLIT_TAB_LABELS[t]}</option>
          ))}
        </select>
        <div className="flex-1" />
        {onSwap && (
          <button onClick={onSwap} title="Tukar dengan pane utama" className="p-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated">
            <ArrowsLeftRight size={12} />
          </button>
        )}
        <button onClick={onClose} title="Tutup pane" className="p-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated">
          <X size={12} />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-2">
        <PaneBody tab={tab} projectId={projectId} paneId={`pane-${index}`} onDirtyChange={onDirtyChange} />
      </div>
    </section>
  );
}
