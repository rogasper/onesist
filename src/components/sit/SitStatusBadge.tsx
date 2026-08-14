import { CheckCircle, XCircle, CircleDashed, Clock, CaretRight, ArrowClockwise, Pause, Circle } from "@phosphor-icons/react";

/** Semantic status color + label for the SIT status/progress/type vocabulary. */
const STATUS_STYLES: Record<string, { label: string; cls: string; Icon: typeof Circle }> = {
  Pass: { label: "Pass", cls: "bg-green-500/12 text-green-400 ring-green-500/30", Icon: CheckCircle },
  Fail: { label: "Fail", cls: "bg-red-500/12 text-red-400 ring-red-500/30", Icon: XCircle },
  "Not started": { label: "Not started", cls: "bg-kumo-elevated text-kumo-subtle ring-kumo-line/60", Icon: CircleDashed },
  "Not tested": { label: "Not tested", cls: "bg-kumo-elevated text-kumo-subtle ring-kumo-line/60", Icon: CircleDashed },
  Hold: { label: "Hold", cls: "bg-amber-500/12 text-amber-400 ring-amber-500/30", Icon: Pause },
  "Re Open": { label: "Re Open", cls: "bg-amber-500/12 text-amber-400 ring-amber-500/30", Icon: ArrowClockwise },
  Stopper: { label: "Stopper", cls: "bg-red-500/15 text-red-400 ring-red-500/40", Icon: Pause },
  Takeout: { label: "Takeout", cls: "bg-red-500/15 text-red-400 ring-red-500/40", Icon: Circle },
};

export function SitStatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: "bg-kumo-elevated text-kumo-subtle ring-kumo-line/60", Icon: Clock };
  const { label, cls, Icon } = s;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ring-1 ${cls}`}>
      <Icon size={10} weight="fill" />
      {label}
    </span>
  );
}

export function SitTypeBadge({ type }: { type: "Positive" | "Negative" }) {
  const positive = type === "Positive";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ring-1 ${
      positive ? "bg-green-500/10 text-green-400 ring-green-500/25" : "bg-red-500/10 text-red-400 ring-red-500/25"
    }`}>
      <CaretRight size={9} className={positive ? "" : "rotate-90"} />
      {type}
    </span>
  );
}

/** Tiny "dot" status used in table cells / tight rows. */
export function SitStatusDot({ status }: { status: string }) {
  const color = /pass/i.test(status) ? "bg-green-400"
    : /fail/i.test(status) || /stopper|takeout/i.test(status) ? "bg-red-400"
    : /hold|re.?open/i.test(status) ? "bg-amber-400"
    : "bg-kumo-line";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />;
}
