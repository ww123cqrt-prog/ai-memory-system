/**
 * Checkpoint management for tracking memory processing progress.
 *
 * ## Split-state design
 *
 * Per-session state is split into two independent namespaces to prevent
 * the PipelineManager and L0/L1 runners from overwriting each other's fields:
 *
 * - **runner_states** (`RunnerSessionState`): owned by CheckpointManager methods
 *   (markL1*, advanceSession*). Contains L0 capture cursor, L1 cursor, scene name.
 *
 * - **pipeline_states** (`PipelineSessionState`): owned exclusively by
 *   PipelineManager via `mergePipelineStates()`. Contains conversation_count,
 *   extraction times, L2 tracking fields.
 *
 * Each side only reads/writes its own namespace, eliminating the split-brain
 * overwrite bug where pipeline persistStates() could clobber runner-written fields.
 *
 * ## Concurrency safety
 *
 * All mutating methods (read-modify-write) are serialized via a per-file async lock.
 * Multiple CheckpointManager instances sharing the same file path automatically share
 * the same lock, so callers can freely `new CheckpointManager()` without coordination.
 * Writes use atomic tmp+rename to prevent corruption on crash.
 */
/**
 * Per-session state managed by L0/L1 runners (written directly to checkpoint).
 * These fields are ONLY written by CheckpointManager methods (markL1*, advanceSession*, etc.)
 * and are NEVER touched by the PipelineManager's persistStates().
 */
export interface RunnerSessionState {
    /** Epoch ms of the newest message captured for THIS session.
     *  Used instead of the global `Checkpoint.last_captured_timestamp` so that
     *  concurrent sessions don't advance each other's cursors and cause missed messages. */
    last_captured_timestamp: number;
    /** L0 JSONL cursor: epoch ms of last message processed by L1 */
    last_l1_cursor: number;
    /** Tie-breaker for L1 cursor when multiple L0 rows share the same recorded_at. */
    last_l1_record_id: string;
    /** Last scene name from the most recent L1 extraction (for cross-batch continuity) */
    last_scene_name: string;
}
/**
 * Per-session state managed exclusively by PipelineManager (written via mergePipelineStates).
 * These fields are ONLY written by the pipeline's persistStates() callback
 * and are NEVER touched by CheckpointManager's L0/L1 methods.
 */
export interface PipelineSessionState {
    /** Conversation rounds since last L1 trigger */
    conversation_count: number;
    /** ISO timestamp of the last extraction completion */
    last_extraction_time: string;
    /** ISO timestamp cursor for incremental extraction reads */
    last_extraction_updated_time: string;
    /** Epoch ms of the last notifyConversation call */
    last_active_time: number;
    /** Mirrors conversation_count at L1 completion time (for L2 tracking) */
    l2_pending_l1_count: number;
    /**
     * Current warm-up threshold for L1 triggering.
     * Starts at 1 for new sessions and doubles after each L1 completion
     * (1 → 2 → 4 → 8 → ...) until it reaches everyNConversations.
     * 0 means warm-up is complete (use everyNConversations directly).
     */
    warmup_threshold: number;
    /** ISO timestamp of last L2 extraction completion */
    l2_last_extraction_time: string;
}
export interface Checkpoint {
    /** Epoch ms of the newest message successfully uploaded. Messages with ts > this are new. */
    last_captured_timestamp: number;
    /** Total messages processed across all time */
    total_processed: number;
    last_persona_at: number;
    last_persona_time: string;
    request_persona_update: boolean;
    persona_update_reason: string;
    memories_since_last_persona: number;
    scenes_processed: number;
    /** Runner-managed per-session state (L0 capture cursor, L1 cursor, scene name).
     *  Written ONLY by CheckpointManager methods. */
    runner_states: Record<string, RunnerSessionState>;
    /** Pipeline-managed per-session state (conversation_count, extraction times, etc.).
     *  Written ONLY by the pipeline's mergePipelineStates(). */
    pipeline_states: Record<string, PipelineSessionState>;
    /** Total L0 conversation files recorded */
    l0_conversations_count: number;
    /** Total L1 memories extracted across all time */
    total_memories_extracted: number;
}
export interface CheckpointLogger {
    info(msg: string): void;
    warn?(msg: string): void;
}
export declare class CheckpointManager {
    private filePath;
    private logger;
    constructor(dataDir: string, logger?: CheckpointLogger);
    private readRaw;
    /** Atomic write: write to tmp file, then rename into place. */
    private writeRaw;
    /**
     * Execute a mutating operation under the per-file lock.
     * `fn` receives the current checkpoint and may modify it in place;
     * the updated checkpoint is atomically written back.
     */
    private mutate;
    /**
     * Read the current checkpoint (unlocked snapshot).
     *
     * NOTE: This does NOT acquire the file lock. The returned snapshot may be
     * stale if a concurrent `mutate()` is in progress. This is acceptable for
     * read-only uses (status display, deciding whether to run a pipeline step).
     *
     * For read-then-write patterns, always use `mutate()` instead — it acquires
     * the lock and re-reads from disk inside the critical section, ensuring the
     * update is based on the latest state.
     */
    read(): Promise<Checkpoint>;
    /** Write a full checkpoint (acquires lock + atomic write). */
    write(checkpoint: Checkpoint): Promise<void>;
    markPersonaGenerated(totalProcessed: number): Promise<void>;
    clearPersonaRequest(): Promise<void>;
    setPersonaUpdateRequest(reason: string): Promise<void>;
    incrementScenesProcessed(): Promise<void>;
    /**
     * Get or create runner session state for a session.
     */
    getRunnerState(cp: Checkpoint, sessionKey: string): RunnerSessionState;
    /**
     * Get or create pipeline session state for a session.
     */
    getPipelineState(cp: Checkpoint, sessionKey: string): PipelineSessionState;
    /**
     * Get all pipeline states from checkpoint.
     */
    getAllPipelineStates(cp: Checkpoint): Record<string, PipelineSessionState>;
    /**
     * Merge pipeline session states into the checkpoint (used by pipeline persister).
     * Acquires the file lock so this is safe against concurrent mutations.
     *
     * This writes ONLY to `pipeline_states`, never touching `runner_states`.
     * This is the core guarantee that eliminates the split-brain overwrite bug.
     */
    mergePipelineStates(states: Record<string, PipelineSessionState>): Promise<void>;
    /**
     * Mark L1 extraction completed: reset sinceL1 counter, advance L1 cursor,
     * and optionally save the last scene name for cross-batch continuity.
     *
     * @param cursorRecordedAtMs - The max recorded_at epoch ms of processed L0 messages.
     *   This becomes the new `last_l1_cursor` value (recorded_at semantics, not conversation timestamp).
     */
    markL1ExtractionComplete(sessionKey: string, memoriesExtracted: number, cursorRecordedAtMs?: number, cursorRecordId?: string, lastSceneName?: string): Promise<void>;
    /**
     * Atomically read the per-session cursor, execute the capture callback,
     * and advance the cursor — all within a single file-lock critical section.
     *
     * This eliminates the race window that existed when `read()` (unlocked) and
     * `advanceSessionCapturedTimestamp()` (locked) were separate calls:
     * two concurrent `agent_end` events could both read the same stale cursor
     * and record duplicate messages.
     *
     * The callback receives `afterTimestamp` (the current per-session cursor)
     * and must return either:
     *   - `{ maxTimestamp, messageCount }` to advance the cursor, or
     *   - `null` to leave the cursor unchanged (nothing captured).
     *
     * L0 conversation count is also incremented inside the lock when messages
     * are captured, removing the need for a separate `incrementL0ConversationCount()` call.
     *
     * @param sessionKey   Per-session identifier
     * @param pluginStartTimestamp  Cold-start floor (used when no cursor exists yet)
     * @param fn  Async callback that performs the actual capture (recordConversation, etc.)
     */
    captureAtomically(sessionKey: string, pluginStartTimestamp: number | undefined, fn: (afterTimestamp: number) => Promise<{
        maxTimestamp: number;
        messageCount: number;
    } | null>): Promise<void>;
}
//# sourceMappingURL=checkpoint.d.ts.map