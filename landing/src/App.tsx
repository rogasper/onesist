import { useEffect, useState, useRef } from "react";

const GH_REPO = "https://github.com/rogasper/onesist";
const GH_RELEASES = `${GH_REPO}/releases`;
const VERSION = "v0.1.37";

function track(name: string, data?: Record<string, string>) {
  try { (window as any).umami?.track(name, data); } catch {}
}

// --- Nav ---
function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto max-w-[1160px] px-6 h-[56px] flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5">
          <img src="/logo-icon.png" alt="Onesist" className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold tracking-wide text-zinc-900">ONESIST</span>
          <span className="hidden sm:inline text-xs text-zinc-400 ml-1">Planner, not executor</span>
        </a>
        <div className="hidden md:flex items-center gap-6 text-sm text-zinc-500">
          <a href="#features" className="hover:text-zinc-900 transition">Features</a>
          <a href="#how" className="hover:text-zinc-900 transition">How it works</a>
          <a href="#screens" className="hover:text-zinc-900 transition">Screens</a>
          <a href="#changelog" className="hover:text-zinc-900 transition">Changelog</a>
          <a href={GH_REPO} target="_blank" rel="noreferrer" className="hover:text-zinc-900 transition">GitHub</a>
        </div>
        <div className="flex items-center gap-2">
          <a href={GH_REPO} target="_blank" rel="noreferrer" onClick={() => track("nav-github")} className="hidden sm:inline-flex text-xs px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition">GitHub</a>
          <a href="#download" onClick={() => track("nav-download")} className="text-xs font-semibold px-4 py-1.5 rounded-full bg-[#6d7cff] text-white hover:bg-[#5a6af0] transition shadow-sm">Download</a>
        </div>
      </div>
    </nav>
  );
}

// --- Hero ---
function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#fcfcfa]">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#f5f6ff] via-[#fcfcfa] to-white" />
      <div className="absolute -top-32 -left-32 w-[560px] h-[560px] rounded-full bg-[#6d7cff]/10 blur-[90px] -z-10" />
      <div className="absolute top-12 -right-24 w-[520px] h-[520px] rounded-full bg-[#ff8fa3]/10 blur-[90px] -z-10" />
      <div className="absolute top-40 left-1/2 w-[700px] h-[300px] -translate-x-1/2 rounded-full bg-[#a78bfa]/8 blur-[80px] -z-10" />
      <div className="mx-auto max-w-[1160px] px-6 pt-12 pb-8 md:pt-16 md:pb-12">
        <div className="grid md:grid-cols-[1.12fr_0.88fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] tracking-wide font-medium px-3 py-1 rounded-full bg-white border border-zinc-200 text-zinc-600 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              v{VERSION.replace("v", "")} • Desktop for macOS & Windows • MIT
            </div>
            <h1 className="mt-5 text-[34px] md:text-[48px] font-semibold leading-[0.95] tracking-tight text-zinc-900">
              Planner, <span className="text-zinc-400">not executor.</span>
              <br />
              FSD to handoff in one flow.
            </h1>
            <p className="mt-4 text-[15px] leading-6 text-zinc-500 max-w-[560px]">
              Onesist turns Functional Specs into <span className="text-zinc-900 font-medium">ERD, API specs, tasks</span> and agentic handoff bundles. One task = one agent iteration — the agent executes, you review.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#download" onClick={() => track("hero-download")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#6d7cff] text-white text-sm font-semibold hover:bg-[#5a6af0] transition shadow-md shadow-[#6d7cff]/15">Download Desktop <span className="text-white/80 text-xs">macOS • Windows</span></a>
              <a href={GH_REPO} target="_blank" rel="noreferrer" onClick={() => track("hero-github")} className="inline-flex items-center px-5 py-2.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition shadow-sm">View on GitHub</a>
              <a href="#changelog" className="inline-flex items-center px-5 py-2.5 rounded-full border border-zinc-200 text-zinc-600 text-sm hover:bg-zinc-50 transition">Changelog</a>
            </div>
            <div className="mt-6 flex flex-wrap gap-4 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-zinc-300" /> Tauri desktop</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-zinc-300" /> Offline-first • SQLite</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-zinc-300" /> No vendor lock-in</span>
            </div>
          </div>

          <div className="relative">
            <div className="glass-strong specular relative rounded-[24px] p-3 md:p-4 animate-float">
              <div className="rounded-[16px] overflow-hidden border border-zinc-200 bg-white">
                <div className="h-8 flex items-center gap-1.5 px-3 border-b border-zinc-100 bg-zinc-50/80">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-3 text-xs text-zinc-400">Onesist — FSD Analyzer</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <span className="text-[10px] px-2 py-1 rounded-full bg-[#6d7cff]/10 text-[#6d7cff] border border-[#6d7cff]/20">FSD</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-50 text-zinc-500 border border-zinc-200">Spec</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-50 text-zinc-500 border border-zinc-200">ERD</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-50 text-zinc-500 border border-zinc-200">Task</span>
                  </div>
                  <div className="h-20 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                    <div className="h-2 w-3/4 rounded bg-zinc-200" />
                    <div className="mt-2 h-2 w-1/2 rounded bg-zinc-100" />
                    <div className="mt-4 flex gap-2">
                      <span className="h-6 w-20 rounded-full bg-zinc-900 text-white text-[10px] flex items-center justify-center">Generate</span>
                      <span className="h-6 w-16 rounded-full bg-white border border-zinc-200" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-xl bg-white border border-zinc-200 p-2">
                      <div className="h-2 w-10 rounded bg-zinc-200" />
                      <div className="mt-2 h-6 rounded bg-[#6d7cff]/10 border border-[#6d7cff]/15" />
                    </div>
                    <div className="h-16 rounded-xl bg-white border border-zinc-100 p-2">
                      <div className="h-2 w-10 rounded bg-zinc-200" />
                      <div className="mt-2 h-6 rounded bg-zinc-50 border border-zinc-100" />
                    </div>
                    <div className="h-16 rounded-xl bg-white border border-zinc-100 p-2">
                      <div className="h-2 w-10 rounded bg-zinc-200" />
                      <div className="mt-2 h-6 rounded bg-zinc-50 border border-zinc-100" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span className="font-mono">output/task/tasks.json + prompts/</span>
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Handoff ready</span>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 hidden md:block w-28 h-28 rounded-2xl glass rotate-3 p-3">
              <div className="text-[10px] text-zinc-400">Story Points</div>
              <div className="text-lg font-semibold text-zinc-900 mt-1">1 SP = 4h</div>
              <div className="mt-2 h-1.5 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full w-[68%] bg-[#6d7cff]" /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const DOCS_URL = "https://github.com/rogasper/onesist/tree/main/docs";

function Features() {
  const items = [
    { k: "FSD Analyzer", d: "Rich MDXEditor, completeness checklist, PDF/DOCX → Markdown. The entry point.", t: "input/fsd" },
    { k: "ERD Studio", d: "ReactFlow + Dagre, DBML live. Visual table editor with SQL export.", t: "output/erd" },
    { k: "API Specs", d: "Module-grouped endpoint cards, search & OpenAPI consolidation.", t: "output/spec" },
  ];
  return (
    <section id="features" className="mx-auto max-w-[1160px] px-6 py-16">
      <div className="max-w-[640px]">
        <div className="text-xs font-mono tracking-wide text-[#6d7cff]">Features</div>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight text-zinc-900">Everything to plan — nothing to execute</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-500">A focused workspace for System Analysts. No code gen, no deployment — just clear artifacts. Full guide → <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-[#6d7cff] hover:underline">docs/</a></p>
      </div>
      <div className="mt-10 grid md:grid-cols-3 gap-6">
        {items.map((it) => (
          <div key={it.k} className="glass specular relative rounded-[24px] p-7">
            <div className="text-[15px] font-semibold text-zinc-900">{it.k}</div>
            <div className="mt-3 text-sm leading-6 text-zinc-500">{it.d}</div>
            <div className="mt-6 inline-flex text-xs font-mono px-2.5 py-1 rounded-full bg-zinc-900 text-white">{it.t}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2.5 text-xs">
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900">Tasks & Phases — 77 SP · Jira/Monday export →</a>
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900">RTM · BR → FR → DS → TC →</a>
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900">SIT & Timeline →</a>
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
      <h2 className="text-xl font-semibold text-zinc-900">How it works — with outputs</h2>
      <p className="text-sm text-zinc-500 mt-1">Each step produces a verifiable artifact. No black box.</p>
      <div className="mt-6 grid md:grid-cols-4 gap-4">
        {steps.map((s) => (
          <div key={s.n} className="relative rounded-2xl border border-zinc-200 bg-white p-5 overflow-hidden hover:shadow-md transition-shadow">
            <div className="absolute -right-4 -top-4 text-[64px] font-bold text-zinc-100 select-none">{s.n}</div>
            <div className="text-xs font-mono text-[#6d7cff]">{s.n}</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{s.t}</div>
            <div className="mt-2 text-sm leading-5 text-zinc-500">{s.d}</div>
            <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-mono text-zinc-500 border-b border-zinc-100 bg-white flex items-center justify-between">
                <span>{s.ex}</span><span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <pre className="p-3 text-[11px] leading-4 font-mono text-zinc-700 whitespace-pre-wrap">{s.code}</pre>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Carousel ---
function Carousel() {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<number | null>(null);
  const slides = [
    { title: "Projects — Dashboard", desc: "Manage repos, auto-install skills.", color: "from-[#6d7cff]/10 to-[#a78bfa]/10", label: "Dashboard", file: "dashboard.png" },
    { title: "ERD Studio", desc: "Interactive canvas — Dagre layout, DBML live.", color: "from-emerald-50 to-teal-50", label: "ERD", file: "erd.png" },
    { title: "API Specs", desc: "Module cards with search & payloads.", color: "from-amber-50 to-orange-50", label: "Spec", file: "spec.png" },
  ];

  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 3200);
    timerRef.current = id;
    return () => window.clearInterval(id);
  }, [slides.length]);

  const go = (n: number) => {
    setIdx((n + slides.length) % slides.length);
    if (timerRef.current) { window.clearInterval(timerRef.current); }
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 3200);
    timerRef.current = id;
  };

  return (
    <section id="screens" className="mx-auto max-w-[1160px] px-6 py-16 border-t border-zinc-200/60">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono tracking-wide text-[#6d7cff]">Screens</div>
          <h3 className="mt-2 text-[22px] font-semibold text-zinc-900">Real outputs, not mockups</h3>
          <p className="text-sm text-zinc-500">Captured via Playwright from the running dashboard.</p>
        </div>
        <span className="hidden md:inline text-xs text-zinc-400">Auto-play • hover to pause</span>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm"
           onMouseEnter={() => timerRef.current && window.clearInterval(timerRef.current)}
           onMouseLeave={() => {
             const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 3200);
             timerRef.current = id;
           }}>
        <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {slides.map((s) => (
            <div key={s.label} className="min-w-full p-6 md:p-8">
              <div className={`rounded-2xl bg-gradient-to-br ${s.color} border border-zinc-100 p-6 md:p-8`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-1 rounded-full bg-white border border-zinc-200 text-zinc-600">{s.label}</span>
                  <span className="text-xs text-zinc-400">Playwright screenshot placeholder — will be replaced with real capture</span>
                </div>
                <div className="mt-4 text-lg font-semibold text-zinc-900">{s.title}</div>
                <div className="text-sm text-zinc-500">{s.desc}</div>
                <div className="mt-6 rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                  <img
                    src={`/screenshots/${(s as any).file}`}
                    alt={s.title}
                    className="w-full h-[360px] object-cover object-top"
                    loading="lazy"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = "none";
                      const ph = el.nextElementSibling as HTMLElement | null;
                      if (ph) ph.style.display = "flex";
                    }}
                  />
                  <div className="hidden h-[360px] items-center justify-center bg-zinc-50 text-sm text-zinc-400">
                    Screenshot pending — run Playwright capture
                  </div>
                </div>
                <div className="mt-4 flex gap-2 text-[11px] font-mono text-zinc-400">
                  <span className="px-2 py-1 rounded-full bg-white border border-zinc-200">output/{s.label.toLowerCase()}/…</span>
                  <span className="px-2 py-1 rounded-full bg-white border border-zinc-200">live file watcher</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* controls */}
        <button onClick={() => go(idx - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow flex items-center justify-center text-zinc-600 hover:bg-zinc-50">‹</button>
        <button onClick={() => go(idx + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow flex items-center justify-center text-zinc-600 hover:bg-zinc-50">›</button>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-zinc-900" : "w-1.5 bg-zinc-300"}`} />
          ))}
        </div>
      </div>

      <div className="mt-3 text-xs text-zinc-400 text-center">Tip: run <code className="px-1 py-0.5 bg-zinc-100 rounded">bun run screenshots</code> to refresh captures from http://localhost:4321</div>
    </section>
  );
}

// --- Download ---
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
            <h3 className="text-lg font-semibold text-zinc-900">Download Desktop</h3>
            <p className="mt-1 text-sm text-zinc-500">Free, MIT. Works offline. Your files stay local (SQLite + file watcher + SSE).</p>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-zinc-900 text-white">Version {VERSION}</span>
              <a href={GH_RELEASES} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900 underline underline-offset-4">Releases</a>
              <span className="text-zinc-300">•</span>
              <a href={`${GH_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900 underline underline-offset-4">Changelog</a>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={`${GH_RELEASES}/tag/${VERSION}`} target="_blank" rel="noreferrer" onClick={() => track("download-macos")} className={`px-5 py-2.5 rounded-full text-sm font-semibold transition shadow-sm ${os === "mac" ? "bg-[#6d7cff] text-white" : "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>macOS .dmg</a>
            <a href={`${GH_RELEASES}/tag/${VERSION}`} target="_blank" rel="noreferrer" onClick={() => track("download-windows")} className={`px-5 py-2.5 rounded-full text-sm font-semibold transition shadow-sm ${os === "win" ? "bg-[#6d7cff] text-white" : "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>Windows .msi</a>
            <a href={GH_REPO} target="_blank" rel="noreferrer" onClick={() => track("download-github")} className="px-5 py-2.5 rounded-full border border-zinc-200 bg-white text-sm text-zinc-700 hover:bg-zinc-50 transition">GitHub</a>
          </div>
        </div>
        <div className="mt-6 text-xs text-zinc-400">Detected: <span className="text-zinc-700">{os === "unknown" ? "Unknown OS — pick above" : os === "mac" ? "macOS" : "Windows"}</span> • If asset not yet published, open Releases and pick the latest.</div>
      </div>
    </section>
  );
}

function Changelog() {
  const entries = [
    { v: "v0.1.36", t: "Fix splash logo broken on Windows", d: "Remove broken /icons/icon.png, pure OS badge fallback." },
    { v: "v0.1.35", t: "Fix splash not showing", d: "First-open splash with always_on_top + marker .first_run_done." },
    { v: "v0.1.34", t: "CI: avoid macos-14 queue", d: "max-parallel 1 for free tier." },
  ];
  return (
    <section id="changelog" className="mx-auto max-w-[1160px] px-6 py-16 border-t border-zinc-200/60">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono tracking-wide text-[#6d7cff]">Changelog</div>
          <h3 className="mt-2 text-[22px] font-semibold text-zinc-900">Latest</h3>
        </div>
        <a href={`${GH_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" onClick={() => track("changelog-full")} className="text-xs text-zinc-400 hover:text-zinc-900 border border-zinc-200 rounded-full px-3 py-1.5 bg-white">View full changelog →</a>
      </div>
      <div className="mt-8 grid gap-3 max-w-[760px]">
        {entries.map((e) => (
          <div key={e.v} className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <span className="shrink-0 text-xs font-mono px-2.5 py-1 rounded-full bg-zinc-900 text-white h-fit">{e.v}</span>
            <div><div className="text-sm font-medium text-zinc-900">{e.t}</div><div className="text-sm text-zinc-500 mt-1">{e.d}</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-200 mt-6 bg-white/60 backdrop-blur">
      <div className="mx-auto max-w-[1160px] px-6 py-8 flex flex-col md:flex-row gap-4 md:items-center justify-between text-sm">
        <div className="text-zinc-500">© 2026 rogasper.com • MIT • <a href={GH_REPO} className="hover:text-zinc-900 underline underline-offset-4">github.com/rogasper/onesist</a></div>
        <div className="text-xs text-zinc-400">Analytics by Umami • No cookies • <a href={GH_RELEASES} className="hover:text-zinc-900">Releases</a></div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-[#fcfcfa] text-zinc-900 antialiased selection:bg-[#6d7cff]/10">
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
