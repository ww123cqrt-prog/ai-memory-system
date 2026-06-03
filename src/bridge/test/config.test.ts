import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const EMBEDDING_ENV_KEYS = [
  'EMBEDDING_ENABLED',
  'EMBEDDING_PROVIDER',
  'EMBEDDING_BASE_URL',
  'EMBEDDING_API_KEY',
  'EMBEDDING_MODEL',
  'EMBEDDING_DIMENSIONS',
  'EMBEDDING_SEND_DIMENSIONS',
  'OLLAMA_HOST',
];

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of EMBEDDING_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

withEnv({}, () => {
  const config = loadConfig();

  assert.deepEqual(config.embedding, {
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
  });
});

withEnv({ EMBEDDING_PROVIDER: 'lm-studio' }, () => {
  const config = loadConfig();

  assert.equal(config.embedding.baseUrl, 'http://127.0.0.1:1234/v1');
  assert.equal(config.embedding.apiKey, 'lm-studio');
  assert.equal(config.embedding.provider, 'lm-studio');
  assert.equal(config.embedding.model, 'text-embedding-qwen3-embedding-8b');
  assert.equal(config.embedding.dimensions, 4096);
  assert.equal(config.embedding.sendDimensions, false);
});

withEnv({ OLLAMA_HOST: '0.0.0.0:11522' }, () => {
  const config = loadConfig();

  assert.equal(config.embedding.provider, 'ollama');
  assert.equal(config.embedding.baseUrl, 'http://127.0.0.1:11522/v1');
});

withEnv({
  OLLAMA_HOST: '0.0.0.0:11522',
  EMBEDDING_BASE_URL: 'http://127.0.0.1:11434/v1',
}, () => {
  const config = loadConfig();

  assert.equal(config.embedding.baseUrl, 'http://127.0.0.1:11434/v1');
});

withEnv({
  EMBEDDING_PROVIDER: 'lm-studio',
  EMBEDDING_BASE_URL: 'http://127.0.0.1:9999/v1',
  EMBEDDING_API_KEY: 'custom-key',
  EMBEDDING_MODEL: 'custom-embedding',
  EMBEDDING_DIMENSIONS: '1024',
  EMBEDDING_SEND_DIMENSIONS: 'true',
}, () => {
  const config = loadConfig();

  assert.equal(config.embedding.baseUrl, 'http://127.0.0.1:9999/v1');
  assert.equal(config.embedding.apiKey, 'custom-key');
  assert.equal(config.embedding.model, 'custom-embedding');
  assert.equal(config.embedding.dimensions, 1024);
  assert.equal(config.embedding.sendDimensions, true);
});

withEnv({ EMBEDDING_ENABLED: 'false' }, () => {
  const config = loadConfig();

  assert.equal(config.embedding.enabled, false);
});
