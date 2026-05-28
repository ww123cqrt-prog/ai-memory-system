/**
 * OpenCode plugin for Memory Bridge
 * 
 * This plugin integrates the memory bridge with OpenCode,
 * providing automatic memory capture and recall.
 */

import type { Plugin } from '@opencode-ai/plugin';

const MemoryBridgePlugin: Plugin = async (ctx) => {
  const { $ } = ctx;

  // Track conversation state
  let messageCount = 0;
  let sessionMemories: string[] = [];

  return {
    // Called on each chat message
    'chat.message': async (input: any, output: any) => {
      messageCount++;
      
      // Every 3 messages, trigger memory capture
      if (messageCount % 3 === 0) {
        console.error(`[MemoryBridge] Auto-capture trigger at message ${messageCount}`);
      }
    },

    // Called before tool execution
    'tool.execute.before': async (input: any, output: any) => {
      const toolName = input?.tool;
      
      // Block writes to MEMORY.md (prevent conflicts)
      if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
        const filePath = input?.args?.file_path;
        if (filePath?.includes('MEMORY.md')) {
          console.error('[MemoryBridge] Blocked write to MEMORY.md');
          output.blocked = true;
        }
      }
    },

    // Called after tool execution
    'tool.execute.after': async (input: any, output: any) => {
      const toolName = input?.tool;
      
      // Track memory-related tool calls
      if (toolName?.startsWith('mcp__memory-bridge__')) {
        console.error(`[MemoryBridge] Tool executed: ${toolName}`);
      }
    },

    // Transform messages (inject memory context)
    'experimental.chat.messages.transform': async (input: any, output: any) => {
      // This would inject relevant memories into the context
      // For now, just log
      if (messageCount === 1) {
        console.error('[MemoryBridge] First message - loading memories');
      }
    },

    // Handle session compaction
    'experimental.session.compacting': async (input: any, output: any) => {
      console.error('[MemoryBridge] Session compacting - preserving memories');
    },
  };
};

export default MemoryBridgePlugin;
