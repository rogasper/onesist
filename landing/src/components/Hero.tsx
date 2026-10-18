import { useState } from "react";
import { AGENTS, HERO_IMAGE, LINKS } from "../content";
import { useChangelog } from "../lib/use-changelog";
import { track } from "../track";

export function Hero() {
  const { version } = useChangelog();
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <section className="relative overflow-hidden bg-[#fcfcfa]">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#f5f6ff] via-[#fcfcfa] to-white" />
      <div className="absolute -top-32 -left-32 w-[560px] h-[560px] rounded-full bg-[#6d7cff]/10 blur-[90px] -z-10" />
      <div className="absolute top-12 -right-24 w-[520px] h-[520px] rounded-full bg-[#ff8fa3]/10 blur-[90px] -z-10" />
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 pt-12 pb-10 md:pt-16 md:pb-14">
        <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-10 items-center">
          <div className="min-w-0">
            <div className="inline-flex flex-wrap items-center gap-2 text-[11px] tracking-wide font-medium px-3 py-1 rounded-full bg-white border border-zinc-200 text-zinc-600 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {version ?? "Latest"} · Desktop for macOS &amp; Windows · MIT
            </div>
            <h1 className="mt-5 text-[34px] md:text-[48px] font-semibold leading-[1] tracking-tight text-zinc-900">
              From FSD to handoff.
              <br />
              <span className="text-zinc-400">Your agents in the loop.</span>
            </h1>
            <p className="mt-5 text-[15px] leading-6 text-zinc-500 max-w-[540px]">
              <span className="text-zinc-900 font-medium">ERD, API spec, tasks, RTM and SIT</span> from one functional spec — with Claude Code, Codex, Pi or OpenCode working inside your project. You approve every write.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#download" onClick={() => track("hero-download")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#6d7cff] text-white text-sm font-semibold hover:bg-[#5a6af0] transition shadow-md shadow-[#6d7cff]/15">
                Download Desktop <span className="text-white/80 text-xs">macOS · Windows</span>
              </a>
              <a href={LINKS.repo} target="_blank" rel="noreferrer" onClick={() => track("hero-github")} className="inline-flex items-center px-5 py-2.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition shadow-sm">
                View on GitHub
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-zinc-300" /> Local-first · SQLite</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-zinc-300" /> Works with {AGENTS.length} CLI agents</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-zinc-300" /> No vendor lock-in</span>
            </div>
          </div>

          <div className="relative min-w-0">
            <div className="glass-strong specular relative rounded-[24px] p-2.5 md:p-3">
              <div className="rounded-[16px] overflow-hidden border border-zinc-200 bg-white">
                <div className="h-8 flex items-center gap-1.5 px-3 border-b border-zinc-100 bg-zinc-50/80">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-3 text-xs text-zinc-400 truncate">Onesist — Chat with Claude Code</span>
                </div>
                {imageFailed ? (
                  <div className="h-[320px] flex items-center justify-center bg-zinc-50 text-sm text-zinc-400">Screenshot unavailable</div>
                ) : (
                  <img src={HERO_IMAGE} alt="Onesist chat: Claude Code asks before writing a file" className="w-full h-auto block" onError={() => setImageFailed(true)} />
                )}
              </div>
            </div>
            <div className="absolute -bottom-4 left-4 hidden md:flex items-center gap-2 rounded-full glass px-3.5 py-2 text-xs text-zinc-600">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6d7cff]" /> Allow once · Always allow · Deny
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
