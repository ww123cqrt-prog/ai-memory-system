/**
 * HostAdapter implementation that bridges mem0's agent integration
 * with TencentDB Agent Memory's core.
 * 
 * This adapter implements the HostAdapter interface expected by TdaiCore,
 * providing runtime context, logger, and LLM runner factory.
 */

import type { BridgeConfig } from './config.js';

// Define types locally to avoid import issues
// These match the TencentDB Agent Memory interfaces

export interface Logger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface RuntimeContext {
  userId: string;
  sessionId: string;
  sessionKey: string;
  platform: string;
  workspaceDir: string;
  dataDir: string;
}

export interface LLMRunParams {
  prompt: string;
  systemPrompt?: string;
  taskId: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface LLMRunner {
  /** False when this runner is plain chat completion and cannot write local files. */
  supportsFileTools?: boolean;
  run(params: LLMRunParams): Promise<string>;
}

export interface LLMRunnerCreateOptions {
  modelRef?: string;
  enableTools?: boolean;
}

export interface LLMRunnerFactory {
  createRunner(opts?: LLMRunnerCreateOptions): LLMRunner;
}

export interface HostAdapter {
  readonly hostType: string;
  getRuntimeContext(): RuntimeContext;
  getLogger(): Logger;
  getLLMRunnerFactory(): LLMRunnerFactory;
}

function logToStderr(message: string): void {
  process.stderr.write(`[TDAI] ${message}\n`);
}

export class MemBridgeHostAdapter implements HostAdapter {
  readonly hostType = 'standalone';
  
  private config: BridgeConfig;
  private logger: Logger;
  private userId: string;
  private sessionId: string;

  constructor(opts: {
    config: BridgeConfig;
    userId?: string;
    sessionId?: string;
  }) {
    this.config = opts.config;
    this.userId = opts.userId || process.env.MEM0_USER_ID || 'default-user';
    this.sessionId = opts.sessionId || this.generateSessionId();
    
    this.logger = {
      debug: opts.config.logLevel === 'debug' 
        ? logToStderr
        : undefined,
      info: logToStderr,
      warn: logToStderr,
      error: logToStderr,
    };
  }

  getRuntimeContext(): RuntimeContext {
    return {
      userId: this.userId,
      sessionId: this.sessionId,
      sessionKey: `${this.userId}:${this.sessionId}`,
      platform: 'mcp-bridge',
      workspaceDir: process.cwd(),
      dataDir: this.config.dataDir,
    };
  }

  getLogger(): Logger {
    return this.logger;
  }

  getLLMRunnerFactory(): LLMRunnerFactory {
    const config = this.config;
    const logger = this.logger;
    
    return {
      createRunner(opts?: LLMRunnerCreateOptions): LLMRunner {
        return {
          supportsFileTools: false,
          async run(params: LLMRunParams): Promise<string> {
            const model = opts?.modelRef || config.llm.model;
            
            logger.debug?.(`LLM call: ${params.taskId} (model: ${model})`);
            
            const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.llm.apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
                  { role: 'user', content: params.prompt },
                ],
                max_tokens: params.maxTokens || config.llm.maxTokens,
                temperature: 0.2,
              }),
              signal: params.timeoutMs ? AbortSignal.timeout(params.timeoutMs) : undefined,
            });

            if (!response.ok) {
              const body = await response.text().catch(() => '');
              const detail = body ? `: ${body.slice(0, 1000)}` : '';
              throw new Error(`LLM API error: ${response.status} ${response.statusText}${detail}`);
            }

            const data = await response.json() as any;
            const choice = data.choices?.[0];
            const finishReason = choice?.finish_reason;
            const content = choice?.message?.content || '';
            if (finishReason && finishReason !== 'stop') {
              logger.warn?.(`LLM call ${params.taskId} finished with reason=${finishReason}, outputChars=${content.length}`);
            }
            return content;
          },
        };
      },
    };
  }

  private generateSessionId(): string {
    return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
