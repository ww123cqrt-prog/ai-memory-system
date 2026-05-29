# AI Memory System

将 [mem0](https://github.com/mem0ai/mem0) 的 Agent 集成层与 [TencentDB Agent Memory](https://github.com/Tencent/TencentDB-Agent-Memory) 的 L0-L3 分层记忆核心结合。

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  Agent (Claude Code / Codex / OpenCode)                             │
├─────────────────────────────────────────────────────────────────────┤
│  集成层 (integration/)                                              │
│  ├── claude-code/        # Claude Code 插件配置                      │
│  └── opencode/           # OpenCode 插件配置                         │
├─────────────────────────────────────────────────────────────────────┤
│  MCP 协议 (9 个工具)                                                │
│  add_memory, search_memories, get_memories, get_memory,             │
│  update_memory, delete_memory, delete_all_memories,                 │
│  delete_entities, list_entities                                     │
├─────────────────────────────────────────────────────────────────────┤
│  桥接层 (src/bridge/)                                               │
│  ├── mcp-server.ts       # MCP 工具实现 (调用 TdaiCore)              │
│  ├── tdai-adapter.ts     # HostAdapter 实现                         │
│  └── config.ts           # 配置                                     │
├─────────────────────────────────────────────────────────────────────┤
│  调度器 (src/scheduler/)                                            │
│  ├── scheduler.ts        # CronScheduler 核心                       │
│  ├── types.ts            # 类型定义                                  │
│  └── config.ts           # 配置加载                                  │
├─────────────────────────────────────────────────────────────────────┤
│  对话来源 (src/sources/)                                            │
│  ├── opencode-source.ts  # OpenCode SDK 适配器                       │
│  ├── claude-source.ts    # 【占位】Claude Code 适配器                 │
│  └── codex-source.ts     # 【占位】Codex 适配器                      │
├─────────────────────────────────────────────────────────────────────┤
│  定时任务 (tasks/)                                                  │
│  ├── daily-summary.ts    # 每日工作总结                              │
│  ├── project-checker.ts  # 【占位】相关项目检查                       │
│  └── llm-client.ts       # LLM 调用封装                             │
├─────────────────────────────────────────────────────────────────────┤
│  TencentDB Agent Memory (vendor/tencentdb/)                         │
│  ├── TdaiCore            # 核心门面                                  │
│  ├── L0-L3 管道          # 分层记忆提取                              │
│  ├── Mermaid 压缩        # 符号化短期记忆                            │
│  └── SQLite + sqlite-vec # 本地存储                                  │
├─────────────────────────────────────────────────────────────────────┤
│  mem0 参考 (vendor/mem0/)                                           │
│  └── mem0-plugin/        # hooks/skills 参考实现                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
# 安装所有依赖
npm install

# 或者分别安装
cd src/bridge && npm install
cd src/scheduler && npm install
```

### 2. 构建

```bash
npm run build
```

### 3. 配置环境变量

```bash
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://token-plan-sgp.xiaomimimo.com/v1"
export LLM_MODEL="mimo-v2.5-pro"
export MEMORY_DATA_DIR="~/.memory-tdai"
```

### 4. 启动 MCP Server

```bash
npm run start:bridge
```

### 5. 启动调度器

```bash
npm run start:scheduler
```

## Agent 集成

### Claude Code

1. 复制 `integration/claude-code/plugin.json` 到 Claude Code 插件目录
2. 配置 `.mcp.json` 指向桥接层
3. 在 Claude Code 中启用插件

### OpenCode

1. 复制 `integration/opencode/opencode.json` 到 OpenCode 配置目录
2. 配置 MCP server 指向桥接层
3. 重启 OpenCode

## 配置

### 环境变量

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LLM_API_KEY` | LLM API Key | - |
| `LLM_BASE_URL` | LLM 接口地址 | `https://token-plan-sgp.xiaomimimo.com/v1` |
| `LLM_MODEL` | 模型名称 | `mimo-v2.5-pro` |
| `MEMORY_DATA_DIR` | 记忆数据目录 | `~/.memory-tdai` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `SCHEDULER_CONFIG` | 调度器配置文件路径 | `./config/scheduler.json` |

### 调度器配置

配置文件：`config/scheduler.json`

```json
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

## 目录结构

```
ai-memory-system/
├── vendor/                    # 上游代码（Git Subtree）
│   ├── mem0/                  # mem0 完整代码 (用于参考)
│   └── tencentdb/             # TencentDB Agent Memory (核心记忆层)
│
├── src/
│   ├── bridge/                # 桥接层
│   │   ├── src/
│   │   │   ├── mcp-server.ts  # 9 个 MCP 工具实现
│   │   │   ├── tdai-adapter.ts # HostAdapter 实现
│   │   │   └── config.ts      # 配置
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── scheduler/             # 调度器模块
│   │   ├── src/
│   │   │   ├── scheduler.ts   # CronScheduler 核心
│   │   │   ├── types.ts       # 类型定义
│   │   │   ├── config.ts      # 配置加载
│   │   │   └── index.ts       # 导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── sources/               # 对话来源适配器
│       ├── types.ts           # 统一接口
│       ├── opencode-source.ts # OpenCode SDK 适配器
│       ├── claude-source.ts   # 【占位】Claude Code 适配器
│       ├── codex-source.ts    # 【占位】Codex 适配器
│       └── index.ts           # 导出
│
├── tasks/                     # 定时任务
│   ├── daily-summary.ts       # 每日工作总结
│   ├── project-checker.ts     # 【占位】相关项目检查
│   └── llm-client.ts          # LLM 调用封装
│
├── scripts/                   # 启动脚本
│   └── start-scheduler.ts     # 调度器入口
│
├── config/                    # 配置文件
│   └── scheduler.json         # 调度器配置
│
├── integration/               # Agent 集成配置
│   ├── claude-code/
│   └── opencode/
│
├── package.json               # 根 package.json
├── plan.md                    # 规划文档
└── README.md                  # 本文档
```

## 已完成

- [x] 实现 TdaiCore 初始化和调用
- [x] 实现记忆数据格式转换 (通过 TdaiCore 统一处理)
- [x] 配置 Claude Code 集成
- [x] 配置 OpenCode 集成
- [x] 实现通用 Cron 调度器
- [x] 实现 OpenCode 对话来源适配器
- [x] 实现每日工作总结任务
- [x] 实现 LLM 调用封装

## 待完成

- [ ] 实现 Claude Code 对话来源适配器
- [ ] 实现 Codex 对话来源适配器
- [ ] 实现相关项目检查任务
- [ ] 添加测试
- [ ] 实现 get_memory / update_memory / delete_memory (需要访问 vector store)
- [ ] 部署脚本
- [ ] 优化 LLM 配置 (支持更多 provider)

## 更新上游

```bash
# 更新 mem0
git subtree pull --prefix=vendor/mem0 https://github.com/mem0ai/mem0.git main --squash

# 更新 TencentDB Agent Memory
git subtree pull --prefix=vendor/tencentdb https://github.com/Tencent/TencentDB-Agent-Memory.git main --squash
```

## License

MIT
