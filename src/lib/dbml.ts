export interface ColumnDef {
  name: string;
  type: string;
  isPk: boolean;
  isUnique: boolean;
  isNotNull: boolean;
  defaultValue: string | null;
  ref: { table: string; column: string } | null;
}

export interface IndexDef {
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
  color?: string;
}

export interface NoteDef {
  content: string;
  tableName?: string;
}

export interface ParsedDbml {
  tables: TableDef[];
  notes: NoteDef[];
}

function stripComments(dbml: string): string {
  return dbml
    .replace(/--[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseInlineRef(settingsStr: string): { table: string; column: string } | null {
  const m = settingsStr.match(/ref:\s*(?:(?:>|[|o{]+)\s*)?(\w+)\.(\w+)/i);
  if (m) return { table: m[1], column: m[2] };
  const m2 = settingsStr.match(/(\w+)\.(\w+)/);
  if (m2) return { table: m2[1], column: m2[2] };
  return null;
}

function parseColumnSettings(str: string): {
  isPk: boolean; isUnique: boolean; isNotNull: boolean;
  defaultValue: string | null; ref: { table: string; column: string } | null;
} {
  const s = str.toLowerCase();
  return {
    isPk: /pk/.test(s) || /primary\s+key/.test(s),
    isUnique: /unique/.test(s) || /uniq/.test(s),
    isNotNull: /not\s+null/.test(s) || /required/.test(s),
    defaultValue: (str.match(/default:\s*([^\]]+)/i)?.[1] ?? null),
    ref: parseInlineRef(str),
  };
}

export function parseDbml(dbml: string): ParsedDbml {
  const cleaned = stripComments(dbml);
  const tables: TableDef[] = [];
  const notes: NoteDef[] = [];
  const tableBlockRegex = /Table\s+(\w+)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = tableBlockRegex.exec(cleaned)) !== null) {
    const tableName = match[1];
    const block = match[2];
    const columns: ColumnDef[] = [];
    const indexes: IndexDef[] = [];

    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

    let inIndexes = false;
    let currentIndex: string[] = [];

    for (const line of lines) {
      if (/^\s*indexes?\s*\{/i.test(line)) {
        inIndexes = true;
        continue;
      }
      if (inIndexes) {
        if (line === '}') {
          inIndexes = false;
          if (currentIndex.length > 0) {
            indexes.push({ name: '', columns: currentIndex, isUnique: false });
            currentIndex = [];
          }
          continue;
        }
        // index line: column_name or (column1, column2) or [unique]
        const idxName = line.match(/^\s*(\w+)\s*\(?\s*(\w[\w, ]*)\)?\s*(\[unique\])?/i);
        if (idxName) {
          indexes.push({
            name: idxName[1] ?? '',
            columns: (idxName[2] ?? idxName[1]).split(',').map(c => c.trim()).filter(Boolean),
            isUnique: !!idxName[3],
          });
        }
        continue;
      }

      // column definition: name type [settings]
      const colMatch = line.match(/^\s*(\w+)\s+(\w+(?:\([^)]*\))?)(.*)$/);
      if (colMatch) {
        const settings = parseColumnSettings(colMatch[3]);
        columns.push({
          name: colMatch[1],
          type: colMatch[2],
          ...settings,
        });
      }
    }
    tables.push({ name: tableName, columns, indexes });
  }

  // Parse Ref: statements (explicit relationships)
  const refRegex = /^Ref:\s*(\w+)\.(\w+)\s*(?:>|[|o{]+)?\s*(\w+)\.(\w+)/gm;
  while ((match = refRegex.exec(dbml)) !== null) {
    const sourceTable = match[1];
    const sourceCol = match[2];
    const targetTable = match[3];
    const targetCol = match[4];
    const table = tables.find(t => t.name === sourceTable);
    if (table) {
      const col = table.columns.find(c => c.name === sourceCol);
      if (col) {
        col.ref = { table: targetTable, column: targetCol };
      }
    }
  }

  return { tables, notes };
}

export function serializeDbml(tables: TableDef[]): string {
  const lines: string[] = [];
  for (const t of tables) {
    lines.push(`Table ${t.name} {`);
    for (const c of t.columns) {
      const settings: string[] = [];
      if (c.isPk) settings.push('pk');
      if (c.isUnique) settings.push('unique');
      if (c.isNotNull) settings.push('not null');
      if (c.defaultValue) settings.push(`default: ${c.defaultValue}`);
      if (c.ref) settings.push(`ref: > ${c.ref.table}.${c.ref.column}`);
      const settingsStr = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
      lines.push(`  ${c.name} ${c.type}${settingsStr}`);
    }
    if (t.indexes.length > 0) {
      lines.push('');
      lines.push('  indexes {');
      for (const ix of t.indexes) {
        const cols = ix.columns.join(', ');
        const uniq = ix.isUnique ? ' [unique]' : '';
        lines.push(`    (${cols})${uniq}`);
      }
      lines.push('  }');
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}
