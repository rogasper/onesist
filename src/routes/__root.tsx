import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { openProjectWindow } from "~/lib/window";
import type { QueryClient } from "@tanstack/react-query";
import { Sidebar, useSidebar } from "@cloudflare/kumo";
import { House, Folder, Gear, Sun, Moon, ArrowUp, MagnifyingGlass, SidebarSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, useRef } from "react";
import { applyTheme, getStoredTheme, toggleTheme, type AppTheme } from "~/lib/theme";
import { useGlobalDropGuard } from "~/lib/file-drop";
import { useRunNotifications } from "~/lib/use-run-notifications";
import { useClientErrorReporting } from "~/lib/use-client-error-report";
import { UpdateBanner, requestUpdateCheck } from "~/components/UpdateBanner";
import { InstanceWatch } from "~/components/system/InstanceWatch";
import { QuickOpenModal } from "~/components/ui/QuickOpenModal";
import { ProjectNotFound } from "~/components/ui/ProjectNotFound";
import { RIGHT_DOCK_ID } from "~/components/layout/RightDock";
import {
  PEEK_ENTER_DELAY_MS,
  PEEK_LEAVE_DELAY_MS,
  getSidebarOpen,
  hasBlockingOverlay,
  hydrateSidebarState,
  isPointerInEdgeZone,
  isPointerInPeekBounds,
  isSidebarToggleKey,
  setSidebarAutoHide,
  setSidebarOpen,
  shouldEnableSidebarPeek,
  shouldStartSidebarPeek,
  useSidebarAutoHide,
  useSidebarChoice,
  useSidebarOpen,
} from "~/lib/sidebar-state";
import { isFocusMode, isFocusSidebarPinned, setFocusSidebarPinned, useFocusMode, useFocusSidebarPinned } from "~/lib/focus-mode";
import "~/styles.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Onesist" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: ProjectNotFound,
});

function SidebarPanelIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="shrink-0"
    >
      <path d="M21.25 6.72v10.56a2.97 2.97 0 0 1-2.97 2.97H5.72a2.97 2.97 0 0 1-2.97-2.97V6.72a2.97 2.97 0 0 1 2.97-2.97h12.56a2.97 2.97 0 0 1 2.97 2.97" />
      <path
        d="M6.25 7.25v9.5"
        style={{ transform: pinned ? "translateX(1px)" : "translateX(10.5px)" }}
        className="motion-safe:transition-transform motion-safe:duration-200"
      />
    </svg>
  );
}

function AppSidebarHeader({
  overlay,
  isPinned,
  onPinToggle,
  onCollapseClick,
}: {
  overlay: boolean;
  isPinned: boolean;
  onPinToggle: () => void;
  onCollapseClick: () => void;
}) {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const isDesktop =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return (
    <Sidebar.Header>
      <div className={`flex w-full items-center gap-2 ${isCollapsed ? "justify-center" : "justify-between"}`}>
        <div className="flex items-center gap-2 min-w-0">
          {overlay ? (
            /* The brand mark doubles as the collapse control: hover swaps it to the panel
               icon so it reads as clickable instead of a dead logo, click collapses. */
            <button
              type="button"
              onClick={onCollapseClick}
              title="Sembunyikan sidebar (Ctrl/⌘B)"
              aria-label="Sembunyikan sidebar"
              className="group/logo relative grid size-7 shrink-0 place-items-center rounded hover:bg-kumo-elevated/60 cursor-pointer"
            >
              <img
                src="/logo-icon.png"
                alt="Onesist"
                className="h-6 w-6 object-contain transition-opacity group-hover/logo:opacity-0"
              />
              <SidebarSimple
                size={14}
                className="absolute text-kumo-subtle opacity-0 transition-opacity group-hover/logo:opacity-100"
              />
            </button>
          ) : (
            <img src="/logo-icon.png" alt="Onesist" className="h-6 w-6 object-contain shrink-0" />
          )}
          {!isCollapsed && <span className="text-sm font-semibold text-kumo-default truncate min-w-0">ONESIST</span>}
        </div>
        {!isCollapsed && (
          <div className="flex items-center gap-1 shrink-0">
            {isDesktop && (
              <button
                type="button"
                onClick={() => requestUpdateCheck()}
                title="Check for updates"
                className="flex items-center justify-center size-7 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/60 cursor-pointer shrink-0"
              >
                <ArrowUp size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={isMobile ? toggleSidebar : onPinToggle}
              title={
                isMobile
                  ? "Tutup sidebar"
                  : isPinned
                    ? "Auto-hide sidebar: sembunyi otomatis dan muncul saat kursor di tepi kiri"
                    : "Pin sidebar: tetap terbuka setelah kursor pergi"
              }
              aria-label={isMobile ? "Tutup sidebar" : "Pin sidebar"}
              aria-pressed={isMobile ? undefined : isPinned}
              className="flex items-center justify-center size-8 rounded-lg text-kumo-subtle hover:text-kumo-default hover:bg-(--sidebar-active-bg) cursor-pointer shrink-0"
            >
              <SidebarPanelIcon pinned={isMobile ? true : isPinned} />
            </button>
          </div>
        )}
      </div>
    </Sidebar.Header>
  );
}

function AppSidebarFooter() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    setMounted(true);
    setTheme(getStoredTheme());
  }, []);

  const onToggleTheme = () => {
    void toggleTheme().then(setTheme);
  };

  return (
    <Sidebar.Footer>
      <div className={`flex items-center gap-1 ${isCollapsed ? 'justify-center' : ''}`}>
        {!isCollapsed && (
          <button
            type="button"
            onClick={onToggleTheme}
            title={mounted ? (theme === "dark" ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
            className="flex items-center gap-2 px-2 py-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/60 cursor-pointer"
          >
            {mounted && theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span className="text-xs">{mounted ? (theme === "dark" ? "Light mode" : "Dark mode") : "Theme"}</span>
          </button>
        )}
      </div>
    </Sidebar.Footer>
  );
}
const SIDEBAR_OPEN_KEY = "onesist:sidebar:open";
const SIDEBAR_AUTO_HIDE_KEY = "onesist:sidebar:auto-hide";
const SIDEBAR_WIDTH_KEY = "onesist:sidebar:width";
// Slightly longer than the 220ms slide-out transform so the sidebar keeps its full expanded
// layout until it has finished leaving the viewport.
const PEEK_EXIT_ANIM_MS = 250;
// Height of the overlay title bar strip on the macOS main window (traffic lights + toggle).
const TITLEBAR_H = 32;
// Which window gets the overlay title bar UI, decided once, synchronously: the macOS desktop
// main window only. Secondary windows (win-*/pane-*) keep their native title bar, the browser
// has none. Synchronous on purpose — an async "is this main?" state once left a gap where the
// strip was missing while the overlay shell was already up, and the sidebar fell back to
// hover-only behavior the user explicitly rejected.
const IS_MAC_MAIN =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window &&
  /Macintosh/.test(navigator.userAgent) &&
  (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
    .__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main";

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch {}
}

function SidebarPersistence() {
  const { state, width, setWidth } = useSidebar();
  const [hydrated, setHydrated] = useState(false);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const open = readStored(SIDEBAR_OPEN_KEY);
    const autoHide = readStored(SIDEBAR_AUTO_HIDE_KEY);
    hydrateSidebarState({
      open: open === null ? null : open === "true",
      autoHide: autoHide === null ? null : autoHide === "true",
    });
    const w = readStored(SIDEBAR_WIDTH_KEY);
    if (w !== null) {
      const n = Number(w);
      if (Number.isFinite(n) && n > 0) setWidth(n);
    }
    setHydrated(true);
  }, [setWidth]);

  // The user's choices are remembered, not transient folds (chat fold or focus mode).
  const choice = useSidebarChoice();
  const autoHide = useSidebarAutoHide();
  useEffect(() => {
    if (!hydrated) return;
    writeStored(SIDEBAR_OPEN_KEY, choice ? "true" : "false");
  }, [hydrated, choice]);

  useEffect(() => {
    if (!hydrated) return;
    writeStored(SIDEBAR_AUTO_HIDE_KEY, autoHide ? "true" : "false");
  }, [hydrated, autoHide]);

  useEffect(() => {
    if (hydrated && state === "expanded") writeStored(SIDEBAR_WIDTH_KEY, String(width));
  }, [hydrated, state, width]);

  return null;
}

/**
 * Left-edge hover reveal and overlay sidebar wrapper.
 *
 * Works in both normal mode (when Auto-hide / unpinned is active) and Focus Mode (where the
 * sidebar auto-hides temporarily until pinned). Rather than relying on kumo's internal `peekable`
 * state — whose provider `useMemo` omits `peekable` from its deps and whose `onMouseLeave` snaps
 * closed with 0ms grace — this drives the overlay with compositor-only `transform` + `opacity`
 * transitions, a 12px left-edge hot zone plus window edge tracking, a 50ms enter dwell (safe
 * across dual monitors), and a 220ms leave grace delay with hysteresis.
 */
function AppSidebarShell({
  dockedOpen,
  autoHide,
  focusActive,
  focusPinned,
  finePointer,
  peeking,
  onOpenPeek,
  onClosePeek,
  children,
}: {
  dockedOpen: boolean;
  autoHide: boolean;
  focusActive: boolean;
  focusPinned: boolean;
  finePointer: boolean;
  peeking: boolean;
  onOpenPeek: () => void;
  onClosePeek: () => void;
  children: React.ReactNode;
}) {
  const { isMobile, width, isResizing } = useSidebar();
  const asideRef = useRef<HTMLElement | null>(null);
  const enterTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;
  const isResizingRef = useRef(isResizing);
  isResizingRef.current = isResizing;
  // Tracks the last known pointer X and whether the pointer must leave the edge strip before
  // re-triggering peek (prevents instant re-open when pressing Esc with the cursor still at x <= 12).
  const lastPointerXRef = useRef<number | null>(null);
  const requireEdgeExitRef = useRef(false);
  const prevPeekingRef = useRef(peeking);

  const peekEnabled = shouldEnableSidebarPeek({
    dockedOpen,
    autoHide,
    focusActive,
    focusPinned,
    finePointer,
    isMobile,
  });

  const clearEnterTimer = useCallback(() => {
    if (enterTimerRef.current !== null) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
  }, []);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  // Latch edge re-arming when peek closes while the pointer is still sitting on the left edge.
  useEffect(() => {
    const wasPeeking = prevPeekingRef.current;
    prevPeekingRef.current = peeking;
    if (wasPeeking && !peeking) {
      const lastX = lastPointerXRef.current;
      const topOffset = asideRef.current?.getBoundingClientRect().top ?? 0;
      if (lastX !== null && isPointerInEdgeZone({ clientX: lastX, clientY: topOffset, topOffset })) {
        requireEdgeExitRef.current = true;
      }
    }
  }, [peeking]);

  // Drop any active peek as soon as hover-reveal is disabled (pinned, focus exited, mobile).
  useEffect(() => {
    if (!peekEnabled && peeking) {
      clearEnterTimer();
      clearLeaveTimer();
      onClosePeek();
    }
  }, [peekEnabled, peeking, clearEnterTimer, clearLeaveTimer, onClosePeek]);

  // Clear timers on unmount.
  useEffect(() => () => {
    clearEnterTimer();
    clearLeaveTimer();
  }, [clearEnterTimer, clearLeaveTimer]);

  // Remove focus from any sidebar item before the off-screen overlay becomes inert.
  const isOverlayDesktop = !isMobile && !dockedOpen;
  useEffect(() => {
    if (!isOverlayDesktop || peeking) return;
    const aside = asideRef.current;
    const active = document.activeElement;
    if (aside && active instanceof HTMLElement && aside.contains(active)) {
      active.blur();
    }
  }, [isOverlayDesktop, peeking]);

  const scheduleEnter = useCallback(
    (clientX: number, clientY: number, buttons: number) => {
      lastPointerXRef.current = clientX;
      const topOffset = asideRef.current?.getBoundingClientRect().top ?? 0;
      if (!isPointerInEdgeZone({ clientX, clientY, topOffset })) {
        requireEdgeExitRef.current = false;
        clearEnterTimer();
        return;
      }
      if (requireEdgeExitRef.current) return;
      if (!shouldStartSidebarPeek({ buttons, isResizing: isResizingRef.current, hasBlockingOverlay: hasBlockingOverlay() })) {
        clearEnterTimer();
        return;
      }
      if (enterTimerRef.current !== null) return;
      enterTimerRef.current = window.setTimeout(() => {
        enterTimerRef.current = null;
        if (
          !requireEdgeExitRef.current &&
          shouldStartSidebarPeek({ buttons: 0, isResizing: isResizingRef.current, hasBlockingOverlay: hasBlockingOverlay() })
        ) {
          onOpenPeek();
        }
      }, PEEK_ENTER_DELAY_MS);
    },
    [clearEnterTimer, onOpenPeek],
  );

  // Window-level left-edge detection while folded and hover-reveal is enabled.
  useEffect(() => {
    if (!peekEnabled || peeking) {
      clearEnterTimer();
      return;
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      scheduleEnter(e.clientX, e.clientY, e.buttons);
    };
    const onPointerDown = () => clearEnterTimer();
    const onMouseLeaveDoc = () => {
      requireEdgeExitRef.current = false;
      clearEnterTimer();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, true);
    document.documentElement.addEventListener("mouseleave", onMouseLeaveDoc);
    return () => {
      clearEnterTimer();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown, true);
      document.documentElement.removeEventListener("mouseleave", onMouseLeaveDoc);
    };
  }, [peekEnabled, peeking, scheduleEnter, clearEnterTimer]);

  // While peeking: stay open inside sidebar + buffer, close gracefully on leave, and dismiss
  // immediately on Escape (before Focus Mode's Escape), outside click, Quick Open, or blur.
  useEffect(() => {
    if (!peeking) {
      clearLeaveTimer();
      return;
    }
    const scheduleLeave = () => {
      if (leaveTimerRef.current !== null) return;
      leaveTimerRef.current = window.setTimeout(() => {
        leaveTimerRef.current = null;
        onClosePeek();
      }, PEEK_LEAVE_DELAY_MS);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      lastPointerXRef.current = e.clientX;
      const topOffset = asideRef.current?.getBoundingClientRect().top ?? 0;
      if (
        isPointerInPeekBounds({
          clientX: e.clientX,
          clientY: e.clientY,
          sidebarWidth: widthRef.current,
          topOffset,
        })
      ) {
        clearLeaveTimer();
      } else {
        scheduleLeave();
      }
    };
    const onMouseLeaveDoc = () => scheduleLeave();
    const onPointerDown = (e: PointerEvent) => {
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) {
        clearLeaveTimer();
        onClosePeek();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requireEdgeExitRef.current = true;
      clearLeaveTimer();
      onClosePeek();
    };
    const onDismissNow = () => {
      clearLeaveTimer();
      onClosePeek();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onMouseLeaveDoc);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onDismissNow);
    window.addEventListener("open-quick-search", onDismissNow);
    return () => {
      clearLeaveTimer();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onMouseLeaveDoc);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onDismissNow);
      window.removeEventListener("open-quick-search", onDismissNow);
    };
  }, [peeking, clearLeaveTimer, onClosePeek]);

  // Only pass overlay overrides while collapsed on desktop — passing `{ style: undefined }`
  // would clobber kumo's own inline `style={{ width }}` because kumo spreads `...rest` after it.
  const overlayProps = isOverlayDesktop
    ? {
        style: { width: 0 } as React.CSSProperties,
        inert: !peeking,
        contentClassName: peeking
          ? "sidebar-peek-panel sidebar-peek-open border-r-0! ring-1 ring-kumo-line shadow-xl"
          : "sidebar-peek-panel sidebar-peek-closed",
      }
    : {};

  return (
    <>
      {peekEnabled && !peeking && (
        <div
          aria-hidden="true"
          data-sidebar-edge-trigger=""
          className="group/edge absolute inset-y-0 left-0 z-[45] w-3"
          onPointerEnter={(e) => {
            if (e.pointerType === "touch") return;
            scheduleEnter(e.clientX, e.clientY, e.buttons);
          }}
          onClick={() => {
            if (!shouldStartSidebarPeek({ buttons: 0, isResizing: isResizingRef.current, hasBlockingOverlay: hasBlockingOverlay() })) return;
            requireEdgeExitRef.current = false;
            clearEnterTimer();
            onOpenPeek();
          }}
        >
          <span className="pointer-events-none absolute left-0 top-1/2 h-14 w-1 -translate-y-1/2 rounded-r-full bg-kumo-line/80 group-hover/edge:w-1.5 group-hover/edge:bg-kumo-brand/70" />
        </div>
      )}
      <Sidebar ref={asideRef} {...overlayProps}>
        {children}
      </Sidebar>
    </>
  );
}

function RootComponent() {
  const navigate = useNavigate();
  // The update banner's height. kumo fixes the desktop sidebar to the top of the window, so the
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const root = document.documentElement;
    // The overlay title bar strip is part of the offset: the fixed sidebar starts below
    // strip + banner, not just below the banner.
    const apply = () =>
      root.style.setProperty("--update-banner-h", `calc(var(--onesist-titlebar, 0px) + ${el.offsetHeight}px)`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--update-banner-h", "calc(var(--onesist-titlebar, 0px) + 0px)");
    };
  }, []);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  // Controlled, so the project's chat and auto-hide can fold it cleanly.
  const choiceOpen = useSidebarOpen();
  const autoHide = useSidebarAutoHide();
  // Focus mode owns the sidebar while it is on: folded (auto-hide) unless pinned, and never
  // written to the remembered choices, so leaving the mode restores the workspace as it was.
  const focusActive = useFocusMode();
  const focusPinned = useFocusSidebarPinned();
  const dockedOpen = focusActive ? focusPinned : choiceOpen;
  const isSidebarPinned = focusActive ? focusPinned : !autoHide;

  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(any-pointer: fine)");
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [peeking, setPeeking] = useState(false);
  const [exitingPeek, setExitingPeek] = useState(false);
  const exitAnimTimerRef = useRef<number | null>(null);
  const prevVisibleRef = useRef(dockedOpen || peeking);

  // Keep kumo's expanded internal layout intact while the overlay slides off-screen so labels
  // and header items do not collapse mid-animation.
  useEffect(() => {
    const nowVisible = dockedOpen || peeking;
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = nowVisible;

    if (exitAnimTimerRef.current !== null) {
      window.clearTimeout(exitAnimTimerRef.current);
      exitAnimTimerRef.current = null;
    }

    if (nowVisible) {
      setExitingPeek(false);
      return;
    }

    if (wasVisible && typeof window !== "undefined") {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isDesktopWidth = window.innerWidth >= 768;
      if (!reducedMotion && isDesktopWidth) {
        setExitingPeek(true);
        exitAnimTimerRef.current = window.setTimeout(() => {
          exitAnimTimerRef.current = null;
          setExitingPeek(false);
        }, PEEK_EXIT_ANIM_MS);
      }
    }
  }, [dockedOpen, peeking]);

  useEffect(() => () => {
    if (exitAnimTimerRef.current !== null) window.clearTimeout(exitAnimTimerRef.current);
  }, []);

  const openPeek = useCallback(() => setPeeking(true), []);
  const closePeek = useCallback(() => setPeeking(false), []);

  const setSidebar = useCallback((next: boolean) => {
    if (!next && peeking) {
      setPeeking(false);
      return;
    }
    if (isFocusMode()) setFocusSidebarPinned(next);
    else setSidebarOpen(next);
    if (next) setPeeking(false);
  }, [peeking]);

  const toggleSidebar = useCallback(() => {
    if (isFocusMode()) {
      setFocusSidebarPinned(!isFocusSidebarPinned());
      setPeeking(false);
      return;
    }
    // Docked open -> switch to auto-hide (hover left edge to reveal);
    // hidden/auto-hide -> pin and dock open. Matches web header toggle on macOS desktop too.
    if (getSidebarOpen()) setSidebarAutoHide(true);
    else setSidebarAutoHide(false);
    setPeeking(false);
  }, []);

  const handleHeaderCollapse = useCallback(() => {
    if (peeking) {
      setPeeking(false);
      return;
    }
    if (isFocusMode()) setFocusSidebarPinned(false);
    else setSidebarAutoHide(true);
  }, [peeking]);

  const sidebarProviderOpen = dockedOpen || peeking || exitingPeek;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const targetEditable = !!target?.closest?.(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], .cm-editor, .ProseMirror, [role="textbox"]',
      );
      if (!isSidebarToggleKey({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, targetEditable })) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  const location = useLocation();
  const pathname = location.pathname;
  const isDashboardActive = pathname === "/";

  // Desktop notifications for finished/blocked chat runs (FR-B16). Lives at the
  // root so a run started in one project still reaches the user while they are
  // working somewhere else (or with the window hidden to the tray).
  useRunNotifications();

  // Client-side failures go into the server log, which is the only log a local
  // app has (see the module comment).
  useClientErrorReporting();

  // A file dropped outside a drop zone must not replace the app with the
  // dropped file — the desktop shell no longer swallows OS drags (see
  // `src/lib/file-drop.ts`).
  useGlobalDropGuard();

  useEffect(() => {
    const fetchProjects = () => {
      fetch("/api/projects", { cache: "no-store" })
        .then((r) => r.json())
        .then((data: { id: string; name: string }[]) => {
          if (Array.isArray(data)) setProjects(data);
        })
        .catch(() => {});
    };

    fetchProjects();
    window.addEventListener("projects-updated", fetchProjects);
    return () => window.removeEventListener("projects-updated", fetchProjects);
  }, []);

  // Fase 5E: a tab opened in its own window shows only the tab — no sidebar, tab bar or dock.
  if (pathname.startsWith("/pane/")) {
    return (
      <html suppressHydrationWarning data-mode={getStoredTheme() === "dark" ? "dark" : undefined} className="h-svh overflow-hidden">
        <head><HeadContent /></head>
        <body suppressHydrationWarning className="flex flex-col h-svh overflow-hidden bg-kumo-recessed text-kumo-default antialiased">
          <Outlet />
          <Scripts />
        </body>
      </html>
    );
  }

  return (
    <html
      suppressHydrationWarning
      data-mode={getStoredTheme() === "dark" ? "dark" : undefined}
      className="h-svh overflow-hidden"
      style={IS_MAC_MAIN ? ({ "--onesist-titlebar": `${TITLEBAR_H}px` } as React.CSSProperties) : undefined}
    >
      <head><HeadContent /></head>
      <body
        suppressHydrationWarning
        className="flex flex-col h-svh overflow-hidden bg-kumo-recessed text-kumo-default antialiased"
        style={IS_MAC_MAIN ? { paddingTop: TITLEBAR_H } : undefined}
      >
        {/* Topmost chrome layer: above the sidebar (z-40/z-50), the floating toggle (z-50)
            and the macOS title bar strip (z-[70]). The ordering matters, not just spacing —
            any logo drawn above this strip covers the banner's own text. */}
        <div ref={bannerRef} className="relative z-[100] shrink-0">
          <UpdateBanner />
        </div>
        <InstanceWatch />
        <QuickOpenModal />
        {/* The overlay title bar strip (macOS main window): dragging moves the window,
            double-clicking zooms it. One slot next to the traffic lights switches between
            Pin (docked open) and Auto-hide (hover left edge to reveal), matching the web toggle. */}
        {IS_MAC_MAIN && (
          <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-[70]" style={{ height: TITLEBAR_H }}>
            {!focusActive && (
              <button
                type="button"
                onClick={toggleSidebar}
                title={
                  dockedOpen
                    ? "Auto-hide sidebar (Ctrl/⌘B): sembunyi otomatis dan muncul saat kursor di tepi kiri"
                    : "Pin sidebar (Ctrl/⌘B): tampilkan sidebar tetap terbuka"
                }
                aria-label="Pin sidebar"
                aria-pressed={dockedOpen}
                className="group/logo absolute left-[76px] top-1/2 -translate-y-1/2 flex items-center justify-center size-7 rounded-md text-kumo-subtle hover:bg-kumo-elevated/60 hover:text-kumo-default cursor-pointer"
              >
                {dockedOpen ? (
                  <SidebarPanelIcon pinned />
                ) : (
                  <>
                    <img
                      src="/logo-icon.png"
                      alt="Onesist"
                      className="h-5 w-5 object-contain transition-opacity group-hover/logo:opacity-0"
                    />
                    <span className="absolute flex items-center justify-center opacity-0 transition-opacity group-hover/logo:opacity-100">
                      <SidebarPanelIcon pinned={false} />
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
        {/* Floating logo, non-overlay windows only (web, Windows, secondary windows): hidden
            while auto-hide edge reveal is active on a fine pointer so it does not cover the
            top-left edge, and kept on touch/coarse pointers or manual collapse. */}
        {!dockedOpen && !IS_MAC_MAIN && !focusActive && !(autoHide && finePointer) && (
          <button
            type="button"
            onClick={() => setSidebar(true)}
            title="Tampilkan sidebar (Ctrl/⌘B)"
            aria-label="Tampilkan sidebar"
            className="fixed left-2 z-50 flex items-center justify-center size-8 rounded bg-kumo-elevated/80 border border-kumo-line hover:bg-kumo-elevated cursor-pointer"
            style={{ top: "calc(var(--update-banner-h, 0px) + 8px)" }}
          >
            <img src="/logo-icon.png" alt="" className="h-5 w-5 object-contain" />
          </button>
        )}
        <div className="flex flex-1 min-h-0">
          <Sidebar.Provider contained open={sidebarProviderOpen} onOpenChange={setSidebar} collapsible="offcanvas" resizable defaultWidth={220} minWidth={48} maxWidth={320} peekable={false} className="min-h-0 h-full w-full">
            <SidebarPersistence />
            <AppSidebarShell
              dockedOpen={dockedOpen}
              autoHide={autoHide}
              focusActive={focusActive}
              focusPinned={focusPinned}
              finePointer={finePointer}
              peeking={peeking}
              onOpenPeek={openPeek}
              onClosePeek={closePeek}
            >
              <AppSidebarHeader
                overlay={IS_MAC_MAIN}
                isPinned={isSidebarPinned}
                onPinToggle={toggleSidebar}
                onCollapseClick={handleHeaderCollapse}
              />
              <Sidebar.Content className="overflow-y-auto scrollbar-thin">
                <Sidebar.Group>
                  <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    <Sidebar.MenuButton
                      active={isDashboardActive}
                      icon={House}
                      tooltip="Dashboard"
                      onClick={(e) => {
                        if (peeking) closePeek();
                        if (e.ctrlKey || e.metaKey || e.button === 1) {
                          e.preventDefault();
                          void openProjectWindow("/");
                        } else {
                          navigate({ to: "/", from: "/" });
                        }
                      }}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          if (peeking) closePeek();
                          void openProjectWindow("/");
                        }
                      }}
                    >
                      Dashboard
                    </Sidebar.MenuButton>
                    <Sidebar.MenuButton
                      onClick={() => {
                        if (peeking) closePeek();
                        window.dispatchEvent(new CustomEvent("open-quick-search"));
                      }}
                      icon={MagnifyingGlass}
                      tooltip="Quick Open (⌘P)"
                    >
                      <span className="flex items-center justify-between w-full">
                        <span>Quick Open</span>
                        <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-kumo-elevated text-kumo-subtle border border-kumo-line/60">⌘P</kbd>
                      </span>
                    </Sidebar.MenuButton>
                    <Sidebar.MenuButton
                      active={pathname === "/settings"}
                      icon={Gear}
                      tooltip="Settings"
                      onClick={(e) => {
                        if (peeking) closePeek();
                        if (e.ctrlKey || e.metaKey || e.button === 1) {
                          e.preventDefault();
                          void openProjectWindow("/settings");
                        } else {
                          navigate({ to: "/settings", from: "/" });
                        }
                      }}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          if (peeking) closePeek();
                          void openProjectWindow("/settings");
                        }
                      }}
                    >
                      Settings
                    </Sidebar.MenuButton>
                  </Sidebar.Menu>
                </Sidebar.Group>
                <Sidebar.Group>
                  <Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    {projects.length === 0 ? (
                      <Sidebar.MenuButton disabled icon={Folder} tooltip="No projects">No projects</Sidebar.MenuButton>
                    ) : projects.map((p) => (
                      <Sidebar.MenuButton
                        key={p.id}
                        active={pathname.startsWith(`/projects/${p.id}`)}
                        icon={Folder}
                        tooltip={p.name}
                        onClick={(e) => {
                          if (peeking) closePeek();
                          if (e.ctrlKey || e.metaKey || e.button === 1) {
                            e.preventDefault();
                            void openProjectWindow(`/projects/${p.id}`);
                          } else {
                            let tabRoute: string = "/projects/$id";
                            try {
                              const savedTab = window.localStorage.getItem(`onesist:project:${p.id}:last-tab`);
                              if (savedTab && savedTab !== "overview") tabRoute = `/projects/$id/${savedTab}`;
                            } catch {}
                            navigate({ to: tabRoute as any, params: { id: p.id }, from: "/" });
                          }
                        }}
                        onAuxClick={(e) => {
                          if (e.button === 1) {
                            e.preventDefault();
                            if (peeking) closePeek();
                            void openProjectWindow(`/projects/${p.id}`);
                          }
                        }}
                      >
                        {p.name}
                      </Sidebar.MenuButton>
                    ))}
                  </Sidebar.Menu>
                </Sidebar.Group>
              </Sidebar.Content>
              <AppSidebarFooter />
            </AppSidebarShell>
            <main data-app-main className={`flex-1 overflow-y-auto min-w-0 ${focusActive ? "p-2" : "p-5"}`}><div className={`mx-auto h-full w-full ${focusActive ? "" : "max-w-[1600px]"}`}><Outlet /></div></main>
            {/* The right dock: chat and terminal panels portal in here (see RightDock), so they run the
                full window height at the right edge, outside the page's padding and centred column. */}
            <div id={RIGHT_DOCK_ID} className="flex h-full shrink-0" />
          </Sidebar.Provider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
