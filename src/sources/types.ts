/**
 * Conversation sources type definitions
 */

export interface Session {
  /** 会话 ID */
  id: string;
  /** 来源名称（opencode/claude/codex） */
  source: string;
  /** 会话标题 */
  title?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
  /** 项目/工作目录 */
  directory?: string;
}

export interface Message {
  /** 消息 ID */
  id: string;
  /** 角色（user/assistant/system） */
  role: 'user' | 'assistant' | 'system';
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
}

export interface ConversationSource {
  /** 来源名称 */
  name: string;

  /** 检查是否可用（配置正确、数据存在等） */
  isAvailable(): Promise<boolean>;

  /** 列出指定时间之后的会话 */
  listSessions(since: Date): Promise<Session[]>;

  /** 获取会话的所有消息 */
  getMessages(sessionId: string): Promise<Message[]>;
}
