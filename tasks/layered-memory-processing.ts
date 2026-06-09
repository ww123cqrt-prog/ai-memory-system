/**
 * Layered memory processing task.
 *
 * Replays already-stored L0 rows through the TencentDB L1/L2/L3 pipeline
 * without writing synthetic marker messages.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadConfig } from '../src/bridge/src/config.js';
import { resolveEmbeddingConfig } from '../src/bridge/src/embedding-services.js';
import { MemBridgeHostAdapter } from '../src/bridge/src/tdai-adapter.js';
import { createTdaiConfig } from '../src/bridge/src/tdai-config.js';
import { TdaiCore } from '../vendor/tencentdb/src/core/tdai-core.js';
import { CheckpointManager } from '../vendor/tencentdb/src/utils/checkpoint.js';

const DEFAULT_ALLOWED_PREFIXES = ['codex:', 'opencode:', 'claude:', 'daily-summary:'];
const CHECKPOINT_VERSION = 1;

export type LayeredProcessingMode = 'incremental' | 'backfill';

export interface LayeredProcessingCheckpointEntry {
  lastProcessedRecordedAt: string;
  lastProcessedRecordedAtMs: number;
  lastProcessedRecordId?: string;
  processedRuns: number;
  lastError?: string;
}

export interface LayeredProcessingCheckpoint {
  version: number;
  updatedAt: string;
  sessions: Record<string, LayeredProcessingCheckpointEntry>;
}

export interface LayeredSessionSummary {
  sessionKey: string;
  rowCount: number;
  dialogRowCount: number;
  maxRecordedAt: string;
  maxRecordedAtMs: number;
  maxRecordId: string;
}

export interface LayeredMemoryProcessingOptions {
  mode?: LayeredProcessingMode;
  dataDir?: string;
  allowedPrefixes?: string[];
  maxSessions?: number;
  maxPassesPerSession?: number;
}

export interface LayeredMemoryProcessingResult {
  mode: LayeredProcessingMode;
  candidates: number;
  processed: number;
  failed: number;
  skippedIncomplete: number;
}

interface DialogMessageLike {
  role: string;
  content: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function ensureLocalModelDefaults(): void {
  process.env.MEMORY_DATA_DIR ??= '~/.memory-tdai';

  process.env.LLM_BASE_URL ??= 'http://127.0.0.1:1234/v1';
  process.env.LLM_API_KEY ??= 'lm-studio';
  process.env.LLM_MODEL ??= 'sulphur-2-base';
  process.env.MEMORY_LLM_MAX_TOKENS ??= '4096';
  process.env.MEMORY_L1_BATCH_LIMIT ??= '2';

  process.env.OLLAMA_HOST ??= '127.0.0.1:11522';
  process.env.EMBEDDING_PROVIDER ??= 'ollama';
  process.env.EMBEDDING_BASE_URL ??= 'http://127.0.0.1:11522/v1';
  process.env.EMBEDDING_API_KEY ??= 'ollama';
  process.env.EMBEDDING_MODEL ??= 'qwen3-embedding';
  process.env.EMBEDDING_DIMENSIONS ??= '4096';
  process.env.EMBEDDING_SEND_DIMENSIONS ??= 'true';
  process.env.EMBEDDING_TIMEOUT_MS ??= '180000';
  process.env.MEMORY_REINDEX_ON_INIT ??= 'false';
}

function defaultDataDir(): string {
  return join(homedir(), '.memory-tdai');
}

function checkpointPath(dataDir: string): string {
  return join(dataDir, '.metadata', 'layered_processing_checkpoint.json');
}

export function filterDialogMessages<T extends DialogMessageLike>(messages: T[]): T[] {
  return messages.filter((message) => message.role === 'user' || message.role === 'assistant');
}

function isAllowedSession(sessionKey: string, allowedPrefixes: string[]): boolean {
  return allowedPrefixes.some((prefix) => sessionKey.startsWith(prefix));
}

function isCursorAtOrAfter(
  cursorRecordedAtMs: number,
  cursorRecordId: string | undefined,
  targetRecordedAtMs: number,
  targetRecordId: string,
): boolean {
  const cursorId = cursorRecordId ?? '';
  return cursorRecordedAtMs > targetRecordedAtMs
    || (cursorRecordedAtMs === targetRecordedAtMs && cursorId >= targetRecordId);
}

function isCursorAfter(
  cursorRecordedAtMs: number,
  cursorRecordId: string | undefined,
  previousRecordedAtMs: number,
  previousRecordId: string | undefined,
): boolean {
  const cursorId = cursorRecordId ?? '';
  const previousId = previousRecordId ?? '';
  return cursorRecordedAtMs > previousRecordedAtMs
    || (cursorRecordedAtMs === previousRecordedAtMs && cursorId > previousId);
}

function isSessionNewerThanCheckpoint(
  row: LayeredSessionSummary,
  checkpointEntry: LayeredProcessingCheckpointEntry | undefined,
): boolean {
  if (!checkpointEntry) return true;
  return !isCursorAtOrAfter(
    checkpointEntry.lastProcessedRecordedAtMs ?? 0,
    checkpointEntry.lastProcessedRecordId ?? '',
    row.maxRecordedAtMs,
    row.maxRecordId,
  );
}

export function selectLayeredSessionCandidates(
  rows: LayeredSessionSummary[],
  opts: {
    checkpoint: LayeredProcessingCheckpoint;
    mode: LayeredProcessingMode;
    allowedPrefixes?: string[];
    maxSessions?: number;
  },
): LayeredSessionSummary[] {
  const allowedPrefixes = opts.allowedPrefixes ?? DEFAULT_ALLOWED_PREFIXES;
  const selected = rows
    .filter((row) => isAllowedSession(row.sessionKey, allowedPrefixes))
    .filter((row) => row.dialogRowCount > 0)
    .filter((row) => {
      if (opts.mode === 'backfill') return true;
      return isSessionNewerThanCheckpoint(row, opts.checkpoint.sessions[row.sessionKey]);
    })
    .sort((a, b) => a.maxRecordedAtMs - b.maxRecordedAtMs || a.maxRecordId.localeCompare(b.maxRecordId));

  return opts.maxSessions && opts.maxSessions > 0
    ? selected.slice(0, opts.maxSessions)
    : selected;
}

async function readLayeredCheckpoint(dataDir: string): Promise<LayeredProcessingCheckpoint> {
  try {
    const raw = await readFile(checkpointPath(dataDir), 'utf-8');
    const parsed = JSON.parse(raw) as LayeredProcessingCheckpoint;
    const sessions: LayeredProcessingCheckpoint['sessions'] = {};
    for (const [sessionKey, entry] of Object.entries(parsed.sessions || {})) {
      sessions[sessionKey] = {
        lastProcessedRecordedAt: entry.lastProcessedRecordedAt || new Date(0).toISOString(),
        lastProcessedRecordedAtMs: entry.lastProcessedRecordedAtMs ?? 0,
        lastProcessedRecordId: entry.lastProcessedRecordId ?? '',
        processedRuns: entry.processedRuns ?? 0,
        ...(entry.lastError ? { lastError: entry.lastError } : {}),
      };
    }
    return {
      version: CHECKPOINT_VERSION,
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
      sessions,
    };
  } catch {
    return {
      version: CHECKPOINT_VERSION,
      updatedAt: new Date(0).toISOString(),
      sessions: {},
    };
  }
}

async function writeLayeredCheckpoint(dataDir: string, checkpoint: LayeredProcessingCheckpoint): Promise<void> {
  const filePath = checkpointPath(dataDir);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

function readSessionSummaries(dataDir: string): LayeredSessionSummary[] {
  const dbPath = join(dataDir, 'vectors.db');
  if (!existsSync(dbPath)) {
    throw new Error(`Memory database not found: ${dbPath}`);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT
        base.session_key AS sessionKey,
        COUNT(*) AS rowCount,
        SUM(CASE WHEN base.role IN ('user', 'assistant') THEN 1 ELSE 0 END) AS dialogRowCount,
        MAX(CASE WHEN base.role IN ('user', 'assistant') THEN base.recorded_at ELSE NULL END) AS maxRecordedAt,
        (
          SELECT MAX(tie.record_id)
          FROM l0_conversations tie
          WHERE tie.session_key = base.session_key
            AND tie.role IN ('user', 'assistant')
            AND tie.recorded_at = (
              SELECT MAX(max_row.recorded_at)
              FROM l0_conversations max_row
              WHERE max_row.session_key = base.session_key
                AND max_row.role IN ('user', 'assistant')
            )
        ) AS maxRecordId
      FROM l0_conversations base
      GROUP BY base.session_key
    `).all() as Array<{
      sessionKey: string;
      rowCount: number;
      dialogRowCount: number | null;
      maxRecordedAt: string | null;
      maxRecordId: string | null;
    }>;

    return rows
      .filter((row) => row.maxRecordedAt)
      .map((row) => ({
        sessionKey: row.sessionKey,
        rowCount: Number(row.rowCount) || 0,
        dialogRowCount: Number(row.dialogRowCount) || 0,
        maxRecordedAt: row.maxRecordedAt!,
        maxRecordedAtMs: Date.parse(row.maxRecordedAt!) || 0,
        maxRecordId: row.maxRecordId || '',
      }))
      .filter((row) => row.maxRecordedAtMs > 0 && row.maxRecordId);
  } finally {
    db.close();
  }
}

async function createCore(dataDir: string): Promise<TdaiCore> {
  ensureLocalModelDefaults();
  const config = {
    ...loadConfig(),
    dataDir,
  };
  const embedding = await resolveEmbeddingConfig(config.embedding, {
    logger: {
      info: (message) => console.log(message),
      warn: (message) => console.warn(message),
      error: (message) => console.error(message),
    },
  });

  const adapter = new MemBridgeHostAdapter({ config });
  const core = new TdaiCore({
    hostAdapter: adapter,
    config: createTdaiConfig(config, embedding) as any,
  });
  await core.initialize();
  return core;
}

async function readL1Cursor(dataDir: string, sessionKey: string): Promise<{ recordedAtMs: number; recordId: string }> {
  const checkpoint = new CheckpointManager(dataDir, { info() {} });
  const cp = await checkpoint.read();
  const state = cp.runner_states?.[sessionKey];
  return {
    recordedAtMs: state?.last_l1_cursor ?? 0,
    recordId: state?.last_l1_record_id ?? '',
  };
}

export async function processSessionUntilCaughtUp(params: {
  core: TdaiCore;
  dataDir: string;
  session: LayeredSessionSummary;
  maxPasses: number;
  forceFirstPass?: boolean;
}): Promise<{ cursor: { recordedAtMs: number; recordId: string }; caughtUp: boolean; passes: number }> {
  let cursor = await readL1Cursor(params.dataDir, params.session.sessionKey);
  let passes = 0;

  while (
    (
      (params.forceFirstPass && passes === 0) ||
      !isCursorAtOrAfter(
        cursor.recordedAtMs,
        cursor.recordId,
        params.session.maxRecordedAtMs,
        params.session.maxRecordId,
      )
    ) &&
    passes < params.maxPasses
  ) {
    const before = cursor;
    passes += 1;
    await params.core.processStoredL0Session(params.session.sessionKey);
    cursor = await readL1Cursor(params.dataDir, params.session.sessionKey);

    if (!isCursorAfter(cursor.recordedAtMs, cursor.recordId, before.recordedAtMs, before.recordId)) {
      break;
    }
  }

  return {
    cursor,
    caughtUp: isCursorAtOrAfter(
      cursor.recordedAtMs,
      cursor.recordId,
      params.session.maxRecordedAtMs,
      params.session.maxRecordId,
    ),
    passes,
  };
}

export async function layeredMemoryProcessingTask(
  options: LayeredMemoryProcessingOptions = {},
): Promise<LayeredMemoryProcessingResult> {
  const mode = options.mode ?? 'incremental';
  const dataDir = options.dataDir ?? defaultDataDir();
  const maxSessions =
    options.maxSessions ?? parseOptionalPositiveInteger(process.env.MEMORY_LAYERED_MAX_SESSIONS);
  const maxPassesPerSession =
    options.maxPassesPerSession ?? parsePositiveInteger(process.env.MEMORY_LAYERED_MAX_PASSES_PER_SESSION, 100);

  const checkpoint = await readLayeredCheckpoint(dataDir);
  const summaries = readSessionSummaries(dataDir);
  const candidates = selectLayeredSessionCandidates(summaries, {
    checkpoint,
    mode,
    allowedPrefixes: options.allowedPrefixes,
    maxSessions,
  });

  console.log(`[layered-memory-processing] mode=${mode}, candidates=${candidates.length}`);

  let processed = 0;
  let failed = 0;
  let skippedIncomplete = 0;
  let core: TdaiCore | undefined;

  try {
    core = await createCore(dataDir);

    for (const session of candidates) {
      try {
        console.log(
          `[layered-memory-processing] processing ${session.sessionKey} ` +
          `(dialogRows=${session.dialogRowCount}, target=${session.maxRecordedAt})`,
        );

        const result = await processSessionUntilCaughtUp({
          core,
          dataDir,
          session,
          maxPasses: maxPassesPerSession,
          forceFirstPass: mode === 'backfill',
        });

        const processedAtMs = Math.min(result.cursor.recordedAtMs, session.maxRecordedAtMs);
        if (processedAtMs > 0) {
          checkpoint.sessions[session.sessionKey] = {
            lastProcessedRecordedAt: new Date(processedAtMs).toISOString(),
            lastProcessedRecordedAtMs: processedAtMs,
            lastProcessedRecordId: result.cursor.recordedAtMs >= session.maxRecordedAtMs
              ? result.cursor.recordId
              : '',
            processedRuns: (checkpoint.sessions[session.sessionKey]?.processedRuns ?? 0) + result.passes,
          };
        }

        if (result.caughtUp) {
          processed += 1;
        } else {
          skippedIncomplete += 1;
          const existingEntry = checkpoint.sessions[session.sessionKey];
          checkpoint.sessions[session.sessionKey] = {
            lastProcessedRecordedAt:
              existingEntry?.lastProcessedRecordedAt ?? new Date(result.cursor.recordedAtMs || 0).toISOString(),
            lastProcessedRecordedAtMs: existingEntry?.lastProcessedRecordedAtMs ?? result.cursor.recordedAtMs,
            lastProcessedRecordId: existingEntry?.lastProcessedRecordId ?? result.cursor.recordId,
            processedRuns: (existingEntry?.processedRuns ?? 0) + result.passes,
            lastError:
              `not caught up after ${result.passes} pass(es), ` +
              `cursor=${result.cursor.recordedAtMs}/${result.cursor.recordId}, ` +
              `target=${session.maxRecordedAtMs}/${session.maxRecordId}`,
          };
          console.warn(
            `[layered-memory-processing] incomplete ${session.sessionKey}: ` +
            `cursor=${result.cursor.recordedAtMs}/${result.cursor.recordId}, ` +
            `target=${session.maxRecordedAtMs}/${session.maxRecordId}`,
          );
        }

        checkpoint.updatedAt = new Date().toISOString();
        await writeLayeredCheckpoint(dataDir, checkpoint);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        checkpoint.sessions[session.sessionKey] = {
          lastProcessedRecordedAt:
            checkpoint.sessions[session.sessionKey]?.lastProcessedRecordedAt ?? new Date(0).toISOString(),
          lastProcessedRecordedAtMs:
            checkpoint.sessions[session.sessionKey]?.lastProcessedRecordedAtMs ?? 0,
          lastProcessedRecordId:
            checkpoint.sessions[session.sessionKey]?.lastProcessedRecordId ?? '',
          processedRuns: checkpoint.sessions[session.sessionKey]?.processedRuns ?? 0,
          lastError: message,
        };
        checkpoint.updatedAt = new Date().toISOString();
        await writeLayeredCheckpoint(dataDir, checkpoint);
        console.warn(`[layered-memory-processing] failed ${session.sessionKey}: ${message}`);
      }
    }
  } finally {
    await core?.destroy();
  }

  const result = {
    mode,
    candidates: candidates.length,
    processed,
    failed,
    skippedIncomplete,
  };
  console.log(`[layered-memory-processing] complete ${JSON.stringify(result)}`);
  return result;
}
