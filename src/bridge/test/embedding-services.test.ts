import assert from 'node:assert/strict';
import type { BridgeConfig } from '../src/config.js';
import { resolveEmbeddingConfig } from '../src/embedding-services.js';

const ollamaEmbedding: BridgeConfig['embedding'] = {
  enabled: true,
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: 'ollama',
  model: 'qwen3-embedding',
  dimensions: 4096,
  sendDimensions: true,
  conflictRecallTopK: 5,
  maxInputChars: 5000,
  timeoutMs: 10000,
};

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

{
  let ollamaStarted = false;
  const resolved = await resolveEmbeddingConfig(ollamaEmbedding, {
    env: {},
    logger: silentLogger,
    probe: async (candidate) => {
      return candidate.provider === 'ollama' && ollamaStarted;
    },
    start: async (candidate) => {
      if (candidate.provider === 'ollama') {
        ollamaStarted = true;
        return true;
      }
      return false;
    },
  });

  assert.equal(resolved.provider, 'ollama');
}

{
  const started: string[] = [];
  const resolved = await resolveEmbeddingConfig(ollamaEmbedding, {
    env: {},
    logger: silentLogger,
    startProbeTimeoutMs: 0,
    probe: async (candidate) => candidate.provider === 'lm-studio' && started.includes('lm-studio'),
    start: async (candidate) => {
      started.push(candidate.provider);
      return true;
    },
  });

  assert.deepEqual(started, ['ollama', 'lm-studio']);
  assert.equal(resolved.provider, 'lm-studio');
  assert.equal(resolved.baseUrl, 'http://127.0.0.1:1234/v1');
  assert.equal(resolved.model, 'text-embedding-qwen3-embedding-8b');
}
