import { layeredMemoryProcessingTask, type LayeredProcessingMode } from '../tasks/layered-memory-processing.js';

function parseMode(): LayeredProcessingMode {
  if (process.argv.includes('--backfill')) return 'backfill';
  const raw = process.env.MEMORY_LAYERED_MODE;
  return raw === 'backfill' ? 'backfill' : 'incremental';
}

async function main() {
  const mode = parseMode();
  const result = await layeredMemoryProcessingTask({ mode });
  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[layered-memory-processing] fatal:', error);
  process.exit(1);
});
