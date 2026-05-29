/**
 * Historical memory initialization script
 * 
 * Environment variables:
 *   LLM_API_KEY  - Required. API key for LLM service
 *   HISTORY_DAYS - Optional. Number of days to scan (default: 30)
 */
import { OpenCodeSource } from '../src/sources/opencode-source.js';
import { ClaudeSource } from '../src/sources/claude-source.js';
import { CodexSource } from '../src/sources/codex-source.js';
import { dailySummaryTask } from '../tasks/daily-summary.js';

async function main() {
  console.log('[init] Starting historical memory initialization...');

  if (!process.env.LLM_API_KEY) {
    console.error('[init] Error: LLM_API_KEY environment variable is required');
    process.exit(1);
  }

  const days = parseInt(process.env.HISTORY_DAYS || '30', 10);
  if (isNaN(days) || days <= 0) {
    console.error('[init] Error: HISTORY_DAYS must be a positive integer');
    process.exit(1);
  }
  console.log(`[init] Scanning past ${days} days of conversations...`);

  try {
    const sources = [
      new OpenCodeSource(),
      new ClaudeSource(),
      new CodexSource(),
    ];

    const summary = await dailySummaryTask({
      sources,
      saveToMemory: true,
      scanAllHistory: true,
      historyDays: days,
    });

    console.log('[init] Historical summary generated:');
    console.log(summary);
    console.log('[init] Done!');
    process.exit(0);
  } catch (error) {
    console.error('[init] Failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[init] Unhandled error:', error);
  process.exit(1);
});
