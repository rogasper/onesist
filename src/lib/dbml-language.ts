import { StreamLanguage } from "@codemirror/language";

const KEYWORDS = /^(Table|Ref|Enum|Note|TableGroup|indexes)\b/i;
const SETTINGS = /^(pk|primary\s+key|unique|not\s+null|null|default|ref|note|increment)\b/i;
const TYPES =
  /^(uuid|varchar|char|character|text|int|integer|bigint|smallint|serial|bigserial|decimal|numeric|real|float|double|boolean|bool|timestamp|timestamptz|date|time|json|jsonb|bytea|blob|interval|money|bit|varbit|xml|inet|cidr|macaddr)\b/i;

interface DbmlState {
  blockComment: boolean;
}

export const dbmlLanguage = StreamLanguage.define<DbmlState>({
  startState: () => ({ blockComment: false }),
  token(stream, state) {
    if (state.blockComment) {
      if (stream.match(/^.*?\*\//)) {
        state.blockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.blockComment = true;
      return "comment";
    }
    if (stream.match(/^'(?:[^'\\]|\\.)*'/)) return "string";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^`(?:[^`\\]|\\.)*`/)) return "string";
    if (stream.match(/^-?\d+(?:\.\d+)?/)) return "number";
    if (stream.match(KEYWORDS)) return "keyword";
    if (stream.match(SETTINGS)) return "propertyName";
    if (stream.match(/^(true|false)\b/i)) return "bool";
    if (stream.match(TYPES)) return "typeName";
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_$]*/)) return "variableName";
    if (stream.match(/^(>=|<=|<>|><|>|<|-|=|\+|\*|\/|%)/)) return "operator";
    if (stream.match(/^[[\]{}(),.:;]/)) return "punctuation";
    stream.next();
    return null;
  },
});
