import { buildFtsQuery } from './core-fts.js';
import type { McpSqliteReader } from './mcp-sqlite-reader.js';

export type MemoryLayer = 'l0' | 'l1';

export interface McpMemory {
  id: string;
  layer: MemoryLayer;
  content: string;
  type?: string;
  priority?: number;
  scene_name?: string;
  session_key: string;
  session_id: string;
  role?: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface MemoryPage {
  memories: McpMemory[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_more: boolean;
  l0: {
    memories: McpMemory[];
    total: number;
  };
  l1: {
    memories: McpMemory[];
    total: number;
  };
}

export interface L1RecordRow {
  record_id: string;
  content: string;
  type?: string;
  priority?: number;
  scene_name?: string;
  session_key?: string;
  session_id?: string;
  timestamp_str?: string;
  timestamp_start?: string;
  timestamp_end?: string;
  created_time?: string;
  updated_time?: string;
  metadata_json?: string;
}

export interface L0RecordRow {
  record_id: string;
  session_key: string;
  session_id?: string;
  role: string;
  message_text: string;
  recorded_at?: string;
  timestamp?: number;
}

interface MemoryStore {
  queryL1Records: (filter?: unknown) => L1RecordRow[] | Promise<L1RecordRow[]>;
  queryL0RecordsCursor?: (afterId: string, pageSize: number) => L0RecordRow[] | Promise<L0RecordRow[]>;
  queryL0ForL1?: (
    sessionKey: string,
    afterRecordedAtMs?: number,
    limit?: number,
  ) => L0RecordRow[] | Promise<L0RecordRow[]>;
  deleteL1: (recordId: string) => boolean | Promise<boolean>;
  deleteL0?: (recordId: string) => boolean | Promise<boolean>;
  searchL0Fts?: (ftsQuery: string, limit?: number) => L0SearchResult[] | Promise<L0SearchResult[]>;
  isFtsAvailable?: () => boolean;
}

export interface MemoryScope { userId?: string; agentId?: string; }

export function matchesScope(sessionKey: string, scope: MemoryScope): boolean {
  const split = sessionKey.indexOf(':');
  const user = split < 0 ? sessionKey : sessionKey.slice(0, split);
  const agent = split < 0 ? '' : sessionKey.slice(split + 1);
  return (scope.userId === undefined || user === scope.userId) &&
    (scope.agentId === undefined || agent === scope.agentId);
}

interface L0SearchResult extends L0RecordRow {
  score: number;
}

export interface MemorySearchPage {
  results: McpMemory[];
  total: number;
  strategy: string;
}

function parseMetadata(metadataJson: string | undefined): Record<string, unknown> {
  if (!metadataJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTimestamp(value: string | undefined, fallback?: number): string {
  if (value) {
    return value;
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
    return new Date(fallback).toISOString();
  }
  return '';
}

export function toL1Memory(record: L1RecordRow): McpMemory {
  return {
    id: record.record_id,
    layer: 'l1',
    content: record.content,
    type: record.type,
    priority: record.priority,
    scene_name: record.scene_name,
    session_key: record.session_key || '',
    session_id: record.session_id || '',
    created_at: record.created_time || record.timestamp_start || '',
    updated_at: record.updated_time || record.timestamp_end || '',
    metadata: parseMetadata(record.metadata_json),
  };
}

export function toL0Memory(record: L0RecordRow): McpMemory {
  const recordedAt = normalizeTimestamp(record.recorded_at, record.timestamp);
  return {
    id: record.record_id,
    layer: 'l0',
    content: record.message_text,
    type: 'conversation',
    session_key: record.session_key,
    session_id: record.session_id || '',
    role: record.role,
    created_at: recordedAt,
    updated_at: recordedAt,
    metadata: {
      role: record.role,
      timestamp: record.timestamp || 0,
    },
  };
}

function newestFirst(a: McpMemory, b: McpMemory): number {
  return Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || '');
}

async function listAllL0Records(store: MemoryStore): Promise<L0RecordRow[]> {
  if (store.queryL0RecordsCursor) {
    const records: L0RecordRow[] = [];
    let afterId = '';

    while (true) {
      const page = await store.queryL0RecordsCursor(afterId, 200);
      if (page.length === 0) {
        break;
      }
      records.push(...page);
      const next = page[page.length - 1].record_id;
      if (next <= afterId) throw new Error('Memory cursor did not advance');
      afterId = next;
    }

    return records;
  }

  return [];
}

export async function listMemories(
  store: MemoryStore,
  opts: { page: number; pageSize: number } & MemoryScope,
  reader?: McpSqliteReader,
): Promise<MemoryPage> {
  if (reader) return reader.list(opts);
  if (!Number.isSafeInteger(opts.page) || opts.page < 1 || !Number.isSafeInteger(opts.pageSize) || opts.pageSize < 1) throw new Error('Invalid pagination');
  const l1Memories = (await store.queryL1Records()).map(toL1Memory).filter(r => matchesScope(r.session_key, opts));
  const l0Memories = (await listAllL0Records(store)).map(toL0Memory).filter(r => matchesScope(r.session_key, opts));
  const allMemories = [...l1Memories, ...l0Memories].sort(newestFirst);
  const total = allMemories.length;
  const totalPages = Math.ceil(total / opts.pageSize);
  const offset = (opts.page - 1) * opts.pageSize;
  const memories = allMemories.slice(offset, offset + opts.pageSize);

  return {
    memories,
    total,
    page: opts.page,
    page_size: opts.pageSize,
    total_pages: totalPages,
    has_more: opts.page < totalPages,
    l0: {
      memories: memories.filter(r => r.layer === 'l0'),
      total: l0Memories.length,
    },
    l1: {
      memories: memories.filter(r => r.layer === 'l1'),
      total: l1Memories.length,
    },
  };
}

export async function findMemoryById(store: MemoryStore, memoryId: string, reader?: McpSqliteReader): Promise<McpMemory | null> {
  if (reader) return reader.find(memoryId);
  const l1Records = await store.queryL1Records();
  const l1Record = l1Records.find((record) => record.record_id === memoryId);
  if (l1Record) {
    return toL1Memory(l1Record);
  }

  if (store.queryL0RecordsCursor) {
    let afterId = '';

    while (true) {
      const page = await store.queryL0RecordsCursor(afterId, 200);
      if (page.length === 0) {
        break;
      }
      const l0Record = page.find((record) => record.record_id === memoryId);
      if (l0Record) {
        return toL0Memory(l0Record);
      }
      const next = page[page.length - 1].record_id;
      if (next <= afterId) throw new Error('Memory cursor did not advance');
      afterId = next;
    }
  }

  return null;
}

export async function findNewestL0RecordForTurn(
  store: MemoryStore,
  sessionKey: string,
  text: string,
  sessionId?: string,
  reader?: McpSqliteReader,
): Promise<McpMemory | null> {
  if (reader) return reader.newest(sessionKey, text, sessionId);
  if (!store.queryL0ForL1) {
    return null;
  }

  const rows = await store.queryL0ForL1(sessionKey, undefined, 50);
  const matches = rows
    .filter((record) => record.message_text === text)
    .filter((record) => !sessionId || !record.session_id || record.session_id === sessionId)
    .map(toL0Memory)
    .sort(newestFirst);

  return matches[0] || null;
}

export async function deleteMemoryById(
  store: MemoryStore,
  memoryId: string,
  reader?: McpSqliteReader,
): Promise<{ success: boolean; id: string; layer?: MemoryLayer }> {
  const existing = await findMemoryById(store, memoryId, reader);
  const requestedLayer = memoryId.startsWith('l0_') || memoryId.startsWith('l0:') ? 'l0' : undefined;

  if (!existing) {
    return { success: false, id: memoryId, layer: requestedLayer };
  }

  if (existing.layer === 'l0') {
    if (!store.deleteL0) {
      return { success: false, id: memoryId, layer: 'l0' };
    }
    return { success: await store.deleteL0(memoryId), id: memoryId, layer: 'l0' };
  }

  const l1Deleted = await store.deleteL1(memoryId);
  return { success: l1Deleted, id: memoryId, layer: 'l1' };
}

export async function searchConversationMemories(
  store: MemoryStore,
  opts: { query: string; limit: number; sessionKey?: string } & MemoryScope,
  reader?: McpSqliteReader,
): Promise<MemorySearchPage> {
  if (reader) return reader.searchL0(opts.query, opts.limit, opts);
  if (!store.searchL0Fts || store.isFtsAvailable?.() === false) {
    return { results: [], total: 0, strategy: 'none' };
  }

  const ftsQuery = buildFtsQuery(opts.query);
  if (!ftsQuery) {
    return { results: [], total: 0, strategy: 'none' };
  }

  const rows = await store.searchL0Fts(ftsQuery, opts.limit * 3);
  const results = rows
    .filter((record) => !opts.sessionKey || record.session_key === opts.sessionKey)
    .map((record) => ({
      ...toL0Memory(record),
      metadata: {
        role: record.role,
        timestamp: record.timestamp || 0,
        score: record.score,
      },
    }))
    .sort(newestFirst)
    .slice(0, opts.limit);

  return {
    results,
    total: results.length,
    strategy: 'fts',
  };
}
