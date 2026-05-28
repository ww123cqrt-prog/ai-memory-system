import type { OffloadEntry, PluginLogger } from "./types.js";
/** Default root data directory (parent of all agent subdirectories) */
export declare const DEFAULT_DATA_ROOT: string;
/** Immutable per-session storage path context. Created once per session switch. */
export interface StorageContext {
    readonly dataRoot: string;
    readonly dataDir: string;
    readonly refsDir: string;
    readonly mmdsDir: string;
    readonly offloadJsonl: string;
    readonly stateFile: string;
    readonly agentName: string;
    readonly sessionId: string;
}
/**
 * Build an immutable StorageContext for a given agent + session.
 * Once created, paths are frozen and cannot be affected by other sessions.
 */
export declare function createStorageContext(dataRoot: string, agentName: string, sessionId: string): StorageContext;
/**
 * Parse a sessionKey into agentName and sessionId.
 * Expected format: "agent:<agent-name>:<session-id>"
 *
 * Worker isolation: if the sessionId contains a "swebench-w{N}" pattern
 * (from multi-worker inference), the worker suffix is merged into agentName
 * so each worker gets its own dataDir (state.json, mmds/, refs/).
 *
 * Returns null if format doesn't match.
 */
export declare function parseSessionKey(sessionKey: string): {
    agentName: string;
    sessionId: string;
} | null;
/** Ensure all required directories exist for the given context */
export declare function ensureDirs(ctx: StorageContext): Promise<void>;
/** Record a sessionKey → realSessionId mapping in the agent's registry. */
export declare function registerSession(ctx: StorageContext, sessionKey: string, realSessionId: string): Promise<void>;
/** Look up the real sessionId for a given sessionKey from the registry. */
export declare function lookupSessionId(ctx: StorageContext, sessionKey: string): Promise<string | null>;
/** List all registered sessions for the given context. */
export declare function listRegisteredSessions(ctx: StorageContext): Promise<Array<{
    sessionKey: string;
    [key: string]: unknown;
}>>;
/** Layer 0 — Source text sanitize. Strips unsafe characters from arbitrary text. */
export declare function sanitizeText(text: string): string;
/** Layer 1 — Write sanitize. Strips unsafe characters from a JSON string with roundtrip verification. */
export declare function sanitizeJsonLine(jsonStr: string): string;
/** Layer 3 — Entry schema validation. */
export declare function validateEntry(entry: unknown): boolean;
/** Layer 2+3+4 — Safe JSONL parser with tolerance, validation, and metrics. */
export declare function parseJsonlSafe(content: string, options?: {
    sourceLabel?: string;
    skipValidation?: boolean;
}): {
    entries: Array<Record<string, unknown>>;
    corruptCount: number;
    invalidCount: number;
    corruptSample: string | null;
};
/** Append one or more entries to an offload JSONL with write-time dedup. */
export declare function appendOffloadEntries(ctx: StorageContext, entries: OffloadEntry[], targetSessionId?: string, logger?: PluginLogger): Promise<void>;
/** Read all entries from the current session's offload JSONL. */
export declare function readOffloadEntries(ctx: StorageContext, logger?: PluginLogger): Promise<OffloadEntry[]>;
/** Rewrite the current session's offload JSONL with the given entries (sanitized) */
export declare function rewriteOffloadEntries(ctx: StorageContext, entries: OffloadEntry[]): Promise<void>;
/** Mark offload entries by tool_call_id with an `offloaded` status. */
export declare function markOffloadStatus(ctx: StorageContext, updates: Map<string, string | boolean>): Promise<void>;
/** Extract confirmed (offloaded) tool_call_ids from entries. */
export declare function extractConfirmedIdsFromEntries(entries: Array<OffloadEntry & {
    offloaded?: unknown;
}>): Set<string>;
/** Extract aggressively deleted tool_call_ids from entries. */
export declare function extractDeletedIdsFromEntries(entries: Array<OffloadEntry & {
    offloaded?: unknown;
}>): Set<string>;
/** Read offload entries from ALL session files under ctx.dataDir. */
export declare function readAllOffloadEntries(ctx: StorageContext, logger?: PluginLogger): Promise<Array<OffloadEntry & {
    _sourceFile?: string;
}>>;
/** Write entries back to their respective source files. */
export declare function rewriteAllOffloadEntries(ctx: StorageContext, entries: Array<Record<string, unknown> | any>): Promise<void>;
/** Update specific entries by tool_call_id across ALL session files (L2 backfill). */
export declare function updateOffloadNodeIds(ctx: StorageContext, updates: Map<string, string>): Promise<void>;
/** Convert ISO 8601 timestamp to a safe filename (replace special chars) */
export declare function isoToFilename(iso: string): string;
/** Write tool result content to a ref MD file, return relative path */
export declare function writeRefMd(ctx: StorageContext, timestamp: string, toolName: string, content: string): Promise<string>;
/** Read a ref MD file by relative path */
export declare function readRefMd(ctx: StorageContext, refPath: string): Promise<string | null>;
/** A single replace block for patchMmd */
export interface MmdReplaceBlock {
    /** 1-based start line number (inclusive) */
    startLine: number;
    /** 1-based end line number (inclusive). If endLine < startLine, treat as pure insertion */
    endLine: number;
    /** Replacement content (may contain newlines) */
    content: string;
}
/** Write/overwrite an MMD file */
export declare function writeMmd(ctx: StorageContext, filename: string, content: string): Promise<void>;
/** Apply incremental line-based replace blocks to an existing MMD file. */
export declare function patchMmd(ctx: StorageContext, filename: string, blocks: MmdReplaceBlock[]): Promise<boolean>;
/** Read an MMD file */
export declare function readMmd(ctx: StorageContext, filename: string): Promise<string | null>;
/** Delete an MMD file */
export declare function deleteMmd(ctx: StorageContext, filename: string): Promise<boolean>;
/** List all MMD files in the mmds directory */
export declare function listMmds(ctx: StorageContext): Promise<string[]>;
/** Read the state.json file */
export declare function readStateFile<T>(ctx: StorageContext, defaultValue: T): Promise<T>;
/** Write the state.json file */
export declare function writeStateFile<T>(ctx: StorageContext, state: T): Promise<void>;
//# sourceMappingURL=storage.d.ts.map