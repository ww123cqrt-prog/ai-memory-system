import { OpenCodeSource } from '../src/sources/opencode-source.js';

async function test() {
  console.log('[test] Testing OpenCode source...');
  const source = new OpenCodeSource();
  
  try {
    const available = await source.isAvailable();
    console.log('[test] Available:', available);
    
    if (available) {
      const since = new Date();
      since.setDate(since.getDate() - 1);
      const sessions = await source.listSessions(since);
      console.log('[test] Sessions found:', sessions.length);
      sessions.slice(0, 5).forEach(s => console.log(' -', s.id, s.title?.substring(0, 50)));
    }
  } catch (error) {
    console.error('[test] Error:', error);
  }
}

test();
