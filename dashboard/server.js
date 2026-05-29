/**
 * AI Memory System Dashboard - Express Server
 * 
 * Provides REST API endpoints for the web dashboard to visualize
 * memories, scheduler status, daily summaries, and system health.
 * 
 * Uses Node.js built-in node:sqlite (no native dependencies).
 */

import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Configuration ──────────────────────────────────────────────────────────────

const PORT = process.env.DASHBOARD_PORT || 3850;
const MEMORY_DATA_DIR = process.env.MEMORY_DATA_DIR || join(homedir(), '.memory-tdai');
const SCHEDULER_CONFIG = process.env.SCHEDULER_CONFIG || resolve(__dirname, '../config/scheduler.json');
const PROJECT_ROOT = resolve(__dirname, '..');

// ─── Database Connection ────────────────────────────────────────────────────────

let db = null;

function getDb() {
  if (!db) {
    const dbPath = join(MEMORY_DATA_DIR, 'vectors.db');
    if (!existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}`);
    }
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  }
  return db;
}

// ─── Express App ────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Serve static files from dashboard directory
app.use(express.static(__dirname));

// ─── API: Memories ──────────────────────────────────────────────────────────────

/**
 * GET /api/memories
 * List all memories (L0 raw conversations + L1 processed records)
 */
app.get('/api/memories', (req, res) => {
  try {
    const database = getDb();
    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
    const offset = (page - 1) * pageSize;

    // Get L0 raw conversations
    const l0Rows = database.prepare(`
      SELECT record_id, session_key, session_id, role, message_text, recorded_at, timestamp
      FROM l0_conversations
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset);

    // Get L1 processed records
    const l1Rows = database.prepare(`
      SELECT record_id, content, type, priority, scene_name, session_key, 
             session_id, timestamp_str, timestamp_start, timestamp_end, 
             created_time, updated_time, metadata_json
      FROM l1_records
      ORDER BY updated_time DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset);

    // Get total counts
    const l0Count = database.prepare('SELECT COUNT(*) as count FROM l0_conversations').get();
    const l1Count = database.prepare('SELECT COUNT(*) as count FROM l1_records').get();

    res.json({
      l0: {
        memories: l0Rows.map(row => ({
          id: row.record_id,
          sessionKey: row.session_key,
          sessionId: row.session_id,
          role: row.role,
          text: row.message_text,
          recordedAt: row.recorded_at,
          timestamp: row.timestamp,
        })),
        total: l0Count.count,
      },
      l1: {
        memories: l1Rows.map(row => ({
          id: row.record_id,
          content: row.content,
          type: row.type,
          priority: row.priority,
          sceneName: row.scene_name,
          sessionKey: row.session_key,
          sessionId: row.session_id,
          timestampStr: row.timestamp_str,
          timestampStart: row.timestamp_start,
          timestampEnd: row.timestamp_end,
          createdTime: row.created_time,
          updatedTime: row.updated_time,
          metadata: safeJsonParse(row.metadata_json),
        })),
        total: l1Count.count,
      },
      page,
      pageSize,
    });
  } catch (error) {
    console.error('[API] Error fetching memories:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/memories/search
 * Search memories by keyword (full-text search on L0 and L1)
 */
app.get('/api/memories/search', (req, res) => {
  try {
    const database = getDb();
    const query = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    if (!query.trim()) {
      return res.json({ l0: [], l1: [], query: '' });
    }

    // Search L0 conversations
    const l0Rows = database.prepare(`
      SELECT record_id, session_key, session_id, role, message_text, recorded_at, timestamp
      FROM l0_conversations
      WHERE message_text LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(`%${query}%`, limit);

    // Search L1 records
    const l1Rows = database.prepare(`
      SELECT record_id, content, type, priority, scene_name, session_key,
             session_id, timestamp_str, created_time, updated_time, metadata_json
      FROM l1_records
      WHERE content LIKE ? OR scene_name LIKE ? OR type LIKE ?
      ORDER BY updated_time DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);

    res.json({
      query,
      l0: l0Rows.map(row => ({
        id: row.record_id,
        sessionKey: row.session_key,
        sessionId: row.session_id,
        role: row.role,
        text: row.message_text,
        recordedAt: row.recorded_at,
        timestamp: row.timestamp,
      })),
      l1: l1Rows.map(row => ({
        id: row.record_id,
        content: row.content,
        type: row.type,
        priority: row.priority,
        sceneName: row.scene_name,
        sessionKey: row.session_key,
        sessionId: row.session_id,
        timestampStr: row.timestamp_str,
        createdTime: row.created_time,
        updatedTime: row.updated_time,
        metadata: safeJsonParse(row.metadata_json),
      })),
    });
  } catch (error) {
    console.error('[API] Error searching memories:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/memories/:id
 * Delete a memory by ID (from L0 or L1)
 */
app.delete('/api/memories/:id', (req, res) => {
  // Open a separate writable connection for deletes
  let writeDb = null;
  try {
    const dbPath = join(MEMORY_DATA_DIR, 'vectors.db');
    writeDb = new DatabaseSync(dbPath, { open: true });
    const { id } = req.params;
    const { layer } = req.query;

    let deleted = false;

    if (layer === 'l0' || !layer) {
      const stmt = writeDb.prepare('DELETE FROM l0_conversations WHERE record_id = ?');
      const result = stmt.run(id);
      if (result.changes > 0) deleted = true;
    }

    if (layer === 'l1' || !layer) {
      const stmt = writeDb.prepare('DELETE FROM l1_records WHERE record_id = ?');
      const result = stmt.run(id);
      if (result.changes > 0) deleted = true;
    }

    writeDb.close();

    if (deleted) {
      res.json({ success: true, id, message: 'Memory deleted' });
    } else {
      res.status(404).json({ error: 'Memory not found', id });
    }
  } catch (error) {
    if (writeDb) {
      try { writeDb.close(); } catch {}
    }
    console.error('[API] Error deleting memory:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── API: Scheduler ─────────────────────────────────────────────────────────────

/**
 * GET /api/scheduler/tasks
 * List all scheduled tasks from config
 */
app.get('/api/scheduler/tasks', (req, res) => {
  try {
    if (!existsSync(SCHEDULER_CONFIG)) {
      return res.json({ tasks: [], configExists: false });
    }

    const raw = readFileSync(SCHEDULER_CONFIG, 'utf-8');
    const config = JSON.parse(raw);
    const tasks = config.tasks || {};

    const taskList = Object.entries(tasks).map(([name, task]) => ({
      name,
      cron: task.cron,
      enabled: task.enabled,
      description: task.description || '',
      retryOnFail: task.retryOnFail || false,
      maxRetries: task.maxRetries || 0,
    }));

    res.json({
      enabled: config.enabled,
      timezone: config.timezone,
      logLevel: config.logLevel,
      tasks: taskList,
    });
  } catch (error) {
    console.error('[API] Error reading scheduler config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scheduler/trigger/:name
 * Manually trigger a scheduled task
 */
app.post('/api/scheduler/trigger/:name', (req, res) => {
  try {
    const { name } = req.params;
    
    if (!existsSync(SCHEDULER_CONFIG)) {
      return res.status(404).json({ error: 'Scheduler config not found' });
    }

    const raw = readFileSync(SCHEDULER_CONFIG, 'utf-8');
    const config = JSON.parse(raw);
    const task = config.tasks?.[name];

    if (!task) {
      return res.status(404).json({ error: `Task "${name}" not found in config` });
    }

    res.json({
      success: true,
      message: `Task "${name}" trigger request received`,
      note: 'Manual trigger requires the scheduler service to be running',
      task: {
        name,
        cron: task.cron,
        description: task.description,
      },
    });
  } catch (error) {
    console.error('[API] Error triggering task:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── API: Daily Summary ─────────────────────────────────────────────────────────

/**
 * GET /api/summary/today
 * Get today's summary from conversation files
 */
app.get('/api/summary/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const conversationsDir = join(MEMORY_DATA_DIR, 'conversations');
    
    if (!existsSync(conversationsDir)) {
      return res.json({ date: today, summary: null, message: 'No conversations directory' });
    }

    const todayFile = join(conversationsDir, `${today}.jsonl`);
    if (!existsSync(todayFile)) {
      return res.json({ date: today, summary: null, message: 'No conversations recorded today' });
    }

    const conversations = parseJsonl(todayFile);

    const summaryEntry = conversations.find(c => 
      c.role === 'summary' || 
      (c.content && c.content.includes('每日工作总结'))
    );

    res.json({
      date: today,
      conversationCount: conversations.length,
      summary: summaryEntry ? summaryEntry.content : null,
      hasSummary: !!summaryEntry,
    });
  } catch (error) {
    console.error('[API] Error fetching today summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/summary/history
 * Get history of past summaries
 */
app.get('/api/summary/history', (req, res) => {
  try {
    const conversationsDir = join(MEMORY_DATA_DIR, 'conversations');
    
    if (!existsSync(conversationsDir)) {
      return res.json({ summaries: [] });
    }

    const files = readdirSync(conversationsDir)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse()
      .slice(0, 30);

    const summaries = files.map(filename => {
      try {
        const date = filename.replace('.jsonl', '');
        const filePath = join(conversationsDir, filename);
        const conversations = parseJsonl(filePath);

        const summaryEntry = conversations.find(c => 
          c.role === 'summary' || 
          (c.content && c.content.includes('每日工作总结'))
        );

        return {
          date,
          conversationCount: conversations.length,
          hasSummary: !!summaryEntry,
          summaryPreview: summaryEntry 
            ? summaryEntry.content.substring(0, 200) + (summaryEntry.content.length > 200 ? '...' : '')
            : null,
        };
      } catch {
        return { date: filename.replace('.jsonl', ''), error: 'Failed to parse' };
      }
    });

    res.json({ summaries });
  } catch (error) {
    console.error('[API] Error fetching summary history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/summary/:date
 * Get summary for a specific date
 */
app.get('/api/summary/:date', (req, res) => {
  try {
    const { date } = req.params;
    const conversationsDir = join(MEMORY_DATA_DIR, 'conversations');
    const filePath = join(conversationsDir, `${date}.jsonl`);
    
    if (!existsSync(filePath)) {
      return res.json({ date, summary: null, message: 'No conversations for this date' });
    }

    const conversations = parseJsonl(filePath);

    const summaryEntry = conversations.find(c => 
      c.role === 'summary' || 
      (c.content && c.content.includes('每日工作总结'))
    );

    res.json({
      date,
      conversationCount: conversations.length,
      summary: summaryEntry ? summaryEntry.content : null,
      hasSummary: !!summaryEntry,
    });
  } catch (error) {
    console.error('[API] Error fetching summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── API: System Status ─────────────────────────────────────────────────────────

/**
 * GET /api/system/status
 * Get system health status
 */
app.get('/api/system/status', (req, res) => {
  try {
    const database = getDb();
    
    // Check database
    const l0Count = database.prepare('SELECT COUNT(*) as count FROM l0_conversations').get();
    const l1Count = database.prepare('SELECT COUNT(*) as count FROM l1_records').get();
    
    // Get database file size
    const dbPath = join(MEMORY_DATA_DIR, 'vectors.db');
    let dbSize = 0;
    if (existsSync(dbPath)) {
      const stats = statSync(dbPath);
      dbSize = stats.size;
    }

    // Check embedding configuration
    let embeddingInfo = null;
    try {
      const meta = database.prepare("SELECT value FROM embedding_meta WHERE key = 'embedding_provider_info'").get();
      if (meta) {
        embeddingInfo = JSON.parse(meta.value);
      }
    } catch {
      // Ignore
    }

    // Check LLM configuration (from environment)
    const llmConfig = {
      baseUrl: process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1',
      model: process.env.LLM_MODEL || 'mimo-v2.5-pro',
      hasApiKey: !!process.env.LLM_API_KEY,
    };
    const llmStatus = llmConfig.hasApiKey ? 'configured' : 'no_api_key';

    // Check scheduler config
    let schedulerStatus = 'unknown';
    if (existsSync(SCHEDULER_CONFIG)) {
      try {
        const raw = readFileSync(SCHEDULER_CONFIG, 'utf-8');
        const config = JSON.parse(raw);
        schedulerStatus = config.enabled ? 'enabled' : 'disabled';
      } catch {
        schedulerStatus = 'error';
      }
    }

    res.json({
      database: {
        path: dbPath,
        size: dbSize,
        sizeFormatted: formatBytes(dbSize),
        l0Count: l0Count.count,
        l1Count: l1Count.count,
      },
      embedding: embeddingInfo ? {
        provider: embeddingInfo.provider,
        model: embeddingInfo.model,
        dimensions: embeddingInfo.dimensions,
        status: 'configured',
      } : {
        status: 'not_configured',
      },
      llm: {
        status: llmStatus,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        hasApiKey: llmConfig.hasApiKey,
      },
      scheduler: {
        status: schedulerStatus,
        configPath: SCHEDULER_CONFIG,
      },
      dataDir: MEMORY_DATA_DIR,
    });
  } catch (error) {
    console.error('[API] Error fetching system status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Utility Functions ──────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str || '{}');
  } catch {
    return {};
  }
}

function parseJsonl(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  return raw.trim().split('\n').filter(Boolean).map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ─── Start Server ───────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   AI Memory System Dashboard                                 │
│                                                              │
│   Server:    http://localhost:${String(PORT).padEnd(39)}│
│   Data Dir:  ${MEMORY_DATA_DIR.padEnd(46)}│
│   Scheduler: ${SCHEDULER_CONFIG.padEnd(46)}│
│                                                              │
└──────────────────────────────────────────────────────────────┘
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  if (db) {
    try { db.close(); } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (db) {
    try { db.close(); } catch {}
  }
  process.exit(0);
});
