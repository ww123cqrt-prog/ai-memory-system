/**
 * memory_search tool: Agent-callable tool for searching L1 memory records.
 *
 * Supports three search strategies with automatic degradation:
 *   1. **hybrid** (default) — FTS5 keyword + vector embedding in parallel,
 *      merged via Reciprocal Rank Fusion (RRF).
 *   2. **embedding** — pure vector similarity (when FTS5 is unavailable).
 *   3. **fts** — pure FTS5 keyword search (when embedding is unavailable).
 *
 * The tool is registered via `api.registerTool()` in index.ts.
 */
import type { IMemoryStore } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
interface Logger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
export interface MemorySearchResultItem {
    id: string;
    content: string;
    type: string;
    priority: number;
    scene_name: string;
    score: number;
    created_at: string;
    updated_at: string;
}
export interface MemorySearchResult {
    results: MemorySearchResultItem[];
    total: number;
    strategy: string;
    /** Optional message, e.g. when embedding is not configured. */
    message?: string;
}
export declare function executeMemorySearch(params: {
    query: string;
    limit: number;
    type?: string;
    scene?: string;
    vectorStore?: IMemoryStore;
    embeddingService?: EmbeddingService;
    logger?: Logger;
}): Promise<MemorySearchResult>;
export declare function formatSearchResponse(result: MemorySearchResult): string;
export {};
//# sourceMappingURL=memory-search.d.ts.map