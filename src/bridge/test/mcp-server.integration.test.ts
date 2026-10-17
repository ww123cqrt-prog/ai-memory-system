import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DatabaseSync } from 'node:sqlite';
import { VectorStore } from '../../../vendor/tencentdb/src/core/store/sqlite.js';

test('compiled MCP tools honor paging/scopes, index old imports, and capture new IDs', { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-bridge-protocol-'));
  const path = join(dir, 'vectors.db');
  const store = new VectorStore(path, 0); store.init();
  store.upsertL1({ id: 'editable', content: 'structured memory', type: 'episodic', priority: 50,
    scene_name: 'test', sessionKey: 'owner:separate', sessionId: 'other-run', source_message_ids: [],
    metadata: { kept: 'yes' }, timestamps: ['2026-01-01'], createdAt: '2026-01-01', updatedAt: '2026-01-01' }, undefined);
  store.close();
  const db = new DatabaseSync(path);
  for (let i = 0; i < 60; i++) db.prepare(`INSERT INTO l0_conversations
    (record_id,session_key,session_id,role,message_text,recorded_at,timestamp) VALUES (?,?,?,?,?,?,?)`)
    .run(`seed-${String(i).padStart(3,'0')}`, 'tester:agent', 'run-test', 'user', 'old synthetic note', '2026-01-01', i);
  db.close();
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../dist/mcp-server.js', import.meta.url))], stderr: 'pipe',
    env: { ...process.env, MEMORY_DATA_DIR: dir, EMBEDDING_ENABLED: 'false', MEMORY_REINDEX_ON_INIT: 'false',
      LLM_BASE_URL: 'http://127.0.0.1:1/v1', LLM_API_KEY: 'test-only', LLM_MODEL: 'test-only' } });
  let stderr = ''; transport.stderr?.on('data', b => { stderr += b.toString(); });
  const client = new Client({ name: 'memory-bridge-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, undefined, JSON.stringify(result));
      return JSON.parse((result.content as {text: string}[])[0].text);
    };
    const tools = await client.listTools(); assert.equal(tools.tools.length, 9);
    assert.equal((await call('get_memories', { page: 1, page_size: 1 })).total, 61);
    assert.equal((await call('get_memories', { user_id: 'missing' })).total, 0);
    assert.equal((await call('search_memories', { query: 'synthetic', user_id: 'tester' })).l0.total, 5);
    assert.equal((await call('search_memories', { query: 'synthetic', user_id: 'missing' })).total, 0);
    const added = await call('add_memory', { text: 'new synthetic capture', user_id: 'tester', agent_id: 'agent', metadata: { session_id: 'run-test' } });
    assert.equal(added.success, true); assert.ok(added.id);
    const captured = await call('get_memory', { memory_id: added.id });
    assert.equal(captured.memory?.id ?? captured.id, added.id);
    assert.equal((await call('update_memory', { memory_id: 'editable', text: 'updated structured memory', metadata: { added: 'value' } })).success, true);
    const edited = await call('get_memory', { memory_id: 'editable' });
    assert.deepEqual((edited.memory ?? edited).metadata, { kept: 'yes', added: 'value' });
    const rawUpdate = await call('update_memory', { memory_id: added.id, text: 'unsupported change' });
    assert.equal(rawUpdate.success, false); assert.match(rawUpdate.error, /L0 conversation updates/);
    const agents = await call('list_entities', { entity_type: 'agent' }); assert.ok(agents.entities.some((r: any) => r.id === 'agent'));
    const removed = await call('delete_entities', { entity_type: 'agent', entity_id: 'agent' });
    assert.equal(removed.success, true); assert.equal(removed.deleted, 61);
    assert.equal((await call('get_memories')).total, 1);
  } catch (e) { throw new Error(String(e) + '\n' + stderr.slice(-3000)); }
  finally { await client.close(); await transport.close(); rmSync(dir, { recursive: true, force: true }); }
});
