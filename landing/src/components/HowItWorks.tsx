import { PIPELINE } from "../content";

export function HowItWorks() {
  const steps = PIPELINE.filter((p) => !p.soon);
  const soon = PIPELINE.filter((p) => p.soon);
  return (
    <section id="how" className="mx-auto max-w-[1160px] px-4 sm:px-6 py-12 border-t border-zinc-200/60">
      <div className="text-xs font-mono tracking-wide text-[#6d7cff]">How it works</div>
      <h2 className="mt-2 text-[24px] md:text-[28px] font-semibold leading-tight text-zinc-900">One spec in. Every artifact out.</h2>
      <p className="mt-2 text-sm text-zinc-500 max-w-[620px]">Each step writes a real file in your project. Nothing is hidden in a database you cannot read.</p>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <span key={s.step} className="inline-flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-full border ${s.step === "Handoff" ? "bg-[#6d7cff]/10 text-[#4f5bd5] border-[#6d7cff]/25" : "bg-white text-zinc-700 border-zinc-200"}`}>{s.step}</span>
            {i < steps.length - 1 && <span className="text-zinc-300">→</span>}
          </span>
        ))}
        {soon.map((s) => (
          <span key={s.step} className="inline-flex items-center gap-2">
            <span className="text-zinc-300">→</span>
            <span className="px-3 py-1.5 rounded-full border border-dashed border-amber-300 bg-amber-50 text-amber-800">{s.step} · coming soon</span>
          </span>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <div key={s.step} className="relative rounded-2xl border border-zinc-200 bg-white p-5 overflow-hidden hover:shadow-md transition-shadow">
            <div className="absolute -right-3 -top-4 text-[56px] font-bold text-zinc-100 select-none">{String(i + 1).padStart(2, "0")}</div>
            <div className="relative text-sm font-semibold text-zinc-900">{s.step}</div>
            <div className="relative mt-3 rounded-xl border border-zinc-100 bg-zinc-50 overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-mono text-zinc-500 border-b border-zinc-100 bg-white flex items-center justify-between gap-2">
                <span className="truncate">{s.file}</span>
                <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" />
              </div>
              <pre className="p-3 text-[11px] leading-4 font-mono text-zinc-700 whitespace-pre-wrap">{s.snippet}</pre>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
