/**
 * Logo shown next to a provider in the model picker and the provider settings.
 * OpenAI-compatible endpoints wear the OpenAI mark: the wire protocol is theirs, the
 * brand is the one people recognise. The OpenAI mark is MIT-licensed artwork from
 * xandemon/developer-icons (see public/icons/developer-SOURCE.md).
 */
export const OPENCODE_LOGO = "/images/opencode.png";
export const OPENAI_LOGO = "/icons/developer/DevOps-AI-ML/openai.svg";

export interface LogoSource {
  apiStyle?: string | null;
  cliAgent?: string | null;
  preset?: string | null;
}

export function providerLogo(p: LogoSource): string | null {
  if (p.apiStyle === "cli") return p.cliAgent === "opencode" ? OPENCODE_LOGO : null;
  if (p.apiStyle === "completions" || p.apiStyle === "responses") return OPENAI_LOGO;
  return null;
}
