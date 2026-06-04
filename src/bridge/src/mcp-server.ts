/**
 * MCP Server that bridges mem0's agent integration with TencentDB Agent Memory.
 * 
 * Implements the 9 MCP tools expected by mem0's hooks/skills:
 * - add_memory
 * - search_memories
 * - get_memories
 * - get_memory
 * - update_memory
 * - delete_memory
 * - delete_all_memories
 * - delete_entities
 * - list_entities
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import {
  deleteMemoryById,
  findMemoryById,
  findNewestL0RecordForTurn,
  listMemories,
  searchConversationMemories,
} from './mcp-memory-store.js';
import { MemBridgeHostAdapter } from './tdai-adapter.js';

// Import TdaiCore dynamically at runtime
// This avoids TypeScript import issues with the vendor directory
let TdaiCore: any;

const config = loadConfig();

// Create host adapter
const adapter = new MemBridgeHostAdapter({ config });

// Default TDAI config (can be overridden via env)
const tdaiConfig = {
  storeBackend: 'sqlite',
  recall: {
    enabled: true,
    strategy: 'hybrid',
    maxResults: 5,
    maxCharsPerMemory: 0,
    maxTotalRecallChars: 0,
    scoreThreshold: 0.3,
    timeoutMs: 5000,
  },
  extraction: {
    enabled: true,
    maxMemoriesPerSession: 20,
  },
  persona: {
    triggerEveryN: 50,
    maxScenes: 20,
    backupCount: 3,
    sceneBackupCount: 10,
  },
  pipeline: {
    everyNConversations: 5,
    enableWarmup: true,
    l1IdleTimeoutSeconds: 600,
    l2DelayAfterL1Seconds: 90,
    l2MinIntervalSeconds: 900,
    l2MaxIntervalSeconds: 3600,
    sessionActiveWindowHours: 24,
  },
  capture: {
    l0l1RetentionDays: 0,
  },
  llm: {
    enabled: true,
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
    maxTokens: config.llm.maxTokens,
    timeoutMs: config.llm.timeoutMs,
  },
  embedding: {
    enabled: config.embedding.enabled,
    provider: config.embedding.provider,
    baseUrl: config.embedding.baseUrl,
    apiKey: config.embedding.apiKey,
    model: config.embedding.model,
    dimensions: config.embedding.dimensions,
    sendDimensions: config.embedding.sendDimensions,
    conflictRecallTopK: config.embedding.conflictRecallTopK,
    maxInputChars: config.embedding.maxInputChars,
    timeoutMs: config.embedding.timeoutMs,
  },
  bm25: {
    language: 'zh',
  },
  memoryCleanup: {},
  report: {},
  offload: {},
};

// TdaiCore instance (initialized lazily)
let core: any = null;

// Memory store for tracking entities - derived from TdaiCore database queries
// const entities = new Map<string, { type: string; id: string; created: number }>();

// Initialize core
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const tencentdbPath = process.env.TENCENTDB_CORE_PATH || '../../../vendor/tencentdb/src/core/tdai-core.js';
        const tencentdb = await import(tencentdbPath);
        TdaiCore = tencentdb.TdaiCore;
        
        core = new TdaiCore({
          hostAdapter: adapter,
          config: tdaiConfig,
        });
        
        await core.initialize();
        console.error('[Bridge] TdaiCore initialized');
      } catch (err) {
        console.error('[Bridge] Failed to initialize TdaiCore:', err);
        initPromise = null;
        throw err;
      }
    })();
  }
  await initPromise;
}

function wrapHandler<T>(handler: (params: T) => Promise<any>) {
  return async (params: T) => {
    try {
      return await handler(params);
    } catch (error) {
      console.error('[Bridge] MCP tool error:', error);
      return {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        }],
      };
    }
  };
}

const server = new McpServer({
  name: 'memory-bridge',
  version: '0.1.0',
});

server.server.registerCapabilities({
  resources: { listChanged: false },
  prompts: { listChanged: false },
});
server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
server.server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));

// Tool 1: add_memory
server.tool(
  'add_memory',
  'Save text or conversation history for a user/agent',
  {
    text: z.string().describe('The text content to save as a memory'),
    user_id: z.string().optional().describe('User identifier'),
    agent_id: z.string().optional().describe('Agent identifier'),
    metadata: z.record(z.any()).optional().describe('Additional metadata'),
  },
  wrapHandler(async ({ text, user_id, agent_id, metadata }) => {
    await ensureInitialized();
    
    const sessionKey = `${user_id || 'default'}:${agent_id || 'default'}`;
    const sessionId = metadata?.session_id;
    const timestamp = Date.now();
    
    // Call TdaiCore.handleTurnCommitted()
    const result = await core.handleTurnCommitted({
      userText: text,
      assistantText: '',
      messages: [{
        id: `mcp_${timestamp}`,
        role: 'user',
        content: text,
        timestamp,
      }],
      sessionKey,
      sessionId,
      originalUserMessageCount: 0,
      startedAt: timestamp - 1,
    });

    const store = core.getVectorStore();
    const captured = store
      ? await findNewestL0RecordForTurn(store, sessionKey, text, sessionId)
      : null;
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          id: captured?.id,
          layer: captured?.layer || 'l0',
          memory: captured,
          l0_recorded: result.l0RecordedCount,
          scheduler_notified: result.schedulerNotified,
        }),
      }],
    };
  })
);

// Tool 2: search_memories
server.tool(
  'search_memories',
  'Semantic search across memories with filters',
  {
    query: z.string().describe('Search query'),
    user_id: z.string().optional(),
    agent_id: z.string().optional(),
    limit: z.number().optional().default(5),
    filters: z.record(z.any()).optional(),
  },
  wrapHandler(async ({ query, user_id, agent_id, limit, filters }) => {
    await ensureInitialized();
    const store = core.getVectorStore();
    
    // Call TdaiCore.searchMemories()
    const result = await core.searchMemories({
      query,
      limit,
      type: filters?.type,
      scene: filters?.scene,
    });
    const sessionKey = user_id || agent_id ? `${user_id || 'default'}:${agent_id || 'default'}` : undefined;
    const l0Result = store
      ? await searchConversationMemories(store, { query, limit, sessionKey })
      : { results: [], total: 0, strategy: 'none' };
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          results: result.text,
          memories: l0Result.results,
          total: result.total + l0Result.total,
          strategy: l0Result.total > 0 ? `${result.strategy}+l0-${l0Result.strategy}` : result.strategy,
          l1: {
            results: result.text,
            total: result.total,
            strategy: result.strategy,
          },
          l0: l0Result,
        }),
      }],
    };
  })
);

// Tool 3: get_memories
server.tool(
  'get_memories',
  'List memories with filters and pagination',
  {
    user_id: z.string().optional(),
    agent_id: z.string().optional(),
    page: z.number().optional().default(1),
    page_size: z.number().optional().default(20),
  },
  wrapHandler(async ({ user_id, agent_id, page, page_size }) => {
    await ensureInitialized();
    
    const store = core.getVectorStore();
    if (!store) {
      throw new Error('Vector store not available');
    }
    
    const pageResult = await listMemories(store, { page, pageSize: page_size });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(pageResult),
      }],
    };
  })
);

// Tool 4: get_memory
server.tool(
  'get_memory',
  'Retrieve a specific memory by ID',
  {
    memory_id: z.string().describe('Memory ID to retrieve'),
  },
  wrapHandler(async ({ memory_id }) => {
    await ensureInitialized();

    const store = core.getVectorStore();
    if (!store) {
      throw new Error('Vector store not available');
    }

    const record = await findMemoryById(store, memory_id);

    if (!record) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Memory not found: ${memory_id}`,
          }),
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          ...record,
        }),
      }],
    };
  })
);

// Tool 5: update_memory
server.tool(
  'update_memory',
  'Overwrite a memory\'s text by ID',
  {
    memory_id: z.string().describe('Memory ID to update'),
    text: z.string().describe('New text content'),
    metadata: z.record(z.any()).optional(),
  },
  wrapHandler(async ({ memory_id, text, metadata }) => {
    await ensureInitialized();

    const store = core.getVectorStore();
    if (!store) {
      throw new Error('Vector store not available');
    }

    const records = await store.queryL1Records();
    const existing = records.find((r: any) => r.record_id === memory_id);

    if (!existing) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Memory not found: ${memory_id}`,
          }),
        }],
      };
    }

    const now = new Date().toISOString();
    const updatedRecord = {
      id: existing.record_id,
      content: text,
      type: existing.type,
      priority: existing.priority,
      scene_name: existing.scene_name,
      source_message_ids: [],
      metadata: existing.metadata_json ? JSON.parse(existing.metadata_json) : {},
      timestamps: [existing.timestamp_start, existing.timestamp_end].filter(Boolean),
      createdAt: existing.created_time,
      updatedAt: now,
      sessionKey: existing.session_key,
      sessionId: existing.session_id,
    };

    let embedding: Float32Array | undefined;
    const embeddingService = core.getEmbeddingService();
    if (embeddingService) {
      try {
        embedding = await embeddingService.embed(text);
      } catch (err) {
        console.error('[Bridge] Embedding failed, updating without vector:', err);
      }
    }

    const success = await store.upsertL1(updatedRecord, embedding);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success,
          id: memory_id,
          updated_at: now,
        }),
      }],
    };
  })
);

// Tool 6: delete_memory
server.tool(
  'delete_memory',
  'Delete a single memory by ID',
  {
    memory_id: z.string().describe('Memory ID to delete'),
  },
  wrapHandler(async ({ memory_id }) => {
    await ensureInitialized();

    const store = core.getVectorStore();
    if (!store) {
      throw new Error('Vector store not available');
    }

    const result = await deleteMemoryById(store, memory_id);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...result,
        }),
      }],
    };
  })
);

// Tool 7: delete_all_memories
server.tool(
  'delete_all_memories',
  'Bulk delete all memories in scope',
  {
    user_id: z.string().optional(),
    agent_id: z.string().optional(),
  },
  async ({ user_id, agent_id }) => {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'Bulk delete not implemented. Use delete_memory for individual records. TdaiCore does not support deleteAllMemories.',
        }),
      }],
    };
  }
);

// Tool 8: delete_entities
server.tool(
  'delete_entities',
  'Delete a user/agent/app/run entity and its memories',
  {
    entity_type: z.enum(['user', 'agent', 'app', 'run']).describe('Type of entity'),
    entity_id: z.string().describe('Entity ID to delete'),
  },
  wrapHandler(async ({ entity_type, entity_id }) => {
    await ensureInitialized();
    
    const store = core.getVectorStore();
    if (!store) {
      throw new Error('Vector store not available');
    }
    
    const page = await listMemories(store, { page: 1, pageSize: 1000 });
    const toDelete = page.memories.filter((r: any) => 
      r.session_id === entity_id || r.session_key?.startsWith(`${entity_id}:`)
    );
    
    if (toDelete.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Entity not found: ${entity_type}:${entity_id}`,
          }),
        }],
      };
    }
    
    let deleted = 0;
    for (const record of toDelete) {
      const result = await deleteMemoryById(store, record.id);
      if (result.success) {
        deleted++;
      }
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          entity_type,
          entity_id,
          deleted,
        }),
      }],
    };
  })
);

// Tool 9: list_entities
server.tool(
  'list_entities',
  'List users/agents/apps/runs stored in memory',
  {
    entity_type: z.enum(['user', 'agent', 'app', 'run']).optional(),
  },
  wrapHandler(async ({ entity_type }) => {
    await ensureInitialized();
    
    const store = core.getVectorStore();
    if (!store) {
      throw new Error('Vector store not available');
    }
    
    const page = await listMemories(store, { page: 1, pageSize: 1000 });
    const entities = new Map();
    
    for (const record of page.memories) {
      const [userId, agentId] = record.session_key.split(':');
      const recordType = userId ? 'user' : 'agent';
      if (entity_type && recordType !== entity_type) continue;

      const entityId = userId || agentId || record.session_id || 'unknown';
      const key = `${recordType}:${entityId}`;
      if (!entities.has(key)) {
        entities.set(key, {
          type: recordType,
          id: entityId,
          created: record.created_at || Date.now(),
        });
      }
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          entities: Array.from(entities.values()),
          total: entities.size,
        }),
      }],
    };
  })
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Bridge] MCP server started');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('[Bridge] Shutting down...');
  if (core) {
    await core.destroy();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[Bridge] Shutting down...');
  if (core) {
    await core.destroy();
  }
  process.exit(0);
});

main().catch(console.error);
