import { type PluginConfig, type PluginLogger } from "./types.js";
import type { OffloadStateManager } from "./state-manager.js";
/** Marker property on the injected message object. */
export declare const MMD_MESSAGE_MARKER = "_mmdContextMessage";
/**
 * Full inject — called from assemble / before_prompt_build (every user-message round)
 * and from llm_input (every LLM call).
 *
 * Only injects the ACTIVE MMD (determined by L1.5).
 * History MMDs are NOT injected here — they are only injected by L3 aggressive
 * compression (buildHistoryMmdInjection) after messages are deleted, as a
 * replacement for lost conversation context.
 */
export declare function injectMmdIntoMessages(messages: any[], stateManager: OffloadStateManager, logger: PluginLogger, getContextWindow: (() => number) | undefined, pluginConfig: Partial<PluginConfig> | undefined, options?: {
    waitForL15?: boolean;
}): Promise<{
    mmdTokens: number;
}>;
/**
 * Incremental update — called from after_tool_call (every tool-loop iteration).
 */
export declare function maybeUpdateMmdInMessages(messages: any[], stateManager: OffloadStateManager, logger: PluginLogger, getContextWindow: (() => number) | undefined, pluginConfig: Partial<PluginConfig> | undefined): Promise<boolean>;
/**
 * Find the best insertion point for the active MMD message.
 *
 * Strategy: insert AFTER the latest user message (in the second half of the
 * conversation), so the MMD sits between the user's question and the ongoing
 * tool loop — not at position 0 which pollutes the oldest context.
 *
 * Fallback: if the latest user message is in the first half (unlikely during
 * active tool loops), insert at the start of the trailing tool-result/assistant
 * block, clamped to within 30 messages from the tail.
 *
 * IMPORTANT: The insertion point must NOT split a tool_call / tool_result pair.
 * If the candidate position is between an assistant message containing tool_use
 * and its corresponding tool_result(s), shift backwards to before the assistant
 * message so the pair stays intact.
 */
export declare function findActiveMmdInsertionPoint(messages: any[]): number;
/**
 * Find insertion point for history MMD messages (injected after AGGRESSIVE deletion).
 *
 * Strategy: insert BEFORE the active MMD (if present) or at the same position
 * where the active MMD would go. History context should precede active context
 * so the LLM reads chronologically: history → active → recent tool loop.
 *
 * Unlike active MMD, history MMD should NOT go to index 0 — it should sit in
 * the middle of the conversation, just before the active task context.
 */
export declare function findHistoryMmdInsertionPoint(messages: any[]): number;
//# sourceMappingURL=mmd-injector.d.ts.map