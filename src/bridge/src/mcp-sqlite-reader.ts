/** SQL pagination and scoped lookups for the configured local SQLite backend. */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { buildFtsQuery } from './core-fts.js';
import { toL0Memory, toL1Memory, type L0RecordRow, type L1RecordRow,
  type MemoryScope, type MemoryPage, type McpMemory, type MemorySearchPage } from './mcp-memory-store.js';

export interface EntityRecord { id: string; layer: 'l0' | 'l1'; session_key: string; session_id: string; created_at: string; }

function whereScope(scope: MemoryScope, column = 'session_key') {
  const parts: string[] = [];
  const values: SQLInputValue[] = [];
  if (scope.userId !== undefined) {
    parts.push(`CASE WHEN instr(${column}, ':') > 0 THEN substr(${column},1,instr(${column},':')-1) ELSE ${column} END = ?`);
    values.push(scope.userId);
  }
  if (scope.agentId !== undefined) {
    parts.push(`CASE WHEN instr(${column}, ':') > 0 THEN substr(${column},instr(${column},':')+1) ELSE '' END = ?`);
    values.push(scope.agentId);
  }
  return { sql: parts.length ? parts.join(' AND ') : '1=1', values };
}

export class McpSqliteReader {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    this.db.exec('PRAGMA busy_timeout=5000');
  }
  close() { this.db.close(); }

  list(opts: { page: number; pageSize: number } & MemoryScope): MemoryPage {
    if (!Number.isSafeInteger(opts.page) || opts.page < 1 || !Number.isSafeInteger(opts.pageSize) || opts.pageSize < 1 ||
      !Number.isSafeInteger((opts.page - 1) * opts.pageSize)) throw new Error('Invalid pagination');
    const scope = whereScope(opts);
    this.db.exec('BEGIN');
    try {
      const n0 = Number(this.db.prepare(`SELECT count(*) AS n FROM l0_conversations WHERE ${scope.sql}`).get(...scope.values)!.n);
      const n1 = Number(this.db.prepare(`SELECT count(*) AS n FROM l1_records WHERE ${scope.sql}`).get(...scope.values)!.n);
      const ids = this.db.prepare(`SELECT record_id, 'l0' AS layer, recorded_at AS sort_at FROM l0_conversations WHERE ${scope.sql}
        UNION ALL SELECT record_id, 'l1' AS layer, coalesce(nullif(updated_time,''),nullif(created_time,''),timestamp_end,'') AS sort_at
        FROM l1_records WHERE ${scope.sql}
        ORDER BY sort_at DESC, layer ASC, record_id ASC LIMIT ? OFFSET ?`).all(
          ...scope.values, ...scope.values, opts.pageSize, (opts.page - 1) * opts.pageSize);
      const memories = ids.map(r => this.findLayer(String(r.record_id), r.layer as 'l0' | 'l1')!);
      const total = n0 + n1;
      this.db.exec('COMMIT');
      return { memories, total, page: opts.page, page_size: opts.pageSize,
        total_pages: Math.ceil(total / opts.pageSize), has_more: opts.page * opts.pageSize < total,
        l0: { memories: memories.filter(r => r.layer === 'l0'), total: n0 },
        l1: { memories: memories.filter(r => r.layer === 'l1'), total: n1 } };
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  private findLayer(id: string, layer: 'l0' | 'l1'): McpMemory | null {
    const row = this.db.prepare(`SELECT * FROM ${layer === 'l0' ? 'l0_conversations' : 'l1_records'} WHERE record_id=?`).get(id);
    return row ? layer === 'l0' ? toL0Memory(row as unknown as L0RecordRow) : toL1Memory(row as unknown as L1RecordRow) : null;
  }
  find(id: string): McpMemory | null { return this.findLayer(id, 'l1') ?? this.findLayer(id, 'l0'); }
  newest(sessionKey: string, text: string, sessionId?: string): McpMemory | null {
    const row = this.db.prepare(`SELECT * FROM l0_conversations WHERE session_key=? AND message_text=?
      ${sessionId ? 'AND session_id=?' : ''} ORDER BY recorded_at DESC,record_id DESC LIMIT 1`).get(
        sessionKey, text, ...(sessionId ? [sessionId] : []));
    return row ? toL0Memory(row as unknown as L0RecordRow) : null;
  }
  searchL0(query: string, limit: number, scope: MemoryScope = {}): MemorySearchPage {
    return this.search('l0', query, limit, scope);
  }
  searchL1(query: string, limit: number, scope: MemoryScope, filters?: { type?: string; scene?: string }): MemorySearchPage {
    return this.search('l1', query, limit, scope, filters);
  }
  private search(layer: 'l0' | 'l1', query: string, limit: number, scope: MemoryScope,
    filters?: { type?: string; scene?: string }): MemorySearchPage {
    const fts = buildFtsQuery(query);
    if (!fts) return { results: [], total: 0, strategy: 'fts' };
    const table = layer === 'l0' ? 'l0_conversations' : 'l1_records';
    const index = `${layer}_fts`;
    const condition = whereScope(scope, 'r.session_key');
    let extra = '';
    if (layer === 'l1' && filters?.type) { extra += ' AND r.type=?'; condition.values.push(filters.type); }
    if (layer === 'l1' && filters?.scene) { extra += ' AND instr(lower(r.scene_name),lower(?))>0'; condition.values.push(filters.scene); }
    const rows = this.db.prepare(`SELECT r.*, bm25(${index}) AS rank FROM ${index}
      JOIN ${table} r ON r.record_id=${index}.record_id
      WHERE ${index} MATCH ? AND ${condition.sql} ${extra}
      ORDER BY rank ASC, r.record_id ASC LIMIT ?`).all(fts, ...condition.values, limit);
    const results = rows.map(r => ({ ...(layer === 'l0' ? toL0Memory(r as unknown as L0RecordRow) : toL1Memory(r as unknown as L1RecordRow)),
      metadata: { ...(layer === 'l1' ? toL1Memory(r as unknown as L1RecordRow).metadata : {}), score: -Number(r.rank) } }));
    return { results, total: results.length, strategy: 'fts' };
  }
  entityRecords(): EntityRecord[] {
    return this.db.prepare(`SELECT record_id AS id,'l0' AS layer,session_key,session_id,recorded_at AS created_at FROM l0_conversations
      UNION ALL SELECT record_id AS id,'l1' AS layer,session_key,session_id,created_time AS created_at FROM l1_records`).all() as unknown as EntityRecord[];
  }
}
