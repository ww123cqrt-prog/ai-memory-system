import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  filterDialogMessages,
  processSessionUntilCaughtUp,
  selectLayeredSessionCandidates,
  type LayeredProcessingCheckpoint,
  type LayeredSessionSummary,
} from '../tasks/layered-memory-processing.js';
import { CheckpointManager } from '../vendor/tencentdb/src/utils/checkpoint.js';

const messages = filterDialogMessages([
  { role: 'system', content: 'boot' },
  { role: 'user', content: 'need memory' },
  { role: 'assistant', content: 'stored' },
  { role: 'tool', content: 'sqlite output' },
]);

assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant']);

const checkpoint: LayeredProcessingCheckpoint = {
  version: 1,
  updatedAt: '2026-06-09T00:00:00.000Z',
  sessions: {
    'codex:old': {
      lastProcessedRecordedAt: '2026-06-09T08:00:00.000Z',
      lastProcessedRecordedAtMs: Date.parse('2026-06-09T08:00:00.000Z'),
      lastProcessedRecordId: 'old-2',
      processedRuns: 1,
    },
  },
};

const rows: LayeredSessionSummary[] = [
  {
    sessionKey: 'codex:old',
    rowCount: 2,
    dialogRowCount: 2,
    maxRecordedAt: '2026-06-09T08:00:00.000Z',
    maxRecordedAtMs: Date.parse('2026-06-09T08:00:00.000Z'),
    maxRecordId: 'old-2',
  },
  {
    sessionKey: 'codex:same-time-new-id',
    rowCount: 3,
    dialogRowCount: 3,
    maxRecordedAt: '2026-06-09T08:00:00.000Z',
    maxRecordedAtMs: Date.parse('2026-06-09T08:00:00.000Z'),
    maxRecordId: 'old-3',
  },
  {
    sessionKey: 'codex:new',
    rowCount: 3,
    dialogRowCount: 2,
    maxRecordedAt: '2026-06-09T09:00:00.000Z',
    maxRecordedAtMs: Date.parse('2026-06-09T09:00:00.000Z'),
    maxRecordId: 'new-3',
  },
  {
    sessionKey: 'opencode:noise',
    rowCount: 4,
    dialogRowCount: 0,
    maxRecordedAt: '2026-06-09T09:30:00.000Z',
    maxRecordedAtMs: Date.parse('2026-06-09T09:30:00.000Z'),
    maxRecordId: 'noise-4',
  },
  {
    sessionKey: 'other:session',
    rowCount: 5,
    dialogRowCount: 5,
    maxRecordedAt: '2026-06-09T10:00:00.000Z',
    maxRecordedAtMs: Date.parse('2026-06-09T10:00:00.000Z'),
    maxRecordId: 'other-5',
  },
  {
    sessionKey: 'daily-summary:default',
    rowCount: 1,
    dialogRowCount: 1,
    maxRecordedAt: '2026-06-09T11:00:00.000Z',
    maxRecordedAtMs: Date.parse('2026-06-09T11:00:00.000Z'),
    maxRecordId: 'summary-1',
  },
];

checkpoint.sessions['codex:same-time-new-id'] = {
  lastProcessedRecordedAt: '2026-06-09T08:00:00.000Z',
  lastProcessedRecordedAtMs: Date.parse('2026-06-09T08:00:00.000Z'),
  lastProcessedRecordId: 'old-2',
  processedRuns: 1,
};

const incremental = selectLayeredSessionCandidates(rows, {
  checkpoint,
  mode: 'incremental',
});

assert.deepEqual(
  incremental.map((row) => row.sessionKey),
  ['codex:same-time-new-id', 'codex:new', 'daily-summary:default'],
);

const backfill = selectLayeredSessionCandidates(rows, {
  checkpoint,
  mode: 'backfill',
});

assert.deepEqual(
  backfill.map((row) => row.sessionKey),
  ['codex:old', 'codex:same-time-new-id', 'codex:new', 'daily-summary:default'],
);

const dataDir = await mkdtemp(join(tmpdir(), 'memory-layered-processing-'));
try {
  const session: LayeredSessionSummary = {
    sessionKey: 'codex:caught-up',
    rowCount: 1,
    dialogRowCount: 1,
    maxRecordedAt: '2026-06-09T12:00:00.000Z',
    maxRecordedAtMs: Date.parse('2026-06-09T12:00:00.000Z'),
    maxRecordId: 'l0:z',
  };

  const checkpoint = new CheckpointManager(dataDir, {
    debug() {},
    info() {},
    warn() {},
    error() {},
  });
  await checkpoint.markL1ExtractionComplete(
    session.sessionKey,
    0,
    session.maxRecordedAtMs,
    session.maxRecordId,
  );

  let calls = 0;
  const core = {
    async processStoredL0Session() {
      calls += 1;
    },
  };

  const incrementalCatchUp = await processSessionUntilCaughtUp({
    core: core as any,
    dataDir,
    session,
    maxPasses: 5,
  });
  assert.equal(calls, 0);
  assert.equal(incrementalCatchUp.caughtUp, true);

  const backfillCatchUp = await processSessionUntilCaughtUp({
    core: core as any,
    dataDir,
    session,
    maxPasses: 5,
    forceFirstPass: true,
  });
  assert.equal(calls, 1);
  assert.equal(backfillCatchUp.caughtUp, true);
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
