/**
 * Configure the tiktoken encoding used for token counting.
 * Call once at startup before any snapshot calls.
 * If the encoding changes, the cached encoder is invalidated.
 */
export declare function configureTokenTracker(encodingName?: string): void;
/** Count tokens for a text string using tiktoken BPE encoding. */
export declare function tiktokenCount(text: string): number;
export interface ContextSnapshot {
    timestamp: string;
    stage: string;
    encoding: string;
    totalTokens: number;
    systemTokens: number;
    messagesTokens: number;
    userPromptTokens: number;
    messageCount: number;
}
/** JSON replacer that strips internal metadata keys from serialization. */
export declare function jsonReplacer(key: string, value: unknown): unknown;
/**
 * Invalidate the token cache for a message whose content was mutated in-place
 * (e.g. by replaceWithSummary). Must be called after any content mutation.
 */
export declare function invalidateTokenCache(msg: any): void;
/**
 * Tiktoken-only snapshot (messages JSON + optional user prompt dedupe).
 * Does not write logs.
 * Internal metadata keys (_offloaded, _mmdContextMessage, etc.) are stripped
 * before serialization so they don't inflate the token count.
 *
 * Uses per-message WeakMap cache: unchanged messages (same object reference
 * and same _offloaded flag) reuse previously computed token counts.
 */
export declare function buildTiktokenContextSnapshot(stage: string, messages: any[], systemPromptText: string | null, userPromptText: string | null, precomputed?: {
    systemTokens?: number;
    userPromptTokens?: number;
}): ContextSnapshot;
//# sourceMappingURL=context-token-tracker.d.ts.map