/**
 * llm_input L3 handler.
 * Calculates precise input tokens via tiktoken and executes L3 compression
 * (mild score-cascade replacement + aggressive oldest-prefix deletion).
 */
import { type OffloadEntry, type PluginConfig, type PluginLogger } from "../types.js";
import type { OffloadStateManager } from "../state-manager.js";
import type { BackendClient } from "../backend-client.js";
export declare function filterHeartbeatMessages(messages: any[], logger: PluginLogger | undefined): number;
export declare function isTokenOverflowError(err: any): boolean;
export declare const MILD_CASCADE_MIN_COUNT = 10;
export declare const MILD_CASCADE_INITIAL_SCORE = 7;
export declare const MILD_CASCADE_FLOOR_SCORE = 1;
export declare const AGGRESSIVE_MIN_MESSAGES_TO_KEEP = 2;
export declare const EMERGENCY_MIN_MESSAGES_TO_KEEP = 2;
export declare function dumpMessagesSnapshot(label: string, messages: any[], logger: PluginLogger): void;
export declare function createLlmInputL3Handler(stateManager: OffloadStateManager, logger: PluginLogger, getContextWindow: () => number, pluginConfig: Partial<PluginConfig> | undefined, callbacks?: {
    notifyL2NewNullEntries?: (count: number) => void;
}, backendClient?: BackendClient | null): (event: any) => Promise<void>;
export declare function compressByScoreCascade(messages: any[], offloadMap: Map<string, OffloadEntry>, currentTaskNodeIds: Set<string>, scanRatio: number, logger: PluginLogger, minCount?: number, initialScore?: number): {
    replacedCount: number;
    lastOffloadedId: string | null;
    finalThreshold: number;
    replacedToolCallIds: string[];
    replacedDetails: Array<{
        toolCallId: string;
        score: number;
        summaryPreview: string;
        originalLength?: number;
        summaryLength?: number;
    }>;
};
/**
 * One-shot aggressive compression.  Computes the exact cut point to bring
 * tokens below threshold in a single pass, then splices once.
 * No multi-round while loop — O(N) tiktoken + O(1) splice.
 */
export declare function aggressiveCompressUntilBelowThreshold(messages: any[], offloadMap: Map<string, OffloadEntry>, currentTaskNodeIds: Set<string>, deleteRatio: number, stateManager: OffloadStateManager, logger: PluginLogger, aggressiveThreshold: number, countTokens: (t: string) => number, sysPrompt: string | null, promptText: string | null): Promise<{
    deletedCount: number;
    rounds: number;
    remainingTokens: number;
    allDeletedToolCallIds: string[];
    stalledByUserMsg?: boolean;
}>;
export declare function emergencyCompress(messages: any[], targetTokens: number, countTokens: (t: string) => number, sysPrompt: string | null, promptText: string | null, logger: PluginLogger): {
    deletedCount: number;
    deletedToolCallIds: string[];
    remainingTokens: number;
};
export declare function removeExistingMmdInjections(messages: any[]): number;
export declare function buildHistoryMmdInjection(deletedToolCallIds: string[], offloadMap: Map<string, OffloadEntry>, offloadEntries: OffloadEntry[], stateManager: OffloadStateManager, logger: PluginLogger, countTokens: (t: string) => number, contextWindow: number, pluginConfig: Partial<PluginConfig> | undefined): Promise<{
    injectedMessages: any[];
    totalMmdTokens: number;
    mmdTokenBudget: number;
    mmdFiles: string[];
}>;
//# sourceMappingURL=llm-input-l3.d.ts.map