/**
 * HostAdapter implementation that bridges mem0's agent integration
 * with TencentDB Agent Memory's core.
 * 
 * This adapter implements the HostAdapter interface expected by TdaiCore,
 * providing runtime context, logger, and LLM runner factory.
 */

import type { 
  HostAdapter, 
  RuntimeContext, 
  Logger, 
  LLMRunnerFactory,
  LLMRunner,
  LLMRunParams 
} from '../../vendor/tencentdb/src/core/types.js';
import type { BridgeConfig } from './config.js';

export class MemBridgeHostAdapter implements HostAdapter {
  readonly hostType = 'standalone' as const;
  
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
      debug: opts.config.logLevel === 'debug' ? (msg) => console.debug(`[TDAI] ${msg}`) : undefined,
      info: (msg) => console.info(`[TDAI] ${msg}`),
      warn: (msg) => console.warn(`[TDAI] ${msg}`),
      error: (msg) => console.error(`[TDAI] ${msg}`),
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
      createRunner(opts?: { modelRef?: string; enableTools?: boolean }): LLMRunner {
        return {
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
              }),
              signal: params.timeoutMs ? AbortSignal.timeout(params.timeoutMs) : undefined,
            });

            if (!response.ok) {
              throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;
            return data.choices[0]?.message?.content || '';
          },
        };
      },
    };
  }

  private generateSessionId(): string {
    return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
