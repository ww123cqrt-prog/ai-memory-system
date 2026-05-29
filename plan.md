# AI Memory System - 完整规划

## 项目概述

基于 mem0 的 Agent 集成层 + TencentDB Agent Memory 的 L0-L3 记忆核心，构建通用 AI 记忆系统。

**已完成**：
- MCP Server（9 个记忆工具）
- TencentDB TdaiCore 集成
- OpenCode / Claude Code 配置
- Git Subtree 管理

**待实现**：
- 通用 Cron 调度器
- 多来源对话采集（OpenCode / Claude Code / Codex）
- 每日工作总结任务
- 相关项目检查任务（占位）

---

## 目录结构

```
ai-memory-system/
├── src/
│   ├── bridge/                        # MCP Server（已完成）
│   │   ├── src/
│   │   │   ├── mcp-server.ts
│   │   │   ├── tdai-adapter.ts
│   │   │   └── config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── scheduler/                     # 【新增】通用 Cron 调度器
│   │   ├── src/
│   │   │   ├── index.ts               # 导出
│   │   │   ├── scheduler.ts           # CronScheduler 核心
│   │   │   ├── types.ts               # 类型定义
│   │   │   └── config.ts              # 配置加载
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── sources/                       # 【新增】对话来源适配器
│       ├── index.ts                   # 导出
│       ├── types.ts                   # ConversationSource 接口
│       ├── opencode-source.ts         # OpenCode SDK 适配器
│       ├── claude-source.ts           # 【占位】Claude Code 适配器
│       └── codex-source.ts            # 【占位】Codex 适配器
│
├── tasks/                             # 【新增】定时任务实现
│   ├── daily-summary.ts               # 每日工作总结
│   ├── project-checker.ts             # 【占位】相关项目检查
│   └── llm-client.ts                  # LLM 调用封装
│
├── scripts/                           # 【新增】启动脚本
│   └── start-scheduler.ts             # 调度器入口
│
├── config/                            # 【新增】配置文件
│   └── scheduler.json                 # 调度配置
│
├── vendor/                            # 上游代码（Git Subtree）
│   ├── mem0/
│   └── tencentdb/
│
├── integration/                       # Agent 集成配置
│   ├── claude-code/
│   └── opencode/
│
├── plan.md                            # 本文档
└── README.md
```

---

## 模块 1：通用调度器 `src/scheduler/`

### 依赖

- `node-cron` - Cron 表达式解析和调度
- `@types/node-cron` - TypeScript 类型

### 核心类

```typescript
// src/scheduler/src/types.ts

export interface TaskDefinition {
  /** 任务唯一名称 */
  name: string;
  /** Cron 表达式，如 "0 22 * * *" */
  cron: string;
  /** 任务处理函数 */
  handler: () => Promise<void>;
  /** 是否启用 */
  enabled: boolean;
  /** 失败时是否重试 */
  retryOnFail: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 任务描述（用于日志） */
  description?: string;
}

export interface SchedulerConfig {
  /** 是否启用调度器 */
  enabled: boolean;
  /** 时区 */
  timezone: string;
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 任务配置 */
  tasks: Record<string, TaskConfig>;
}

export interface TaskConfig {
  /** Cron 表达式 */
  cron: string;
  /** 是否启用 */
  enabled: boolean;
  /** 任务描述 */
  description?: string;
  /** 失败重试 */
  retryOnFail?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
}
```

```typescript
// src/scheduler/src/scheduler.ts

import cron from 'node-cron';
import type { TaskDefinition, SchedulerConfig } from './types.js';

export class CronScheduler {
  private tasks = new Map<string, TaskDefinition>();
  private scheduledTasks = new Map<string, cron.ScheduledTask>();
  private config: SchedulerConfig;
  private logger: Logger;

  constructor(config: SchedulerConfig, logger?: Logger);

  /** 注册任务 */
  register(task: TaskDefinition): void;

  /** 从配置文件批量注册 */
  registerFromConfig(configPath: string): Promise<void>;

  /** 启动调度器 */
  start(): void;

  /** 停止调度器 */
  stop(): void;

  /** 手动触发任务 */
  trigger(taskName: string): Promise<void>;

  /** 获取任务状态 */
  getStatus(): TaskStatus[];
}
```

### 配置文件

```json
// config/scheduler.json
{
  "enabled": true,
  "timezone": "Asia/Shanghai",
  "logLevel": "info",
  "tasks": {
    "daily-summary": {
      "cron": "0 22 * * *",
      "enabled": true,
      "description": "每日工作总结 - 整理今天干了什么",
      "retryOnFail": true,
      "maxRetries": 3
    },
    "project-checker": {
      "cron": "0 22 * * 5",
      "enabled": false,
      "description": "每周五检查相关项目（暂未实现）",
      "retryOnFail": false,
      "maxRetries": 0
    }
  }
}
```

---

## 模块 2：对话来源适配器 `src/sources/`

### 统一接口

```typescript
// src/sources/types.ts

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
```

### OpenCode 适配器

```typescript
// src/sources/opencode-source.ts

import { createOpencodeClient } from '@opencode-ai/sdk';
import type { ConversationSource, Session, Message } from './types.js';

export class OpenCodeSource implements ConversationSource {
  name = 'opencode';
  private client: ReturnType<typeof createOpencodeClient>;

  constructor(directory?: string);

  async isAvailable(): Promise<boolean>;
  async listSessions(since: Date): Promise<Session[]>;
  async getMessages(sessionId: string): Promise<Message[]>;
}
```

### Claude Code 适配器（占位）

```typescript
// src/sources/claude-source.ts

import type { ConversationSource } from './types.js';

/**
 * Claude Code 对话来源适配器（占位）
 *
 * 数据位置：~/.claude/projects/
 * 格式：JSONL
 *
 * TODO: 实现以下功能
 * 1. 解析 ~/.claude/projects/ 下的 JSONL 文件
 * 2. 提取 session 元数据（id, title, created_at）
 * 3. 提取 messages（role, content, timestamp）
 */
export class ClaudeSource implements ConversationSource {
  name = 'claude';

  async isAvailable(): Promise<boolean> {
    // TODO: 检查 ~/.claude/ 目录是否存在
    return false;
  }

  async listSessions(since: Date): Promise<Session[]> {
    // TODO: 实现
    throw new Error('Not implemented');
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    // TODO: 实现
    throw new Error('Not implemented');
  }
}
```

### Codex 适配器（占位）

```typescript
// src/sources/codex-source.ts

import type { ConversationSource } from './types.js';

/**
 * Codex 对话来源适配器（占位）
 *
 * 数据位置：~/.codex/sessions/
 * 格式：JSONL
 *
 * TODO: 实现以下功能
 * 1. 解析 ~/.codex/sessions/ 下的 JSONL 文件
 * 2. 提取 session 元数据
 * 3. 提取 messages
 */
export class CodexSource implements ConversationSource {
  name = 'codex';

  async isAvailable(): Promise<boolean> {
    // TODO: 检查 ~/.codex/ 目录是否存在
    return false;
  }

  async listSessions(since: Date): Promise<Session[]> {
    // TODO: 实现
    throw new Error('Not implemented');
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    // TODO: 实现
    throw new Error('Not implemented');
  }
}
```

---

## 模块 3：定时任务 `tasks/`

### 每日工作总结

```typescript
// tasks/daily-summary.ts

import type { ConversationSource } from '../src/sources/types.js';
import { callLLM } from './llm-client.js';

interface DailySummaryOptions {
  /** 对话来源列表 */
  sources: ConversationSource[];
  /** 目标日期（默认今天） */
  date?: Date;
  /** 是否存入记忆系统 */
  saveToMemory: boolean;
  /** MCP Server 路径（用于存入记忆） */
  mcpServerPath?: string;
}

/**
 * 每日工作总结任务
 *
 * 流程：
 * 1. 遍历所有 source，获取今天的 session
 * 2. 获取每个 session 的 messages
 * 3. 调用 LLM 整理总结
 * 4. 存入记忆系统
 */
export async function dailySummaryTask(options: DailySummaryOptions): Promise<void> {
  const { sources, date = new Date(), saveToMemory } = options;

  // 1. 收集今天的对话
  const todayStart = new Date(date);
  todayStart.setHours(0, 0, 0, 0);

  const allSessions: Array<{ source: string; session: Session; messages: Message[] }> = [];

  for (const source of sources) {
    if (!(await source.isAvailable())) continue;

    const sessions = await source.listSessions(todayStart);
    for (const session of sessions) {
      const messages = await source.getMessages(session.id);
      if (messages.length > 0) {
        allSessions.push({ source: source.name, session, messages });
      }
    }
  }

  if (allSessions.length === 0) {
    console.log('[daily-summary] 今天没有对话记录');
    return;
  }

  // 2. 格式化对话内容
  const formattedConversations = allSessions.map(({ source, session, messages }) => {
    const header = `## ${source} - ${session.title || session.id}`;
    const body = messages
      .map(m => `[${m.role}] ${m.content}`)
      .join('\n');
    return `${header}\n${body}`;
  }).join('\n\n---\n\n');

  // 3. 调用 LLM 整理
  const prompt = buildSummaryPrompt(formattedConversations, date);
  const summary = await callLLM(prompt);

  // 4. 存入记忆系统
  if (saveToMemory) {
    await saveSummaryToMemory(summary, date);
  }

  console.log('[daily-summary] 完成:\n', summary);
}

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
```

### LLM 调用封装

```typescript
// tasks/llm-client.ts

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * 调用 LLM API
 * 直接调用 mimo-v2.5-pro API（OpenAI 兼容格式）
 */
export async function callLLM(
  prompt: string,
  config?: Partial<LLMConfig>
): Promise<string> {
  const cfg: LLMConfig = {
    baseUrl: process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'mimo-v2.5-pro',
    maxTokens: 2000,
    timeoutMs: 30000,
    ...config,
  };

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: cfg.maxTokens,
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}
```

### 相关项目检查（占位）

```typescript
// tasks/project-checker.ts

/**
 * 相关项目检查任务（占位）
 *
 * 未来实现：
 * 1. 接入 GitHub API 搜索用户仓库
 * 2. 根据今日工作总结搜索相关开源项目
 * 3. 存入记忆系统作为参考
 *
 * 触发频率：每周五 22:00
 */
export async function projectCheckerTask(): Promise<void> {
  console.log('[project-checker] 任务暂未实现');
  // TODO: 实现
  // 1. 读取最近的 daily-summary 记忆
  // 2. 提取关键词
  // 3. 搜索 GitHub 相关项目
  // 4. 存入记忆系统
}
```

---

## 模块 4：启动脚本 `scripts/`

```typescript
// scripts/start-scheduler.ts

import { CronScheduler } from '../src/scheduler/index.js';
import { OpenCodeSource } from '../src/sources/opencode-source.js';
import { ClaudeSource } from '../src/sources/claude-source.js';
import { CodexSource } from '../src/sources/codex-source.js';
import { dailySummaryTask } from '../tasks/daily-summary.js';
import { projectCheckerTask } from '../tasks/project-checker.js';

async function main() {
  console.log('[scheduler] 启动调度器...');

  // 创建调度器
  const scheduler = new CronScheduler({
    configPath: './config/scheduler.json',
  });

  // 创建对话来源
  const sources = [
    new OpenCodeSource(),
    new ClaudeSource(),
    new CodexSource(),
  ];

  // 注册任务：每日工作总结
  scheduler.register({
    name: 'daily-summary',
    handler: async () => {
      await dailySummaryTask({
        sources,
        saveToMemory: true,
      });
    },
  });

  // 注册任务：相关项目检查（占位）
  scheduler.register({
    name: 'project-checker',
    handler: async () => {
      await projectCheckerTask();
    },
  });

  // 启动调度器
  scheduler.start();

  console.log('[scheduler] 调度器已启动');
  console.log('[scheduler] 已注册任务:', scheduler.getStatus().map(t => t.name));

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('[scheduler] 收到 SIGINT，停止调度器...');
    scheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[scheduler] 收到 SIGTERM，停止调度器...');
    scheduler.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[scheduler] 启动失败:', err);
  process.exit(1);
});
```

---

## Crontab 配置

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每天 22:00 启动调度器）
# 调度器内部会管理具体的任务时间
0 22 * * * cd /Users/cq/WorkingProjects/ai-memory-system && node scripts/start-scheduler.js >> ~/.memory-tdai/logs/scheduler.log 2>&1
```

或者直接用 `pm2` 或 `systemd` 管理调度器进程：

```bash
# 使用 pm2
pm2 start scripts/start-scheduler.js --name memory-scheduler

# 查看日志
pm2 logs memory-scheduler
```

---

## 环境变量

```bash
# .env 或 crontab 中设置

# LLM 配置
LLM_API_KEY=tp-s6wizppnb4mx98viw6j7eewj4drlrojql2qzoieodqmhcjdr
LLM_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
LLM_MODEL=mimo-v2.5-pro

# Embedding 配置（本地 LM Studio）
EMBEDDING_BASE_URL=http://localhost:1234/v1
EMBEDDING_MODEL=text-embedding-qwen3-embedding-8b

# 数据目录
MEMORY_DATA_DIR=~/.memory-tdai

# 调度器配置
SCHEDULER_CONFIG=./config/scheduler.json
```

---

## sessionKey 设计

每日总结的 sessionKey：

```
daily-summary:default
```

**说明**：
- 所有每日总结共享同一个 sessionKey
- TencentDB 的 L0 会按时间戳区分不同日期的总结
- L1 提炼时会自动去重、合并

如果需要按日期区分（不推荐，会导致记忆碎片化）：
```
daily-summary:2026-05-29
daily-summary:2026-05-30
```

**推荐**：使用固定的 `daily-summary:default`，让 L0-L3 流水线自动管理时间维度。

---

## 实施步骤

| # | 任务 | 文件 | 依赖 |
|---|---|---|---|
| 1 | 创建 `src/scheduler/` 目录结构 | package.json, tsconfig.json | 无 |
| 2 | 实现 CronScheduler 核心 | scheduler.ts, types.ts, config.ts | node-cron |
| 3 | 创建 `src/sources/` 目录结构 | package.json, types.ts | 无 |
| 4 | 实现 OpenCodeSource | opencode-source.ts | @opencode-ai/sdk |
| 5 | 创建 ClaudeSource 占位 | claude-source.ts | 无 |
| 6 | 创建 CodexSource 占位 | codex-source.ts | 无 |
| 7 | 实现 LLM 调用封装 | tasks/llm-client.ts | 无 |
| 8 | 实现每日总结任务 | tasks/daily-summary.ts | llm-client, sources |
| 9 | 创建相关项目检查占位 | tasks/project-checker.ts | 无 |
| 10 | 创建启动脚本 | scripts/start-scheduler.ts | scheduler, tasks |
| 11 | 创建配置文件 | config/scheduler.json | 无 |
| 12 | 更新 README | README.md | 无 |
| 13 | 测试 + crontab 配置 | 无 | 以上全部 |

---

## 依赖汇总

### npm 包

```json
{
  "dependencies": {
    "node-cron": "^3.0.3",
    "@opencode-ai/sdk": "^1.15.11"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11",
    "typescript": "^5.8.0"
  }
}
```

### 外部服务

| 服务 | 用途 | 配置 |
|---|---|---|
| mimo-v2.5-pro API | LLM 调用（总结、提炼） | LLM_* 环境变量 |
| LM Studio (qwen3) | Embedding（语义搜索） | localhost:1234 |
| OpenCode SDK | 获取对话记录 | 自动检测 |

---

## 后续扩展

1. **Claude Code 适配器**：解析 `~/.claude/projects/` 下的 JSONL 文件
2. **Codex 适配器**：解析 `~/.codex/sessions/` 下的 JSONL 文件
3. **相关项目检查**：接入 GitHub API 搜索相关项目
4. **Web Dashboard**：可视化记忆内容和调度状态
5. **记忆导出**：支持导出为 Markdown / JSON 格式
