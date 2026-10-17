import type { EntityRecord } from './mcp-sqlite-reader.js';
export type EntityType = 'user' | 'agent' | 'app' | 'run';
function identity(row: EntityRecord, type: EntityType): string {
  const split = row.session_key.indexOf(':');
  if (type === 'run') return row.session_id || '';
  if (type === 'user') return split < 0 ? row.session_key : row.session_key.slice(0, split);
  if (type === 'agent') return split < 0 ? '' : row.session_key.slice(split + 1);
  return '';
}
export function entityMatches(row: EntityRecord, type: EntityType, id: string): boolean {
  return type !== 'app' && identity(row, type) === id;
}
export function listEntities(rows: EntityRecord[], type?: EntityType) {
  const result = new Map<string, { type: EntityType; id: string; created: string }>();
  for (const row of rows) for (const kind of type ? [type] : ['user', 'agent', 'run'] as EntityType[]) {
    const id = identity(row, kind); if (!id) continue;
    const key = `${kind}:${id}`;
    const old = result.get(key);
    if (!old || (row.created_at && (!old.created || row.created_at < old.created))) {
      result.set(key, { type: kind, id, created: row.created_at });
    }
  }
  return [...result.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}
