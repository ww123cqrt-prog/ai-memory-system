/**
 * OpenCode conversation source adapter
 *
 * Uses OpenCode SDK to retrieve session and message data.
 */

import type { ConversationSource, Session, Message } from './types.js';

/**
 * OpenCode SDK types (based on @opencode-ai/sdk)
 */
interface OpenCodeSession {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
  directory?: string;
}

interface OpenCodeMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

/**
 * Minimal OpenCode SDK interface we need
 */
interface OpenCodeClient {
  session: {
    list(): Promise<OpenCodeSession[]>;
    messages(sessionId: string): Promise<OpenCodeMessage[]>;
  };
}

export class OpenCodeSource implements ConversationSource {
  name = 'opencode';
  private client: OpenCodeClient | null = null;
  private directory?: string;

  constructor(directory?: string) {
    this.directory = directory;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const client = await this.getClient();
      // Try to list sessions to check if SDK is working
      await client.session.list();
      return true;
    } catch {
      return false;
    }
  }

  async listSessions(since: Date): Promise<Session[]> {
    const client = await this.getClient();
    const sessions = await client.session.list();

    return sessions
      .filter(s => new Date(s.updated_at) >= since)
      .map(s => ({
        id: s.id,
        source: this.name,
        title: s.title,
        createdAt: new Date(s.created_at),
        updatedAt: new Date(s.updated_at),
        directory: s.directory || this.directory,
      }));
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const client = await this.getClient();
    const messages = await client.session.messages(sessionId);

    return messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.created_at),
    }));
  }

  private async getClient(): Promise<OpenCodeClient> {
    if (this.client) {
      return this.client;
    }

    try {
      // Dynamic import to avoid build errors if SDK is not installed
      const sdk = await import('@opencode-ai/sdk');
      this.client = sdk.createOpencodeClient({
        // OpenCode SDK will auto-detect the running instance
      }) as unknown as OpenCodeClient;
      return this.client;
    } catch (error) {
      throw new Error(
        `Failed to initialize OpenCode SDK: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
