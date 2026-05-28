/**
 * TcvdbMemoryStore: Tencent Cloud VectorDB backend implementing IMemoryStore.
 *
 * Features:
 * - Server-side dense embedding (embeddingItems via Collection embedding config)
 * - Client-side sparse vectors (BM25 local encoder for hybridSearch)
 * - Native hybridSearch (dense + sparse + RRFRerank)
 * - Filter expressions for scalar field queries
 * - Time fields stored as uint64 epoch ms (ISO ↔ epoch conversion internal)
 *
 * All methods are fault-tolerant: return empty/false on error, never throw.
 */
import type { MemoryRecord } from "../record/l1-writer.js";
import type { EmbeddingProviderInfo } from "./embedding.js";
import type { IMemoryStore, StoreCapabilities, StoreInitResult, L1SearchResult, L1FtsResult, L1RecordRow, L1QueryFilter, L0SearchResult, L0FtsResult, L0QueryRow, L0SessionGroup, ProfileRecord, ProfileSyncRecord, StoreLogger } from "./types.js";
import type { BM25LocalEncoder } from "./bm25-local.js";
import type { SparseVector } from "@tencentdb-agent-memory/tcvdb-text";
export interface TcvdbMemoryStoreConfig {
    url: string;
    username: string;
    apiKey: string;
    database: string;
    embeddingModel: string;
    timeout: number;
    /** Path to CA certificate PEM file (for HTTPS connections) */
    caPemPath?: string;
    logger?: StoreLogger;
    bm25Encoder?: BM25LocalEncoder;
}
export declare class TcvdbMemoryStore implements IMemoryStore {
    private readonly client;
    private readonly embeddingModel;
    private readonly logger?;
    private readonly bm25Encoder?;
    private readonly l1Collection;
    private readonly l0Collection;
    private readonly profilesCollection;
    private degraded;
    /** Promise that resolves when async init completes. */
    private _initPromise;
    constructor(config: TcvdbMemoryStoreConfig);
    init(_providerInfo?: EmbeddingProviderInfo): Promise<StoreInitResult>;
    /**
     * Await async initialization. Call at the start of every async method.
     * If init already completed (or failed → degraded), returns immediately.
     */
    private _ensureInit;
    private static readonly VECTOR_INDEX_DISK_FLAT;
    private static readonly VECTOR_INDEX_HNSW;
    /**
     * Detect whether a createCollection error indicates DISK_FLAT is unsupported.
     * Matches on apiCode 15113 OR message containing "DISK_FLAT" + "not support".
     */
    private static isDiskFlatUnsupported;
    /**
     * Create a collection with DISK_FLAT vector index, falling back to HNSW
     * if the storage engine doesn't support DISK_FLAT.
     */
    private _createCollectionWithVectorFallback;
    private _initAsync;
    isDegraded(): boolean;
    getCapabilities(): StoreCapabilities;
    close(): void;
    /**
     * Paginated /document/query that fetches all matching docs.
     * TCVDB query API returns at most `limit` docs per call.
     * We loop with offset until fewer docs than page size are returned.
     */
    private _queryAllDocs;
    upsertL1(record: MemoryRecord, _embedding?: Float32Array): Promise<boolean>;
    private _upsertL1Async;
    /**
     * Batch upsert multiple L1 records in a single API call.
     * Used by migration scripts to reduce request count.
     */
    upsertL1Batch(records: MemoryRecord[]): Promise<number>;
    deleteL1(recordId: string): Promise<boolean>;
    deleteL1Batch(recordIds: string[]): Promise<boolean>;
    deleteL1Expired(cutoffIso: string): Promise<number>;
    countL1(): Promise<number>;
    queryL1Records(filter?: L1QueryFilter): Promise<L1RecordRow[]>;
    getAllL1Texts(): Promise<Array<{
        record_id: string;
        content: string;
        updated_time: string;
    }>>;
    searchL1Vector(_queryEmbedding: Float32Array, topK?: number, queryText?: string): Promise<L1SearchResult[]>;
    searchL1Fts(ftsQuery: string, limit?: number): Promise<L1FtsResult[]>;
    searchL1Hybrid(params: {
        query?: string;
        queryEmbedding?: Float32Array;
        sparseVector?: SparseVector;
        topK?: number;
    }): Promise<L1SearchResult[]>;
    /**
     * Async L1 hybrid search — the real implementation.
     * Call this directly from async contexts (hooks, tools).
     */
    searchL1HybridAsync(params: {
        queryText: string;
        topK?: number;
    }): Promise<L1SearchResult[]>;
    upsertL0(record: {
        id: string;
        sessionKey: string;
        sessionId: string;
        role: string;
        messageText: string;
        recordedAt: string;
        timestamp: number;
    }, _embedding?: Float32Array): Promise<boolean>;
    private _upsertL0Async;
    /**
     * Batch upsert multiple L0 records in a single API call.
     * Used by migration scripts to reduce request count.
     */
    upsertL0Batch(records: Array<{
        id: string;
        sessionKey: string;
        sessionId: string;
        role: string;
        messageText: string;
        recordedAt: string;
        timestamp: number;
    }>): Promise<number>;
    deleteL0(recordId: string): Promise<boolean>;
    deleteL0Expired(cutoffIso: string): Promise<number>;
    countL0(): Promise<number>;
    queryL0ForL1(sessionKey: string, afterRecordedAtMs?: number, limit?: number): Promise<L0QueryRow[]>;
    queryL0GroupedBySessionId(sessionKey: string, afterRecordedAtMs?: number, limit?: number): Promise<L0SessionGroup[]>;
    getAllL0Texts(): Promise<Array<{
        record_id: string;
        message_text: string;
        recorded_at: string;
    }>>;
    searchL0Vector(_queryEmbedding: Float32Array, topK?: number, queryText?: string): Promise<L0SearchResult[]>;
    searchL0Fts(ftsQuery: string, limit?: number): Promise<L0FtsResult[]>;
    /**
     * Async L0 hybrid search.
     */
    searchL0HybridAsync(params: {
        queryText: string;
        topK?: number;
    }): Promise<L0SearchResult[]>;
    pullProfiles(): Promise<ProfileRecord[]>;
    syncProfiles(records: ProfileSyncRecord[]): Promise<void>;
    deleteProfiles(recordIds: string[]): Promise<void>;
    reindexAll(_embedFn: (text: string) => Promise<Float32Array>, _onProgress?: (done: number, total: number, layer: "L1" | "L0") => void): Promise<{
        l1Count: number;
        l0Count: number;
    }>;
    isFtsAvailable(): boolean;
    private _parseL1SearchResults;
    private _parseL0SearchResults;
}
//# sourceMappingURL=tcvdb.d.ts.map