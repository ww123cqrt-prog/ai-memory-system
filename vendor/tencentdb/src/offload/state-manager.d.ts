import type { StorageContext } from "./storage.js";
import type { ToolPair, PluginState, OffloadEntry, L15Boundary } from "./types.js";
export declare class OffloadStateManager {
    /** Immutable storage path context — set by init() or switchSession() */
    private _ctx;
    /** Buffered tool pairs waiting to be processed by L1 */
    pendingToolPairs: Array<ToolPair & {
        _sessionId?: string | null;
    }>;
    /** Set of already-processed tool call IDs to prevent duplicates */
    processedToolCallIds: Set<string>;
    /** Persistent state (synced with state.json) */
    private state;
    /** Whether state has been loaded from disk */
    private loaded;
    /** Mutex for L1 pipeline to prevent concurrent runs */
    private l1Lock;
    private mmdInjectionReady;
    private injectedMmdVersions;
    /** Whether L1.5 has successfully executed for the current session/prompt.
     *  L2 must wait for this to be true before triggering. */
    l15Settled: boolean;
    /** Unique instance ID for debugging (each new OffloadStateManager gets a new id). */
    readonly _instanceId: number;
    private static _instanceCounter;
    /** Set of toolCallIds confirmed offloaded in previous rounds. */
    confirmedOffloadIds: Set<string>;
    /** Set of toolCallIds that were aggressively DELETED. */
    deletedOffloadIds: Set<string>;
    /** Reconciliation retry counter */
    _reconcileRetries: Map<string, number>;
    /** Cached offload entries map */
    _cachedOffloadMap: Map<string, OffloadEntry> | null;
    /** Monotonic version counter */
    _offloadMapVersion: number;
    /** Last MMD injection token count */
    lastMmdInjectedTokens: number;
    /** Cached system prompt from last llm_input */
    cachedSystemPrompt: string | null;
    /** Cached user prompt from last llm_input */
    cachedUserPrompt: string | null;
    /** Cached latest turn messages for L2 */
    cachedLatestTurnMessages: string | null;
    /** Cached recent history for L2 background triggers */
    cachedRecentHistory: string | null;
    /** Cached system prompt token count */
    cachedSystemPromptTokens: number | null;
    /** Cached user prompt token count */
    cachedUserPromptTokens: number | null;
    /** Force emergency compression on next L3 entry */
    _forceEmergencyNext: boolean;
    /** Last known total token count from precise tiktoken calculation (P1 quick-skip) */
    lastKnownTotalTokens: number;
    /** Message count at last precise tiktoken calculation (P1 quick-skip) */
    lastKnownMessageCount: number;
    /** Consecutive QUICK-SKIP count; reset to 0 on each precise calculation */
    consecutiveQuickSkips: number;
    /** Boundary info from last aggressive deletion — enables O(1) head-delete on replay.
     *  originalIndex: position of the first kept message in the original input array.
     *  fingerprint: hash of that message for verification.
     *  keptMsgCount: number of messages kept after aggressive.
     *  remainingTokens: total tokens (incl sys) after aggressive compression. */
    _lastAggressiveBoundary: {
        originalIndex: number;
        fingerprint: number;
        keptMsgCount: number;
        remainingTokens: number;
    } | null;
    /** Cached tool params from before_tool_call hook */
    _pendingParams: Map<string, Record<string, unknown>>;
    /** Last L1.5 prompt hash — per-session to avoid cross-session re-trigger skip */
    lastL15PromptHash: number | null;
    /** Per-chunk consecutive L1 failure count. Key = first toolCallId of the chunk. */
    _l1ChunkFailCounts: Map<string, number>;
    /** Consecutive L1.5 all-null response count. Reset to 0 on successful judgment. */
    l15ConsecutiveNullCount: number;
    /** Global entry counter, incremented after each appendOffloadEntries. */
    entryCounter: number;
    /** Settled boundaries (ascending by startIndex). */
    l15Boundaries: L15Boundary[];
    /** Get the current session's StorageContext. Throws if not initialized. */
    get ctx(): StorageContext;
    /** Get agent name from ctx (null if not initialized) */
    get agentName(): string | null;
    /** Get session id from ctx (null if not initialized) */
    get sessionId(): string | null;
    /**
     * Initialize the manager for a specific agent + session.
     * Creates StorageContext, ensures directories, and loads persistent state.
     */
    init(dataRoot: string, agentName: string, sessionId: string): Promise<void>;
    save(): Promise<void>;
    addToolPair(pair: ToolPair): void;
    getPendingCount(): number;
    hasPending(): boolean;
    takePending(max: number): Array<ToolPair & {
        _sessionId?: string | null;
    }>;
    isProcessed(toolCallId: string): boolean;
    getActiveMmdFile(): string | null;
    getActiveMmdId(): string | null;
    setActiveMmd(file: string | null, id: string | null): void;
    nextMmdNumber(): Promise<number>;
    getMmdCounter(): number;
    getLastSessionKey(): string | null;
    setLastSessionKey(key: string | null): void;
    /**
     * Switch to a new session. Rebuilds StorageContext and reloads state.
     * @param sessionKey - Full session key (e.g. "agent:main:session-123")
     * @param dataRoot - Storage root directory
     * @param realSessionId - Optional override for the parsed sessionId
     */
    switchSession(sessionKey: string, dataRoot: string, realSessionId?: string): Promise<boolean>;
    getLastOffloadedToolCallId(): string | null;
    setLastOffloadedToolCallId(toolCallId: string | null): void;
    acquireL1Lock(): Promise<() => void>;
    getLastL2TriggerTime(): string | null;
    setLastL2TriggerTime(time: string | null): void;
    getState(): Readonly<PluginState>;
    isLoaded(): boolean;
    setMmdInjectionReady(ready: boolean): void;
    isMmdInjectionReady(): boolean;
    setInjectedMmdVersion(filename: string, fingerprint: string): void;
    getInjectedMmdVersion(filename: string): string | null;
    removeInjectedMmdVersion(filename: string): void;
    getAllInjectedMmdVersions(): Record<string, string>;
    clearInjectedMmdVersions(): void;
    setEstimatedSystemOverhead(tokens: number): void;
    getEstimatedSystemOverhead(): number | null;
    invalidateOffloadMapCache(): void;
    getCachedOffloadMap(): Map<string, OffloadEntry> | null;
    setCachedOffloadMap(map: Map<string, OffloadEntry>): void;
    getOffloadMapVersion(): number;
    cacheToolParams(toolCallId: string, params: Record<string, unknown>): void;
    consumeToolParams(toolCallId: string): Record<string, unknown> | null;
    /**
     * Append a new boundary (must be in ascending startIndex order).
     * If the last boundary has the same startIndex, overwrite it instead of
     * appending — this happens during fast task switching when no tool calls
     * (and thus no L1 entries) are produced between consecutive L1.5 judgments.
     */
    pushBoundary(boundary: L15Boundary): void;
    /**
     * Find the boundary that covers the given entry index.
     * Returns the last boundary whose startIndex <= entryIndex,
     * or null if no boundary covers it (entry predates all boundaries).
     */
    resolveEntryBoundary(entryIndex: number): L15Boundary | null;
}
//# sourceMappingURL=state-manager.d.ts.map