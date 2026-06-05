import { spawn } from 'node:child_process';
import type { BridgeConfig } from './config.js';

type EmbeddingConfig = BridgeConfig['embedding'];

interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

interface Candidate {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  sendDimensions: boolean;
}

interface ResolveOptions {
  env?: Record<string, string | undefined>;
  logger?: Logger;
  probe?: (candidate: Candidate) => Promise<boolean>;
  start?: (candidate: Candidate) => Promise<boolean>;
  startProbeTimeoutMs?: number;
}

const LM_STUDIO_CANDIDATE: Candidate = {
  provider: 'lm-studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  apiKey: 'lm-studio',
  model: 'text-embedding-qwen3-embedding-8b',
  dimensions: 4096,
  sendDimensions: false,
};

const OLLAMA_CANDIDATE: Candidate = {
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: 'ollama',
  model: 'qwen3-embedding',
  dimensions: 4096,
  sendDimensions: true,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAutoEmbedding(env: Record<string, string | undefined>): boolean {
  return !env.EMBEDDING_PROVIDER && !env.EMBEDDING_BASE_URL;
}

function candidateFromConfig(config: EmbeddingConfig): Candidate {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    dimensions: config.dimensions,
    sendDimensions: config.sendDimensions,
  };
}

function applyCandidate(config: EmbeddingConfig, candidate: Candidate): EmbeddingConfig {
  return {
    ...config,
    provider: candidate.provider,
    baseUrl: candidate.baseUrl,
    apiKey: candidate.apiKey,
    model: candidate.model,
    dimensions: candidate.dimensions,
    sendDimensions: candidate.sendDimensions,
  };
}

async function defaultProbe(candidate: Candidate): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`${candidate.baseUrl.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidate.apiKey}`,
        },
        body: JSON.stringify({
          input: 'memory bridge embedding health probe',
          model: candidate.model,
          ...(candidate.sendDimensions ? { dimensions: candidate.dimensions } : {}),
        }),
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

function spawnDetached(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    let settled = false;
    const settle = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    child.once('spawn', () => {
      child.unref();
      settle(true);
    });
    child.once('error', () => settle(false));
  });
}

async function defaultStart(candidate: Candidate): Promise<boolean> {
  try {
    if (candidate.provider === 'ollama') {
      return await spawnDetached('ollama', ['serve']);
    }

    if (candidate.provider === 'lm-studio') {
      return await spawnDetached('open', ['-gja', 'LM Studio']);
    }
  } catch {
    return false;
  }

  return false;
}

export async function resolveEmbeddingConfig(
  config: EmbeddingConfig,
  options: ResolveOptions = {},
): Promise<EmbeddingConfig> {
  const env = options.env ?? process.env;
  const logger = options.logger;
  const probe = options.probe ?? defaultProbe;
  const start = options.start ?? defaultStart;
  const startProbeTimeoutMs = options.startProbeTimeoutMs ?? 5000;

  if (!config.enabled || !isAutoEmbedding(env)) {
    return config;
  }

  const primary = candidateFromConfig(config);
  const candidates = [
    primary,
    ...(primary.provider === 'lm-studio' ? [OLLAMA_CANDIDATE] : [LM_STUDIO_CANDIDATE]),
  ];

  for (const candidate of candidates) {
    if (await probe(candidate)) {
      logger?.info(`[Bridge] Using embedding service: ${candidate.provider} (${candidate.baseUrl}, ${candidate.model})`);
      return applyCandidate(config, candidate);
    }

    if (await start(candidate)) {
      logger?.info(`[Bridge] Started embedding service candidate: ${candidate.provider}`);
      if (startProbeTimeoutMs > 0) {
        await sleep(startProbeTimeoutMs);
      }
      if (await probe(candidate)) {
        logger?.info(`[Bridge] Using embedding service after start: ${candidate.provider}`);
        return applyCandidate(config, candidate);
      }
    }
  }

  logger?.warn('[Bridge] No local embedding service responded; vector search will run degraded until a service is available');
  return config;
}
