import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityMatches, listEntities } from '../src/memory-entities.js';
const rows = [
  { id: '1', layer: 'l0' as const, session_key: 'alice:bob', session_id: 'run-1', created_at: '2026-01-01' },
  { id: '2', layer: 'l1' as const, session_key: 'bob:alice', session_id: 'alice', created_at: '2026-02-01' },
];
test('entity type constrains matching instead of conflating users, agents and runs', () => {
  assert.deepEqual(rows.filter(r => entityMatches(r, 'user', 'alice')).map(r => r.id), ['1']);
  assert.deepEqual(rows.filter(r => entityMatches(r, 'agent', 'alice')).map(r => r.id), ['2']);
  assert.deepEqual(rows.filter(r => entityMatches(r, 'run', 'alice')).map(r => r.id), ['2']);
  assert.equal(rows.some(r => entityMatches(r, 'app', 'alice')), false);
});
test('entity listing includes agents and runs with the earliest creation date', () => {
  assert.equal(listEntities(rows).length, 6);
  assert.deepEqual(listEntities(rows, 'user').map(r => r.id), ['alice', 'bob']);
  assert.deepEqual(listEntities(rows, 'app'), []);
});
