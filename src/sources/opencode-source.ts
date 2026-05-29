/**
 * OpenCode conversation source adapter
 *
 * Reads directly from OpenCode SQLite database at ~/.local/share/opencode/opencode.db
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ConversationSource, Session, Message } from './types.js';

export class OpenCodeSource implements ConversationSource {
  name = 'opencode';
  private dbPath: string;
  private db: DatabaseSync | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.dbPath)) return false;
      const db = this.getDb();
      const result = db.prepare('SELECT COUNT(*) as count FROM session').get() as any;
      return result?.count > 0;
    } catch {
      return false;
    }
  }

  async listSessions(since: Date): Promise<Session[]> {
    const db = this.getDb();
    const sinceMs = since.getTime();
    
    const rows = db.prepare(`
      SELECT id, title, directory, time_created, time_updated
      FROM session
      WHERE time_updated >= ?
      ORDER BY time_updated DESC
    `).all(sinceMs) as any[];

    return rows.map(row => ({
      id: row.id,
      source: this.name,
      title: row.title || undefined,
      createdAt: new Date(row.time_created),
      updatedAt: new Date(row.time_updated),
      directory: row.directory || undefined,
    }));
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const db = this.getDb();
    
    const rows = db.prepare(`
      SELECT id, time_created, data
      FROM message
      WHERE session_id = ?
      ORDER BY time_created ASC
    `).all(sessionId) as any[];

    const messages: Message[] = [];
    for (const row of rows) {
      try {
        const data = JSON.parse(row.data);
        const role = data.role;
        if (!role || role === 'system') continue;
        
        let content = '';
        if (typeof data.content === 'string') {
          content = data.content;
        } else if (Array.isArray(data.content)) {
          content = data.content
            .filter((b: any) => b.type === 'text' && b.text)
            .map((b: any) => b.text)
            .join('\n');
        }
        
        if (content) {
          messages.push({
            id: row.id,
            role: role as Message['role'],
            content,
            timestamp: new Date(row.time_created),
          });
        }
      } catch {
        // Skip malformed entries
      }
    }

    return messages;
  }

  private getDb(): DatabaseSync {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath, { open: true, readOnly: true });
    }
    return this.db;
  }
}
