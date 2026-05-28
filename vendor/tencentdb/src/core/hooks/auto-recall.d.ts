/**
 * auto-recall hook (v3): injects relevant memories + persona into agent context
 * before the agent starts processing.
 *
 * - Searches L1 memories using configurable strategy (keyword / embedding / hybrid)
 *   - keyword: FTS5 BM25 (requires FTS5; returns empty if unavailable)
 *   - embedding: VectorStore cosine similarity
 *   - hybrid: keyword + embedding merged with RRF
 * - L3 persona injection
 * - L2 scene navigation (full injection, LLM decides relevance)
 */
import type { MemoryTdaiConfig } from "../../config.js";
import type { IMemoryStore } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
interface Logger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
/** A single recalled L1 memory with its search score and type. */
export interface RecalledMemory {
    content: string;
    score: number;
    type: string;
}
export interface RecallResult {
    /** L1 relevant memories — prepended to user prompt text (dynamic, per-turn) */
    prependContext?: string;
    /** Stable recall context appended to system prompt (persona, scene nav, tools guide — cacheable) */
    appendSystemContext?: string;
    /** L1 memories that were recalled (with scores), for metric reporting */
    recalledL1Memories?: RecalledMemory[];
    /** L3 Persona raw content loaded during recall (null if none) */
    recalledL3Persona?: string | null;
    /** Effective search strategy used */
    recallStrategy?: string;
}
export declare function performAutoRecall(params: {
    userText: string;
    actorId: string;
    sessionKey: string;
    cfg: MemoryTdaiConfig;
    pluginDataDir: string;
    logger?: Logger;
    vectorStore?: IMemoryStore;
    embeddingService?: EmbeddingService;
}): Promise<RecallResult | undefined>;
export {};
//# sourceMappingURL=auto-recall.d.ts.map