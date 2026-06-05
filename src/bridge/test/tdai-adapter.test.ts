import assert from 'node:assert/strict';
import { defaultConfig } from '../src/config.js';
import { MemBridgeHostAdapter } from '../src/tdai-adapter.js';

const stdoutWrites: string[] = [];
const stderrWrites: string[] = [];
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

process.stdout.write = ((chunk: any, ...args: any[]) => {
  stdoutWrites.push(String(chunk));
  return true;
}) as typeof process.stdout.write;

process.stderr.write = ((chunk: any, ...args: any[]) => {
  stderrWrites.push(String(chunk));
  return true;
}) as typeof process.stderr.write;

try {
  const adapter = new MemBridgeHostAdapter({
    config: {
      ...defaultConfig,
      logLevel: 'debug',
    },
  });
  const logger = adapter.getLogger();

  logger.debug?.('debug message');
  logger.info('info message');
  logger.warn('warn message');
  logger.error('error message');

  assert.deepEqual(stdoutWrites, []);
  assert.equal(stderrWrites.length, 4);
  assert.ok(stderrWrites.every((line) => line.startsWith('[TDAI] ')));
} finally {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
}
