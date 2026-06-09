/**
 * Scheduler entry point
 *
 * Usage:
 *   node scripts/start-scheduler.js
 *
 * Environment variables:
 *   LLM_API_KEY - Required for LLM calls
 *   LLM_BASE_URL - LLM API base URL (default: https://token-plan-sgp.xiaomimimo.com/v1)
 *   LLM_MODEL - LLM model name (default: mimo-v2.5-pro)
 */

import { CronScheduler } from '../src/scheduler/dist/index.js';
import { OpenCodeSource } from '../src/sources/opencode-source.js';
import { ClaudeSource } from '../src/sources/claude-source.js';
import { CodexSource } from '../src/sources/codex-source.js';
import { dailySummaryTask } from '../tasks/daily-summary.js';
import { layeredMemoryProcessingTask } from '../tasks/layered-memory-processing.js';
import { projectCheckerTask } from '../tasks/project-checker.js';

async function main() {
  console.log('[scheduler] Starting scheduler...');

  // Validate environment
  if (!process.env.LLM_API_KEY) {
    console.error('[scheduler] Error: LLM_API_KEY environment variable is required');
    process.exit(1);
  }

  // Create scheduler from config file
  const configPath = process.env.SCHEDULER_CONFIG || './config/scheduler.json';
  let scheduler: CronScheduler;

  try {
    scheduler = CronScheduler.fromConfigFile(configPath);
  } catch (error) {
    console.error(`[scheduler] Failed to load config from ${configPath}:`, error);
    process.exit(1);
  }

  // Create conversation sources
  const sources = [
    new OpenCodeSource(),
    new ClaudeSource(),
    new CodexSource(),
  ];

  // Register task: daily summary
  scheduler.register({
    name: 'daily-summary',
    cron: '0 22 * * *',
    handler: async () => {
      const result = await dailySummaryTask({
        sources,
        saveToMemory: true,
      });
      console.log('[scheduler] Daily summary result:\n', result);
      const layeredResult = await layeredMemoryProcessingTask({ mode: 'incremental' });
      console.log('[scheduler] layered-memory-processing complete:', layeredResult);
    },
    enabled: true,
    retryOnFail: true,
    maxRetries: 3,
    description: '每日工作总结 - 整理今天干了什么',
  });

  // Register task: project checker (placeholder)
  scheduler.register({
    name: 'layered-memory-backfill',
    cron: '30 3 * * *',
    handler: async () => {
      const result = await layeredMemoryProcessingTask({ mode: 'backfill' });
      console.log('[scheduler] layered-memory-backfill complete:', result);
    },
    enabled: false,
    retryOnFail: false,
    maxRetries: 0,
    description: '手动/一次性补跑历史 L0 到 L1/L2/L3',
  });

  scheduler.register({
    name: 'project-checker',
    cron: '0 22 * * 5',
    handler: async () => {
      const result = await projectCheckerTask();
      console.log('[scheduler] Project checker result:', result);
    },
    enabled: false, // Disabled by default
    retryOnFail: false,
    maxRetries: 0,
    description: '每周五检查相关项目（暂未实现）',
  });

  // Start scheduler
  scheduler.start();

  const status = scheduler.getStatus();
  console.log('[scheduler] Scheduler started with tasks:');
  for (const task of status) {
    console.log(`  - ${task.name}: ${task.enabled ? 'enabled' : 'disabled'} (${task.cron})`);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[scheduler] Received ${signal}, stopping...`);
    const forceExit = setTimeout(() => {
      console.error('[scheduler] Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000);
    forceExit.unref();

    await scheduler.stop();
    clearTimeout(forceExit);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  console.log('[scheduler] Scheduler is running. Press Ctrl+C to stop.');
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[scheduler] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - let the scheduler continue running
});

process.on('uncaughtException', (error) => {
  console.error('[scheduler] Uncaught exception:', error);
  // Exit with error code - this is a fatal error
  process.exit(1);
});

// Handle SIGHUP (terminal closed)
process.on('SIGHUP', () => {
  console.log('[scheduler] Received SIGHUP, ignoring...');
  // Don't exit - keep running as a daemon
});

main().catch(err => {
  console.error('[scheduler] Fatal error:', err);
  process.exit(1);
});
