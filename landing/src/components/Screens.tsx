import { useEffect, useRef, useState } from "react";
import { SLIDES } from "../content";

const INTERVAL_MS = 3600;

export function Screens() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    timer.current = window.setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [paused, idx]);

  const go = (n: number) => setIdx((n + SLIDES.length) % SLIDES.length);

  return (
    <section id="screens" className="mx-auto max-w-[1160px] px-4 sm:px-6 py-14 border-t border-zinc-200/60">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono tracking-wide text-[#6d7cff]">Screens</div>
          <h2 className="mt-2 text-[22px] font-semibold text-zinc-900">The real app, v0.4.0</h2>
        </div>
        <span className="hidden md:inline text-xs text-zinc-400">Auto-play · hover to pause</span>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {SLIDES.map((s) => (
            <div key={s.file} className="min-w-full p-3 md:p-6">
              <div className="rounded-2xl bg-gradient-to-br from-[#6d7cff]/8 to-[#a78bfa]/8 border border-zinc-100 p-3 md:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-zinc-200 text-zinc-700 shadow-sm">{s.label}</span>
                  <span className="text-[15px] md:text-[17px] font-semibold text-zinc-900">{s.title}</span>
                </div>
                <div className="mt-1 text-xs md:text-sm text-zinc-500">{s.desc}</div>
                <div className="mt-4 rounded-[14px] overflow-hidden border border-zinc-200/70 bg-white">
                  {failed[s.file] ? (
                    <div className="h-[260px] flex items-center justify-center bg-zinc-50 text-sm text-zinc-400">Screenshot unavailable</div>
                  ) : (
                    <img src={`/screenshots/${s.file}`} alt={s.title} className="w-full h-auto max-h-[620px] object-contain block bg-white" loading="lazy" decoding="async" onError={() => setFailed((f) => ({ ...f, [s.file]: true }))} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button aria-label="Previous screen" onClick={() => go(idx - 1)} className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow flex items-center justify-center text-zinc-600 hover:bg-zinc-50">‹</button>
        <button aria-label="Next screen" onClick={() => go(idx + 1)} className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow flex items-center justify-center text-zinc-600 hover:bg-zinc-50">›</button>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {SLIDES.map((s, i) => (
            <button key={s.file} aria-label={`Show ${s.title}`} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-zinc-900" : "w-1.5 bg-zinc-300"}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
