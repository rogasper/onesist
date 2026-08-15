export interface ParsedEndpoint {
  no: string;
  method: string;
  path: string;
  title: string;
  purpose: string;
  note: string;
  body: string;
  response: string;
  query: string;
  validation: string;
  filter: string;
  action: string;
  logic: string;
  detail: string;
  rawMarkdown: string;
}

export interface ParsedSpecModule {
  number: string;
  name: string;
  fullName: string;
  endpoints: ParsedEndpoint[];
}

const METHOD_RE = /\b(GET|POST|PUT|DELETE|PATCH)\s+/;
const BOLD_FIELD_RE = /^(- )?\*\*([\w\s()]+?):\*\*\s*(.*)$/;
const PLAIN_FIELD_RE = /^- ([\w\s()]+?):\s*(.*)$/;

const SKIP_SECTIONS = ["API Summary", "Global Standard", "Changelog", "Column Spreadsheet", "FSD Reference", "Overview", "Auth", "Summary of", "Role-based", "Migration Script", "Testing Checklist"];

interface EndpointBlock {
  start: number;
  heading: string;
  id: string;
  method?: string;
  path?: string;
  block: string[];
}

interface EndpointHeadingInfo {
  id: string;
  title: string;
  method?: string;
  path?: string;
}

/**
 * Tolerant endpoint-heading detection. Models follow the skill's canonical
 * format (`### NO: {n} — {Method} \`{path}\``) with varying discipline, so
 * accept the common deviations too:
 *   - `### 1. GET /api/users — List users`   (dot separator, method inside)
 *   - `### GET /api/users`                   (no ID, no separator)
 *   - `#### POST /api/v1/login | desc`       (pipe separator)
 *   - `### NO: 1 GET /api/users`             (no separator after NO)
 *   - `### 1 — Flow login`                   (ID + dash, no method)
 *   - `## GET /api/users`                    (flattened H2 — handled by caller)
 */
function parseEndpointHeading(line: string): EndpointHeadingInfo | null {
  const m = line.match(/^#{2,4}\s*(.*)$/);
  if (!m) return null;
  const rest = m[1].trim();

  // NO: prefix — id is the token after NO:, title is the remainder
  const noMatch = rest.match(/^NO:\s*([\w.]+)\s*[—–\-:|]?\s*(.*)$/i);
  if (noMatch) {
    const methodPath = extractMethodPath(noMatch[2]);
    return {
      id: noMatch[1],
      title: noMatch[2].trim() || noMatch[1],
      ...(methodPath ? { method: methodPath.method, path: methodPath.path } : {}),
    };
  }

  // Method-first with optional leading ID: "1. GET /path — title"
  const methodMatch = rest.match(/^([\w.]*)\s*[.:]?\s*(GET|POST|PUT|DELETE|PATCH)\s+(`?\/?[\w{}/.:%-]+`?)(.*)$/i);
  if (methodMatch) {
    const method = methodMatch[2].toUpperCase();
    const path = methodMatch[3].replace(/^`+|`+$/g, "");
    const after = methodMatch[4].trim();
    const sep = after.match(/^[—–:|]+\s*(.*)$/);
    const title = (sep ? sep[1] : after).trim() || path;
    const rawId = methodMatch[1].replace(/[.:\s]/g, "");
    return { id: rawId || path, title, method, path };
  }

  // ID — title (no method in heading)
  const dashMatch = rest.match(/^([\w.]+)\s*[—–\-]+\s*(.+)$/);
  if (dashMatch) {
    return { id: dashMatch[1], title: dashMatch[2].trim() };
  }

  return null;
}

/** Extract `METHOD path` from a heading fragment (e.g. "GET /api/users — List"). */
function extractMethodPath(text: string): { method: string; path: string; after: string } | null {
  const m = text.match(/(GET|POST|PUT|DELETE|PATCH)\s+(`?\/?[\w{}/.:%-]+`?)(.*)$/i);
  if (!m) return null;
  return {
    method: m[1].toUpperCase(),
    path: m[2].replace(/^`+|`+$/g, ""),
    after: m[3].trim(),
  };
}

export function parseMarkdownToModules(markdown: string): ParsedSpecModule[] {
  const markdownModules = parseMarkdownModules(markdown, false);
  if (markdownModules.some((m) => m.endpoints.length > 0)) return markdownModules;
  // Fallback: no `##` modules matched — some models write modules as H1
  // (`# Module`) with `###` endpoints inside. Skip the first H1 (doc title).
  const h1Modules = parseMarkdownModules(markdown, true);
  if (h1Modules.some((m) => m.endpoints.length > 0)) return h1Modules;
  return parseLegacyTable(markdown);
}

const LEGACY_ROW_RE = /^(\d+)\s+(\/?[\w\-/:{}]+)\s+(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/;
const LEGACY_STATUS_RE = /^(New|Existing \(Needs Update\)|Existing|Update|Adjustment \(existing API, tambah field\)|Adjustment|Status)\s*(?:\([^)]*\))?\s*/;

function parseLegacyTable(markdown: string): ParsedSpecModule[] {
  const endpoints: ParsedEndpoint[] = [];

  for (const line of markdown.split("\n")) {
    const m = line.match(LEGACY_ROW_RE);
    if (!m) continue;
    const purpose = m[4].replace(LEGACY_STATUS_RE, "").trim();
    endpoints.push({
      no: m[1],
      method: m[3],
      path: m[2].startsWith("/") ? m[2] : `/${m[2]}`,
      title: purpose.slice(0, 80),
      purpose,
      note: "",
      body: "",
      response: "",
      query: "",
      validation: "",
      filter: "",
      action: "",
      logic: "",
      detail: "",
      rawMarkdown: line,
    });
  }

  if (endpoints.length === 0) return [];
  return [{
    number: "0",
    name: "Existing (Legacy Table)",
    fullName: "Existing (Legacy Table)",
    endpoints,
  }];
}

function parseMarkdownModules(markdown: string, h1Modules: boolean): ParsedSpecModule[] {
  const lines = markdown.split("\n");
  const modules: ParsedSpecModule[] = [];
  let currentModule: ParsedSpecModule | null = null;
  let endpointBlocks: EndpointBlock[] = [];
  let moduleCounter = 0;
  const firstContentLine = lines.findIndex((l) => l.trim().length > 0);
  // In H1-fallback mode the first H1 is usually the document title — but a
  // single-H1 document uses it as the module itself.
  const h1Count = h1Modules ? lines.filter((l) => /^#\s+/.test(l)).length : 0;

  const flushCurrent = () => {
    if (currentModule && endpointBlocks.length > 0) {
      currentModule.endpoints = parseEndpointBlocks(endpointBlocks);
      modules.push(currentModule);
    }
  };

  const beginModule = (sectionName: string) => {
    flushCurrent();
    const numMatch = sectionName.match(/^(\d+)[.\s]+/);
    moduleCounter++;
    currentModule = {
      number: numMatch ? numMatch[1] : String(moduleCounter),
      name: sectionName,
      fullName: sectionName,
      endpoints: [],
    };
    endpointBlocks = [];
  };

  const startEndpoint = (i: number, info: EndpointHeadingInfo, line: string) => {
    if (endpointBlocks.length > 0) {
      endpointBlocks[endpointBlocks.length - 1].block.pop();
    }
    endpointBlocks.push({
      start: i, heading: info.title, id: info.id,
      method: info.method, path: info.path, block: [line],
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingLevel = (/^(#{1,4})\s+/.exec(line)?.[1].length ?? 0) as 0 | 1 | 2 | 3 | 4;

    if (headingLevel === 2) {
      // Flattened endpoint? Models sometimes write "## GET /api/users" as an
      // endpoint heading (no H3 wrapper) inside a module.
      if (currentModule) {
        const info = parseEndpointHeading(line);
        if (info?.method) {
          startEndpoint(i, info, line);
          continue;
        }
      }
      if (!h1Modules) {
        const sectionName = line.replace(/^##\s+/, "").trim();
        if (SKIP_SECTIONS.some((s) => sectionName.startsWith(s))) {
          endpointBlocks = [];
          continue;
        }
        beginModule(sectionName);
      } else if (endpointBlocks.length > 0) {
        // H2 inside an H1-module document: sub-section, keep in current block
        endpointBlocks[endpointBlocks.length - 1].block.push(line);
      }
      continue;
    }

    if (headingLevel === 1) {
      if (h1Modules) {
        // The first H1 is usually the document title, not a module.
        if (i === firstContentLine && h1Count > 1) continue;
        const sectionName = line.replace(/^#\s+/, "").trim();
        if (SKIP_SECTIONS.some((s) => sectionName.startsWith(s))) {
          endpointBlocks = [];
          continue;
        }
        beginModule(sectionName);
      } else if (endpointBlocks.length > 0) {
        endpointBlocks[endpointBlocks.length - 1].block.push(line);
      }
      continue;
    }

    // H3/H4 — endpoint candidates (only inside a module)
    if (!currentModule) continue;
    const info = parseEndpointHeading(line);
    if (info) {
      startEndpoint(i, info, line);
      continue;
    }
    // Non-endpoint H3/H4 (section headings inside an endpoint block)
    if (endpointBlocks.length > 0) {
      endpointBlocks[endpointBlocks.length - 1].block.push(line);
    }
  }

  flushCurrent();
  return modules;
}

function parseEndpointBlocks(blocks: EndpointBlock[]): ParsedEndpoint[] {
  return blocks.map((b) => {
    const blockText = b.block.join("\n");
    const fields = extractFields(blockText);

    let method = fields.method || b.method || "";
    let path = (fields.service || b.path || "").replace(/^`+|`+$/g, "").trim();
    if (path && !method) {
      const bundledMethodMatch = path.match(/^(GET|POST|PUT|DELETE|PATCH)\s+/);
      if (bundledMethodMatch) {
        method = bundledMethodMatch[1];
        path = path.slice(bundledMethodMatch[0].length).trim().replace(/^`+|`+$/g, "");
      }
    }
    let title = b.heading;

    const headingMethodMatch = b.heading.match(METHOD_RE);
    if (headingMethodMatch && !method) {
      method = headingMethodMatch[1];
      const afterMethod = b.heading.slice(b.heading.indexOf(method) + method.length).trim();
      const pathEnd = afterMethod.search(/[\s(]/);
      const rawPath = pathEnd > -1 ? afterMethod.slice(0, pathEnd) : afterMethod;
      path = rawPath.replace(/^`+|`+$/g, "").trim();
      title = afterMethod.slice(rawPath.length).trim().replace(/^\(/, "").replace(/\)$/, "").trim();
    }

    if (!title || title === b.heading) {
      const purpose = fields.purpose;
      if (purpose) title = purpose.slice(0, 80);
    }

    return {
      no: extractField(blockText, /NO:\s*([\w.]+)/) || b.id || extractHeadingId(b.heading) || b.heading || "",
      method,
      path,
      title: title || b.heading || "",
      purpose: fields.purpose || "",
      note: fields.note || "",
      body: fields.body || fields["request body"] || "",
      response: fields.response || fields["response success"] || fields["response failed"] || "",
      query: fields.query || fields["parameter input"] || "",
      validation: fields.validation || "",
      filter: fields.filter || "",
      action: fields.action || "",
      logic: fields.logic || "",
      detail: fields.detail || "",
      rawMarkdown: blockText,
    };
  });
}

function extractFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    let match = trimmed.match(BOLD_FIELD_RE);
    if (match) {
      const key = match[2].toLowerCase().replace(/\s*\([^)]*\)\s*/, "").trim();
      if (!(key in fields)) fields[key] = match[3].trim();
      continue;
    }

    match = trimmed.match(PLAIN_FIELD_RE);
    if (match) {
      const key = match[1].toLowerCase().replace(/\s*\([^)]*\)\s*/, "").trim();
      if (!(key in fields)) fields[key] = match[2].trim();
    }
  }

  return fields;
}

function extractField(text: string, regex: RegExp): string {
  const m = regex.exec(text);
  return m ? m[1].trim() : "";
}

function extractHeadingId(heading: string): string {
  const m = heading.match(/^([A-Z][A-Za-z0-9]*)\s+[—–-]/);
  return m ? m[1] : "";
}
