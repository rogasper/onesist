import { useEffect, useState } from "react";
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { Question } from "@phosphor-icons/react";
import { getPageHelp, type PageHelpKey } from "~/lib/page-helpers";

const LANG_KEY = "pageHelpLang";

/** Small "?" button that opens a popup with the page's best practices / usage
 *  guide (bilingual ID/EN, from src/lib/page-helpers.ts). */
export function PageHelpButton({ help }: { help: PageHelpKey }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"id" | "en">(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === "en" ? "en" : "id";
    } catch {
      return "id";
    }
  });
  const content = getPageHelp(help);
  const title = content.title[lang];
  const tips = content.tips[lang];
  const source = content.source?.[lang];

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  }, [lang]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Help: ${title}`}
        aria-label="Help"
        className="flex items-center justify-center w-7 h-7 rounded-full border border-kumo-line/70 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-tint hover:border-kumo-line transition-colors shrink-0"
      >
        <Question size={14} weight="fill" />
      </button>

      <DialogRoot open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <Dialog>
          <div className="p-5 w-[460px] max-w-full">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-sm font-semibold leading-snug">{title}</DialogTitle>
              <div className="flex items-center gap-0.5 rounded-full border border-kumo-line p-0.5 text-[10px] shrink-0">
                {(["id", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`px-2 py-0.5 rounded-full uppercase font-semibold transition-colors ${
                      lang === l ? "bg-kumo-brand text-white" : "text-kumo-subtle hover:text-kumo-default"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <DialogDescription className="sr-only">Panduan & best practices / guide & best practices</DialogDescription>

            <ul className="mt-4 space-y-2">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-kumo-default leading-relaxed">
                  <span className="mt-[5px] size-1.5 rounded-full bg-kumo-brand shrink-0" />
                  <span className="min-w-0">{tip}</span>
                </li>
              ))}
            </ul>

            {source && (
              <div className="mt-4 pt-3 border-t border-kumo-line/60 text-[10px] text-kumo-subtle truncate">
                Panduan lengkap: <span className="font-mono">{source}</span>
              </div>
            )}
          </div>
        </Dialog>
      </DialogRoot>
    </>
  );
}
