# AI Memory System

将 [mem0](https://github.com/mem0ai/mem0) 的 Agent 集成层与 [TencentDB Agent Memory](https://github.com/Tencent/TencentDB-Agent-Memory) 的 L0-L3 分层记忆核心结合。

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  Agent (Claude Code / Codex / OpenCode)                             │
├─────────────────────────────────────────────────────────────────────┤
│  mem0 集成层 (vendor/mem0/mem0-plugin/)                             │
│  ├── hooks.json          # Claude Code 生命周期钩子                  │
│  ├── scripts/            # 钩子实现脚本                              │
│  ├── skills/             # 16 个斜杠命令                             │
│  └── .opencode-plugin/   # OpenCode TypeScript 插件                  │
├─────────────────────────────────────────────────────────────────────┤
│  MCP 协议 (9 个工具)                                                │
│  add_memory, search_memories, get_memories, get_memory,             │
│  update_memory, delete_memory, delete_all_memories,                 │
│  delete_entities, list_entities                                     │
├─────────────────────────────────────────────────────────────────────┤
│  桥接层 (src/bridge/)                                               │
│  ├── mcp-server.ts       # MCP 工具实现                              │
│  ├── tdai-adapter.ts     # HostAdapter 实现                         │
│  └── config.ts           # 配置                                     │
├─────────────────────────────────────────────────────────────────────┤
│  TencentDB Agent Memory (vendor/tencentdb/)                         │
│  ├── TdaiCore            # 核心门面                                  │
│  ├── L0-L3 管道          # 分层记忆提取                              │
│  ├── Mermaid 压缩        # 符号化短期记忆                            │
│  └── SQLite + sqlite-vec # 本地存储                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 快速开始

```bash
# 1. 安装依赖
cd src/bridge && npm install

# 2. 配置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4o-mini"
export MEMORY_DATA_DIR="~/.memory-tdai"

# 3. 启动 MCP Server
npm run dev
```

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LLM_API_KEY` | LLM API Key | - |
| `LLM_BASE_URL` | LLM 接口地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名称 | `gpt-4o-mini` |
| `MEMORY_DATA_DIR` | 记忆数据目录 | `~/.memory-tdai` |
| `MCP_PORT` | MCP Server 端口 | `8420` |
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
│   ├── mem0/              # mem0 完整代码 (subtree)
│   └── tencentdb/         # TencentDB Agent Memory 完整代码 (subtree)
├── src/
│   └── bridge/            # 桥接代码
│       ├── src/
│       │   ├── mcp-server.ts
│       │   ├── tdai-adapter.ts
│       │   └── config.ts
│       ├── package.json
│       └── tsconfig.json
└── README.md
```

## 待完成

- [ ] 实现 TdaiCore 初始化和调用
- [ ] 实现记忆数据格式转换
- [ ] 添加测试
- [ ] 配置 Claude Code / OpenCode 集成
- [ ] 部署脚本

## License

MIT
