/**
 * SessionRegistry: Per-session OffloadStateManager routing.
 *
 * Maps sessionKey → { manager, lastAccessMs } with LRU eviction.
 * Eliminates the global singleton stateManager — each session gets
 * its own isolated OffloadStateManager + StorageContext.
 */
import { OffloadStateManager } from "./state-manager.js";
/** Per-session context entry held by the registry. */
export interface SessionCtx {
    readonly sessionKey: string;
    readonly manager: OffloadStateManager;
    lastAccessMs: number;
}
/** Routes sessionKey → per-session OffloadStateManager with LRU eviction. */
export declare class SessionRegistry {
    private _sessions;
    private _dataRoot;
    readonly _registryId: number;
    private static _registryCounter;
    constructor(dataRoot: string);
    /** Get the configured data root. */
    get dataRoot(): string;
    /**
     * Get or create a per-session manager.
     * First access will create a new OffloadStateManager, call init() + switchSession()
     * to fully initialize storage paths and rebuild in-memory state from offload files.
     */
    resolve(sessionKey: string, realSessionId?: string): Promise<SessionCtx>;
    /**
     * Resolve a session only if it is NOT an internal memory-pipeline session.
     *
     * Returns null for memory sessions (e.g. `memory-{taskId}-session-{ts}`),
     * preventing unnecessary OffloadStateManager creation, disk I/O, and LRU
     * cache slot pollution for sessions that should never run offload.
     *
     * Callers that need unconditional resolve (e.g. tests) can still use resolve().
     */
    resolveIfAllowed(sessionKey: string, realSessionId?: string): Promise<SessionCtx | null>;
    /** Look up an existing session (does not create). Updates lastAccessMs. */
    get(sessionKey: string): SessionCtx | undefined;
    /** Number of cached sessions. */
    get size(): number;
    /** Iterate over all session keys. */
    keys(): IterableIterator<string>;
    /** Iterate over all session entries. */
    values(): IterableIterator<SessionCtx>;
    /** Evict the least-recently-accessed session. */
    private _evictOldest;
}
//# sourceMappingURL=session-registry.d.ts.map