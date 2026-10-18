import { LINKS } from "../content";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 mt-6 bg-white/60 backdrop-blur">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-4 md:items-center justify-between text-sm">
        <div className="text-zinc-500">
          © 2026 rogasper.com · MIT ·{" "}
          <a href={LINKS.repo} className="hover:text-zinc-900 underline underline-offset-4">github.com/rogasper/onesist</a>
        </div>
        <div className="text-xs text-zinc-400">
          Analytics by Umami · No cookies · <a href={LINKS.releases} className="hover:text-zinc-900">Releases</a>
        </div>
      </div>
    </footer>
  );
}
