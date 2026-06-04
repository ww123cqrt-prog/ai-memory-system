import assert from 'node:assert/strict';
import {
  deleteMemoryById,
  findMemoryById,
  findNewestL0RecordForTurn,
  listMemories,
  searchConversationMemories,
} from '../src/mcp-memory-store.js';

const l0Rows = [
  {
    record_id: 'l0_user:agent_100_0_aaaaaa',
    session_key: 'user:agent',
    session_id: 'session-1',
    role: 'user',
    message_text: 'older note',
    recorded_at: '2026-06-04T00:00:00.000Z',
    timestamp: 100,
  },
  {
    record_id: 'l0_user:agent_200_0_bbbbbb',
    session_key: 'user:agent',
    session_id: 'session-1',
    role: 'user',
    message_text: 'remember this exact note',
    recorded_at: '2026-06-04T00:00:02.000Z',
    timestamp: 200,
  },
];

function createStore() {
  const deleted: string[] = [];

  return {
    deleted,
    queryL1Records: () => [],
    queryL0ForL1: () => [...l0Rows],
    queryL0RecordsCursor: (afterId: string, pageSize: number) => {
      const rows = l0Rows.filter((row) => row.record_id > afterId).slice(0, pageSize);
      return rows;
    },
    deleteL0: (recordId: string) => {
      deleted.push(recordId);
      return true;
    },
    deleteL1: () => false,
    searchL0Fts: () => [
      {
        record_id: 'l0_user:agent_200_0_bbbbbb',
        session_key: 'user:agent',
        session_id: 'session-1',
        role: 'user',
        message_text: 'remember this exact note',
        score: 0.9,
        recorded_at: '2026-06-04T00:00:02.000Z',
        timestamp: 200,
      },
    ],
    isFtsAvailable: () => true,
  };
}

{
  const store = createStore();
  const captured = await findNewestL0RecordForTurn(
    store,
    'user:agent',
    'remember this exact note',
    'session-1',
  );

  assert.equal(captured?.id, 'l0_user:agent_200_0_bbbbbb');
  assert.equal(captured?.layer, 'l0');
  assert.equal(captured?.content, 'remember this exact note');
}

{
  const store = createStore();
  const page = await listMemories(store, { page: 1, pageSize: 10 });

  assert.equal(page.total, 2);
  assert.equal(page.l0.total, 2);
  assert.equal(page.l1.total, 0);
  assert.deepEqual(page.memories.map((memory) => memory.id), [
    'l0_user:agent_200_0_bbbbbb',
    'l0_user:agent_100_0_aaaaaa',
  ]);
}

{
  const store = createStore();
  const memory = await findMemoryById(store, 'l0_user:agent_200_0_bbbbbb');

  assert.equal(memory?.id, 'l0_user:agent_200_0_bbbbbb');
  assert.equal(memory?.content, 'remember this exact note');
}

{
  const store = createStore();
  const result = await deleteMemoryById(store, 'l0_user:agent_200_0_bbbbbb');

  assert.equal(result.success, true);
  assert.equal(result.layer, 'l0');
  assert.deepEqual(store.deleted, ['l0_user:agent_200_0_bbbbbb']);
}

{
  const store = createStore();
  const result = await deleteMemoryById(store, 'l0_missing');

  assert.equal(result.success, false);
  assert.equal(result.layer, 'l0');
  assert.deepEqual(store.deleted, []);
}

{
  const store = createStore();
  const result = await searchConversationMemories(store, {
    query: 'exact note',
    limit: 5,
    sessionKey: 'user:agent',
  });

  assert.equal(result.total, 1);
  assert.equal(result.results[0].id, 'l0_user:agent_200_0_bbbbbb');
  assert.equal(result.results[0].content, 'remember this exact note');
  assert.equal(result.strategy, 'fts');
}
