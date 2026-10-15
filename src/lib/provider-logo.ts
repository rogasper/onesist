/**
 * Logo shown next to a provider in the model picker and the provider settings.
 * Each preset shows its own brand; a custom endpoint shows the mark of the wire
 * protocol it speaks (OpenAI-compatible → OpenAI, Anthropic-compatible → Anthropic).
 * Brand marks: public/icons/brand/ (CC0, see public/icons/brand-SOURCE.md). The OpenAI
 * mark is MIT artwork from xandemon/developer-icons (public/icons/developer-SOURCE.md).
 * Agent CLI logos are the ones in public/images/ (lookup via agentLogo()).
 */
const BRAND = "/icons/brand";

export const OPENCODE_LOGO = "/images/opencode.png";
export const OPENAI_LOGO = "/icons/developer/DevOps-AI-ML/openai.svg";
export const ANTHROPIC_LOGO = `${BRAND}/anthropic.svg`;

/** Logo per preset id. Presets missing here (Groq, xAI, Zhipu GLM) have no mark yet. */
const PRESET_LOGOS: Record<string, string> = {
  openai: OPENAI_LOGO,
  "custom-responses": OPENAI_LOGO,
  "custom-openai": OPENAI_LOGO,
  anthropic: ANTHROPIC_LOGO,
  "custom-anthropic": ANTHROPIC_LOGO,
  gemini: `${BRAND}/googlegemini.svg`,
  deepseek: `${BRAND}/deepseek.svg`,
  kimi: `${BRAND}/kimi.svg`,
  qwen: `${BRAND}/qwen.svg`,
  minimax: `${BRAND}/minimax.svg`,
  mistral: `${BRAND}/mistralai.svg`,
  openrouter: `${BRAND}/openrouter.svg`,
  ollama: `${BRAND}/ollama.svg`,
  lmstudio: `${BRAND}/lmstudio.svg`,
  vllm: `${BRAND}/vllm.svg`,
  "cli-opencode": OPENCODE_LOGO,
  "cli-claude": "/images/claude.png",
  "cli-codex": "/images/codex.png",
  "cli-antigravity": "/images/antigravity.png",
  "cli-pi": "/images/pi.svg",
};

export interface LogoSource {
  apiStyle?: string | null;
  cliAgent?: string | null;
  preset?: string | null;
}

export function providerLogo(p: LogoSource): string | null {
  // A known preset shows its own mark or none; only a provider saved without a preset id
  // falls back to the mark of its protocol.
  if (p.preset) return PRESET_LOGOS[p.preset] ?? null;
  if (p.apiStyle === "cli") return p.cliAgent === "opencode" ? OPENCODE_LOGO : null;
  if (p.apiStyle === "completions" || p.apiStyle === "responses") return OPENAI_LOGO;
  if (p.apiStyle === "anthropic-messages") return ANTHROPIC_LOGO;
  return null;
}
