import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { VectorStore } from '../../../vendor/tencentdb/src/core/store/sqlite.js';
import { McpSqliteReader } from '../src/mcp-sqlite-reader.js';
import { repairL0Fts } from '../src/l0-fts.js';
import { saveConversationsToMemory } from '../../../tasks/daily-summary.js';

const dir = mkdtempSync(join(tmpdir(), 'memory-bridge-regression-'));
const file = join(dir, 'vectors.db');
const store = new VectorStore(file, 0);
store.init();
const db = new DatabaseSync(file);
const insert = db.prepare(`INSERT INTO l0_conversations
(record_id, session_key, session_id, role, message_text, recorded_at, timestamp) VALUES (?,?,?,?,?,?,?)`);
for (let i = 0; i < 1205; i++) insert.run(`row-${String(i).padStart(6, '0')}`,
  i === 1204 ? 'second:beta' : 'first:alpha', 'run-1', 'user',
  i === 1204 ? '索引修复 pcsel-3dcwt-core' : 'common needle',
  new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), i);
const reader = new McpSqliteReader(file);
try {
  await test('SQL paging and lookup cover every row, with stable page boundaries', () => {
    const first = reader.list({ page: 1, pageSize: 10 });
    assert.equal(first.total, 1205);
    assert.equal(first.memories[0].id, 'row-001204');
    assert.equal(first.l0.memories.length, 10);
    const last = reader.list({ page: 121, pageSize: 10 });
    assert.equal(last.memories.length, 5);
    assert.equal(last.has_more, false);
    assert.equal(reader.find('row-001204')?.id, 'row-001204');
  });
  await test('scope is applied independently by user and agent before pagination', () => {
    assert.equal(reader.list({ page: 1, pageSize: 10, userId: 'missing' }).total, 0);
    assert.equal(reader.list({ page: 1, pageSize: 10, userId: 'second' }).total, 1);
    assert.equal(reader.list({ page: 1, pageSize: 10, agentId: 'beta' }).total, 1);
    assert.equal(reader.list({ page: 1, pageSize: 10, userId: 'first', agentId: 'beta' }).total, 0);
  });
  await test('FTS repair fills missing records, stays idempotent and preserves source rows', () => {
    assert.equal(repairL0Fts(db).inserted, 1205);
    assert.equal(repairL0Fts(db).inserted, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM l0_fts').get()!.n, 1205);
    assert.equal(db.prepare('SELECT count(*) AS n FROM l0_conversations').get()!.n, 1205);
    const result = reader.searchL0('索引修复 pcsel-3dcwt-core', 5, { userId: 'second' });
    assert.equal(result.results[0].id, 'row-001204');
  });
  await test('scope filters before FTS limit so unrelated matches cannot starve it', () => {
    insert.run('row-zz', 'second:beta', 'run-2', 'user', 'common needle', '2026-06-01', 1);
    repairL0Fts(db);
    assert.equal(reader.searchL0('common needle', 1, { userId: 'second' }).results[0].id, 'row-zz');
    assert.equal(reader.searchL0('common needle', 3, { userId: 'missing' }).total, 0);
  });
  await test('newest captured turn remains findable after more than fifty older messages', () => {
    assert.equal(reader.newest('first:alpha', 'common needle', 'run-1')?.id, 'row-001203');
  });
  await test('mixed L0/L1 pages are disjoint and layer arrays agree with the main page', () => {
    const now = '2027-01-01T00:00:00.000Z';
    for (const [id, key] of [['m-a', 'first:alpha'], ['m-b', 'second:beta']]) {
      assert.equal(store.upsertL1({ id, content: 'common needle', type: 'episodic', priority: 50,
        scene_name: 'test', sessionKey: key, sessionId: 'run-l1', source_message_ids: [], metadata: {},
        timestamps: [now], createdAt: now, updatedAt: now }, undefined), true);
    }
    const p1 = reader.list({ page: 1, pageSize: 2 });
    const p2 = reader.list({ page: 2, pageSize: 2 });
    assert.equal(p1.l1.memories.length, 2);
    assert.equal(p1.memories.some(a => p2.memories.some(b => a.id === b.id)), false);
    assert.equal(p1.l0.memories.length + p1.l1.memories.length, p1.memories.length);
    assert.equal(reader.searchL1('common needle', 1, { userId: 'second' }).results[0].id, 'm-b');
    assert.equal(reader.searchL1('common needle', 5, { userId: 'missing' }).total, 0);
  });
  await test('invalid pagination fails instead of silently slicing a misleading page', () => {
    for (const page of [0, -1, 1.5, NaN]) assert.throws(() => reader.list({ page, pageSize: 10 }));
    assert.throws(() => reader.list({ page: Number.MAX_SAFE_INTEGER, pageSize: 1000 }));
  });
  const sessions = [{ source: 'codex', session: { id: 'import-test', source: 'codex',
    createdAt: new Date(), updatedAt: new Date() }, messages: [{ id: 'message-1', role: 'user' as const,
      content: 'newly imported indexed note', timestamp: new Date() }] }];
  await test('direct imports index new rows atomically and do not duplicate repeated imports', async () => {
    const before = Number(db.prepare('SELECT count(*) AS n FROM l0_conversations').get()!.n);
    await saveConversationsToMemory(sessions, db);
    await saveConversationsToMemory(sessions, db);
    assert.equal(db.prepare('SELECT count(*) AS n FROM l0_conversations').get()!.n, before + 1);
    assert.equal(reader.searchL0('newly imported indexed note', 5, { userId: 'codex' }).total, 1);
  });
  await test('an index failure rolls back the conversation import too', async () => {
    const before = db.prepare('SELECT count(*) AS n FROM l0_conversations').get()!.n;
    db.exec('DROP TABLE l0_fts');
    const broken = [{ ...sessions[0], session: { ...sessions[0].session, id: 'failed-import' } }];
    await assert.rejects(saveConversationsToMemory(broken, db));
    assert.equal(db.prepare('SELECT count(*) AS n FROM l0_conversations').get()!.n, before);
  });
} finally { reader.close(); db.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
