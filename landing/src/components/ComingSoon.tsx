import { COMING_SOON } from "../content";

export function ComingSoon() {
  return (
    <section className="mx-auto max-w-[1160px] px-4 sm:px-6 py-8">
      <div className="rounded-[20px] border border-dashed border-amber-300 bg-amber-50/70 p-6 md:p-7 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        <span className="self-start shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">Coming soon</span>
        <div>
          <div className="text-[15px] font-semibold text-zinc-900">{COMING_SOON.title}</div>
          <div className="mt-1 text-sm text-zinc-600">{COMING_SOON.body}</div>
        </div>
      </div>
    </section>
  );
}
