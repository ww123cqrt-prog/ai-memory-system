/**
 * Claude Code conversation source adapter
 *
 * Parses JSONL files from `~/.claude/projects/` to extract sessions and messages.
 *
 * **Data layout**
 * ```
 * ~/.claude/projects/
 *   {encoded-project-path}/
 *     {session-uuid}.jsonl
 * ```
 *
 * **JSONL line schema (relevant types)**
 * - `type: "user"` – user message with `message.role`, `message.content`, `uuid`, `timestamp`
 * - `type: "assistant"` – assistant message with `message.role`, `message.content`, `uuid`, `timestamp`
 * - Other types (`queue-operation`, `attachment`, …) are skipped.
 *
 * @module
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ConversationSource, Session, Message } from './types.js';

/**
 * Raw shape of a single JSONL line from a Claude Code session file.
 * Only the fields we actually read are typed; everything else is ignored.
 */
interface ClaudeJsonlLine {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  };
  cwd?: string;
  [key: string]: unknown;
}

export class ClaudeSource implements ConversationSource {
  name = 'claude';
  private claudeDir: string;
  private jsonlCache: Map<string, ClaudeJsonlLine[]> = new Map();
  private fileListCache: Map<string, string[]> = new Map();

  constructor(claudeDir?: string) {
    this.claudeDir = claudeDir || path.join(os.homedir(), '.claude');
  }

  /**
   * Clear the internal JSONL file cache.
   *
   * Call this when files on disk may have changed (e.g. new conversations
   * were created) and you need fresh reads.
   */
  clearCache(): void {
    this.jsonlCache.clear();
    this.fileListCache.clear();
  }

  /**
   * Check whether the Claude projects directory exists and is readable.
   */
  async isAvailable(): Promise<boolean> {
    const projectsDir = this.getProjectsDir();
    try {
      await fs.promises.access(projectsDir, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List sessions whose most recent activity is at or after `since`.
   *
   * Scans every `.jsonl` file under `~/.claude/projects/`, derives the
   * session id from the filename, and builds lightweight metadata without
   * loading every message body into memory.
   */
  async listSessions(since: Date): Promise<Session[]> {
    const files = await this.findJsonlFiles(this.getProjectsDir());
    const sessions: Session[] = [];

    for (const filePath of files) {
      try {
        const sessionId = path.basename(filePath, '.jsonl');
        const meta = await this.extractSessionMeta(filePath, sessionId);
        if (meta && meta.updatedAt >= since) {
          sessions.push(meta);
        }
      } catch (err) {
        // Skip files that cannot be parsed – log and continue
        console.warn(`[claude-source] Failed to read session file ${filePath}:`, err);
      }
    }

    return sessions;
  }

  /**
   * Return all messages for a single session.
   *
   * The `sessionId` is the JSONL filename stem (UUID). The method searches
   * all project directories for a matching file.
   */
  async getMessages(sessionId: string): Promise<Message[]> {
    const files = await this.findJsonlFiles(this.getProjectsDir());
    const target = files.find(f => path.basename(f, '.jsonl') === sessionId);

    if (!target) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const lines = await this.readJsonl(target);
    const messages: Message[] = [];

    for (const line of lines) {
      if (line.type !== 'user' && line.type !== 'assistant') continue;

      const role = this.normalizeRole(line.type);
      if (!role) continue;

      const content = this.extractContent(line.message?.content);
      if (!content) continue;

      messages.push({
        id: line.uuid || `${sessionId}-${messages.length}`,
        role,
        content,
        timestamp: line.timestamp ? new Date(line.timestamp) : new Date(),
      });
    }

    return messages;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Path to the `projects` subdirectory inside the Claude config folder. */
  private getProjectsDir(): string {
    return path.join(this.claudeDir, 'projects');
  }

  /**
   * Recursively collect all `.jsonl` files under `dir`.
   *
   * Claude organises sessions per-project directory, so we need a recursive
   * scan to find every session file regardless of nesting depth.
   */
  private async findJsonlFiles(dir: string): Promise<string[]> {
    const cached = this.fileListCache.get(dir);
    if (cached) return cached;

    const results: string[] = [];

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.findJsonlFiles(fullPath);
        results.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }

    this.fileListCache.set(dir, results);
    return results;
  }

  /**
   * Read a JSONL file and parse every non-empty line as JSON.
   * Malformed lines are silently skipped.
   *
   * Results are cached by absolute file path so repeated reads of the same
   * file (e.g. `listSessions` then `getMessages`) don't hit disk twice.
   * Call `clearCache()` to invalidate.
   */
  private async readJsonl(filePath: string): Promise<ClaudeJsonlLine[]> {
    const cached = this.jsonlCache.get(filePath);
    if (cached) return cached;

    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return [];
    }

    const lines: ClaudeJsonlLine[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        lines.push(JSON.parse(trimmed) as ClaudeJsonlLine);
      } catch {
        // Malformed JSON line – skip
      }
    }

    this.jsonlCache.set(filePath, lines);
    return lines;
  }

  /**
   * Extract session-level metadata from a JSONL file by scanning lines
   * for timestamps and the first user message to derive a title.
   */
  private async extractSessionMeta(
    filePath: string,
    sessionId: string,
  ): Promise<Session | null> {
    const lines = await this.readJsonl(filePath);
    if (lines.length === 0) return null;

    let earliest: Date | null = null;
    let latest: Date | null = null;
    let title: string | undefined;
    let directory: string | undefined;

    for (const line of lines) {
      // Track timestamps
      if (line.timestamp) {
        const ts = new Date(line.timestamp);
        if (!isNaN(ts.getTime())) {
          if (!earliest || ts < earliest) earliest = ts;
          if (!latest || ts > latest) latest = ts;
        }
      }

      // Derive title from the first user message content
      if (!title && line.type === 'user' && line.message?.content) {
        const text = this.extractContent(line.message.content);
        if (text) {
          // Use first ~80 chars as the session title
          title = text.length > 80 ? text.slice(0, 80) + '…' : text;
        }
      }

      // Capture working directory
      if (!directory && typeof line.cwd === 'string') {
        directory = line.cwd;
      }
    }

    if (!earliest) return null;

    return {
      id: sessionId,
      source: this.name,
      title,
      createdAt: earliest,
      updatedAt: latest || earliest,
      directory,
    };
  }

  /**
   * Map a Claude `type` string to the canonical `Message.role` union.
   * Returns `null` for types we don't recognise as user-visible messages.
   */
  private normalizeRole(type: string): Message['role'] | null {
    switch (type) {
      case 'user':
        return 'user';
      case 'assistant':
        return 'assistant';
      default:
        return null;
    }
  }

  /**
   * Extract plain-text content from the heterogeneous `message.content`
   * field.  Claude stores it as either a raw string or an array of
   * `{ type, text }` blocks (for thinking / tool use, etc.).
   */
  private extractContent(
    content: string | Array<{ type?: string; text?: string }> | undefined,
  ): string | null {
    if (!content) return null;

    if (typeof content === 'string') {
      return content.trim() || null;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        // Only extract plain text and thinking blocks; skip tool_use etc.
        if (block.type === 'text' && block.text) {
          parts.push(block.text);
        } else if (block.type === 'thinking' && block.text) {
          // Include thinking blocks as content for memory purposes
          parts.push(block.text);
        }
      }
      const joined = parts.join('\n').trim();
      return joined || null;
    }

    return null;
  }
}
