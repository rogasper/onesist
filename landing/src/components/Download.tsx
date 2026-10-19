import { useEffect, useState } from "react";
import { LINKS } from "../content";
import { useChangelog } from "../lib/use-changelog";
import { track } from "../track";

type Os = "mac" | "win" | "unknown";

export function Download() {
  const [os, setOs] = useState<Os>("unknown");
  const { version } = useChangelog();
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) setOs("mac");
    else if (ua.includes("win")) setOs("win");
  }, []);
  const button = (active: boolean) =>
    `px-5 py-2.5 rounded-full text-sm font-semibold transition shadow-sm ${active ? "bg-[#6d7cff] text-white hover:bg-[#5a6af0]" : "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`;
  return (
    <section id="download" className="mx-auto max-w-[1160px] px-4 sm:px-6 py-10">
      <div className="glass-strong specular relative rounded-[24px] p-6 md:p-8 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Download Desktop</h2>
            <p className="mt-1 text-sm text-zinc-500">Free and MIT-licensed. Your files stay on your machine.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-zinc-900 text-white">Version {version ?? "latest"}</span>
              <a href={LINKS.releases} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900 underline underline-offset-4">Releases</a>
              <span className="text-zinc-300">·</span>
              <a href={LINKS.changelog} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-900 underline underline-offset-4">Changelog</a>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={LINKS.releases} target="_blank" rel="noreferrer" onClick={() => track("download-macos")} className={button(os === "mac")}>macOS .dmg</a>
            <a href={LINKS.releases} target="_blank" rel="noreferrer" onClick={() => track("download-windows")} className={button(os === "win")}>Windows .exe</a>
            <a href={LINKS.repo} target="_blank" rel="noreferrer" onClick={() => track("download-github")} className="px-5 py-2.5 rounded-full border border-zinc-200 bg-white text-sm text-zinc-700 hover:bg-zinc-50 transition">GitHub</a>
          </div>
        </div>
        <div className="mt-6 text-xs text-zinc-400">
          Detected: <span className="text-zinc-700">{os === "unknown" ? "unknown — pick one above" : os === "mac" ? "macOS" : "Windows"}</span> · Downloads open the latest release on GitHub.
        </div>
      </div>
    </section>
  );
}
