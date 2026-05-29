/**
 * Daily summary task - consolidate today's work
 */

import type { ConversationSource, Session, Message } from '../src/sources/types.js';
import { callLLM } from './llm-client.js';

const MAX_CONTENT_CHARS = 100000; // ~25K tokens (rough estimate: 4 chars per token)

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
  const { sources, date = new Date(), saveToMemory, llmConfig } = options;

  // 1. Collect today's conversations
  const todayStart = new Date(date);
  todayStart.setHours(0, 0, 0, 0);

  const allSessions: SessionWithMessages[] = [];

  for (const source of sources) {
    try {
      if (!(await source.isAvailable())) {
        console.log(`[daily-summary] Source "${source.name}" is not available, skipping`);
        continue;
      }

      const sessions = await source.listSessions(todayStart);
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
    console.log('[daily-summary] No conversations found today');
    return 'No conversations found today';
  }

  // 2. Format conversation content
  const formattedConversations = allSessions
    .map(({ source, session, messages }) => {
      const header = `## ${source} - ${session.title || session.id}`;
      const body = messages.map(m => `[${m.role}] ${m.content}`).join('\n');
      return `${header}\n${body}`;
    })
    .join('\n\n---\n\n');

  const { content: truncatedContent, truncated } = truncateContent(formattedConversations, MAX_CONTENT_CHARS);

  if (truncated) {
    console.warn(`[daily-summary] Content truncated from ${formattedConversations.length} to ${truncatedContent.length} chars`);
  }

  // 3. Call LLM to generate summary
  const prompt = buildSummaryPrompt(truncatedContent, date);
  console.log('[daily-summary] Calling LLM to generate summary...');

  const summary = await callLLM(prompt, llmConfig);

  // 4. Save to memory system
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
function buildSummaryPrompt(conversations: string, date: Date): string {
  const dateStr = date.toISOString().split('T')[0];
  return `你是每日工作总结助手。请根据以下 ${dateStr} 的对话记录，整理今天的工作总结。

## 要求

输出格式：

### 今日完成
- （2-5 条）

### 学到的知识
- （1-3 条）

### 待解决问题
- （1-3 条）

### 明日计划
- （1-3 条）

## 对话记录

${conversations}

## 总结`;
}

/**
 * Save summary to memory system via MCP
 */
async function saveSummaryToMemory(summary: string, date: Date): Promise<void> {
  const dateStr = date.toISOString().split('T')[0];
  const content = `## ${dateStr} 每日工作总结\n\n${summary}`;

  // TODO: Implement MCP call to add_memory — remove this throw once done
  throw new Error(
    'saveSummaryToMemory is not implemented yet. ' +
    `Summary for ${dateStr} was generated but not persisted to memory system.`
  );
}
