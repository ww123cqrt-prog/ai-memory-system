import type { BridgeConfig } from './config.js';

type EmbeddingConfig = BridgeConfig['embedding'];

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createTdaiConfig(config: BridgeConfig, embedding: EmbeddingConfig = config.embedding) {
  const llmMaxTokens = positiveIntegerEnv(
    'MEMORY_LLM_MAX_TOKENS',
    positiveInteger(config.llm.maxTokens, 4096),
  );

  return {
    storeBackend: 'sqlite',
    recall: {
      enabled: true,
      strategy: 'hybrid',
      maxResults: 5,
      maxCharsPerMemory: 0,
      maxTotalRecallChars: 0,
      scoreThreshold: 0.3,
      timeoutMs: 5000,
    },
    extraction: {
      enabled: true,
      enableDedup: true,
      maxMemoriesPerSession: 20,
    },
    persona: {
      triggerEveryN: 50,
      maxScenes: 20,
      backupCount: 3,
      sceneBackupCount: 10,
    },
    pipeline: {
      everyNConversations: 5,
      enableWarmup: true,
      l1IdleTimeoutSeconds: 600,
      l2DelayAfterL1Seconds: 90,
      l2MinIntervalSeconds: 900,
      l2MaxIntervalSeconds: 3600,
      sessionActiveWindowHours: 24,
    },
    capture: {
      enabled: true,
      excludeAgents: [],
      l0l1RetentionDays: 0,
      allowAggressiveCleanup: false,
    },
    llm: {
      enabled: true,
      baseUrl: config.llm.baseUrl,
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      maxTokens: llmMaxTokens,
      timeoutMs: positiveInteger(config.llm.timeoutMs, 120000),
    },
    embedding: {
      enabled: embedding.enabled,
      provider: embedding.provider,
      baseUrl: embedding.baseUrl,
      apiKey: embedding.apiKey,
      model: embedding.model,
      dimensions: embedding.dimensions,
      sendDimensions: embedding.sendDimensions,
      conflictRecallTopK: embedding.conflictRecallTopK,
      maxInputChars: embedding.maxInputChars,
      timeoutMs: embedding.timeoutMs,
      captureTimeoutMs: embedding.timeoutMs,
      recallTimeoutMs: Math.min(embedding.timeoutMs, 5000),
    },
    bm25: {
      enabled: true,
      language: 'zh',
    },
    memoryCleanup: {
      enabled: false,
      cleanTime: '03:00',
    },
    report: {
      enabled: false,
      type: 'local',
    },
    tcvdb: {
      url: '',
      username: 'root',
      apiKey: '',
      database: '',
      alias: '',
      embeddingModel: 'bge-large-zh',
      timeout: 10000,
    },
    offload: {
      enabled: false,
      mode: 'local',
      temperature: 0.2,
      forceTriggerThreshold: 4,
      defaultContextWindow: 200000,
      maxPairsPerBatch: 20,
      l2NullThreshold: 4,
      l2TimeoutSeconds: 300,
      mildOffloadRatio: 0.5,
      aggressiveCompressRatio: 0.85,
      mmdMaxTokenRatio: 0.2,
      backendTimeoutMs: 120000,
      offloadRetentionDays: 0,
      logMaxSizeMb: 50,
    },
  };
}
