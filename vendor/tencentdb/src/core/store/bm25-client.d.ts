/**
 * BM25 Sparse Vector Encoding Client.
 *
 * HTTP client for the BM25 Python sidecar service (bm25_server.py).
 * Used by TCVDB backend to generate sparse vectors for hybridSearch.
 *
 * Two operations:
 * - `encodeTexts(texts)` — encode documents for upsert (TF-based)
 * - `encodeQueries(texts)` — encode queries for search (IDF-based)
 *
 * Graceful degradation: if the sidecar is unreachable, all methods
 * return empty arrays and `isHealthy()` returns false. Callers can
 * check health to dynamically downgrade to pure semantic search.
 */
/** Sparse vector: array of [token_hash, weight] pairs. */
export type SparseVector = Array<[number, number]>;
interface Logger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
export interface BM25ClientConfig {
    /** Sidecar service URL (default: "http://127.0.0.1:8084") */
    serviceUrl: string;
    /** Request timeout in ms (default: 5000) */
    timeout: number;
}
export declare class BM25Client {
    private readonly baseUrl;
    private readonly timeout;
    private readonly logger?;
    /** Cached health status to avoid repeated checks on every call. */
    private _healthy;
    private _lastHealthCheck;
    private static readonly HEALTH_CHECK_INTERVAL_MS;
    constructor(config: BM25ClientConfig, logger?: Logger);
    /**
     * Encode document texts for upsert (TF-based BM25 scoring).
     * Returns one SparseVector per input text.
     * Returns empty array on error (non-throwing).
     */
    encodeTexts(texts: string[]): Promise<SparseVector[]>;
    /**
     * Encode query texts for search (IDF-based BM25 scoring).
     * Returns one SparseVector per input text.
     * Returns empty array on error (non-throwing).
     */
    encodeQueries(texts: string[]): Promise<SparseVector[]>;
    /**
     * Check if the BM25 sidecar is reachable.
     * Result is cached for 30 seconds to avoid spamming health checks.
     */
    isHealthy(): Promise<boolean>;
    private _encode;
}
/**
 * Create a BM25Client if BM25 is enabled in config.
 * Returns undefined if disabled — callers should check before using.
 */
export declare function createBM25Client(config: {
    enabled: boolean;
    serviceUrl: string;
    timeout: number;
}, logger?: Logger): BM25Client | undefined;
export {};
//# sourceMappingURL=bm25-client.d.ts.map