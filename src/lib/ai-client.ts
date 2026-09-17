/**
 * CLIENT BARREL — the only browser-side file that imports the AI SDK.
 *
 * Twin of `src/server/agent/ai.ts` on the server side (FR-A11). One barrel
 * per side, not "no AI SDK types in the UI" — because the UI genuinely needs
 * `UIMessage` to render parts, and `useChat` returns them. By centralizing
 * imports in two files, an AI SDK upgrade touches at most
 * two files, not the whole app.
 *
 * Do NOT import `ai` or `@ai-sdk/react` directly from components.
 * Verify:
 *   grep -rn 'from "ai"\|from "@ai-sdk/react"' src/ --include=*.tsx --include=*.ts \
 *     | grep -v 'src/server/agent/ai.ts' | grep -v 'src/lib/ai-client.ts'
 */

export { useChat } from "@ai-sdk/react";

/** The transport `useChat` uses to call the Onesist endpoint. */
export { DefaultChatTransport } from "ai";

export type { UIMessage, UIMessagePart, ChatStatus, ToolUIPart, DynamicToolUIPart } from "ai";

/** Part predicates. Used to render the transcript without guessing part shapes. */
export { isTextUIPart, isReasoningUIPart, isToolUIPart, isDynamicToolUIPart, getToolName, getStaticToolName } from "ai";

/** Text part of a UI message. */
export type TextPart = { type: "text"; text: string };
