/**
 * AI Memory System Dashboard - Frontend Application
 * 
 * Vanilla JS application for visualizing the AI memory system.
 * Uses fetch API for all backend communication.
 */

// ─── State ──────────────────────────────────────────────────────────────────────

const state = {
  memories: {
    layer: 'l0',
    page: 1,
    pageSize: 50,
    searchQuery: '',
    data: null,
  },
  scheduler: {
    data: null,
  },
  summary: {
    today: null,
    history: null,
  },
  system: {
    data: null,
  },
  selectedMemory: null,
};

// ─── API Client ─────────────────────────────────────────────────────────────────

const api = {
  async fetch(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Is the dashboard running?');
      }
      throw error;
    }
  },

  // Memories
  async getMemories(page = 1, pageSize = 50) {
    return this.fetch(`/api/memories?page=${page}&pageSize=${pageSize}`);
  },

  async searchMemories(query, limit = 20) {
    return this.fetch(`/api/memories/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  },

  async deleteMemory(id, layer) {
    return this.fetch(`/api/memories/${id}?layer=${layer}`, { method: 'DELETE' });
  },

  // Scheduler
  async getSchedulerTasks() {
    return this.fetch('/api/scheduler/tasks');
  },

  async triggerTask(name) {
    return this.fetch(`/api/scheduler/trigger/${name}`, { method: 'POST' });
  },

  // Summary
  async getTodaySummary() {
    return this.fetch('/api/summary/today');
  },

  async getSummaryHistory() {
    return this.fetch('/api/summary/history');
  },

  async getSummaryByDate(date) {
    return this.fetch(`/api/summary/${date}`);
  },

  // System
  async getSystemStatus() {
    return this.fetch('/api/system/status');
  },
};

// ─── DOM Helpers ────────────────────────────────────────────────────────────────

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function show(el) {
  if (typeof el === 'string') el = $(el);
  el?.classList.remove('hidden');
}

function hide(el) {
  if (typeof el === 'string') el = $(el);
  el?.classList.add('hidden');
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatTimestamp(ts) {
  if (!ts) return '--';
  try {
    const date = new Date(ts);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

function truncate(text, maxLen = 150) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Toast Notifications ────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3000) {
  const container = $('#toast-container');
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Memories Panel ─────────────────────────────────────────────────────────────

async function loadMemories() {
  const loadingEl = $('#memories-loading');
  const emptyEl = $('#memories-empty');
  const errorEl = $('#memories-error');
  const listEl = $('#memory-list');

  show(loadingEl);
  hide(emptyEl);
  hide(errorEl);
  hide(listEl);

  try {
    let data;
    if (state.memories.searchQuery) {
      data = await api.searchMemories(state.memories.searchQuery);
      // Transform search results to match expected format
      const memories = state.memories.layer === 'l0' ? data.l0 : data.l1;
      renderMemoryList(memories, state.memories.layer);
    } else {
      data = await api.getMemories(state.memories.page, state.memories.pageSize);
      const memories = state.memories.layer === 'l0' ? data.l0.memories : data.l1.memories;
      const total = state.memories.layer === 'l0' ? data.l0.total : data.l1.total;
      renderMemoryList(memories, state.memories.layer);
      updatePagination(total);
    }

    state.memories.data = data;
    hide(loadingEl);
    show(listEl);

    // Update count badge
    const count = state.memories.layer === 'l0' 
      ? (data.l0?.total || data.l0?.memories?.length || 0)
      : (data.l1?.total || data.l1?.memories?.length || 0);
    $('#memory-count').textContent = count;
  } catch (error) {
    hide(loadingEl);
    show(errorEl);
    $('#memories-error-text').textContent = error.message;
    showToast('Failed to load memories', 'error');
  }
}

function renderMemoryList(memories, layer) {
  const listEl = $('#memory-list');

  if (!memories || memories.length === 0) {
    hide(listEl);
    show('#memories-empty');
    return;
  }

  listEl.innerHTML = memories.map(memory => {
    if (layer === 'l0') {
      return renderL0Memory(memory);
    } else {
      return renderL1Memory(memory);
    }
  }).join('');

  // Add click handlers
  listEl.querySelectorAll('.memory-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const layer = item.dataset.layer;
      showMemoryDetail(id, layer);
    });
  });
}

function renderL0Memory(memory) {
  const roleClass = memory.role || 'system';
  return `
    <div class="memory-item" data-id="${escapeHtml(memory.id)}" data-layer="l0">
      <div class="memory-item-header">
        <div class="memory-item-meta">
          <span class="memory-item-role ${roleClass}">${escapeHtml(memory.role)}</span>
          <span class="memory-item-id">${escapeHtml(truncate(memory.id, 30))}</span>
        </div>
      </div>
      <div class="memory-item-text">${escapeHtml(truncate(memory.text))}</div>
      <div class="memory-item-time">${formatTimestamp(memory.recordedAt)}</div>
    </div>
  `;
}

function renderL1Memory(memory) {
  const typeClass = memory.type || '';
  return `
    <div class="memory-item" data-id="${escapeHtml(memory.id)}" data-layer="l1">
      <div class="memory-item-header">
        <div class="memory-item-meta">
          ${memory.type ? `<span class="memory-item-type ${typeClass}">${escapeHtml(memory.type)}</span>` : ''}
          ${memory.sceneName ? `<span class="memory-item-scene">${escapeHtml(memory.sceneName)}</span>` : ''}
          <span class="memory-item-id">${escapeHtml(truncate(memory.id, 30))}</span>
        </div>
      </div>
      <div class="memory-item-text">${escapeHtml(truncate(memory.content))}</div>
      <div class="memory-item-time">${formatTimestamp(memory.updatedTime)}</div>
    </div>
  `;
}

function updatePagination(total) {
  const pageInfo = $('#page-info');
  const prevBtn = $('#btn-prev-page');
  const nextBtn = $('#btn-next-page');

  pageInfo.textContent = `Page ${state.memories.page}`;
  prevBtn.disabled = state.memories.page <= 1;
  nextBtn.disabled = total <= state.memories.page * state.memories.pageSize;
}

function showMemoryDetail(id, layer) {
  const memories = layer === 'l0' 
    ? (state.memories.data?.l0?.memories || [])
    : (state.memories.data?.l1?.memories || []);
  
  const memory = memories.find(m => m.id === id);
  if (!memory) return;

  state.selectedMemory = { ...memory, layer };

  const modalBody = $('#modal-body');
  
  if (layer === 'l0') {
    modalBody.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">ID</span>
        <span class="detail-value">${escapeHtml(memory.id)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Role</span>
        <span class="detail-value">${escapeHtml(memory.role)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Session Key</span>
        <span class="detail-value">${escapeHtml(memory.sessionKey)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Session ID</span>
        <span class="detail-value">${escapeHtml(memory.sessionId || '--')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Recorded At</span>
        <span class="detail-value">${formatTimestamp(memory.recordedAt)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Content</span>
      </div>
      <pre>${escapeHtml(memory.text)}</pre>
    `;
  } else {
    modalBody.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">ID</span>
        <span class="detail-value">${escapeHtml(memory.id)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Type</span>
        <span class="detail-value">${escapeHtml(memory.type || '--')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Priority</span>
        <span class="detail-value">${memory.priority ?? '--'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Scene</span>
        <span class="detail-value">${escapeHtml(memory.sceneName || '--')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Session Key</span>
        <span class="detail-value">${escapeHtml(memory.sessionKey)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Created</span>
        <span class="detail-value">${formatTimestamp(memory.createdTime)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Updated</span>
        <span class="detail-value">${formatTimestamp(memory.updatedTime)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Content</span>
      </div>
      <pre>${escapeHtml(memory.content)}</pre>
      ${memory.metadata && Object.keys(memory.metadata).length > 0 ? `
        <div class="detail-row">
          <span class="detail-label">Metadata</span>
        </div>
        <pre>${escapeHtml(JSON.stringify(memory.metadata, null, 2))}</pre>
      ` : ''}
    `;
  }

  show('#memory-modal');
}

async function deleteSelectedMemory() {
  if (!state.selectedMemory) return;

  const { id, layer } = state.selectedMemory;
  
  if (!confirm(`Are you sure you want to delete this memory?\n\nID: ${id}`)) {
    return;
  }

  try {
    await api.deleteMemory(id, layer);
    showToast('Memory deleted successfully', 'success');
    hide('#memory-modal');
    state.selectedMemory = null;
    loadMemories();
  } catch (error) {
    showToast(`Failed to delete memory: ${error.message}`, 'error');
  }
}

// ─── Scheduler Panel ────────────────────────────────────────────────────────────

async function loadScheduler() {
  const loadingEl = $('#scheduler-loading');
  const errorEl = $('#scheduler-error');
  const listEl = $('#task-list');

  show(loadingEl);
  hide(errorEl);
  hide(listEl);

  try {
    const data = await api.getSchedulerTasks();
    state.scheduler.data = data;

    $('#scheduler-status-badge').textContent = data.enabled ? 'Active' : 'Disabled';
    $('#scheduler-status-badge').style.backgroundColor = data.enabled 
      ? 'rgba(78, 201, 176, 0.2)' 
      : 'rgba(241, 76, 76, 0.2)';
    $('#scheduler-status-badge').style.color = data.enabled 
      ? 'var(--accent-green)' 
      : 'var(--accent-red)';

    renderTaskList(data.tasks);
    hide(loadingEl);
    show(listEl);
  } catch (error) {
    hide(loadingEl);
    show(errorEl);
    $('#scheduler-error-text').textContent = error.message;
  }
}

function renderTaskList(tasks) {
  const listEl = $('#task-list');

  if (!tasks || tasks.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><span>No tasks configured</span></div>';
    show(listEl);
    return;
  }

  listEl.innerHTML = tasks.map(task => `
    <div class="task-item">
      <div class="task-info">
        <div class="task-name">${escapeHtml(task.name)}</div>
        <div class="task-description">${escapeHtml(task.description || 'No description')}</div>
        <div class="task-meta">
          <span class="task-cron">${escapeHtml(task.cron)}</span>
          <span>Retry: ${task.retryOnFail ? `${task.maxRetries}x` : 'No'}</span>
        </div>
      </div>
      <div class="task-status">
        <span class="task-enabled ${task.enabled ? 'active' : 'inactive'}">
          ${task.enabled ? 'Enabled' : 'Disabled'}
        </span>
        <button class="btn btn-sm btn-trigger" data-task="${escapeHtml(task.name)}" title="Trigger task">
          ▶ Run
        </button>
      </div>
    </div>
  `).join('');

  // Add trigger handlers
  listEl.querySelectorAll('.btn-trigger').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskName = btn.dataset.task;
      await triggerTask(taskName, btn);
    });
  });
}

async function triggerTask(name, btn) {
  btn.disabled = true;
  btn.textContent = '⏳ Running...';

  try {
    const result = await api.triggerTask(name);
    showToast(`Task "${name}" triggered: ${result.message}`, 'success');
  } catch (error) {
    showToast(`Failed to trigger task: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Run';
  }
}

// ─── Summary Panel ──────────────────────────────────────────────────────────────

async function loadSummary() {
  const loadingEl = $('#summary-loading');
  const emptyEl = $('#summary-empty');
  const errorEl = $('#summary-error');
  const contentEl = $('#summary-content');
  const historyEl = $('#summary-history');

  show(loadingEl);
  hide(emptyEl);
  hide(errorEl);
  hide(contentEl);
  hide(historyEl);

  try {
    // Load today's summary and history in parallel
    const [todayData, historyData] = await Promise.all([
      api.getTodaySummary(),
      api.getSummaryHistory(),
    ]);

    state.summary.today = todayData;
    state.summary.history = historyData;

    hide(loadingEl);

    // Render today's summary
    if (todayData.hasSummary && todayData.summary) {
      contentEl.textContent = todayData.summary;
      show(contentEl);
    } else {
      show(emptyEl);
    }

    // Render history
    if (historyData.summaries && historyData.summaries.length > 0) {
      renderSummaryHistory(historyData.summaries);
      show(historyEl);
    }
  } catch (error) {
    hide(loadingEl);
    show(errorEl);
    $('#summary-error-text').textContent = error.message;
  }
}

function renderSummaryHistory(summaries) {
  const listEl = $('#history-list');
  
  listEl.innerHTML = summaries.map(item => `
    <div class="history-item" data-date="${escapeHtml(item.date)}">
      <div>
        <div class="history-date">${escapeHtml(item.date)}</div>
        <div class="history-meta">${item.conversationCount || 0} conversations</div>
      </div>
      <span class="history-badge ${item.hasSummary ? 'has-summary' : 'no-summary'}">
        ${item.hasSummary ? '✓ Summary' : 'No summary'}
      </span>
    </div>
  `).join('');

  // Add click handlers
  listEl.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async () => {
      const date = item.dataset.date;
      try {
        const data = await api.getSummaryByDate(date);
        if (data.summary) {
          const contentEl = $('#summary-content');
          contentEl.textContent = data.summary;
          show(contentEl);
          hide('#summary-empty');
        } else {
          showToast(`No summary for ${date}`, 'info');
        }
      } catch (error) {
        showToast(`Failed to load summary: ${error.message}`, 'error');
      }
    });
  });
}

// ─── System Status Panel ────────────────────────────────────────────────────────

async function loadSystemStatus() {
  const loadingEl = $('#status-loading');
  const errorEl = $('#status-error');
  const gridEl = $('#status-grid');

  show(loadingEl);
  hide(errorEl);
  hide(gridEl);

  try {
    const data = await api.getSystemStatus();
    state.system.data = data;

    hide(loadingEl);
    show(gridEl);

    renderSystemStatus(data);
    updateHeaderStatus(data);
  } catch (error) {
    hide(loadingEl);
    show(errorEl);
    $('#status-error-text').textContent = error.message;
    updateHeaderStatus(null, error);
  }
}

function renderSystemStatus(data) {
  // Database
  $('#db-size').textContent = data.database.sizeFormatted;
  $('#db-l0-count').textContent = data.database.l0Count.toLocaleString();
  $('#db-l1-count').textContent = data.database.l1Count.toLocaleString();

  // LLM
  const llmDot = $('#llm-status-dot');
  $('#llm-status').textContent = data.llm.status;
  $('#llm-model').textContent = data.llm.model || '--';
  $('#llm-apikey').textContent = data.llm.hasApiKey ? '✓ Configured' : '✗ Missing';
  llmDot.className = 'status-dot ' + (data.llm.status === 'configured' ? 'ok' : 'error');

  // Embedding
  const embeddingDot = $('#embedding-status-dot');
  $('#embedding-status').textContent = data.embedding.status;
  $('#embedding-model').textContent = data.embedding.model || '--';
  $('#embedding-dimensions').textContent = data.embedding.dimensions || '--';
  embeddingDot.className = 'status-dot ' + (data.embedding.status === 'configured' ? 'ok' : 'warn');

  // Scheduler
  const schedulerDot = $('#scheduler-status-dot');
  $('#scheduler-status').textContent = data.scheduler.status;
  $('#scheduler-config').textContent = data.scheduler.configPath ? '✓ Found' : '✗ Missing';
  schedulerDot.className = 'status-dot ' + (data.scheduler.status === 'enabled' ? 'ok' : 'warn');
}

function updateHeaderStatus(data, error = null) {
  const dot = $('#system-status-dot');
  const text = $('#system-status-text');

  if (error) {
    dot.className = 'status-indicator error';
    text.textContent = 'Error';
    return;
  }

  if (!data) {
    dot.className = 'status-indicator';
    text.textContent = 'Connecting...';
    return;
  }

  const allOk = data.llm.status === 'configured' && 
                data.scheduler.status === 'enabled';

  if (allOk) {
    dot.className = 'status-indicator connected';
    text.textContent = 'All systems operational';
  } else {
    dot.className = 'status-indicator';
    text.textContent = 'Partial system status';
  }
}

// ─── Event Handlers ─────────────────────────────────────────────────────────────

function setupEventHandlers() {
  // Tab switching
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.memories.layer = tab.dataset.layer;
      state.memories.page = 1;
      loadMemories();
    });
  });

  // Memory search
  let searchTimeout;
  $('#memory-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    searchTimeout = setTimeout(() => {
      state.memories.searchQuery = query;
      state.memories.page = 1;
      loadMemories();
    }, 300);
  });

  // Pagination
  $('#btn-prev-page').addEventListener('click', () => {
    if (state.memories.page > 1) {
      state.memories.page--;
      loadMemories();
    }
  });

  $('#btn-next-page').addEventListener('click', () => {
    state.memories.page++;
    loadMemories();
  });

  // Refresh button
  $('#btn-refresh').addEventListener('click', () => {
    loadAll();
    showToast('Refreshing all data...', 'info');
  });

  // Today summary button
  $('#btn-today-summary').addEventListener('click', () => {
    loadSummary();
  });

  // Modal
  $('#modal-close').addEventListener('click', () => {
    hide('#memory-modal');
    state.selectedMemory = null;
  });

  $('#modal-cancel').addEventListener('click', () => {
    hide('#memory-modal');
    state.selectedMemory = null;
  });

  $('#modal-delete').addEventListener('click', deleteSelectedMemory);

  // Close modal on overlay click
  $('#memory-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      hide('#memory-modal');
      state.selectedMemory = null;
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hide('#memory-modal');
      state.selectedMemory = null;
    }
  });
}

// ─── Load All ───────────────────────────────────────────────────────────────────

async function loadAll() {
  await Promise.allSettled([
    loadMemories(),
    loadScheduler(),
    loadSummary(),
    loadSystemStatus(),
  ]);
}

// ─── Initialize ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupEventHandlers();
  loadAll();

  // Auto-refresh every 60 seconds
  setInterval(loadAll, 60000);
});
