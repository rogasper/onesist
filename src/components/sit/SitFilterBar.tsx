import { useState } from "react";
import { SearchInput } from "~/components/ui/SearchInput";
import { SitStatusDot } from "./SitStatusBadge";
import type { SitFileEntry } from "~/shared/sit-types";

interface SitFilterBarProps {
  entries: SitFileEntry[];
  onFilter: (filtered: SitFileEntry[]) => void;
}

const STATUS_OPTIONS = ["All", "Pass", "Fail", "Not started", "Hold", "Re Open"] as const;

export function SitFilterBar({ entries, onFilter }: SitFilterBarProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("All");

  const applyFilter = (newSearch = search, newStatus = status) => {
    const q = newSearch.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      if (newStatus !== "All" && e.metadata.status !== newStatus) return false;
      if (q) {
        const hay = `${e.metadata.tcId} ${e.metadata.title} ${e.metadata.tester || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    onFilter(filtered);
  };

  return (
    <div className="shrink-0 flex items-center gap-2 flex-wrap">
      <SearchInput
        value={search}
        onChange={(v) => { setSearch(v); applyFilter(v, status); }}
        placeholder="Cari TC ID, modul, tester…"
        variant="pill"
        className="w-64"
      />
      <div className="flex items-center gap-0.5 rounded-full p-0.5 ring-1 ring-kumo-line/40 bg-kumo-elevated/30 overflow-x-auto max-w-full">
        {STATUS_OPTIONS.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              onClick={() => { setStatus(s); applyFilter(search, s); }}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-[10.5px] transition-colors ${
                active ? "bg-kumo-brand text-white" : "text-kumo-subtle hover:text-kumo-default"
              }`}
            >
              {s !== "All" && <SitStatusDot status={s} />}
              {s}
            </button>
          );
        })}
      </div>
      <span className="text-[10px] text-kumo-subtle ml-auto whitespace-nowrap">
        {entries.length} TC
      </span>
    </div>
  );
}
