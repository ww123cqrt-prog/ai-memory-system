/**
 * TdaiCore — Host-neutral facade for TDAI memory capabilities.
 *
 * This is the single entry point that both OpenClaw and Hermes/Gateway call
 * to perform recall, capture, search, and pipeline management. It depends
 * only on abstract interfaces (HostAdapter, LLMRunner), never on a specific host.
 *
 * Usage:
 *   // OpenClaw path (in-process)
 *   const adapter = new OpenClawHostAdapter({ api, pluginDataDir, config });
 *   const core = new TdaiCore({ hostAdapter: adapter, config: parsedCfg });
 *   await core.initialize();
 *   const recall = await core.handleBeforeRecall("user query", "session-1");
 *
 *   // Gateway path (HTTP)
 *   const adapter = new StandaloneHostAdapter({ ... });
 *   const core = new TdaiCore({ hostAdapter: adapter, config: parsedCfg });
 *   await core.initialize();
 *   // HTTP handler calls core.handleBeforeRecall / core.handleTurnCommitted / etc.
 */
import type { HostAdapter, LLMRunnerFactory, RecallResult, CaptureResult, CompletedTurn, MemorySearchParams, ConversationSearchParams } from "./types.js";
import type { MemoryTdaiConfig } from "../config.js";
import type { IMemoryStore } from "./store/types.js";
import type { EmbeddingService } from "./store/embedding.js";
import { MemoryPipelineManager } from "../utils/pipeline-manager.js";
import { SessionFilter } from "../utils/session-filter.js";
export interface TdaiCoreOptions {
    /** Host adapter providing runtime context, logger, and LLM runner factory. */
    hostAdapter: HostAdapter;
    /** Parsed TDAI memory configuration. */
    config: MemoryTdaiConfig;
    /** Session filter for excluding internal/benchmark sessions. */
    sessionFilter?: SessionFilter;
    /** Plugin instance ID for metric reporting. */
    instanceId?: string;
}
export declare class TdaiCore {
    private hostAdapter;
    private cfg;
    private logger;
    private dataDir;
    private runnerFactory;
    private sessionFilter;
    private instanceId?;
    private vectorStore?;
    private embeddingService?;
    private scheduler?;
    /**
     * Promise gate for the one-shot scheduler-start sequence.
     *
     * ``ensureSchedulerStarted`` reads a checkpoint file (async) and then
     * calls ``scheduler.start(restoredStates)``.  Under the Gateway, several
     * HTTP requests can reach ``handleTurnCommitted`` concurrently and all
     * race into that function.  Using a plain boolean flag is unsafe: the
     * first caller flips the flag to ``true`` *before* the await completes,
     * so subsequent callers slip past the check and touch the scheduler
     * before ``start()`` has actually run — which makes ``start()``'s
     * ``sessionStates.set(key, restored)`` later clobber the state that
     * those concurrent captures already incremented.
     *
     * Storing the in-flight promise lets every concurrent caller ``await``
     * the same start sequence.  Once it resolves the promise is kept as a
     * sentinel so subsequent calls are a single already-resolved await
     * (effectively a no-op).
     */
    private schedulerStartPromise?;
    private storeReady?;
    /**
     * In-flight fire-and-forget background tasks started by
     * ``handleTurnCommitted`` (currently: deferred L0 embedding for
     * SQLite-style stores — see auto-capture.ts path A).
     *
     * ``destroy()`` awaits all pending entries (with a hard timeout)
     * before closing ``vectorStore`` / ``embeddingService`` so that a
     * late ``updateL0Embedding`` cannot land on an already-closed
     * database connection.
     *
     * Each task registers itself on creation and removes itself in its
     * own ``finally`` handler, so the set stays bounded by the number
     * of currently-running background tasks.
     */
    private readonly bgTasks;
    constructor(opts: TdaiCoreOptions);
    /**
     * Initialize data directories, storage, and pipeline scheduler.
     * Must be called once before any other methods.
     */
    initialize(): Promise<void>;
    /**
     * Destroy all resources. Call on shutdown.
     */
    destroy(): Promise<void>;
    /**
     * Handle recall (memory retrieval) before an LLM turn.
     * Maps to: OpenClaw `before_prompt_build` / Hermes `prefetch()`.
     */
    handleBeforeRecall(userText: string, sessionKey: string): Promise<RecallResult>;
    /**
     * Handle turn commitment (conversation capture + pipeline trigger).
     * Maps to: OpenClaw `agent_end` / Hermes `sync_turn()`.
     */
    handleTurnCommitted(turn: CompletedTurn): Promise<CaptureResult>;
    /**
     * Search L1 structured memories.
     * Maps to: `tdai_memory_search` tool.
     */
    searchMemories(params: MemorySearchParams): Promise<{
        text: string;
        total: number;
        strategy: string;
    }>;
    /**
     * Search L0 raw conversations.
     * Maps to: `tdai_conversation_search` tool.
     */
    searchConversations(params: ConversationSearchParams): Promise<{
        text: string;
        total: number;
    }>;
    /**
     * Handle end-of-conversation for a single session.
     *
     * ⚠️ Read this if you are editing the method:
     *
     * There are two distinct shutdown-ish events, and they must **NOT**
     * share an implementation:
     *
     *   - **`gateway_stop` (OpenClaw / process exit)**
     *     The host is going away.  Tear everything down — scheduler,
     *     VectorStore, EmbeddingService, caches.  That is
     *     {@link destroy}, not this method.
     *
     *   - **`on_session_end` (Hermes) / `POST /session/end` (Gateway)**
     *     One conversation ended while the process keeps serving other
     *     concurrent sessions.  **Only** this session's buffered work
     *     should be flushed; every other session's timers, buffers,
     *     pipeline state, and the shared scheduler itself MUST remain
     *     untouched.  That is this method.
     *
     * Historically this method did ``scheduler.destroy() +
     * createPipelineManager()``, which conflated the two semantics and
     * wiped concurrent sessions' in-memory state on every ``/session/end``
     * call.  That bug is covered by the concurrency test
     * ``P0-1: handleSessionEnd must be scoped to its session``.
     *
     * @param sessionKey  Session whose buffered work should be flushed.
     *                    Unknown keys are tolerated as a no-op so callers
     *                    don't have to pre-check whether the session was
     *                    already evicted or never produced a capture.
     */
    handleSessionEnd(sessionKey: string): Promise<void>;
    /**
     * Trigger L1/L2/L3 processing for a session whose L0 rows already exist.
     *
     * This is used by scheduler/backfill jobs that ingest raw conversations
     * directly into the L0 store. It deliberately does not call auto-capture and
     * does not write marker messages; the L1 runner reads persisted L0 rows using
     * its normal checkpoint cursor.
     */
    processStoredL0Session(sessionKey: string): Promise<void>;
    /** Get the LLM runner factory (for creating host-neutral LLM runners). */
    getLLMRunnerFactory(): LLMRunnerFactory;
    /** Get the shared VectorStore (may be undefined if init failed). */
    getVectorStore(): IMemoryStore | undefined;
    /** Get the shared EmbeddingService (may be undefined if not configured). */
    getEmbeddingService(): EmbeddingService | undefined;
    /** Get the pipeline scheduler (may be undefined if extraction disabled). */
    getScheduler(): MemoryPipelineManager | undefined;
    /** Whether the scheduler has been started (or is currently starting). */
    isSchedulerStarted(): boolean;
    /** Set the instance ID for metrics (may be resolved asynchronously). */
    setInstanceId(id: string): void;
    private initStores;
    private wirePipelineRunners;
    private ensureSchedulerStarted;
}
//# sourceMappingURL=tdai-core.d.ts.map