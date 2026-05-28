/**
 * Pipeline factory: shared infrastructure for creating and wiring
 * MemoryPipelineManager instances with VectorStore, EmbeddingService,
 * L1 runner, L2 runner, L3 runner, and persister.
 *
 * Used by both:
 * - `index.ts` (live plugin runtime)
 * - `seed-runtime.ts` (standalone seed CLI command)
 *
 * This avoids duplicating VectorStore init, L1/L2/L3 extraction logic,
 * persister wiring, and destroy sequences across multiple callers.
 */
import type { MemoryTdaiConfig } from "../config.js";
import { MemoryPipelineManager } from "./pipeline-manager.js";
import type { L2Runner, L3Runner } from "./pipeline-manager.js";
import { SessionFilter } from "./session-filter.js";
import type { PipelineSessionState } from "./checkpoint.js";
import type { IMemoryStore } from "../core/store/types.js";
import type { EmbeddingService } from "../core/store/embedding.js";
export interface PipelineLogger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
export interface PipelineFactoryOptions {
    /** Plugin data directory (L0, records, scene_blocks, vectors.db, etc.). */
    pluginDataDir: string;
    /** Parsed memory-tdai config. */
    cfg: MemoryTdaiConfig;
    /** OpenClaw config object (needed for LLM calls in L1). */
    openclawConfig: unknown;
    /** Logger instance. */
    logger: PipelineLogger;
    /** Session filter (optional, defaults to empty). */
    sessionFilter?: SessionFilter;
    /** Host-neutral LLM runner for L1 extraction (text-only, enableTools=false). */
    l1LlmRunner?: import("../core/types.js").LLMRunner;
    /** Host-neutral LLM runner for L2/L3 (tool-call enabled, enableTools=true). */
    l2l3LlmRunner?: import("../core/types.js").LLMRunner;
}
export interface PipelineInstance {
    /** The pipeline scheduler. */
    scheduler: MemoryPipelineManager;
    /** VectorStore (undefined if init failed or degraded). */
    vectorStore: IMemoryStore | undefined;
    /** EmbeddingService (undefined if not configured or init failed). */
    embeddingService: EmbeddingService | undefined;
    /**
     * Destroy all resources (scheduler, VectorStore, EmbeddingService).
     * Call this on shutdown / cleanup.
     */
    destroy: () => Promise<void>;
}
/**
 * Ensure all required data subdirectories exist under `pluginDataDir`.
 * Safe to call multiple times (mkdirSync with `recursive: true`).
 */
export declare function initDataDirectories(dataDir: string): void;
export interface StoreInitResult {
    vectorStore: IMemoryStore | undefined;
    embeddingService: EmbeddingService | undefined;
    /** Whether a background re-index is needed (embedding config changed). */
    needsReindex: boolean;
    reindexReason?: string;
}
/**
 * Initialize store backend and (optionally) EmbeddingService.
 *
 * **Once-async semantics per dataDir**: the first call for a given
 * `pluginDataDir` creates the store and caches the result; subsequent
 * calls with the same dir return the cached Promise immediately.
 * Call `resetStores()` during shutdown to clear the cache.
 *
 * Supports both SQLite (sync init) and TCVDB (async init) backends.
 */
export declare function initStores(cfg: MemoryTdaiConfig, pluginDataDir: string, logger: PipelineLogger): Promise<StoreInitResult>;
/**
 * Reset the cached store singleton(s).
 *
 * Call this during `gateway_stop` (after closing the actual store/embedding
 * resources) so that a subsequent `register()` on hot-restart can
 * re-initialize fresh instances.
 *
 * @param pluginDataDir  If provided, only clear the cache for that dir.
 *                       If omitted, clear all cached stores.
 */
export declare function resetStores(pluginDataDir?: string): void;
/**
 * Create the standard L1 runner function.
 *
 * Reads L0 messages (from VectorStore DB or JSONL fallback), groups by sessionId,
 * runs extractL1Memories for each group, and updates the checkpoint cursor.
 */
export declare function createL1Runner(opts: {
    pluginDataDir: string;
    cfg: MemoryTdaiConfig;
    openclawConfig: unknown;
    vectorStore: IMemoryStore | undefined;
    embeddingService: EmbeddingService | undefined;
    logger: PipelineLogger;
    /**
     * Getter for the plugin instance ID used for metric reporting.
     * Called at runner execution time (not at creation time) so that the ID is
     * available even when the runner is wired before instanceId is resolved.
     * Metrics are skipped when the getter returns undefined.
     */
    getInstanceId?: () => string | undefined;
    /** Host-neutral LLM runner for L1 extraction (standalone/gateway mode). */
    llmRunner?: import("../core/types.js").LLMRunner;
}): (params: {
    sessionKey: string;
}) => Promise<{
    processedCount: number;
}>;
/**
 * Create the standard pipeline state persister.
 * Saves pipeline session states to the checkpoint file.
 */
export declare function createPersister(pluginDataDir: string, logger: PipelineLogger): (states: Record<string, PipelineSessionState>) => Promise<void>;
/**
 * Create the standard L2 runner function (scene extraction).
 *
 * Reads L1 memory records (incremental via VectorStore or JSONL fallback),
 * runs SceneExtractor, and returns the latest cursor for pipeline-manager
 * to track incremental progress.
 *
 * Used by both `index.ts` (live runtime) and `seed-runtime.ts` (seed CLI).
 */
export declare function createL2Runner(opts: {
    pluginDataDir: string;
    cfg: MemoryTdaiConfig;
    openclawConfig: unknown;
    vectorStore: IMemoryStore | undefined;
    logger: PipelineLogger;
    instanceId?: string;
    /** Host-neutral LLM runner for L2 scene extraction (standalone/gateway mode). Must have enableTools=true. */
    llmRunner?: import("../core/types.js").LLMRunner;
}): L2Runner;
/**
 * Create the standard L3 runner function (persona generation).
 *
 * Uses PersonaTrigger to check if generation is needed, then runs
 * PersonaGenerator. Used by both `index.ts` and `seed-runtime.ts`.
 */
export declare function createL3Runner(opts: {
    pluginDataDir: string;
    cfg: MemoryTdaiConfig;
    openclawConfig: unknown;
    vectorStore?: IMemoryStore;
    logger: PipelineLogger;
    instanceId?: string;
    /** Host-neutral LLM runner for L3 persona generation (standalone/gateway mode). Must have enableTools=true. */
    llmRunner?: import("../core/types.js").LLMRunner;
}): L3Runner;
/**
 * Create a MemoryPipelineManager with the standard config mapping.
 */
export declare function createPipelineManager(cfg: MemoryTdaiConfig, logger: PipelineLogger, sessionFilter?: SessionFilter): MemoryPipelineManager;
/**
 * Create a fully wired pipeline instance: VectorStore + EmbeddingService +
 * MemoryPipelineManager with L1 runner and persister attached.
 *
 * This is the high-level entry point used by both `index.ts` and `seed-runtime.ts`.
 * Callers should attach L2/L3 runners after creation using `createL2Runner()`
 * and `createL3Runner()` from this module.
 */
export declare function createPipeline(opts: PipelineFactoryOptions): Promise<PipelineInstance>;
//# sourceMappingURL=pipeline-factory.d.ts.map