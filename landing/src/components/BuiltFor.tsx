import { AUDIENCE } from "../content";

export function BuiltFor() {
  return (
    <section className="mx-auto max-w-[1160px] px-4 sm:px-6 py-12">
      <div className="text-xs font-mono tracking-wide text-[#6d7cff]">Built for</div>
      <h2 className="mt-2 text-[24px] md:text-[28px] font-semibold leading-tight text-zinc-900">Everyone who lives in the requirements.</h2>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {AUDIENCE.map((a) => (
          <div key={a.title} className="glass specular relative rounded-[20px] p-5">
            <div className="text-[15px] font-semibold text-zinc-900">{a.title}</div>
            <div className="mt-2 text-sm text-zinc-500">{a.line}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
