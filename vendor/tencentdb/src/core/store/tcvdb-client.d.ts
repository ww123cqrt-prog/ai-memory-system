/**
 * Tencent Cloud VectorDB HTTP Client.
 *
 * Thin wrapper around the VectorDB HTTP API. Handles authentication, timeouts,
 * retries (5xx / timeout), and error normalization.
 *
 * API docs: https://cloud.tencent.com/document/product/1709
 */
import type { StoreLogger } from "./types.js";
export interface TcvdbClientConfig {
    /** Instance URL (e.g. "http://10.0.1.1:80") */
    url: string;
    /** Account name (default: "root") */
    username: string;
    /** API Key */
    apiKey: string;
    /** Database name */
    database: string;
    /** Request timeout in ms (default: 10000) */
    timeout: number;
    /** Path to CA certificate PEM file (for HTTPS connections) */
    caPemPath?: string;
}
/** Standard VectorDB API response envelope. */
interface ApiResponse {
    code: number;
    msg: string;
    [key: string]: unknown;
}
/** Search/hybridSearch response shape. */
export interface SearchResponse {
    documents: Array<Array<Record<string, unknown>>>;
}
/** Query response shape. */
export interface QueryResponse {
    documents: Array<Record<string, unknown>>;
    count?: number;
}
/** Collection info from describeCollection. */
export interface CollectionInfo {
    collection: string;
    database: string;
    documentCount?: number;
    embedding?: {
        field: string;
        vectorField: string;
        model: string;
    };
    indexes?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}
export declare class TcvdbApiError extends Error {
    readonly apiCode: number;
    constructor(path: string, code: number, msg: string);
}
export declare class TcvdbClient {
    private readonly baseUrl;
    private readonly authHeader;
    private readonly database;
    private readonly timeout;
    private readonly logger?;
    /** undici dispatcher for HTTPS + custom CA. */
    private readonly dispatcher?;
    constructor(config: TcvdbClientConfig, logger?: StoreLogger);
    /**
     * Send a POST request to VectorDB API.
     * Handles auth, timeout, retries (5xx/timeout), and error unwrapping.
     */
    request<T = ApiResponse>(path: string, body: Record<string, unknown>): Promise<T>;
    createDatabase(dbName?: string): Promise<boolean>;
    createCollection(params: Record<string, unknown>): Promise<void>;
    describeCollection(collection: string): Promise<CollectionInfo>;
    upsert(collection: string, documents: Record<string, unknown>[]): Promise<void>;
    search(collection: string, searchParams: Record<string, unknown>): Promise<SearchResponse>;
    hybridSearch(collection: string, searchParams: Record<string, unknown>): Promise<SearchResponse>;
    query(collection: string, queryParams: Record<string, unknown>): Promise<QueryResponse>;
    deleteDoc(collection: string, params: Record<string, unknown>): Promise<void>;
    /**
     * Count documents matching an optional filter.
     * Uses the dedicated /document/count endpoint.
     */
    count(collection: string, filter?: string): Promise<number>;
    getDatabase(): string;
}
export {};
//# sourceMappingURL=tcvdb-client.d.ts.map