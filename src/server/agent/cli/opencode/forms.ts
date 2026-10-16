/**
 * OpenCode's forms (`form.created`, answered with POST .../form/:id/reply) as the run's questions.
 * The question tool asks through a form; its fields become one question each, and the card's
 * answers are turned back into the form's values. Shapes come from the OpenCode 2 schema
 * (Form.Field, Form.Answer) that its own web client uses.
 */
export interface OcFormOption {
  value: string;
  label: string;
  description?: string | null;
}

export interface OcFormField {
  key: string;
  type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external";
  title?: string | null;
  description?: string | null;
  required?: boolean | null;
  hidden?: boolean | null;
  options?: OcFormOption[] | null;
  url?: string | null;
  custom?: boolean | null;
}

export interface OcForm {
  id: string;
  sessionID: string;
  title?: string | null;
  fields: OcFormField[];
}

export type FormValue = string | number | boolean | string[];

const YES = "Ya";
const NO = "Tidak";

/** The fields Onesist can ask: not external sign-ins, not hidden ones. */
function askable(form: OcForm): OcFormField[] {
  return form.fields.filter((f) => f.type !== "external" && !f.hidden);
}

function optionsOf(field: OcFormField): string[] {
  if (field.type === "boolean") return [YES, NO];
  return (field.options ?? []).map((o) => o.label);
}

export function formQuestions(form: OcForm): { fields: OcFormField[]; questions: { question: string; options: string[] }[] } {
  const fields = askable(form);
  const questions = fields.map((f) => ({ question: f.title || f.key, options: optionsOf(f) }));
  return { fields, questions };
}

/**
 * The form's answer from the card's answers (one per field, positional). Null answers and
 * non-numbers for number fields are refused; the caller cancels the form then.
 */
export function formAnswer(fields: OcFormField[], answers: (string | null)[]): { ok: true; answer: Record<string, FormValue> } | { ok: false; message: string } {
  const answer: Record<string, FormValue> = {};
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const raw = answers[i];
    const title = field.title || field.key;
    if (raw === null || raw === undefined) return { ok: false, message: `Tidak ada jawaban untuk "${title}".` };
    const text = raw.trim();
    if (text === "" && !field.required) continue;
    if (field.type === "boolean") {
      if (text === YES) answer[field.key] = true;
      else if (text === NO) answer[field.key] = false;
      else return { ok: false, message: `Jawaban "${title}" harus Ya atau Tidak.` };
    } else if (field.type === "number" || field.type === "integer") {
      const n = Number(text);
      if (text === "" || !Number.isFinite(n) || (field.type === "integer" && !Number.isInteger(n))) return { ok: false, message: `Jawaban "${title}" harus berupa angka.` };
      answer[field.key] = n;
    } else if (field.type === "multiselect") {
      const picked = text.split(",").map((t) => t.trim()).filter(Boolean);
      answer[field.key] = picked.map((label) => field.options?.find((o) => o.label === label)?.value ?? label);
    } else {
      const option = field.options?.find((o) => o.label === text);
      answer[field.key] = option ? option.value : text;
    }
  }
  return { ok: true, answer };
}
