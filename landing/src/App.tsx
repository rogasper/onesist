import { useEffect, useState } from "react";

const GH_REPO = "https://github.com/rogasper/onesist";
const GH_RELEASES = `${GH_REPO}/releases`;
const VERSION = "v0.1.37";

function track(name: string, data?: Record<string, string>) {
  try {
    (window as any).umami?.track(name, data);
  } catch {}
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/60 backdrop-blur-xl">
      <div className="mx-auto max-w-[1160px] px-6 h-[56px] flex items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <span className="rounded bg-[#6d7cff] px-1.5 py-0.5 text-xs font-bold text-white">OS</span>
          <span className="text-sm font-semibold tracking-wide text-white">ONESIST</span>
          <span className="hidden sm:inline text-xs text-white/40 ml-1">Planner, not executor</span>
        </a>
        <div className="hidden md:flex items-center gap-6 text-sm text-white/60">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#how" className="hover:text-white transition">How it works</a>
          <a href="#changelog" className="hover:text-white transition">Changelog</a>
          <a href={GH_REPO} target="_blank" rel="noreferrer" className="hover:text-white transition">GitHub</a>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={GH_REPO}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("nav-github")}
            className="hidden sm:inline-flex text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/80 hover:bg-white/10 transition"
          >
            GitHub
          </a>
          <a
            href="#download"
            onClick={() => track("nav-download")}
            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-[#6d7cff] text-white hover:bg-[#5a6af0] transition"
          >
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[#0a0a0a]" />
      <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-[#6d7cff]/20 blur-[90px] -z-10" />
      <div className="absolute top-20 -right-32 w-[480px] h-[480px] rounded-full bg-[#ff6b9d]/12 blur-[90px] -z-10" />
      <div className="mx-auto max-w-[1160px] px-6 pt-14 pb-10 md:pt-20 md:pb-14">
        <div className="grid md:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] tracking-wide font-medium px-3 py-1 rounded-full glass-subtle text-white/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              v{VERSION.replace("v", "")} • Desktop for macOS & Windows • MIT
            </div>
            <h1 className="mt-5 text-[34px] md:text-[46px] font-semibold leading-[0.95] tracking-tight text-white">
              Planner, <span className="text-white/40">not executor.</span>
              <br />
              FSD to handoff in one flow.
            </h1>
            <p className="mt-4 text-[15px] leading-6 text-white/60 max-w-[560px]">
              Onesist turns Functional Specs into <span className="text-white">ERD, API specs, tasks</span> and agentic handoff bundles. One task = one agent iteration — the agent executes, you review.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#download"
                onClick={() => track("hero-download")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#6d7cff] text-white text-sm font-semibold hover:bg-[#5a6af0] transition shadow-lg shadow-[#6d7cff]/20"
              >
                Download Desktop
                <span className="text-white/70 text-xs">macOS • Windows</span>
              </a>
              <a
                href={GH_REPO}
                target="_blank"
                rel="noreferrer"
                onClick={() => track("hero-github")}
                className="inline-flex items-center px-5 py-2.5 rounded-full glass text-white text-sm font-medium hover:bg-white/10 transition"
              >
                View on GitHub
              </a>
              <a
                href="#changelog"
                className="inline-flex items-center px-5 py-2.5 rounded-full border border-white/10 text-white/80 text-sm hover:bg-white/5 transition"
              >
                Changelog
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-white/40">
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-white/40" /> Tauri desktop</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-white/40" /> Offline-first • SQLite</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-white/40" /> No vendor lock-in</span>
            </div>
          </div>

          <div className="relative">
            <div className="glass-strong specular relative rounded-[24px] p-3 md:p-4">
              <div className="rounded-[16px] overflow-hidden border border-white/10 bg-[#0f0f0f]">
                <div className="h-8 flex items-center gap-1.5 px-3 border-b border-white/5 bg-white/[0.04]">
                  <span className="w-3 h-3 rounded-full bg-red-400/80" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <span className="w-3 h-3 rounded-full bg-green-400/80" />
                  <span className="ml-3 text-xs text-white/40">Onesist — FSD Analyzer</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <span className="text-[10px] px-2 py-1 rounded-full bg-[#6d7cff]/20 text-[#8b9bff] border border-[#6d7cff]/20">FSD</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/60 border border-white/10">Spec</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/60 border border-white/10">ERD</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/60 border border-white/10">Task</span>
                  </div>
                  <div className="h-20 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                    <div className="h-2 w-3/4 rounded bg-white/10" />
                    <div className="mt-2 h-2 w-1/2 rounded bg-white/5" />
                    <div className="mt-4 flex gap-2">
                      <span className="h-6 w-20 rounded-full bg-white/10" />
                      <span className="h-6 w-16 rounded-full bg-white/5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-xl glass-subtle p-2">
                      <div className="h-2 w-10 rounded bg-white/10" />
                      <div className="mt-2 h-6 rounded bg-[#6d7cff]/20" />
                    </div>
                    <div className="h-16 rounded-xl glass-subtle p-2">
                      <div className="h-2 w-10 rounded bg-white/10" />
                      <div className="mt-2 h-6 rounded bg-white/5" />
                    </div>
                    <div className="h-16 rounded-xl glass-subtle p-2">
                      <div className="h-2 w-10 rounded bg-white/10" />
                      <div className="mt-2 h-6 rounded bg-white/5" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-white/50">
                <span>output/task/tasks.json + prompts/</span>
                <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Handoff ready</span>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 hidden md:block w-28 h-28 rounded-2xl glass rotate-3 p-3">
              <div className="text-[10px] text-white/50">Story Points</div>
              <div className="text-lg font-semibold text-white mt-1">1 SP = 4h</div>
              <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full w-[68%] bg-[#6d7cff]" /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { k: "FSD Analyzer", d: "Parse FSD, run gap analysis vs MASTER_ERD / MASTER_SPEC, generate artifacts per halaman/module with folder-per-page.", t: "input/fsd → output/*" },
    { k: "ERD + DBML", d: "Tables, relations, indexes with DBML for dbdiagram.io. Graphviz layout, drift detection.", t: "output/erd/<module>/" },
    { k: "Spec + OpenAPI", d: "Endpoint tables, auth, pagination. Consolidate into openapi.yaml with x-status / x-phase.", t: "output/spec/openapi.yaml" },
    { k: "Agentic Tasks", d: "12-row summary + Context + Given-When-Then AC + Flow Logic. tasks.json + prompts/{code}.prompt.md for external agents.", t: "output/task/<module>/" },
  ];
  return (
    <section id="features" className="mx-auto max-w-[1160px] px-6 py-12">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-white">Everything to plan — nothing to execute</h2>
        <a href={GH_REPO} target="_blank" rel="noreferrer" className="text-xs text-white/50 hover:text-white">Docs →</a>
      </div>
      <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <div key={it.k} className="glass specular relative rounded-[20px] p-5">
            <div className="text-sm font-semibold text-white">{it.k}</div>
            <div className="mt-2 text-sm leading-5 text-white/60">{it.d}</div>
            <div className="mt-4 inline-flex text-[11px] font-mono px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">{it.t}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid md:grid-cols-3 gap-4">
        <div className="glass-subtle rounded-2xl p-4 flex items-center justify-between">
          <span className="text-sm text-white/70">RTM</span><span className="text-xs font-mono text-white/50">BR → FR → DS → TC</span>
        </div>
        <div className="glass-subtle rounded-2xl p-4 flex items-center justify-between">
          <span className="text-sm text-white/70">SIT</span><span className="text-xs font-mono text-white/50">Chrome / Safari / iOS / Android</span>
        </div>
        <div className="glass-subtle rounded-2xl p-4 flex items-center justify-between">
          <span className="text-sm text-white/70">Timeline</span><span className="text-xs font-mono text-white/50">Gantt • Critical path</span>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Upload FSD", d: "Drop markdown or convert doc → input/fsd. Multi-root file browser watches it live." },
    { n: "02", t: "Generate", d: "Run fsd-analyzer (codex/claude/opencode/agy). Writes per halaman: spec, erd, tasks." },
    { n: "03", t: "Review", d: "Open Markdown+MDX editor, Mermaid preview, DBML. Edit in place, no rebuild." },
    { n: "04", t: "Handoff", d: "Export handoff-{project}-v{version}.zip → tasks.json + prompts + context for external agents." },
  ];
  return (
    <section id="how" className="mx-auto max-w-[1160px] px-6 py-8">
      <h2 className="text-xl font-semibold text-white">How it works</h2>
      <div className="mt-6 grid md:grid-cols-4 gap-4">
        {steps.map((s) => (
          <div key={s.n} className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-hidden">
            <div className="absolute -right-6 -top-6 text-[64px] font-bold text-white/[0.04]">{s.n}</div>
            <div className="text-xs font-mono text-[#8b9bff]">{s.n}</div>
            <div className="mt-1 text-sm font-semibold text-white">{s.t}</div>
            <div className="mt-2 text-sm leading-5 text-white/60">{s.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Screens() {
  return (
    <section className="mx-auto max-w-[1160px] px-6 py-8">
      <div className="glass rounded-[24px] p-6 md:p-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Built for System Analysts</h3>
          <span className="text-xs text-white/40">Tauri desktop • Offline • SQLite</span>
        </div>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f0f] p-3">
            <div className="text-xs font-medium text-white/70">Projects</div>
            <div className="mt-3 h-28 rounded-xl bg-white/[0.04] border border-white/5" />
            <div className="mt-2 text-xs text-white/40">Open / import / switch roots</div>
          </div>
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f0f] p-3">
            <div className="text-xs font-medium text-white/70">ERD Canvas</div>
            <div className="mt-3 h-28 rounded-xl bg-white/[0.04] border border-white/5" />
            <div className="mt-2 text-xs text-white/40">XYFlow + Dagre + DBML</div>
          </div>
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f0f] p-3">
            <div className="text-xs font-medium text-white/70">Tasks & Handoff</div>
            <div className="mt-3 h-28 rounded-xl bg-white/[0.04] border border-white/5" />
            <div className="mt-2 text-xs text-white/40">Prompt per task, zip export</div>
          </div>
        </div>
      </div>
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
            <h3 className="text-lg font-semibold text-white">Download Desktop</h3>
            <p className="mt-1 text-sm text-white/60">Free, MIT. Works offline. Your files stay local (SQLite + file watcher + SSE).</p>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white/70">Version {VERSION}</span>
              <a href={GH_RELEASES} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white underline underline-offset-4">Releases</a>
              <span className="text-white/20">•</span>
              <a href={`${GH_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white underline underline-offset-4">Changelog</a>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${GH_RELEASES}/tag/${VERSION}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("download-macos")}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition ${os === "mac" ? "bg-[#6d7cff] text-white shadow-lg shadow-[#6d7cff]/20" : "glass text-white hover:bg-white/10"}`}
            >
              macOS .dmg
            </a>
            <a
              href={`${GH_RELEASES}/tag/${VERSION}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("download-windows")}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition ${os === "win" ? "bg-[#6d7cff] text-white shadow-lg shadow-[#6d7cff]/20" : "glass text-white hover:bg-white/10"}`}
            >
              Windows .msi
            </a>
            <a
              href={GH_REPO}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("download-github")}
              className="px-5 py-2.5 rounded-full border border-white/10 text-sm text-white/80 hover:bg-white/5 transition"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="mt-6 text-xs text-white/40">
          Detected: <span className="text-white/70">{os === "unknown" ? "Unknown OS — pick above" : os === "mac" ? "macOS" : "Windows"}</span> • If asset not yet published, open Releases and pick the latest.
        </div>
      </div>
    </section>
  );
}

function Changelog() {
  const entries = [
    { v: "v0.1.36", t: "Fix splash logo broken on Windows", d: "Remove broken /icons/icon.png reference, pure OS badge fallback." },
    { v: "v0.1.35", t: "Fix splash not showing", d: "First-open splash with always_on_top + marker .first_run_done." },
    { v: "v0.1.34", t: "CI: avoid macos-14 queue", d: "max-parallel 1 for free tier." },
    { v: "v0.1.33", t: "Sanitization + LICENSE MIT", d: "Remove confidential xlsx from git, placeholder Example Corp." },
    { v: "v0.1.32", t: "RTM delete + build fix", d: "Delete RTM cells + fix transparent build." },
  ];
  return (
    <section id="changelog" className="mx-auto max-w-[1160px] px-6 py-8">
      <div className="flex items-end justify-between">
        <h3 className="text-lg font-semibold text-white">Changelog</h3>
        <a href={`${GH_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" onClick={() => track("changelog-full")} className="text-xs text-white/50 hover:text-white">View full changelog →</a>
      </div>
      <div className="mt-4 grid gap-3">
        {entries.map((e) => (
          <div key={e.v} className="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <span className="shrink-0 text-xs font-mono px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 h-fit">{e.v}</span>
            <div>
              <div className="text-sm font-medium text-white">{e.t}</div>
              <div className="text-sm text-white/50">{e.d}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 mt-6">
      <div className="mx-auto max-w-[1160px] px-6 py-8 flex flex-col md:flex-row gap-4 md:items-center justify-between text-sm">
        <div className="text-white/40">© 2026 rogasper.com • MIT License • <a href={GH_REPO} className="hover:text-white underline underline-offset-4">github.com/rogasper/onesist</a></div>
        <div className="text-xs text-white/30">Analytics by Umami • No cookies • <a href={GH_RELEASES} className="hover:text-white">Releases</a></div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white antialiased selection:bg-[#6d7cff]/30">
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Screens />
      <Download />
      <Changelog />
      <Footer />
    </div>
  );
}
