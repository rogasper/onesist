import { describe, expect, test } from "bun:test";
import {
  extractDbml,
  parseDbml,
  replaceDbmlFence,
  serializeDbmlDocument,
  type ParsedDbml,
} from "./dbml";

const reported = `Table cms_users {
  id uuid [pk]
  email varchar(255)
  name varchar(255)
  is_active boolean
  created_at timestamp
  updated_at timestamp
  del VARCHAR
}

Table cms_saved_filter {
  id uuid [pk, default: \`gen_random_uuid()\`, note: 'UUID, bukan serial - mengikuti cms_users.id yang UUID', ref: > cms_users.id]
  user_id uuid [not null, ref: > cms_users.id]
  module varchar(50) [pk, not null, default: 'LEADS_TRACKING', note: 'disiapkan untuk modul lain; saat ini hanya satu nilai dipakai']
  name varchar(35) [not null]
  filters jsonb [not null]
}
`;

describe("parseDbml — settings", () => {
  test("the reported schema keeps default, note and ref apart", () => {
    const parsed = parseDbml(reported);
    const table = parsed.tables.find((t) => t.name === "cms_saved_filter")!;
    const id = table.columns.find((c) => c.name === "id")!;
    expect(id.defaultValue).toBe("`gen_random_uuid()`");
    expect(id.note).toBe("UUID, bukan serial - mengikuti cms_users.id yang UUID");
    expect(id.ref).toEqual({ table: "cms_users", column: "id", relation: ">" });

    const module = table.columns.find((c) => c.name === "module")!;
    expect(module.defaultValue).toBe("'LEADS_TRACKING'");
    expect(module.note).toBe("disiapkan untuk modul lain; saat ini hanya satu nilai dipakai");
    expect(module.ref).toBeNull();
  });

  test("flags are tokens, not substrings of a note", () => {
    const parsed = parseDbml(`Table t {
  a int [note: 'pk bukan di sini, unique juga bukan']
  b int [not null, unique]
}`);
    const [a, b] = parsed.tables[0].columns;
    expect(a.isPk).toBe(false);
    expect(a.isUnique).toBe(false);
    expect(a.isNotNull).toBe(false);
    expect(b.isNotNull).toBe(true);
    expect(b.isUnique).toBe(true);
  });

  test("a note may contain // and --", () => {
    const parsed = parseDbml(`Table t {
  url text [note: 'lihat https://example.dev/a -- catatan']
}`);
    expect(parsed.tables[0].columns[0].note).toBe("lihat https://example.dev/a -- catatan");
  });

  test("settings may span several lines", () => {
    const parsed = parseDbml(`Table users {
  id int [pk]
}

Table orders {
  id int [pk,
    not null,
    ref: > users.id]
  total numeric(10, 2)
}`);
    const table = parsed.tables[1];
    expect(table.name).toBe("orders");
    expect(table.columns).toHaveLength(2);
    const id = table.columns[0];
    expect(id.isPk).toBe(true);
    expect(id.isNotNull).toBe(true);
    expect(id.ref).toEqual({ table: "users", column: "id", relation: ">" });
    expect(table.columns[1].type).toBe("numeric(10, 2)");
    expect(table.columns.some((c) => c.name === "not")).toBe(false);
  });
});

describe("parseDbml — names", () => {
  test("quoted and schema-qualified table names", () => {
    const parsed = parseDbml(`Table "public"."users" {
  id int [pk]
}

Table posts {
  user_id int [ref: > public.users.id]
}`);
    expect(parsed.tables.map((t) => t.name)).toEqual(["public.users", "posts"]);
    expect(parsed.tables[1].columns[0].ref).toEqual({
      table: "public.users",
      column: "id",
      relation: ">",
    });
  });

  test("an alias resolves refs to the real table name", () => {
    const parsed = parseDbml(`Table users as U {
  id int [pk]
}

Table posts {
  user_id int [ref: > U.id]
}`);
    expect(parsed.tables[0].alias).toBe("U");
    expect(parsed.tables[1].columns[0].ref).toEqual({
      table: "users",
      column: "id",
      relation: ">",
    });
  });
});

describe("parseDbml — document parts", () => {
  test("standalone Ref, table note, enum and global note", () => {
    const parsed = parseDbml(`Enum status {
  active
  inactive
}

Table users {
  id int [pk]
  Note: 'akun pengguna'
}

Table posts {
  id int [pk]
  user_id int
}

Ref: posts.user_id > users.id
Note: 'dokumen ini milik tim produk'
`);
    expect(parsed.enums).toEqual([{ name: "status", values: ["active", "inactive"] }]);
    expect(parsed.tables[0].note).toBe("akun pengguna");
    expect(parsed.tables[1].columns[1].ref).toEqual({
      table: "users",
      column: "id",
      relation: ">",
    });
    expect(parsed.notes).toEqual([{ content: "dokumen ini milik tim produk" }]);
  });

  test("an unresolved ref stays in the document instead of drawing a bad edge", () => {
    const parsed = parseDbml(`Table posts {
  id int [pk]
  user_id int [ref: > missing.id]
}`);
    expect(parsed.tables[0].columns[1].ref).toBeNull();
    expect(parsed.refs).toEqual([
      {
        from: { table: "posts", column: "user_id" },
        to: { table: "missing", column: "id" },
        relation: ">",
      },
    ]);
  });

  test("the same unresolved ref written inline and as a Ref line is kept once", () => {
    const parsed = parseDbml(`Table posts {
  user_id int [ref: > missing.id]
}

Ref: posts.user_id > missing.id
`);
    expect(parsed.refs).toHaveLength(1);
    expect(parsed.refs?.[0]).toEqual({
      from: { table: "posts", column: "user_id" },
      to: { table: "missing", column: "id" },
      relation: ">",
    });
  });

  test("indexes are parsed", () => {
    const parsed = parseDbml(`Table users {
  id int [pk]
  country varchar(2)
  created_at timestamp

  indexes {
    (id, country) [unique]
    created_at [name: 'created_at_index']
  }
}`);
    expect(parsed.tables[0].indexes).toEqual([
      { name: "", columns: ["id", "country"], isUnique: true },
      { name: "created_at_index", columns: ["created_at"], isUnique: false },
    ]);
  });
});

describe("serializeDbmlDocument", () => {
  test("round-trips notes, enums and refs", () => {
    const original: ParsedDbml = parseDbml(`Enum status {
  active
  inactive
}

Table users {
  id int [pk]
  Note: 'akun pengguna'
}

Table posts {
  id int [pk]
  user_id int [not null, ref: > users.id, note: 'pemilik']
}

Ref: posts.id - users.id
Note: 'dokumen ini milik tim produk'
`);
    const text = serializeDbmlDocument(original);
    const again = parseDbml(text);
    expect(again.tables).toEqual(original.tables);
    expect(again.enums).toEqual(original.enums);
    expect(again.notes).toEqual(original.notes);
  });
});

describe("extractDbml", () => {
  test("a Markdown file contributes only its fenced DBML", () => {
    const md = `# ERD

Diskusi: Table ini belum final.

\`\`\`dbml
Table users {
  id int [pk]
}
\`\`\`

Catatan lain.
`;
    const extracted = extractDbml(md, true);
    expect(extracted.source).toBe("fence");
    expect(extracted.fenceCount).toBe(1);
    expect(extracted.hasDbml).toBe(true);
    const parsed = parseDbml(extracted.dbml);
    expect(parsed.tables.map((t) => t.name)).toEqual(["users"]);
  });

  test("an untagged fence with a schema counts", () => {
    const md = "```\nTable users {\n  id int [pk]\n}\n```\n";
    const extracted = extractDbml(md, true);
    expect(extracted.fenceCount).toBe(1);
    expect(parseDbml(extracted.dbml).tables).toHaveLength(1);
  });

  test("a schema inside a text fence counts (real project files use text)", () => {
    const md = "```text\nTable users {\n  id int [pk]\n}\n```\n";
    const extracted = extractDbml(md, true);
    expect(extracted.source).toBe("fence");
    expect(extracted.fenceCount).toBe(1);
    expect(parseDbml(extracted.dbml).tables).toHaveLength(1);
  });

  test("a SQL fence with CREATE TABLE is not mistaken for DBML", () => {
    const md = "```sql\nCREATE TABLE users (id int);\n```\n";
    const extracted = extractDbml(md, true);
    expect(extracted.source).toBe("raw");
    expect(extracted.fenceCount).toBe(0);
  });

  test("a Markdown file without a fence falls back to its raw text", () => {
    const md = "# Catatan\n\nTidak ada schema di sini.\n";
    const extracted = extractDbml(md, true);
    expect(extracted.source).toBe("raw");
    expect(extracted.hasDbml).toBe(false);
    expect(parseDbml(extracted.dbml).tables).toHaveLength(0);
  });

  test("a .dbml file is used as-is", () => {
    const extracted = extractDbml("Table users {\n  id int [pk]\n}", false);
    expect(extracted.source).toBe("raw");
    expect(extracted.hasDbml).toBe(true);
    expect(parseDbml(extracted.dbml).tables).toHaveLength(1);
  });
});

describe("replaceDbmlFence", () => {
  test("replaces one fence and keeps the prose around it", () => {
    const md = "# ERD\n\n\`\`\`dbml\nTable old {\n  id int\n}\n\`\`\`\n\nSelesai.\n";
    const next = replaceDbmlFence(md, "Table users {\n  id int [pk]\n}");
    expect(next).toContain("# ERD");
    expect(next).toContain("Selesai.");
    expect(next).toContain("Table users");
    expect(next).not.toContain("Table old");
    expect(parseDbml(extractDbml(next!, true).dbml).tables[0].name).toBe("users");
  });

  test("refuses to guess when there are several DBML fences", () => {
    const md = "\`\`\`dbml\nTable a {\n  id int\n}\n\`\`\`\n\n\`\`\`dbml\nTable b {\n  id int\n}\n\`\`\`\n";
    expect(replaceDbmlFence(md, "Table c {\n  id int\n}")).toBeNull();
  });
});
