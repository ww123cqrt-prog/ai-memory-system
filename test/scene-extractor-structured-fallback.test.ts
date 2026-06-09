import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SceneExtractor } from '../vendor/tencentdb/src/core/scene/scene-extractor.js';

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

async function withTempMemoryDir<T>(fn: (dataDir: string) => Promise<T>): Promise<T> {
  const dataDir = await mkdtemp(join(tmpdir(), 'memory-scene-fallback-'));
  try {
    return await fn(dataDir);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

await withTempMemoryDir(async (dataDir) => {
  let promptSeen = '';
  const extractor = new SceneExtractor({
    dataDir,
    config: {},
    logger,
    llmRunner: {
      supportsFileTools: false,
      async run(params) {
        assert.equal(params.workspaceDir, undefined);
        assert.equal(params.maxTokens, 2048);
        promptSeen = params.prompt;
        return JSON.stringify({
          scenes: [
            {
              filename: 'codex-memory-preferences.md',
              summary: 'The user prefers durable local memory processing with concrete verification.',
              heat: 2,
              content: '## 用户偏好\n\n用户要求 L0 自动进入 L1/L2，并要求本地验证和常驻调度。',
            },
          ],
        });
      },
    },
  });

  const result = await extractor.extract([
    {
      id: 'l1-1',
      content: 'User wants L0 memories to be promoted into L1 and L2 automatically.',
      created_at: '2026-06-09T08:00:00.000Z',
    },
  ]);

  assert.equal(result.success, true);
  assert.equal(result.memoriesProcessed, 1);
  assert.match(promptSeen, /Return strict JSON only/);

  const files = await readdir(join(dataDir, 'scene_blocks'));
  assert.deepEqual(files, ['codex-memory-preferences.md']);

  const raw = await readFile(join(dataDir, 'scene_blocks', 'codex-memory-preferences.md'), 'utf-8');
  assert.match(raw, /The user prefers durable local memory processing/);
  assert.match(raw, /用户要求 L0 自动进入 L1\/L2/);
});

await withTempMemoryDir(async (dataDir) => {
  const extractor = new SceneExtractor({
    dataDir,
    config: {},
    logger,
    llmRunner: {
      supportsFileTools: false,
      async run() {
        return JSON.stringify({ scenes: [] });
      },
    },
  });

  const result = await extractor.extract([
    {
      id: 'l1-empty',
      content: 'A memory that the model refuses to place into a scene.',
      created_at: '2026-06-09T08:00:00.000Z',
    },
  ]);

  assert.equal(result.success, false);
  assert.match(result.error ?? '', /produced no scene files/);
});
