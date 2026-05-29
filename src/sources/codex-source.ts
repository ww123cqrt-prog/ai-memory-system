/**
 * Codex conversation source adapter
 *
 * Parses JSONL files from `~/.codex/sessions/` to extract sessions and messages.
 *
 * **Data layout**
 * ```
 * ~/.codex/sessions/
 *   {year}/{month}/{day}/
 *     rollout-{ISO-timestamp}-{uuid}.jsonl
 * ```
 *
 * **JSONL line schema (relevant types)**
 * - `type: "session_meta"` – session metadata: `payload.id`, `payload.timestamp`, `payload.cwd`
 * - `type: "response_item"` with `payload.type: "message"` – user/assistant/developer messages
 *   containing `payload.role` and `payload.content` (array of `{ type, text }` blocks).
 * - Other types (`event_msg`, `turn_context`, …) are skipped.
 *
 * @module
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ConversationSource, Session, Message } from './types.js';

/**
 * Raw shape of a single JSONL line from a Codex session file.
 * Only the fields we actually read are typed; everything else is ignored.
 */
interface CodexJsonlLine {
  type?: string;
  timestamp?: string;
  payload?: {
    id?: string;
    type?: string;
    timestamp?: string;
    cwd?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class CodexSource implements ConversationSource {
  name = 'codex';
  private codexDir: string;

  constructor(codexDir?: string) {
    this.codexDir = codexDir || path.join(os.homedir(), '.codex');
  }

  /**
   * Check whether the Codex sessions directory exists and is readable.
   */
  async isAvailable(): Promise<boolean> {
    const sessionsDir = this.getSessionsDir();
    try {
      await fs.promises.access(sessionsDir, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List sessions whose most recent activity is at or after `since`.
   *
   * Scans every `.jsonl` file under `~/.codex/sessions/`, derives the
   * session id from either the `session_meta` payload or the filename,
   * and builds lightweight metadata.
   */
  async listSessions(since: Date): Promise<Session[]> {
    const files = await this.findJsonlFiles(this.getSessionsDir());
    const sessions: Session[] = [];

    for (const filePath of files) {
      try {
        const meta = await this.extractSessionMeta(filePath);
        if (meta && meta.updatedAt >= since) {
          sessions.push(meta);
        }
      } catch (err) {
        // Skip files that cannot be parsed – log and continue
        console.warn(`[codex-source] Failed to read session file ${filePath}:`, err);
      }
    }

    return sessions;
  }

  /**
   * Return all messages for a single session.
   *
   * The `sessionId` matches `session_meta.payload.id` (a UUID). The method
   * searches all session directories for a file whose embedded id matches.
   */
  async getMessages(sessionId: string): Promise<Message[]> {
    const files = await this.findJsonlFiles(this.getSessionsDir());

    // Find the file that contains this session id
    let target: string | undefined;
    for (const filePath of files) {
      const id = this.extractSessionIdFromFilename(filePath);
      if (id === sessionId) {
        target = filePath;
        break;
      }
    }

    // Fallback: scan files for session_meta payload match
    if (!target) {
      for (const filePath of files) {
        const lines = await this.readJsonl(filePath);
        for (const line of lines) {
          if (line.type === 'session_meta' && line.payload?.id === sessionId) {
            target = filePath;
            break;
          }
        }
        if (target) break;
      }
    }

    if (!target) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const lines = await this.readJsonl(target);
    const messages: Message[] = [];

    for (const line of lines) {
      // Only process response_item lines that contain actual messages
      if (line.type !== 'response_item') continue;
      if (line.payload?.type !== 'message') continue;

      const role = this.normalizeRole(line.payload.role);
      if (!role) continue;

      const content = this.extractContent(line.payload.content);
      if (!content) continue;

      // Use the line timestamp or the payload timestamp
      const ts = line.timestamp || line.payload.timestamp;

      messages.push({
        id: `${sessionId}-${messages.length}`,
        role,
        content,
        timestamp: ts ? new Date(ts) : new Date(),
      });
    }

    return messages;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Path to the `sessions` subdirectory inside the Codex config folder. */
  private getSessionsDir(): string {
    return path.join(this.codexDir, 'sessions');
  }

  /**
   * Recursively collect all `.jsonl` files under `dir`.
   *
   * Codex organises sessions by date: `sessions/{year}/{month}/{day}/`,
   * so we need a recursive scan.
   */
  private async findJsonlFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      // Directory does not exist or is unreadable – return empty
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

    return results;
  }

  /**
   * Read a JSONL file and parse every non-empty line as JSON.
   * Malformed lines are silently skipped.
   */
  private async readJsonl(filePath: string): Promise<CodexJsonlLine[]> {
    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return [];
    }

    const lines: CodexJsonlLine[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        lines.push(JSON.parse(trimmed) as CodexJsonlLine);
      } catch {
        // Malformed JSON line – skip
      }
    }
    return lines;
  }

  /**
   * Extract the session UUID from a Codex filename.
   *
   * Filenames follow the pattern `rollout-{ISO-timestamp}-{uuid}.jsonl`.
   * The UUID is the last hyphen-delimited segment before the extension.
   */
  private extractSessionIdFromFilename(filePath: string): string | null {
    const base = path.basename(filePath, '.jsonl');
    // Pattern: rollout-2026-05-27T23-45-11-019e6a1c-7872-70d3-b4b3-f6d8f1a3a0be
    // The UUID is the last 5 hyphen-separated groups
    const match = base.match(
      /rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    );
    return match ? match[1] : null;
  }

  /**
   * Extract session-level metadata from a JSONL file.
   *
   * Prefers the `session_meta` payload; falls back to filename-derived id
   * and first/last timestamps.
   */
  private async extractSessionMeta(filePath: string): Promise<Session | null> {
    const lines = await this.readJsonl(filePath);
    if (lines.length === 0) return null;

    let sessionId: string | null = null;
    let createdAt: Date | null = null;
    let updatedAt: Date | null = null;
    let title: string | undefined;
    let directory: string | undefined;

    for (const line of lines) {
      // Extract session metadata from session_meta lines
      if (line.type === 'session_meta' && line.payload) {
        if (line.payload.id) sessionId = line.payload.id;
        if (line.payload.cwd) directory = line.payload.cwd;
        if (line.payload.timestamp) {
          const ts = new Date(line.payload.timestamp);
          if (!isNaN(ts.getTime())) {
            createdAt = ts;
          }
        }
      }

      // Track timestamps
      if (line.timestamp) {
        const ts = new Date(line.timestamp);
        if (!isNaN(ts.getTime())) {
          if (!createdAt) createdAt = ts;
          if (!updatedAt || ts > updatedAt) updatedAt = ts;
        }
      }

      // Derive title from the first user message
      if (
        !title &&
        line.type === 'response_item' &&
        line.payload?.type === 'message' &&
        line.payload.role === 'user'
      ) {
        const text = this.extractContent(line.payload.content);
        if (text) {
          title = text.length > 80 ? text.slice(0, 80) + '…' : text;
        }
      }
    }

    // Fall back to filename-derived session id
    if (!sessionId) {
      sessionId = this.extractSessionIdFromFilename(filePath);
    }

    if (!sessionId || !createdAt) return null;

    return {
      id: sessionId,
      source: this.name,
      title,
      createdAt,
      updatedAt: updatedAt || createdAt,
      directory,
    };
  }

  /**
   * Map a Codex `role` string to the canonical `Message.role` union.
   * Developer messages are treated as `system`.
   * Returns `null` for roles we don't recognise.
   */
  private normalizeRole(role: string | undefined): Message['role'] | null {
    switch (role) {
      case 'user':
        return 'user';
      case 'assistant':
        return 'assistant';
      case 'developer':
        return 'system';
      default:
        return null;
    }
  }

  /**
   * Extract plain-text content from the Codex content array.
   *
   * Codex stores content as an array of `{ type, text }` blocks.
   * We extract `input_text` and `text` blocks.
   */
  private extractContent(
    content: Array<{ type?: string; text?: string }> | undefined,
  ): string | null {
    if (!content || !Array.isArray(content)) return null;

    const parts: string[] = [];
    for (const block of content) {
      if ((block.type === 'input_text' || block.type === 'text') && block.text) {
        parts.push(block.text);
      }
    }

    const joined = parts.join('\n').trim();
    return joined || null;
  }
}
