/**
 * Configuration for the memory bridge
 */

import { homedir } from 'node:os';

export interface BridgeConfig {
  /** TencentDB data directory */
  dataDir: string;
  
  /** LLM configuration for TencentDB's L0-L3 pipeline */
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
    maxTokens?: number;
    timeoutMs?: number;
  };

  /** OpenAI-compatible embedding configuration for vector search */
  embedding: {
    enabled: boolean;
    provider: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    dimensions: number;
    sendDimensions: boolean;
    conflictRecallTopK: number;
    maxInputChars: number;
    timeoutMs: number;
  };
  
  /** MCP server port (for HTTP mode) */
  port?: number;
  
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export const defaultConfig: BridgeConfig = {
  dataDir: '~/.memory-tdai',
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'mimo-v2.5-pro',
    maxTokens: 4096,
    timeoutMs: 120000,  // Match the increased timeout
  },
  embedding: {
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
  },
  port: 8420,
  logLevel: 'info',
};

function ollamaBaseUrlFromHost(host: string | undefined): string | undefined {
  if (!host) {
    return undefined;
  }

  const withProtocol = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  try {
    const url = new URL(withProtocol);
    if (url.hostname === '0.0.0.0' || url.hostname === '::') {
      url.hostname = '127.0.0.1';
    }
    url.pathname = '/v1';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

const embeddingPresets = {
  ollama: {
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    model: 'qwen3-embedding',
    dimensions: 4096,
    sendDimensions: true,
  },
  'lm-studio': {
    provider: 'lm-studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: 'lm-studio',
    model: 'text-embedding-qwen3-embedding-8b',
    dimensions: 4096,
    sendDimensions: false,
  },
} as const;

function expandHomeDir(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return `${homedir()}${path.slice(1)}`;
  }
  return path;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(): BridgeConfig {
  const dataDir = process.env.MEMORY_DATA_DIR || defaultConfig.dataDir;
  const presetName = process.env.EMBEDDING_PROVIDER || 'ollama';
  const preset =
    presetName in embeddingPresets
      ? embeddingPresets[presetName as keyof typeof embeddingPresets]
      : embeddingPresets.ollama;
  const presetBaseUrl =
    preset.provider === 'ollama'
      ? ollamaBaseUrlFromHost(process.env.OLLAMA_HOST) || preset.baseUrl
      : preset.baseUrl;

  return {
    ...defaultConfig,
    dataDir: expandHomeDir(dataDir),
    llm: {
      ...defaultConfig.llm,
      baseUrl: process.env.LLM_BASE_URL || defaultConfig.llm.baseUrl,
      apiKey: process.env.LLM_API_KEY || defaultConfig.llm.apiKey,
      model: process.env.LLM_MODEL || defaultConfig.llm.model,
    },
    embedding: {
      ...defaultConfig.embedding,
      enabled: parseBoolean(process.env.EMBEDDING_ENABLED, defaultConfig.embedding.enabled),
      provider: preset.provider,
      baseUrl: process.env.EMBEDDING_BASE_URL || presetBaseUrl,
      apiKey: process.env.EMBEDDING_API_KEY || preset.apiKey,
      model: process.env.EMBEDDING_MODEL || preset.model,
      dimensions: parsePositiveInteger(process.env.EMBEDDING_DIMENSIONS, preset.dimensions),
      sendDimensions: parseBoolean(process.env.EMBEDDING_SEND_DIMENSIONS, preset.sendDimensions),
      conflictRecallTopK: parsePositiveInteger(
        process.env.EMBEDDING_CONFLICT_RECALL_TOP_K,
        defaultConfig.embedding.conflictRecallTopK,
      ),
      maxInputChars: parsePositiveInteger(
        process.env.EMBEDDING_MAX_INPUT_CHARS,
        defaultConfig.embedding.maxInputChars,
      ),
      timeoutMs: parsePositiveInteger(
        process.env.EMBEDDING_TIMEOUT_MS,
        defaultConfig.embedding.timeoutMs,
      ),
    },
    port: process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : defaultConfig.port,
    logLevel: (process.env.LOG_LEVEL as BridgeConfig['logLevel']) || defaultConfig.logLevel,
  };
}
