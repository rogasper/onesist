import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { CodeCard, isCardWorthyCode } from "~/components/chat/CodeCard";
import { useFileContent } from "~/lib/use-file-data";

/**
 * Inline artifact preview inside the chat (FR-C8), using the viewers that already
 * exist rather than a new one.
 *
 * Deliberate exceptions to "preview everything inline":
 *
 *  - ERD artifacts (`output/erd/**`, `.dbml`) are summarised, not rendered.
 *    `ErdCanvas` is ReactFlow; inside a ~460px column an interactive node graph
 *    is worse than useless, and the ERD tab next door renders it properly. A
 *    table list answers the question the user actually has here ("what is in this
 *    file now") in a few lines.
 *  - Anything else that is not markdown-ish falls back to a plain code block,
 *    which is still a real preview of the file the agent wrote.
 */

interface Props {
  path: string;
  /** Route from the change ledger (`erd` / `spec` / `task` / …). */
  route: string | null;
  projectId: string;
}

interface DbmlTable {
  name: string;
  columns: number;
}

/** Minimal DBML reader: enough to list tables and their column counts. A full
 *  parse already exists server-side (`lib/dbml.ts`) but it drags the ERD graph
 *  builder into the client bundle for what is a summary line. */
export function parseDbmlTables(content: string): DbmlTable[] {
  const tables: DbmlTable[] = [];
  const lines = content.split("\n");
  let current: DbmlTable | null = null;
  let depth = 0;
  for (const raw of lines) {
    const line = raw.trim();
    const open = /^Table\s+([\w."`]+)\s*\{/i.exec(line);
    if (open) {
      current = { name: open[1].replace(/["`]/g, ""), columns: 0 };
      tables.push(current);
      depth = 1;
      continue;
    }
    if (!current) continue;
    if (line.includes("{")) depth++;
    if (line.includes("}")) {
      depth--;
      if (depth <= 0) current = null;
      continue;
    }
    if (depth === 1 && line && !line.startsWith("//") && !line.startsWith("Note") && !line.startsWith("indexes")) {
      current.columns++;
    }
  }
  return tables;
}

export function ArtifactPreview({ path, route, projectId }: Props) {
  const { content, loading } = useFileContent(path, projectId);

  if (loading) return <p className="text-sm text-kumo-subtle py-1">Memuat pratinjau…</p>;
  if (content == null) {
    return <p className="text-sm text-kumo-subtle py-1">Berkas tidak bisa dibaca — mungkin sudah dihapus atau dipindahkan.</p>;
  }

  if (route === "erd" || /\.dbml$/i.test(path)) {
    const tables = parseDbmlTables(content);
    return (
      <div className="rounded-lg ring ring-kumo-line px-3 py-2 grid gap-1">
        <p className="text-sm text-kumo-subtle">
          {tables.length ? `${tables.length} tabel` : "Tidak ada tabel terbaca"} · pratinjau DBML
        </p>
        {tables.map((t) => (
          <p key={t.name} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[0.8125rem] text-kumo-default">{t.name}</span>
            <span className="text-kumo-subtle">{t.columns} kolom</span>
          </p>
        ))}
        <p className="text-xs text-kumo-subtle">Diagram lengkapnya ada di tab ERD.</p>
      </div>
    );
  }

  if (/\.(md|markdown)$/i.test(path) || route === "fsd" || route === "task" || route === "td" || route === "rtm" || route === "sit") {
    return (
      <div className="rounded-lg ring ring-kumo-line px-3 py-2 max-h-72 overflow-y-auto">
        <MarkdownViewer
          content={content}
          className="text-sm"
          codeRenderer={(lang, code) => (isCardWorthyCode(lang, code) ? <CodeCard lang={lang} code={code} projectId={projectId} /> : null)}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg ring ring-kumo-line max-h-72 overflow-y-auto">
      <CodeCard lang={path.split(".").pop() ?? ""} code={content.slice(0, 4000)} projectId={projectId} />
    </div>
  );
}
