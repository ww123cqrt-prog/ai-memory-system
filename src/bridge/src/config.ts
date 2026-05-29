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
  
  /** MCP server port (for HTTP mode) */
  port?: number;
  
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export const defaultConfig: BridgeConfig = {
  dataDir: '~/.memory-tdai',
  llm: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    timeoutMs: 30000,
  },
  port: 8420,
  logLevel: 'info',
};

function expandHomeDir(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return `${homedir()}${path.slice(1)}`;
  }
  return path;
}

export function loadConfig(): BridgeConfig {
  const dataDir = process.env.MEMORY_DATA_DIR || defaultConfig.dataDir;

  return {
    ...defaultConfig,
    dataDir: expandHomeDir(dataDir),
    llm: {
      ...defaultConfig.llm,
      baseUrl: process.env.LLM_BASE_URL || defaultConfig.llm.baseUrl,
      apiKey: process.env.LLM_API_KEY || defaultConfig.llm.apiKey,
      model: process.env.LLM_MODEL || defaultConfig.llm.model,
    },
    port: process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : defaultConfig.port,
    logLevel: (process.env.LOG_LEVEL as BridgeConfig['logLevel']) || defaultConfig.logLevel,
  };
}
