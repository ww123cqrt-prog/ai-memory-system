import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointManager } from '../vendor/tencentdb/src/utils/checkpoint.js';
import { createL1Runner } from '../vendor/tencentdb/src/utils/pipeline-factory.js';

const oldLimit = process.env.MEMORY_L1_BATCH_LIMIT;
process.env.MEMORY_L1_BATCH_LIMIT = '2';

const dataDir = await mkdtemp(join(tmpdir(), 'memory-l1-failure-cursor-'));
const recordedAtMs = Date.parse('2026-06-09T08:00:00.000Z');

const store = {
  isDegraded: () => false,
  queryL0GroupedBySessionId: () => [
    {
      sessionId: 'session-1',
      messages: [
        {
          id: 'a',
          role: 'user',
          content: 'This message contains enough useful detail for L1 extraction testing.',
          timestamp: recordedAtMs,
          recordedAtMs,
        },
      ],
    },
  ],
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
      return '[{"scene_name":"truncated"';
    },
  },
});

try {
  await assert.rejects(
    runner({ sessionKey: 'codex:failure' }),
    /L1 extraction failed/,
  );

  const checkpoint = await new CheckpointManager(dataDir, logger).read();
  const state = checkpoint.runner_states['codex:failure'];
  assert.equal(state?.last_l1_cursor ?? 0, 0);
  assert.equal(state?.last_l1_record_id ?? '', '');
} finally {
  process.env.MEMORY_L1_BATCH_LIMIT = oldLimit;
  await rm(dataDir, { recursive: true, force: true });
}
