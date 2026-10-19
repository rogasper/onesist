import { LINKS, WORKSPACE_POINTS } from "../content";

export function Workspace() {
  return (
    <section id="features" className="mx-auto max-w-[1160px] px-4 sm:px-6 py-14 border-t border-zinc-200/60">
      <div className="text-xs font-mono tracking-wide text-[#6d7cff]">Workspace</div>
      <h2 className="mt-2 text-[24px] md:text-[28px] font-semibold leading-tight text-zinc-900">Made for long documents and many tabs.</h2>
      <p className="mt-2 text-sm text-zinc-500">
        FSD editor, ERD studio, API spec, tasks, RTM and SIT in one desktop app. Full guide →{" "}
        <a href={LINKS.docs} target="_blank" rel="noreferrer" className="text-[#6d7cff] hover:underline">docs/</a>
      </p>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {WORKSPACE_POINTS.map((p) => (
          <div key={p.title} className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="text-[15px] font-semibold text-zinc-900">{p.title}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-500">{p.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
