/**
 * Backend HTTP Client for Context Offload.
 *
 * When `backendUrl` is configured, L1/L1.5/L2/L4 LLM calls are routed
 * through this client to the backend service. The backend handles
 * prompt construction + LLM invocation; the client handles data
 * collection and file I/O.
 *
 * All methods throw on failure — callers are responsible for fallback.
 */
import type { OffloadEntry, TaskJudgment, PluginLogger } from "./types.js";
export interface L1Request {
    recentMessages: string;
    toolPairs: Array<{
        toolName: string;
        toolCallId: string;
        params: unknown;
        result: unknown;
        timestamp: string;
    }>;
    pluginConfig?: Record<string, unknown>;
}
export interface L1Response {
    entries: OffloadEntry[];
}
export interface L15Request {
    recentMessages: string;
    currentMmd?: {
        filename: string;
        content: string;
        path: string;
    } | null;
    availableMmdMetas: Array<{
        filename: string;
        path: string;
        taskGoal: string;
        doneCount: number;
        doingCount: number;
        todoCount: number;
        updatedTime?: string | null;
        nodeSummaries?: Array<{
            nodeId: string;
            status: string;
            summary: string;
        }>;
    }>;
}
export interface L15Response extends TaskJudgment {
}
export interface L2Request {
    existingMmd: string | null;
    newEntries: Array<{
        tool_call_id: string;
        tool_call: string;
        summary: string;
        timestamp: string;
    }>;
    recentHistory: string | null;
    currentTurn: string | null;
    taskLabel: string;
    mmdPrefix: string;
    mmdCharCount: number;
}
export interface L2Response {
    fileAction: "write" | "replace";
    mmdContent?: string;
    replaceBlocks?: Array<{
        startLine: number;
        endLine: number;
        content: string;
    }>;
    nodeMapping: Record<string, string>;
}
export interface L4Request {
    mmdFilename: string;
    mmdContent: string;
    offloadEntries: OffloadEntry[];
    skillFocus: string | null;
}
export interface L4Response {
    skillName: string;
    skillDescription: string;
    skillContent: string;
}
/**
 * Arbitrary key/value payload uploaded to the backend `/offload/v1/store` endpoint.
 * The backend stores the raw JSON body verbatim; see `internal/handler/store.go`.
 */
export type StoreStatePayload = Record<string, unknown>;
export interface StoreStateResponse {
    insertedId?: string;
}
export declare class BackendClient {
    private baseUrl;
    private apiKey;
    /** Hardcoded timeout for all backend calls (L1/L1.5/L2/L4) */
    private static readonly TIMEOUT_MS;
    private logger;
    private sessionKeyFn;
    /** Resolves the value of the `X-User-Id` header sent on every call. */
    private userIdFn;
    /** Resolves the value of the `X-Task-Id` header sent on every call (optional). */
    private taskIdFn;
    constructor(baseUrl: string, logger: PluginLogger, apiKey?: string, _defaultTimeoutMs?: number, // kept for backward compat, ignored
    sessionKeyFn?: () => string | null, userIdFn?: () => string | null, taskIdFn?: () => string | null);
    /** L1 Summarize — synchronous await (used by assemble flush + force trigger) */
    l1Summarize(req: L1Request): Promise<L1Response>;
    /** L1.5 Task Judgment — synchronous await, uses unified timeout */
    l15Judge(req: L15Request): Promise<L15Response>;
    /** L2 MMD Generation — async background, uses unified timeout */
    l2Generate(req: L2Request): Promise<L2Response>;
    /** L4 Skill Generation — synchronous await, uses unified timeout */
    l4Generate(req: L4Request): Promise<L4Response>;
    /**
     * Upload an arbitrary state payload to the backend `/offload/v1/store` endpoint.
     * Fire-and-forget style — the caller is expected to `.catch(...)` rejections.
     * Uses a short timeout so reporting never blocks hook execution meaningfully.
     */
    storeState(payload: StoreStatePayload): Promise<StoreStateResponse>;
    private post;
}
//# sourceMappingURL=backend-client.d.ts.map