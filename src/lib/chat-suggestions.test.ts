import { describe, expect, test } from "bun:test";
import { extractSuggestions, extractSuggestionsFromText, MAX_CHAT_SUGGESTIONS, suggestionsInParts } from "./chat-suggestions";

const fence = (body: string) => "```suggestions\n" + body + "\n```";

describe("chat suggestions", () => {
  test("strips the block and returns its items", () => {
    const result = extractSuggestionsFromText(`Login sudah dibuat.\n\n${fence("- Jalankan test login\n- Buat dokumentasi API")}`);
    expect(result.text).toBe("Login sudah dibuat.");
    expect(result.suggestions).toEqual(["Jalankan test login", "Buat dokumentasi API"]);
  });

  test("keeps the number the model wrote, up to the cap", () => {
    const result = extractSuggestionsFromText(fence(["- satu", "- dua", "- tiga", "- empat", "- lima", "- enam", "- tujuh"].join("\n")));
    expect(result.suggestions).toHaveLength(MAX_CHAT_SUGGESTIONS);
    expect(result.suggestions.at(-1)).toBe("enam");
  });

  test("accepts numbering, bullets and quotes", () => {
    const result = extractSuggestionsFromText(fence('1. "Buat endpoint"\n* Tambah test\n• Rapikan docs'));
    expect(result.suggestions).toEqual(["Buat endpoint", "Tambah test", "Rapikan docs"]);
  });

  test("accepts a JSON array", () => {
    const result = extractSuggestionsFromText(fence('["Buat endpoint", "Tambah test"]'));
    expect(result.suggestions).toEqual(["Buat endpoint", "Tambah test"]);
  });

  test("deduplicates and drops empty items", () => {
    const result = extractSuggestionsFromText(fence("- sama\n\n- sama\n- lain"));
    expect(result.suggestions).toEqual(["sama", "lain"]);
  });

  test("an answer without the block is untouched", () => {
    const text = "Selesai.\n\n- ini daftar biasa\n- bukan saran";
    expect(extractSuggestionsFromText(text)).toEqual({ text, suggestions: [] });
  });

  test("another code fence is not a suggestions block", () => {
    const text = "```bash\nnpm test\n```";
    expect(extractSuggestionsFromText(text)).toEqual({ text, suggestions: [] });
  });

  test("an unclosed block is hidden while streaming", () => {
    const result = extractSuggestionsFromText("Selesai.\n\n```suggestions\n- baru setengah");
    expect(result.text).toBe("Selesai.");
    expect(result.suggestions).toEqual([]);
  });

  test("a block in the middle is removed and the prose after it survives", () => {
    const result = extractSuggestionsFromText(`Awal.\n${fence("- satu")}\nPenutup.`);
    expect(result.text).toBe("Awal.\n\nPenutup.");
    expect(result.suggestions).toEqual(["satu"]);
  });

  test("parts: text is cleaned, other parts stay, an empty text part is dropped", () => {
    const tool = { type: "tool-bash", toolCallId: "t1" };
    const parts = [
      { type: "text", text: "Jawaban." },
      tool,
      { type: "text", text: fence("- Lanjut") },
    ];
    const result = extractSuggestions(parts);
    expect(result.parts).toEqual([{ type: "text", text: "Jawaban." }, tool]);
    expect(result.suggestions).toEqual(["Lanjut"]);
    expect(suggestionsInParts(parts)).toEqual(["Lanjut"]);
  });
});
