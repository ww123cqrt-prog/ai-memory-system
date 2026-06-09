/**
 * Daily summary task - consolidate today's work
 */

import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ConversationSource, Session, Message } from '../src/sources/types.js';
import { callLLM } from './llm-client.js';

function getMaxContentChars(): number {
  const raw = process.env.DAILY_SUMMARY_MAX_CONTENT_CHARS;
  if (!raw) {
    return 100000; // ~25K tokens (rough estimate: 4 chars per token)
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100000;
}

function truncateContent(content: string, maxChars: number): { content: string; truncated: boolean } {
  if (content.length <= maxChars) {
    return { content, truncated: false };
  }

  // Try to truncate at a message boundary
  const truncated = content.substring(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');

  return {
    content: lastNewline > maxChars * 0.8 ? truncated.substring(0, lastNewline) : truncated,
    truncated: true,
  };
}

export interface DailySummaryOptions {
  /** 对话来源列表 */
  sources: ConversationSource[];
  /** 目标日期（默认今天） */
  date?: Date;
  /** 是否存入记忆系统 */
  saveToMemory: boolean;
  /** 扫描所有历史记录（用于初始化） */
  scanAllHistory?: boolean;
  /** 历史扫描天数（默认 30 天） */
  historyDays?: number;
  /** LLM 配置覆盖 */
  llmConfig?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
}

interface SessionWithMessages {
  source: string;
  session: Session;
  messages: Message[];
}

function isDialogMessage(message: Message): boolean {
  return message.role === 'user' || message.role === 'assistant';
}

/**
 * Daily summary task
 *
 * Flow:
 * 1. Iterate all sources, get today's sessions
 * 2. Get messages for each session
 * 3. Call LLM to generate summary
 * 4. Save to memory system
 */
export async function dailySummaryTask(options: DailySummaryOptions): Promise<string> {
  const { sources, date = new Date(), saveToMemory, scanAllHistory, historyDays = 30, llmConfig } = options;

  // Validate historyDays
  if (scanAllHistory && (isNaN(historyDays) || historyDays <= 0)) {
    throw new Error(`historyDays must be a positive integer, got: ${historyDays}`);
  }

  const scanStart = new Date(date);
  if (scanAllHistory) {
    scanStart.setDate(scanStart.getDate() - historyDays);
    console.log(`[daily-summary] Scanning all history from ${scanStart.toISOString().split('T')[0]}`);
  } else {
    scanStart.setHours(0, 0, 0, 0);
  }

  const allSessions: SessionWithMessages[] = [];

  for (const source of sources) {
    try {
      if (!(await source.isAvailable())) {
        console.log(`[daily-summary] Source "${source.name}" is not available, skipping`);
        continue;
      }

      const sessions = await source.listSessions(scanStart);
      console.log(`[daily-summary] Found ${sessions.length} sessions from ${source.name}`);

      for (const session of sessions) {
        try {
          const messages = await source.getMessages(session.id);
          if (messages.length > 0) {
            allSessions.push({ source: source.name, session, messages });
          }
        } catch (error) {
          console.warn(
            `[daily-summary] Failed to get messages for session ${session.id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.warn(`[daily-summary] Failed to list sessions from ${source.name}:`, error);
    }
  }

  if (allSessions.length === 0) {
    const range = scanAllHistory ? `past ${historyDays} days` : 'today';
    console.log(`[daily-summary] No conversations found ${range}`);
    return `No conversations found ${range}`;
  }

  // 2. Format conversation content
  const formattedConversations = allSessions
    .map(({ source, session, messages }) => {
      const header = `## ${source} - ${session.title || session.id}`;
      const body = messages.filter(isDialogMessage).map(m => `[${m.role}] ${m.content}`).join('\n');
      return `${header}\n${body}`;
    })
    .join('\n\n---\n\n');

  const maxContentChars = getMaxContentChars();
  const { content: truncatedContent, truncated } = truncateContent(formattedConversations, maxContentChars);

  if (truncated) {
    console.warn(`[daily-summary] Content truncated from ${formattedConversations.length} to ${truncatedContent.length} chars`);
  }

  if (saveToMemory) {
    try {
      await saveConversationsToMemory(allSessions);
    } catch (error) {
      console.warn('[daily-summary] Failed to save raw conversations:', error instanceof Error ? error.message : error);
    }
  }

  // 4. Call LLM to generate summary
  const prompt = buildSummaryPrompt(truncatedContent, date, scanAllHistory);
  console.log('[daily-summary] Calling LLM to generate summary...');

  let summary: string;
  try {
    summary = await callLLM(prompt, llmConfig);
  } catch (error) {
    console.error('[daily-summary] LLM call failed:', error instanceof Error ? error.message : error);
    throw new Error(`LLM call failed: ${error instanceof Error ? error.message : error}`);
  }

  // 5. Save to memory system
  if (saveToMemory) {
    try {
      await saveSummaryToMemory(summary, date);
    } catch (error) {
      console.warn(
        '[daily-summary] Summary generated but memory save failed:',
        error instanceof Error ? error.message : error
      );
      // Still return the summary — generation succeeded even if persistence didn't
    }
  }

  console.log('[daily-summary] Summary generated successfully');
  return summary;
}

/**
 * Build the summary prompt
 */
function buildSummaryPrompt(conversations: string, date: Date, scanAllHistory?: boolean): string {
  const dateStr = date.toISOString().split('T')[0];
  const range = scanAllHistory ? '历史' : dateStr;
  return `你是每日工作总结助手。请根据以下 ${range} 的对话记录，整理工作总结。

## 要求

输出格式：

### 完成的主要工作
- （3-10 条，按重要性排序）

### 学到的知识
- （2-5 条）

### 待解决问题
- （1-5 条）

### 下一步计划
- （1-5 条）

## 对话记录

${conversations}

## 总结`;
}

/**
 * Open a connection to the memory SQLite database
 */
let _db: InstanceType<typeof DatabaseSync> | null = null;
function getDb() {
  if (_db) return _db;
  const dbPath = join(homedir(), '.memory-tdai', 'vectors.db');
  if (!existsSync(dbPath)) {
    throw new Error(`Memory database not found: ${dbPath}`);
  }
  _db = new DatabaseSync(dbPath);
  return _db;
}

/**
 * Save summary to memory system via direct SQLite
 */
async function saveSummaryToMemory(summary: string, date: Date): Promise<void> {
  const dateStr = date.toISOString().split('T')[0];
  const content = `## ${dateStr} 每日工作总结\n\n${summary}`;

  const db = getDb();
  const recordId = `daily-summary:${dateStr}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO l0_conversations 
    (record_id, session_key, session_id, role, message_text, recorded_at, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(recordId, 'daily-summary:default', 'scheduler', 'assistant', content, now, date.getTime());

  console.log(`[daily-summary] Saved summary to memory: ${recordId}`);
}

async function saveConversationsToMemory(sessions: SessionWithMessages[]): Promise<void> {
  const db = getDb();
  db.exec('BEGIN TRANSACTION');
  
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO l0_conversations 
      (record_id, session_key, session_id, role, message_text, recorded_at, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    let saved = 0;
    
    for (const { source, session, messages } of sessions) {
      for (const msg of messages.filter(isDialogMessage)) {
        const recordId = `l0:${source}:${session.id}:${msg.id}`;
        try {
          stmt.run(recordId, `${source}:${session.id}`, session.id, msg.role, msg.content, now, msg.timestamp.getTime());
          saved++;
        } catch (error) {
          if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
            // Duplicate, skip silently
          } else {
            console.warn(`[daily-summary] Failed to save message ${recordId}:`, error);
          }
        }
      }
    }
    
    db.exec('COMMIT');
    console.log(`[daily-summary] Saved ${saved} raw conversation messages to L0`);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* rollback failed, original error preserved */ }
    throw error;
  }
}
