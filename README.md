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
# 安装桥接层依赖
cd src/bridge && npm install

# 构建
npm run build
```

### 2. 配置环境变量

```bash
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4o-mini"
export MEMORY_DATA_DIR="~/.memory-tdai"
```

### 3. 测试 MCP Server

```bash
cd src/bridge && npm run dev
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

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LLM_API_KEY` | LLM API Key | - |
| `LLM_BASE_URL` | LLM 接口地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名称 | `gpt-4o-mini` |
| `MEMORY_DATA_DIR` | 记忆数据目录 | `~/.memory-tdai` |
| `LOG_LEVEL` | 日志级别 | `info` |

## 更新上游

```bash
# 更新 mem0
git subtree pull --prefix=vendor/mem0 https://github.com/mem0ai/mem0.git main --squash

# 更新 TencentDB Agent Memory
git subtree pull --prefix=vendor/tencentdb https://github.com/Tencent/TencentDB-Agent-Memory.git main --squash
```

## 目录结构

```
ai-memory-system/
├── vendor/
│   ├── mem0/              # mem0 完整代码 (subtree，用于参考)
│   └── tencentdb/         # TencentDB Agent Memory (subtree，核心记忆层)
├── src/
│   └── bridge/            # 桥接代码 (你的核心代码)
│       ├── src/
│       │   ├── mcp-server.ts       # 9 个 MCP 工具实现
│       │   ├── tdai-adapter.ts     # HostAdapter 实现
│       │   └── config.ts           # 配置
│       ├── package.json
│       └── tsconfig.json
├── integration/           # Agent 集成配置
│   ├── claude-code/       # Claude Code 插件配置
│   │   ├── plugin.json
│   │   ├── .mcp.json
│   │   └── hooks.json
│   └── opencode/          # OpenCode 插件配置
│       ├── opencode.json
│       ├── package.json
│       ├── index.ts
│       └── tsconfig.json
└── README.md
```

## 已完成

- [x] 实现 TdaiCore 初始化和调用
- [x] 实现记忆数据格式转换 (通过 TdaiCore 统一处理)
- [x] 配置 Claude Code 集成
- [x] 配置 OpenCode 集成

## 待完成

- [ ] 添加测试
- [ ] 实现 get_memory / update_memory / delete_memory (需要访问 vector store)
- [ ] 部署脚本
- [ ] 优化 LLM 配置 (支持更多 provider)

## License

MIT
