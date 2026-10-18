import { LINKS } from "../content";
import { track } from "../track";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#agents", label: "Agents" },
  { href: "#how", label: "How it works" },
  { href: "#screens", label: "Screens" },
  { href: "#changelog", label: "Changelog" },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 h-[56px] flex items-center justify-between gap-3">
        <a href="#" className="flex items-center gap-2.5 shrink-0">
          <img src="/logo-icon.png" alt="Onesist" className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold tracking-wide text-zinc-900">ONESIST</span>
        </a>
        <div className="hidden md:flex items-center gap-6 text-sm text-zinc-500">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="hover:text-zinc-900 transition">
              {n.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a href={LINKS.repo} target="_blank" rel="noreferrer" onClick={() => track("nav-github")} className="hidden sm:inline-flex text-xs px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition">
            GitHub
          </a>
          <a href="#download" onClick={() => track("nav-download")} className="text-xs font-semibold px-4 py-1.5 rounded-full bg-[#6d7cff] text-white hover:bg-[#5a6af0] transition shadow-sm">
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}
