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

interface L1RecordRow {
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

interface L0RecordRow {
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

const MAX_L0_SCAN_ROWS = 1000;

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

function toL1Memory(record: L1RecordRow): McpMemory {
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

function toL0Memory(record: L0RecordRow): McpMemory {
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

function buildSimpleFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/["*]/g, ''))
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(' OR ');
}

async function listAllL0Records(store: MemoryStore): Promise<L0RecordRow[]> {
  if (store.queryL0RecordsCursor) {
    const records: L0RecordRow[] = [];
    let afterId = '';

    while (records.length < MAX_L0_SCAN_ROWS) {
      const page = await store.queryL0RecordsCursor(afterId, Math.min(200, MAX_L0_SCAN_ROWS - records.length));
      if (page.length === 0) {
        break;
      }
      records.push(...page);
      afterId = page[page.length - 1].record_id;
    }

    return records;
  }

  return [];
}

export async function listMemories(
  store: MemoryStore,
  opts: { page: number; pageSize: number },
): Promise<MemoryPage> {
  const l1Memories = (await store.queryL1Records()).map(toL1Memory);
  const l0Memories = (await listAllL0Records(store)).map(toL0Memory);
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
      memories: l0Memories.sort(newestFirst).slice(offset, offset + opts.pageSize),
      total: l0Memories.length,
    },
    l1: {
      memories: l1Memories.sort(newestFirst).slice(offset, offset + opts.pageSize),
      total: l1Memories.length,
    },
  };
}

export async function findMemoryById(store: MemoryStore, memoryId: string): Promise<McpMemory | null> {
  const l1Records = await store.queryL1Records();
  const l1Record = l1Records.find((record) => record.record_id === memoryId);
  if (l1Record) {
    return toL1Memory(l1Record);
  }

  if (store.queryL0RecordsCursor) {
    let afterId = '';
    let scanned = 0;

    while (scanned < MAX_L0_SCAN_ROWS) {
      const page = await store.queryL0RecordsCursor(afterId, Math.min(200, MAX_L0_SCAN_ROWS - scanned));
      if (page.length === 0) {
        break;
      }
      const l0Record = page.find((record) => record.record_id === memoryId);
      if (l0Record) {
        return toL0Memory(l0Record);
      }
      scanned += page.length;
      afterId = page[page.length - 1].record_id;
    }
  }

  return null;
}

export async function findNewestL0RecordForTurn(
  store: MemoryStore,
  sessionKey: string,
  text: string,
  sessionId?: string,
): Promise<McpMemory | null> {
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
): Promise<{ success: boolean; id: string; layer?: MemoryLayer }> {
  const existing = await findMemoryById(store, memoryId);
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
  opts: { query: string; limit: number; sessionKey?: string },
): Promise<MemorySearchPage> {
  if (!store.searchL0Fts || store.isFtsAvailable?.() === false) {
    return { results: [], total: 0, strategy: 'none' };
  }

  const ftsQuery = buildSimpleFtsQuery(opts.query);
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
