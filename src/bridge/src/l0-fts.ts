/** Keep direct SQL conversation imports in the same FTS format as the core store. */
import type { DatabaseSync } from 'node:sqlite';
import { tokenizeForFts } from './core-fts.js';

interface L0Row { record_id: string; session_key: string; session_id: string; role: string;
  message_text: string; recorded_at: string; timestamp: number; }

export function indexL0Row(db: DatabaseSync, row: L0Row, replace = true): void {
  if (replace) db.prepare('DELETE FROM l0_fts WHERE record_id=?').run(row.record_id);
  db.prepare(`INSERT INTO l0_fts (message_text,message_text_original,record_id,session_key,session_id,role,recorded_at,timestamp)
    VALUES (?,?,?,?,?,?,?,?)`).run(tokenizeForFts(row.message_text), row.message_text, row.record_id,
      row.session_key, row.session_id, row.role, row.recorded_at, row.timestamp);
}

/** Fill missing index rows without modifying conversation or vector records. */
export function repairL0Fts(db: DatabaseSync): { inserted: number } {
  db.exec('BEGIN IMMEDIATE');
  try {
    const indexed = new Set(db.prepare('SELECT record_id FROM l0_fts').all().map(r => String(r.record_id)));
    let inserted = 0;
    const ids = db.prepare('SELECT record_id FROM l0_conversations').all();
    const query = db.prepare('SELECT * FROM l0_conversations WHERE record_id=?');
    for (const id of ids) if (!indexed.has(String(id.record_id))) {
      indexL0Row(db, query.get(id.record_id) as unknown as L0Row, false);
      inserted++;
    }
    db.exec('COMMIT');
    return { inserted };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
