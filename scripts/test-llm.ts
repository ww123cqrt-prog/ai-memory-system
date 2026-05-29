/**
 * Test LLM connectivity
 */

import { callLLM } from '../tasks/llm-client.js';

async function test() {
  console.log('Testing LLM connectivity...');
  console.log('LLM_BASE_URL:', process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1');
  console.log('LLM_MODEL:', process.env.LLM_MODEL || 'mimo-v2.5-pro');
  console.log('LLM_API_KEY:', process.env.LLM_API_KEY ? '***' : 'NOT SET');
  
  try {
    const result = await callLLM('Say "Hello, I am working!" in one sentence.', {
      maxTokens: 50,
      maxRetries: 1,
    });
    console.log('\nLLM response:', result);
    console.log('\n✅ LLM test passed');
  } catch (error) {
    console.error('\n❌ LLM test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

test();
