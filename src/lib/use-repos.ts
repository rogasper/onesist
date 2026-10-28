import { useEffect, useState } from "react";
import type { RepoSummary } from "~/shared/types";

/** The project's repos, loaded once per project. A failed load reads as no repos. */
export function useRepos(projectId: string): { repos: RepoSummary[]; loading: boolean } {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/repos`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { repos: RepoSummary[] }) : { repos: [] }))
      .then((data) => {
        if (!cancelled) setRepos(data.repos);
      })
      .catch(() => {
        if (!cancelled) setRepos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { repos, loading };
}
