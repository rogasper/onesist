/**
 * The suggestions an empty chat offers (M5 item 22), computed from what the project has.
 *
 * Each suggestion is a prompt that fills the composer; nothing is sent until the user
 * sends it, the same rule ZCode uses. The rules follow the analyst's pipeline: FSD, then
 * spec and ERD, then the test cases, then a consistency check when the spec is older than
 * the FSD.
 */
export interface ProjectState {
  fsdCount: number;
  endpointCount: number;
  erdTableCount: number;
  taskCount: number;
  testCaseCount: number;
  /** The newest FSD changed after the newest spec was saved. */
  fsdNewerThanSpec: boolean;
}

export interface ProjectSuggestion {
  label: string;
  prompt: string;
}

/** Shown at most this many at a time: the empty state has room for four. */
const LIMIT = 4;

export function suggestionsFor(state: ProjectState): ProjectSuggestion[] {
  const out: ProjectSuggestion[] = [];
  if (state.fsdCount === 0) {
    out.push({
      label: "Periksa isi project",
      prompt: "Periksa berkas apa saja yang sudah ada di project ini dan apa yang masih perlu dibuat.",
    });
  }
  if (state.fsdCount > 0 && state.endpointCount === 0) {
    out.push({ label: "Buat spec API dari FSD", prompt: "Buat spec API dari dokumen FSD di input/fsd dan simpan di output/spec." });
  }
  if (state.fsdCount > 0 && state.erdTableCount === 0) {
    out.push({ label: "Buat ERD dari FSD", prompt: "Buat ERD dari dokumen FSD di input/fsd, lalu tulis DBML-nya di output/erd." });
  }
  if (state.endpointCount > 0 && state.testCaseCount === 0) {
    out.push({ label: "Susun SIT", prompt: "Susun test case SIT untuk endpoint yang ada di spec API, lalu simpan di output/sit." });
  }
  if (state.endpointCount > 0 && state.fsdNewerThanSpec) {
    out.push({
      label: "Periksa konsistensi",
      prompt: "Periksa konsistensi spec API dengan FSD terbaru. Laporkan yang tidak cocok, tanpa mengubah berkas.",
    });
  }
  if (state.erdTableCount > 0 && state.endpointCount > 0) {
    out.push({ label: "Entitas tanpa endpoint", prompt: "Ringkas ERD dan sebutkan entitas yang belum punya endpoint." });
  }
  if (state.fsdCount > 0 && state.taskCount === 0) {
    out.push({ label: "Pecah FSD jadi task", prompt: "Pecah FSD di input/fsd menjadi task card beserta dependensinya." });
  }
  // The summary always keeps its place: it is the one suggestion that fits any project.
  return [...out.slice(0, LIMIT - 1), { label: "Ringkas project", prompt: "Ringkas isi project ini: dokumen apa saja yang ada dan apa yang belum selesai." }];
}
