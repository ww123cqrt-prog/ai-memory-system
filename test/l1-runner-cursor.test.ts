import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointManager } from '../vendor/tencentdb/src/utils/checkpoint.js';
import { createL1Runner } from '../vendor/tencentdb/src/utils/pipeline-factory.js';

const oldLimit = process.env.MEMORY_L1_BATCH_LIMIT;
process.env.MEMORY_L1_BATCH_LIMIT = '2';

const dataDir = await mkdtemp(join(tmpdir(), 'memory-l1-cursor-'));
const recordedAtMs = Date.parse('2026-06-09T08:00:00.000Z');
const rows = ['a', 'b', 'c', 'd'].map((id, index) => ({
  id,
  role: index % 2 === 0 ? 'user' : 'assistant',
  content: `This message ${id} contains enough useful detail for L1 extraction testing.`,
  timestamp: recordedAtMs + index,
  recordedAtMs,
}));

const queryCalls: Array<{ afterRecordedAtMs?: number; limit?: number; afterRecordId?: string }> = [];

const store = {
  isDegraded: () => false,
  queryL0GroupedBySessionId: (
    sessionKey: string,
    afterRecordedAtMs?: number,
    limit?: number,
    afterRecordId = '',
  ) => {
    assert.equal(sessionKey, 'codex:same-recorded-at');
    queryCalls.push({ afterRecordedAtMs, limit, afterRecordId });
    const selected = rows
      .filter((row) => {
        if (!afterRecordedAtMs) return true;
        return row.recordedAtMs > afterRecordedAtMs
          || (row.recordedAtMs === afterRecordedAtMs && row.id > afterRecordId);
      })
      .slice(0, limit ?? rows.length);
    return [{ sessionId: 'session-1', messages: selected }];
  },
  countL1: () => 0,
  isFtsAvailable: () => false,
};

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const runner = createL1Runner({
  pluginDataDir: dataDir,
  cfg: {
    extraction: {
      enableDedup: false,
      maxMemoriesPerSession: 10,
    },
    embedding: {
      conflictRecallTopK: 5,
      timeoutMs: 1000,
    },
  } as any,
  openclawConfig: undefined,
  vectorStore: store as any,
  embeddingService: undefined,
  logger,
  llmRunner: {
    async run() {
      return JSON.stringify([
        {
          scene_name: 'cursor-test',
          message_ids: [],
          memories: [],
        },
      ]);
    },
  },
});

try {
  const first = await runner({ sessionKey: 'codex:same-recorded-at' });
  assert.equal(first.processedCount, 2);

  let checkpoint = await new CheckpointManager(dataDir, logger).read();
  let state = checkpoint.runner_states['codex:same-recorded-at'];
  assert.equal(state.last_l1_cursor, recordedAtMs);
  assert.equal(state.last_l1_record_id, 'b');

  const second = await runner({ sessionKey: 'codex:same-recorded-at' });
  assert.equal(second.processedCount, 2);

  checkpoint = await new CheckpointManager(dataDir, logger).read();
  state = checkpoint.runner_states['codex:same-recorded-at'];
  assert.equal(state.last_l1_cursor, recordedAtMs);
  assert.equal(state.last_l1_record_id, 'd');

  assert.deepEqual(queryCalls, [
    { afterRecordedAtMs: undefined, limit: 2, afterRecordId: '' },
    { afterRecordedAtMs: recordedAtMs, limit: 2, afterRecordId: 'b' },
  ]);
} finally {
  process.env.MEMORY_L1_BATCH_LIMIT = oldLimit;
  await rm(dataDir, { recursive: true, force: true });
}
