/**
 * LLM client for calling mimo-v2.5-pro API
 */

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;      // default: 3
  retryDelayMs: number;    // initial delay, default: 1000
}

const DEFAULT_CONFIG: LLMConfig = {
  baseUrl: 'https://token-plan-sgp.xiaomimimo.com/v1',
  apiKey: '',
  model: 'mimo-v2.5-pro',
  maxTokens: 2000,
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

/**
 * Single LLM call attempt (no retry logic)
 */
async function callOnce(cfg: LLMConfig, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: cfg.maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('LLM returned empty response');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`LLM API timeout after ${cfg.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call LLM with retry logic and exponential backoff
 * Retries on: 429 rate limits, 5xx server errors, network errors
 * Does NOT retry on: 400, 401, 403, 404 client errors
 */
async function callWithRetry(cfg: LLMConfig, prompt: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await callOnce(cfg, prompt);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx except 429)
      if (lastError.message.includes('400') || lastError.message.includes('401') ||
          lastError.message.includes('403') || lastError.message.includes('404')) {
        throw lastError;
      }

      if (attempt < cfg.maxRetries) {
        const delay = Math.min(cfg.retryDelayMs * Math.pow(2, attempt), 30000);
        console.log(`[LLM] Retry attempt ${attempt + 1}/${cfg.maxRetries} after ${delay}ms - ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Call LLM API (OpenAI compatible format)
 */
export async function callLLM(
  prompt: string,
  config?: Partial<LLMConfig>
): Promise<string> {
  const cfg: LLMConfig = {
    ...DEFAULT_CONFIG,
    baseUrl: process.env.LLM_BASE_URL || DEFAULT_CONFIG.baseUrl,
    apiKey: process.env.LLM_API_KEY || DEFAULT_CONFIG.apiKey,
    model: process.env.LLM_MODEL || DEFAULT_CONFIG.model,
    ...config,
  };

  if (!cfg.apiKey) {
    throw new Error('LLM_API_KEY environment variable is required');
  }

  return callWithRetry(cfg, prompt);
}
