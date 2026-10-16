/**
 * OpenCode's `question` tool asks through a form (form.created). Its fields become the
 * questions of the run's question card, and the card's answers become the form's answer.
 *
 *   bun test src/server/agent/cli/opencode/forms.test.ts
 */
import { expect, test } from "bun:test";
import { formAnswer, formQuestions, type OcForm } from "./forms";

const form: OcForm = {
  id: "frm_1",
  sessionID: "ses_1",
  title: "Cakupan kerja",
  fields: [
    { key: "scope", type: "string", title: "Seberapa luas garapan?", options: [{ value: "gap", label: "Tambal gap" }, { value: "full", label: "Tulis ulang" }] },
    { key: "confirm", type: "boolean", title: "Lanjut sekarang?" },
    { key: "count", type: "integer", title: "Berapa bab?" },
    { key: "note", type: "string", title: "Catatan tambahan", required: false },
    { key: "tags", type: "multiselect", title: "Pilih tag", options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }] },
    { key: "hidden", type: "string", title: "Rahasia", hidden: true },
    { key: "login", type: "external", url: "https://example.test", title: "Masuk" },
  ],
};

test("each askable field becomes one question; external and hidden fields are not asked", () => {
  const { questions, fields } = formQuestions(form);
  expect(fields.map((f) => f.key)).toEqual(["scope", "confirm", "count", "note", "tags"]);
  expect(questions.map((q) => q.question)).toEqual(["Seberapa luas garapan?", "Lanjut sekarang?", "Berapa bab?", "Catatan tambahan", "Pilih tag"]);
  expect(questions[0].options).toEqual(["Tambal gap", "Tulis ulang"]);
  expect(questions[1].options).toEqual(["Ya", "Tidak"]);
  expect(questions[2].options).toEqual([]);
});

test("answers turn back into the form's values: labels to values, yes/no to booleans, text kept as typed", () => {
  const { fields } = formQuestions(form);
  const result = formAnswer(fields, ["Tambal gap", "Ya", "3", "", "Alpha, Beta"]);
  expect(result).toEqual({ ok: true, answer: { scope: "gap", confirm: true, count: 3, tags: ["a", "b"] } });
  const custom = formAnswer(fields, ["Bebas", "Tidak", "2", "catatan", "Beta"]);
  expect(custom).toEqual({ ok: true, answer: { scope: "Bebas", confirm: false, count: 2, note: "catatan", tags: ["b"] } });
});

test("a missing answer or a non-number for a number field is refused, not sent", () => {
  const { fields } = formQuestions(form);
  expect(formAnswer(fields, ["Tambal gap", null, "3", "", "Alpha"]).ok).toBe(false);
  const bad = formAnswer(fields, ["Tambal gap", "Ya", "tiga", "", "Alpha"]);
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.message).toContain("Berapa bab?");
});
