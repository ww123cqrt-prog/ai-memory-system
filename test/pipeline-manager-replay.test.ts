import assert from 'node:assert/strict';
import { MemoryPipelineManager } from '../vendor/tencentdb/src/utils/pipeline-manager.js';

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const manager = new MemoryPipelineManager(
  {
    everyNConversations: 5,
    enableWarmup: false,
    l1: { idleTimeoutSeconds: 600 },
    l2: {
      delayAfterL1Seconds: 90,
      minIntervalSeconds: 0,
      maxIntervalSeconds: 3600,
      sessionActiveWindowHours: 24,
    },
  },
  logger,
);

let l1Calls = 0;
let l2Calls = 0;
let l3Calls = 0;

manager.setL1Runner(async ({ sessionKey, msg }) => {
  l1Calls += 1;
  assert.equal(sessionKey, 'codex:test-session');
  assert.deepEqual(msg, []);
  return { processedCount: 0 };
});

manager.setL2Runner(async (sessionKey) => {
  l2Calls += 1;
  assert.equal(sessionKey, 'codex:test-session');
  return { latestCursor: new Date().toISOString() };
});

manager.setL3Runner(async () => {
  l3Calls += 1;
});

manager.start({});

await manager.replayStoredL0Session('codex:test-session');
assert.equal(l1Calls, 1);
assert.equal(l2Calls, 0);

await manager.drainSession('codex:test-session');
assert.equal(l2Calls, 1);
assert.equal(l3Calls, 1);

await manager.destroy();
