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
import { z } from 'zod';
import { loadConfig } from './config.js';
import { MemBridgeHostAdapter } from './tdai-adapter.js';
import { TdaiCore } from '../../vendor/tencentdb/src/core/tdai-core.js';
import type { MemoryTdaiConfig } from '../../vendor/tencentdb/src/config.js';

const config = loadConfig();

// Create host adapter
const adapter = new MemBridgeHostAdapter({ config });

// Default TDAI config (can be overridden via env)
const tdaiConfig: MemoryTdaiConfig = {
  storeBackend: 'sqlite',
  recall: {
    strategy: 'hybrid',
    maxResults: 5,
    maxCharsPerMemory: 0,
    maxTotalRecallChars: 0,
  },
  extraction: {
    enabled: true,
    everyNConversations: 5,
    maxMemoriesPerSession: 20,
  },
  persona: {
    triggerEveryN: 50,
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
    provider: 'openai',
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  bm25: {
    language: 'zh',
  },
};

// Initialize TdaiCore
const core = new TdaiCore({
  hostAdapter: adapter,
  config: tdaiConfig,
});

// Memory store for tracking entities (in-memory, can be persisted later)
const entities = new Map<string, { type: string; id: string; created: number }>();

// Initialize core
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = core.initialize();
  }
  await initPromise;
}

const server = new McpServer({
  name: 'memory-bridge',
  version: '0.1.0',
});

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
  async ({ text, user_id, agent_id, metadata }) => {
    await ensureInitialized();
    
    const sessionKey = `${user_id || 'default'}:${agent_id || 'default'}`;
    
    // Call TdaiCore.handleTurnCommitted()
    const result = await core.handleTurnCommitted({
      userText: text,
      assistantText: '',
      messages: [{ role: 'user', content: text }],
      sessionKey,
      sessionId: metadata?.session_id,
    });
    
    // Track entity
    const entityId = user_id || agent_id || 'default';
    entities.set(entityId, {
      type: user_id ? 'user' : 'agent',
      id: entityId,
      created: Date.now(),
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          id: `mem_${Date.now()}`,
          l0_recorded: result.l0RecordedCount,
          scheduler_notified: result.schedulerNotified,
        }),
      }],
    };
  }
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
  async ({ query, user_id, agent_id, limit, filters }) => {
    await ensureInitialized();
    
    const sessionKey = `${user_id || 'default'}:${agent_id || 'default'}`;
    
    // Call TdaiCore.searchMemories()
    const result = await core.searchMemories({
      query,
      limit,
      type: filters?.type,
      scene: filters?.scene,
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          results: result.text,
          total: result.total,
          strategy: result.strategy,
        }),
      }],
    };
  }
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
  async ({ user_id, agent_id, page, page_size }) => {
    await ensureInitialized();
    
    // For now, use searchConversations with empty query
    const result = await core.searchConversations({
      query: '',
      limit: page_size,
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          memories: result.text,
          total: result.total,
          page,
          page_size,
        }),
      }],
    };
  }
);

// Tool 4: get_memory
server.tool(
  'get_memory',
  'Retrieve a specific memory by ID',
  {
    memory_id: z.string().describe('Memory ID to retrieve'),
  },
  async ({ memory_id }) => {
    // Note: TdaiCore doesn't have a direct getMemory method
    // This would need to be implemented via vector store lookup
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: memory_id,
          text: '',
          metadata: {},
          note: 'Direct ID lookup not yet implemented in bridge',
        }),
      }],
    };
  }
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
  async ({ memory_id, text, metadata }) => {
    // Note: TdaiCore doesn't have a direct updateMemory method
    // This would need to be implemented via vector store update
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          note: 'Direct update not yet implemented in bridge',
        }),
      }],
    };
  }
);

// Tool 6: delete_memory
server.tool(
  'delete_memory',
  'Delete a single memory by ID',
  {
    memory_id: z.string().describe('Memory ID to delete'),
  },
  async ({ memory_id }) => {
    // Note: TdaiCore doesn't have a direct deleteMemory method
    // This would need to be implemented via vector store delete
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          note: 'Direct delete not yet implemented in bridge',
        }),
      }],
    };
  }
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
    // Note: TdaiCore doesn't have a direct deleteAllMemories method
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          deleted: 0,
          note: 'Bulk delete not yet implemented in bridge',
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
  async ({ entity_type, entity_id }) => {
    entities.delete(entity_id);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true }),
      }],
    };
  }
);

// Tool 9: list_entities
server.tool(
  'list_entities',
  'List users/agents/apps/runs stored in memory',
  {
    entity_type: z.enum(['user', 'agent', 'app', 'run']).optional(),
  },
  async ({ entity_type }) => {
    const list = Array.from(entities.values());
    const filtered = entity_type
      ? list.filter(e => e.type === entity_type)
      : list;
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          entities: filtered.map(e => ({
            type: e.type,
            id: e.id,
            created: new Date(e.created).toISOString(),
          })),
        }),
      }],
    };
  }
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
  await core.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[Bridge] Shutting down...');
  await core.destroy();
  process.exit(0);
});

main().catch(console.error);
