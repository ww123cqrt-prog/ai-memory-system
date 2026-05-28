/**
 * Context Offload Module Entry
 *
 * Exports `registerOffload(api, offloadConfig)` for conditional registration
 * from the main plugin index.ts.
 *
 * This module is the merged equivalent of the standalone context-offload-plugin's index.js,
 * adapted to co-exist with the memory-tencentdb plugin.
 */
import { OffloadStateManager } from "./state-manager.js";
import type { OffloadConfig } from "../config.js";
declare function simpleHash(str: string): number;
declare function _extractLatestTurn(_messages: any[], currentPrompt: string | null): string | null;
declare function _extractMsgText(msg: any): string;
declare function _normalizePromptForCompare(text: string | null): string;
/**
 * Check if a message text looks like a heartbeat probe.
 * Matches both user heartbeat prompts and assistant HEARTBEAT_OK replies.
 */
declare function _isHeartbeatText(text: string): boolean;
/**
 * Extract recent history messages for L1/L2 context, organized as
 * user-assistant pairs: each user message followed by up to
 * `maxAssistantPerUser` assistant replies from that turn.
 *
 * Output format:
 *   [User]: xxx
 *   [Assistant]: aaa
 *   [User]: yyy
 *   [Assistant]: bbb
 *   [Assistant]: ccc
 *
 * Scans messages in forward order, skipping MMD injections, heartbeat
 * probes, and the current prompt (to avoid duplication).
 */
declare function _extractRecentHistory(messages: any[], currentPrompt?: string | null, maxAssistantPerUser?: number): string | null;
declare function _buildL1RecentContext(stateManager: OffloadStateManager): string;
/** L1.5-specific format: history as reference first, latest user message as focus last. */
declare function _buildL15RecentContext(stateManager: OffloadStateManager): string;
declare function isInternalMemorySession(sessionKey: string | null | undefined): boolean;
export declare function registerOffload(api: any, offloadConfig: OffloadConfig): void;
declare class OffloadContextEngine {
    private _sessions;
    private _logger;
    private _pCfg;
    private _getContextWindow;
    private _notifyL2NewNullEntries;
    private _clearL2Timeout;
    private _l4State;
    private _flushL1;
    private _backendClient;
    private _judgeL15;
    private _disposeL15;
    constructor(opts: any);
    /**
     * Hot-update all internal references. Called on every registerOffload()
     * invocation so the singleton engine always delegates to the LATEST
     * closures (hooks, sessions, flushL1, etc.) produced by the most recent
     * register() call — which is the only one whose hooks are actually live.
     */
    update(opts: any): void;
    get info(): {
        id: string;
        name: string;
        version: string;
        ownsCompaction: boolean;
    };
    bootstrap(params: any): Promise<{
        bootstrapped: boolean;
        reason: string;
    } | {
        bootstrapped: boolean;
        reason?: undefined;
    }>;
    ingest(params: any): Promise<{
        ingested: boolean;
    }>;
    assemble(params: any): Promise<{
        messages: any[];
        estimatedTokens: number;
        systemPromptAddition?: undefined;
    } | {
        messages: any[];
        estimatedTokens: number;
        systemPromptAddition: string | undefined;
    }>;
    compact(params: any): Promise<any>;
    afterTurn(_params: any): Promise<void>;
    maintain(_params: any): Promise<{
        changed: boolean;
        bytesFreed: number;
        rewrittenEntries: number;
    }>;
    dispose(): Promise<void>;
}
export declare const _testExports: {
    _isHeartbeatText: typeof _isHeartbeatText;
    _extractMsgText: typeof _extractMsgText;
    _normalizePromptForCompare: typeof _normalizePromptForCompare;
    _extractLatestTurn: typeof _extractLatestTurn;
    _extractRecentHistory: typeof _extractRecentHistory;
    _buildL1RecentContext: typeof _buildL1RecentContext;
    _buildL15RecentContext: typeof _buildL15RecentContext;
    isInternalMemorySession: typeof isInternalMemorySession;
    simpleHash: typeof simpleHash;
    OffloadContextEngine: typeof OffloadContextEngine;
};
export {};
//# sourceMappingURL=index.d.ts.map