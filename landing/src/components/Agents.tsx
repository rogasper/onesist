import { AGENT_POINTS, AGENTS, API_PROVIDERS } from "../content";

export function Agents() {
  return (
    <section id="agents" className="mx-auto max-w-[1160px] px-4 sm:px-6 py-14 border-t border-zinc-200/60">
      <div className="text-xs font-mono tracking-wide text-[#6d7cff]">Agents · new in v0.4.0</div>
      <h2 className="mt-2 text-[24px] md:text-[28px] font-semibold leading-tight text-zinc-900">Bring the agent you already use.</h2>
      <p className="mt-2 text-sm text-zinc-500 max-w-[640px]">Onesist runs the CLI you have installed, in your project folder, and asks you before anything is written.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {AGENTS.map((a) => (
          <span key={a} className="text-sm px-3.5 py-1.5 rounded-full bg-[#6d7cff]/10 text-[#4f5bd5] border border-[#6d7cff]/25 font-medium">{a}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>Or an API key:</span>
        {API_PROVIDERS.map((p) => (
          <span key={p} className="px-2.5 py-1 rounded-full bg-white border border-zinc-200">{p}</span>
        ))}
        <span>and more</span>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {AGENT_POINTS.map((p) => (
          <div key={p.title} className="glass specular relative rounded-[20px] p-6">
            <div className="text-[15px] font-semibold text-zinc-900">{p.title}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-500">{p.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
