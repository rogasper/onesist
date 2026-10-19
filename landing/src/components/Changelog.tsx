import { LINKS } from "../content";
import { useChangelog } from "../lib/use-changelog";
import { track } from "../track";

export function Changelog() {
  const { entries, live } = useChangelog();
  return (
    <section id="changelog" className="mx-auto max-w-[1160px] px-4 sm:px-6 py-14 border-t border-zinc-200/60">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono tracking-wide text-[#6d7cff]">
            Changelog {live && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">live</span>}
          </div>
          <h2 className="mt-2 text-[22px] font-semibold text-zinc-900">Latest releases</h2>
        </div>
        <a href={LINKS.changelog} target="_blank" rel="noreferrer" onClick={() => track("changelog-full")} className="text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-full px-3 py-1.5 bg-white">
          View full changelog →
        </a>
      </div>
      <div className="mt-8 grid gap-3 max-w-[760px]">
        {entries.map((e) => (
          <a key={e.v} href={`${LINKS.releases}/tag/${e.v}`} target="_blank" rel="noreferrer" className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-300 hover:shadow-sm transition">
            <span className="shrink-0 text-xs font-mono px-2.5 py-1 rounded-full bg-zinc-900 text-white h-fit">{e.v}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-900">{e.t}</div>
              {e.d && <div className="text-sm text-zinc-500 mt-1 line-clamp-2">{e.d}</div>}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
