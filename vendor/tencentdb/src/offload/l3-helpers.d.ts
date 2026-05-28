import type { OffloadEntry } from "./types.js";
import type { OffloadStateManager } from "./state-manager.js";
/**
 * Anthropic-style tool ids sometimes appear as `toolu_bdrk_01...` (underscores)
 * in offload.jsonl while the live session uses `toolubdrk01...`. Normalize for lookup.
 */
export declare function normalizeToolCallIdForLookup(id: string): string;
export declare function getOffloadEntry(map: Map<string, OffloadEntry>, toolCallId: string): OffloadEntry | undefined;
/** Index offload entries by canonical id and by underscore-free form when they differ. */
export declare function populateOffloadLookupMap(map: Map<string, OffloadEntry>, entries: OffloadEntry[]): void;
/** Check if a message is a tool result */
export declare function isToolResultMessage(msg: any): boolean;
/** Extract tool call ID from a tool result message */
export declare function extractToolCallId(msg: any): string | null;
/** Check if a content block is a tool use block */
export declare function isToolUseBlock(block: any): boolean;
/** Get message content (handles transcript wrapper format) */
export declare function getMessageContent(msg: any): any;
/** Check if an assistant message contains tool_use blocks */
export declare function isAssistantMessageWithToolUse(msg: any): boolean;
/** Check if message contains tool_use (alias) */
export declare function isToolUseInAssistant(msg: any): boolean;
/** Extract tool_use ID from an assistant message (first tool_use block) */
export declare function extractToolUseIdFromAssistant(msg: any): string | null;
/**
 * Check if an assistant message contains ONLY tool_use blocks (no text or other content).
 */
export declare function isOnlyToolUseAssistant(msg: any): boolean;
/** Extract ALL tool_use block IDs from an assistant message */
export declare function extractAllToolUseIds(msg: any): string[];
/** Truncate a tool_call string to a compact form */
export declare function compactToolCall(toolCall: string | null | undefined): string;
/**
 * Compress a pure tool_use assistant message by replacing each tool_use block's
 * input/arguments with a compact offload summary.
 */
export declare function replaceAssistantToolUseWithSummary(msg: any, entries: OffloadEntry[]): void;
/** Replace a tool result message's content with the offload summary.
 *  Returns original and summary content lengths for diagnostics. */
export declare function replaceWithSummary(msg: any, entry: OffloadEntry): {
    originalLength: number;
    summaryLength: number;
};
/**
 * Compress non-current-task tool_use blocks inside an assistant message.
 */
export declare function compressNonCurrentToolUseBlocks(msg: any, offloadMap: Map<string, OffloadEntry>, currentTaskNodeIds: Set<string>, replacedIds?: Set<string>): void;
/** Get the set of node_ids belonging to the current active task */
export declare function getCurrentTaskNodeIds(stateManager: OffloadStateManager): Promise<Set<string>>;
//# sourceMappingURL=l3-helpers.d.ts.map