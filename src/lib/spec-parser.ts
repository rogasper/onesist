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
const ENDPOINT_HEADING_RE = /^#{3,4}\s*(?:NO:\s*)?([\w.]+)\s*[—–-]+\s*(.+)$/;
const NO_RE = /^#{3,4}\s*NO:\s*(.+)$/;
const BOLD_FIELD_RE = /^(- )?\*\*([\w\s()]+?):\*\*\s*(.*)$/;
const PLAIN_FIELD_RE = /^- ([\w\s()]+?):\s*(.*)$/;

const SKIP_SECTIONS = ["API Summary", "Global Standard", "Changelog", "Column Spreadsheet", "FSD Reference", "Overview", "Auth", "Summary of", "Role-based", "Migration Script", "Testing Checklist"];

export function parseMarkdownToModules(markdown: string): ParsedSpecModule[] {
  const markdownModules = parseMarkdownModules(markdown);
  if (markdownModules.some((m) => m.endpoints.length > 0)) return markdownModules;
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

function parseMarkdownModules(markdown: string): ParsedSpecModule[] {
  const lines = markdown.split("\n");
  const modules: ParsedSpecModule[] = [];
  let currentModule: ParsedSpecModule | null = null;
  let endpointBlocks: { start: number; heading: string; id: string; block: string[] }[] = [];
  let moduleCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^##\s+/.test(line)) {
      const sectionName = line.replace(/^##\s+/, "").trim();

      if (SKIP_SECTIONS.some((s) => sectionName.startsWith(s))) {
        endpointBlocks = [];
        continue;
      }

      if (currentModule && endpointBlocks.length > 0) {
        currentModule.endpoints = parseEndpointBlocks(endpointBlocks);
        modules.push(currentModule);
      }

      const numMatch = sectionName.match(/^(\d+)[.\s]+/);
      moduleCounter++;
      currentModule = {
        number: numMatch ? numMatch[1] : String(moduleCounter),
        name: sectionName,
        fullName: sectionName,
        endpoints: [],
      };
      endpointBlocks = [];
      continue;
    }

    if (!currentModule) continue;

    if (ENDPOINT_HEADING_RE.test(line)) {
      if (endpointBlocks.length > 0) {
        endpointBlocks[endpointBlocks.length - 1].block.pop();
      }
      const m = line.match(ENDPOINT_HEADING_RE)!;
      endpointBlocks.push({ start: i, heading: m[2].trim(), id: m[1].trim(), block: [line] });
    } else if (NO_RE.test(line)) {
      if (endpointBlocks.length > 0) {
        endpointBlocks[endpointBlocks.length - 1].block.pop();
      }
      const m = line.match(NO_RE)!;
      endpointBlocks.push({ start: i, heading: m[1].trim(), id: "", block: [line] });
    } else if (endpointBlocks.length > 0) {
      endpointBlocks[endpointBlocks.length - 1].block.push(line);
    }
  }

  if (currentModule && endpointBlocks.length > 0) {
    currentModule.endpoints = parseEndpointBlocks(endpointBlocks);
    modules.push(currentModule);
  }

  return modules;
}

function parseEndpointBlocks(blocks: { start: number; heading: string; id: string; block: string[] }[]): ParsedEndpoint[] {
  return blocks.map((b) => {
    const blockText = b.block.join("\n");
    const fields = extractFields(blockText);

    let method = fields.method || "";
    let path = (fields.service || "").replace(/^`+|`+$/g, "").trim();
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
