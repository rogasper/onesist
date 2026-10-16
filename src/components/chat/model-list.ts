/**
 * Which models of one provider the model picker shows. A provider can list hundreds of models
 * (gateways list several hundred), so the picker shows a few and says how many are hidden.
 */

/**
 * Without a search, shows the first `limit` models, and always the selected one (pinned
 * first). With a search, shows every match, because the search is the way to reach the rest.
 */
export function visibleModels(
  all: string[],
  opts: { query: string; expanded: boolean; selected: string | null; limit?: number },
): { shown: string[]; hidden: number } {
  const q = opts.query.trim().toLowerCase();
  const matches = q ? all.filter((m) => m.toLowerCase().includes(q)) : all;
  if (q || opts.expanded) return { shown: matches, hidden: 0 };

  const limit = opts.limit ?? 8;
  if (matches.length <= limit) return { shown: matches, hidden: 0 };

  const pinned = opts.selected && matches.includes(opts.selected) ? [opts.selected] : [];
  const rest = matches.filter((m) => !pinned.includes(m)).slice(0, limit - pinned.length);
  const shown = [...pinned, ...rest];
  return { shown, hidden: matches.length - shown.length };
}

/**
 * Whether the picker asks a provider for its full model list when it opens. A provider that
 * shows at most one stored model is asked, CLI providers included: their list comes from the
 * runtime and is stored on the first refresh, so later opens do not ask again.
 */
export function shouldFetchModelList(provider: { models?: string[] | null }): boolean {
  return (provider.models?.length ?? 0) <= 1;
}
