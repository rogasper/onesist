import { useEffect, useState, useRef } from "react";

const GH_REPO = "https://github.com/rogasper/onesist";
const GH_RELEASES = `${GH_REPO}/releases`;
const VERSION = "v0.1.37";

function track(name: string, data?: Record<string, string>) {
  try { (window as any).umami?.track(name, data); } catch {}
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-kumo-line/70 bg-kumo-base/70 backdrop-blur-xl">
      <div className="mx-auto max-w-[1160px] px-6 h-[56px] flex items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <span className="rounded bg-kumo-brand px-1.5 py-0.5 text-xs font-bold text-white">OS</span>
          <span className="text-sm font-semibold tracking-wide text-kumo-default">ONESIST</span>
          <span className="hidden sm:inline text-xs text-kumo-subtle ml-1">Planner, not executor</span>
        </a>
        <div className="hidden md:flex items-center gap-6 text-sm text-kumo-subtle">
          <a href="#features" className="hover:text-kumo-default transition">Features</a>
          <a href="#how" className="hover:text-kumo-default transition">How it works</a>
          <a href="#screens" className="hover:text-kumo-default transition">Screens</a>
          <a href="#changelog" className="hover:text-kumo-default transition">Changelog</a>
          <a href={GH_REPO} target="_blank" rel="noreferrer" className="hover:text-kumo-default transition">GitHub</a>
        </div>
        <div className="flex items-center gap-2">
          <a href={GH_REPO} target="_blank" rel="noreferrer" onClick={() => track("nav-github")} className="hidden sm:inline-flex text-xs px-3 py-1.5 rounded-full border border-kumo-line bg-kumo-base text-kumo-default hover:bg-kumo-tint transition">GitHub</a>
          <a href="#download" onClick={() => track("nav-download")} className="text-xs font-semibold px-4 py-1.5 rounded-full bg-kumo-brand text-white hover:opacity-90 transition shadow-sm">Download</a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-kumo-recessed">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-kumo-elevated via-kumo-recessed to-kumo-base" />
      <div className="absolute -top-32 -left-32 w-[560px] h-[560px] rounded-full bg-kumo-brand/10 blur-[90px] -z-10" />
      <div className="absolute top-12 -right-24 w-[520px] h-[520px] rounded-full bg-kumo-brand/5 blur-[90px] -z-10" />
      <div className="absolute top-40 left-1/2 w-[700px] h-[300px] -translate-x-1/2 rounded-full bg-kumo-brand/5 blur-[80px] -z-10" />
      <div className="mx-auto max-w-[1160px] px-6 pt-12 pb-8 md:pt-16 md:pb-12">
        <div className="grid md:grid-cols-[1.12fr_0.88fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] tracking-wide font-medium px-3 py-1 rounded-full bg-kumo-base border border-kumo-line text-kumo-subtle shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              v{VERSION.replace("v", "")} • Desktop for macOS & Windows • MIT
            </div>
            <h1 className="mt-5 text-[34px] md:text-[48px] font-semibold leading-[0.95] tracking-tight text-kumo-strong">
              Planner, <span className="text-kumo-subtle">not executor.</span>
              <br />
              FSD to handoff in one flow.
            </h1>
            <p className="mt-4 text-[15px] leading-6 text-kumo-subtle max-w-[560px]">
              Onesist turns Functional Specs into <span className="text-kumo-strong font-medium">ERD, API specs, tasks</span> and agentic handoff bundles. One task = one agent iteration — the agent executes, you review.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#download" onClick={() => track("hero-download")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-kumo-brand text-white text-sm font-semibold hover:opacity-90 transition shadow-md">Download Desktop <span className="text-white/80 text-xs">macOS • Windows</span></a>
              <a href={GH_REPO} target="_blank" rel="noreferrer" onClick={() => track("hero-github")} className="inline-flex items-center px-5 py-2.5 rounded-full bg-kumo-base border border-kumo-line text-kumo-default text-sm font-medium hover:bg-kumo-tint transition shadow-sm">View on GitHub</a>
              <a href="#changelog" className="inline-flex items-center px-5 py-2.5 rounded-full border border-kumo-line text-kumo-subtle text-sm hover:bg-kumo-tint transition">Changelog</a>
            </div>
            <div className="mt-6 flex flex-wrap gap-4 text-xs text-kumo-subtle">
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-kumo-line" /> Tauri desktop</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-kumo-line" /> Offline-first • SQLite</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-kumo-line" /> No vendor lock-in</span>
            </div>
          </div>

          <div className="relative">
            <div className="glass-strong specular relative rounded-[24px] p-3 md:p-4 animate-float">
              <div className="rounded-[16px] overflow-hidden border border-kumo-line bg-kumo-base">
                <div className="h-8 flex items-center gap-1.5 px-3 border-b border-kumo-line/60 bg-kumo-elevated/80">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-3 text-xs text-kumo-subtle">Onesist — FSD Analyzer</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <span className="text-[10px] px-2 py-1 rounded-full bg-kumo-brand/10 text-kumo-brand border border-kumo-brand/20">FSD</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-kumo-elevated text-kumo-subtle border border-kumo-line">Spec</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-kumo-elevated text-kumo-subtle border border-kumo-line">ERD</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-kumo-elevated text-kumo-subtle border border-kumo-line">Task</span>
                  </div>
                  <div className="h-20 rounded-xl border border-kumo-line bg-kumo-elevated p-3">
                    <div className="h-2 w-3/4 rounded bg-kumo-fill" />
                    <div className="mt-2 h-2 w-1/2 rounded bg-kumo-fill/60" />
                    <div className="mt-4 flex gap-2">
                      <span className="h-6 w-20 rounded-full bg-kumo-contrast text-kumo-base text-[10px] flex items-center justify-center">Generate</span>
                      <span className="h-6 w-16 rounded-full bg-kumo-base border border-kumo-line" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-xl bg-kumo-base border border-kumo-line p-2">
                      <div className="h-2 w-10 rounded bg-kumo-fill" />
                      <div className="mt-2 h-6 rounded bg-kumo-brand/10 border border-kumo-brand/15" />
                    </div>
                    <div className="h-16 rounded-xl bg-kumo-base border border-kumo-line/60 p-2">
                      <div className="h-2 w-10 rounded bg-kumo-fill" />
                      <div className="mt-2 h-6 rounded bg-kumo-elevated border border-kumo-line/60" />
                    </div>
                    <div className="h-16 rounded-xl bg-kumo-base border border-kumo-line/60 p-2">
                      <div className="h-2 w-10 rounded bg-kumo-fill" />
                      <div className="mt-2 h-6 rounded bg-kumo-elevated border border-kumo-line/60" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-kumo-subtle">
                <span className="font-mono">output/task/tasks.json + prompts/</span>
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Handoff ready</span>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 hidden md:block w-28 h-28 rounded-2xl glass rotate-3 p-3">
              <div className="text-[10px] text-kumo-subtle">Story Points</div>
              <div className="text-lg font-semibold text-kumo-strong mt-1">1 SP = 4h</div>
              <div className="mt-2 h-1.5 rounded-full bg-kumo-fill overflow-hidden"><div className="h-full w-[68%] bg-kumo-brand" /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { k: "FSD Analyzer", d: "Parse FSD, gap analysis vs MASTER_ERD / MASTER_SPEC, generate per-page artifacts with folder-per-page.", t: "input/fsd → output/*" },
    { k: "ERD + DBML", d: "Tables, relations, indexes with DBML for dbdiagram.io. Graphviz layout, drift detection.", t: "output/erd/<module>/" },
    { k: "Spec + OpenAPI", d: "Endpoint tables, auth, pagination. Consolidate into openapi.yaml with x-status / x-phase.", t: "output/spec/openapi.yaml" },
    { k: "Agentic Tasks", d: "12-row summary + Context + Given-When-Then AC. tasks.json + prompts for external agents.", t: "output/task/<module>/" },
  ];
  return (
    <section id="features" className="mx-auto max-w-[1160px] px-6 py-12">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-kumo-strong">Everything to plan — nothing to execute</h2>
        <a href={GH_REPO} target="_blank" rel="noreferrer" className="text-xs text-kumo-subtle hover:text-kumo-strong">Docs →</a>
      </div>
      <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <div key={it.k} className="glass specular relative rounded-[20px] p-5">
            <div className="text-sm font-semibold text-kumo-strong">{it.k}</div>
            <div className="mt-2 text-sm leading-5 text-kumo-subtle">{it.d}</div>
            <div className="mt-4 inline-flex text-[11px] font-mono px-2 py-1 rounded-full bg-kumo-contrast text-kumo-base">{it.t}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid md:grid-cols-3 gap-4">
        <div className="glass-subtle rounded-2xl p-4 flex items-center justify-between"><span className="text-sm text-kumo-default">RTM</span><span className="text-xs font-mono text-kumo-subtle">BR → FR → DS → TC</span></div>
        <div className="glass-subtle rounded-2xl p-4 flex items-center justify-between"><span className="text-sm text-kumo-default">SIT</span><span className="text-xs font-mono text-kumo-subtle">Chrome / Safari / iOS / Android</span></div>
        <div className="glass-subtle rounded-2xl p-4 flex items-center justify-between"><span className="text-sm text-kumo-default">Timeline</span><span className="text-xs font-mono text-kumo-subtle">Gantt • Critical path</span></div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Upload FSD", d: "Drop markdown → input/fsd. Live watcher + SSE updates.", ex: "input/fsd/fsd_checkout.md", code: "## Flow\n1. User adds to cart\n2. Checkout → POST /api/orders" },
    { n: "02", t: "Generate", d: "Run fsd-analyzer (claude/codex/agy). Writes per-page:", ex: "output/spec/checkout/spec.md", code: "POST /api/orders\n- Body: { items: [...] }\n- Resp: { orderId }" },
    { n: "03", t: "Review", d: "MDX + Mermaid + DBML. Edit in place.", ex: "output/erd/checkout/erd.dbml", code: "Table orders {\n  id pk\n  total decimal\n}" },
    { n: "04", t: "Handoff", d: "One click export → handoff zip for agents.", ex: "handoff-proj-v1.2.zip", code: "context/ + spec/ + erd/ + tasks.json\n+ prompts/CHK-01.prompt.md" },
  ];
  return (
    <section id="how" className="mx-auto max-w-[1160px] px-6 py-8">
      <h2 className="text-xl font-semibold text-kumo-strong">How it works — with outputs</h2>
      <p className="text-sm text-kumo-subtle mt-1">Each step produces a verifiable artifact. No black box.</p>
      <div className="mt-6 grid md:grid-cols-4 gap-4">
        {steps.map((s) => (
          <div key={s.n} className="relative rounded-2xl border border-kumo-line bg-kumo-base p-5 overflow-hidden hover:shadow-md transition-shadow">
            <div className="absolute -right-4 -top-4 text-[64px] font-bold text-kumo-fill select-none">{s.n}</div>
            <div className="text-xs font-mono text-kumo-brand">{s.n}</div>
            <div className="mt-1 text-sm font-semibold text-kumo-strong">{s.t}</div>
            <div className="mt-2 text-sm leading-5 text-kumo-subtle">{s.d}</div>
            <div className="mt-4 rounded-xl border border-kumo-line bg-kumo-elevated overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-mono text-kumo-subtle border-b border-kumo-line bg-kumo-base flex items-center justify-between">
                <span>{s.ex}</span><span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <pre className="p-3 text-[11px] leading-4 font-mono text-kumo-default whitespace-pre-wrap">{s.code}</pre>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Carousel() {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<number | null>(null);
  const slides = [
    { title: "Projects — Dashboard", desc: "Open / import / multi-root. 12/page, taller cards.", color: "from-kumo-elevated to-kumo-base", label: "Dashboard", file: "dashboard.png" },
    { title: "ERD Canvas", desc: "XYFlow + Dagre layout. DBML live, table editor.", color: "from-kumo-elevated to-kumo-base", label: "ERD", file: "erd.png" },
    { title: "Spec + OpenAPI", desc: "Endpoint cards, search, Swagger. Consolidate openapi.yaml.", color: "from-kumo-elevated to-kumo-base", label: "Spec", file: "spec.png" },
    { title: "Tasks — Agentic Handoff", desc: "Context + Given-When-Then + prompts. Export zip.", color: "from-kumo-elevated to-kumo-base", label: "Tasks", file: "tasks.png" },
    { title: "RTM & SIT", desc: "Trace BR→TC. SIT browser matrix (5 platforms).", color: "from-kumo-elevated to-kumo-base", label: "RTM/SIT", file: "tasks.png" },
  ];

  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 3200);
    timerRef.current = id;
    return () => window.clearInterval(id);
  }, [slides.length]);

  const go = (n: number) => {
    setIdx((n + slides.length) % slides.length);
    if (timerRef.current) window.clearInterval(timerRef.current);
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 3200);
    timerRef.current = id;
  };

  return (
    <section id="screens" className="mx-auto max-w-[1160px] px-6 py-8">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-kumo-strong">Screens — real outputs</h3>
        <span className="text-xs text-kumo-subtle">Auto-play • hover to pause</span>
      </div>
      <div className="relative mt-6 overflow-hidden rounded-[24px] border border-kumo-line bg-kumo-base shadow-sm"
           onMouseEnter={() => timerRef.current && window.clearInterval(timerRef.current)}
           onMouseLeave={() => {
             const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 3200);
             timerRef.current = id;
           }}>
        <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {slides.map((s) => (
            <div key={s.label} className="min-w-full p-6 md:p-8">
              <div className={`rounded-2xl bg-gradient-to-br ${s.color} border border-kumo-line p-6 md:p-8`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-1 rounded-full bg-kumo-base border border-kumo-line text-kumo-subtle">{s.label}</span>
                  <span className="text-xs text-kumo-subtle">Playwright capture</span>
                </div>
                <div className="mt-4 text-lg font-semibold text-kumo-strong">{s.title}</div>
                <div className="text-sm text-kumo-subtle">{s.desc}</div>
                <div className="mt-6 rounded-xl overflow-hidden border border-kumo-line bg-kumo-base shadow-sm">
                  <img src={`/screenshots/${(s as any).file}`} alt={s.title} className="w-full h-[360px] object-cover object-top" loading="lazy"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = "none";
                      const ph = el.nextElementSibling as HTMLElement | null;
                      if (ph) ph.style.display = "flex";
                    }}
                  />
                  <div className="hidden h-[360px] items-center justify-center bg-kumo-elevated text-sm text-kumo-subtle">Screenshot pending</div>
                </div>
                <div className="mt-4 flex gap-2 text-[11px] font-mono text-kumo-subtle">
                  <span className="px-2 py-1 rounded-full bg-kumo-base border border-kumo-line">output/{s.label.toLowerCase()}/…</span>
                  <span className="px-2 py-1 rounded-full bg-kumo-base border border-kumo-line">live file watcher</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => go(idx - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-kumo-base border border-kumo-line shadow flex items-center justify-center text-kumo-subtle hover:bg-kumo-tint">‹</button>
        <button onClick={() => go(idx + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-kumo-base border border-kumo-line shadow flex items-center justify-center text-kumo-subtle hover:bg-kumo-tint">›</button>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-kumo-contrast" : "w-1.5 bg-kumo-fill"}`} />
          ))}
        </div>
      </div>
      <div className="mt-3 text-xs text-kumo-subtle text-center">Tip: run <code className="px-1 py-0.5 bg-kumo-elevated rounded border border-kumo-line">bun run screenshots</code> to refresh captures from http://localhost:4321</div>
    </section>
  );
}

function Download() {
  const [os, setOs] = useState<"mac" | "win" | "unknown">("unknown");
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) setOs("mac");
    else if (ua.includes("win")) setOs("win");
  }, []);
  return (
    <section id="download" className="mx-auto max-w-[1160px] px-6 py-10">
      <div className="glass-strong specular relative rounded-[24px] p-6 md:p-8 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-lg font-semibold text-kumo-strong">Download Desktop</h3>
            <p className="mt-1 text-sm text-kumo-subtle">Free, MIT. Works offline. Your files stay local (SQLite + file watcher + SSE).</p>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-kumo-contrast text-kumo-base">Version {VERSION}</span>
              <a href={GH_RELEASES} target="_blank" rel="noreferrer" className="text-kumo-subtle hover:text-kumo-strong underline underline-offset-4">Releases</a>
              <span className="text-kumo-line">•</span>
              <a href={`${GH_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="text-kumo-subtle hover:text-kumo-strong underline underline-offset-4">Changelog</a>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={`${GH_RELEASES}/tag/${VERSION}`} target="_blank" rel="noreferrer" onClick={() => track("download-macos")} className={`px-5 py-2.5 rounded-full text-sm font-semibold transition shadow-sm ${os === "mac" ? "bg-kumo-brand text-white" : "bg-kumo-base border border-kumo-line text-kumo-default hover:bg-kumo-tint"}`}>macOS .dmg</a>
            <a href={`${GH_RELEASES}/tag/${VERSION}`} target="_blank" rel="noreferrer" onClick={() => track("download-windows")} className={`px-5 py-2.5 rounded-full text-sm font-semibold transition shadow-sm ${os === "win" ? "bg-kumo-brand text-white" : "bg-kumo-base border border-kumo-line text-kumo-default hover:bg-kumo-tint"}`}>Windows .msi</a>
            <a href={GH_REPO} target="_blank" rel="noreferrer" onClick={() => track("download-github")} className="px-5 py-2.5 rounded-full border border-kumo-line bg-kumo-base text-sm text-kumo-default hover:bg-kumo-tint transition">GitHub</a>
          </div>
        </div>
        <div className="mt-6 text-xs text-kumo-subtle">Detected: <span className="text-kumo-default">{os === "unknown" ? "Unknown OS — pick above" : os === "mac" ? "macOS" : "Windows"}</span> • If asset not yet published, open Releases and pick the latest.</div>
      </div>
    </section>
  );
}

function Changelog() {
  const entries = [
    { v: "v0.1.36", t: "Fix splash logo broken on Windows", d: "Remove broken /icons/icon.png, pure OS badge fallback." },
    { v: "v0.1.35", t: "Fix splash not showing", d: "First-open splash with always_on_top + marker .first_run_done." },
    { v: "v0.1.34", t: "CI: avoid macos-14 queue", d: "max-parallel 1 for free tier." },
    { v: "v0.1.33", t: "Sanitization + LICENSE MIT", d: "Remove confidential xlsx, placeholder Example Corp." },
    { v: "v0.1.32", t: "RTM delete + build fix", d: "Delete RTM cells + fix transparent build." },
  ];
  return (
    <section id="changelog" className="mx-auto max-w-[1160px] px-6 py-8">
      <div className="flex items-end justify-between">
        <h3 className="text-lg font-semibold text-kumo-strong">Changelog</h3>
        <a href={`${GH_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" onClick={() => track("changelog-full")} className="text-xs text-kumo-subtle hover:text-kumo-strong">View full changelog →</a>
      </div>
      <div className="mt-4 grid gap-3">
        {entries.map((e) => (
          <div key={e.v} className="flex gap-4 rounded-2xl border border-kumo-line bg-kumo-base p-4 hover:shadow-sm transition">
            <span className="shrink-0 text-xs font-mono px-2 py-1 rounded-full bg-kumo-contrast text-kumo-base h-fit">{e.v}</span>
            <div><div className="text-sm font-medium text-kumo-strong">{e.t}</div><div className="text-sm text-kumo-subtle">{e.d}</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-kumo-line mt-6 bg-kumo-base/60 backdrop-blur">
      <div className="mx-auto max-w-[1160px] px-6 py-8 flex flex-col md:flex-row gap-4 md:items-center justify-between text-sm">
        <div className="text-kumo-subtle">© 2026 rogasper.com • MIT • <a href={GH_REPO} className="hover:text-kumo-strong underline underline-offset-4">github.com/rogasper/onesist</a></div>
        <div className="text-xs text-kumo-subtle">Analytics by Umami • No cookies • <a href={GH_RELEASES} className="hover:text-kumo-strong">Releases</a></div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-kumo-recessed text-kumo-default antialiased selection:bg-kumo-brand/10">
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Carousel />
      <Download />
      <Changelog />
      <Footer />
    </div>
  );
}
