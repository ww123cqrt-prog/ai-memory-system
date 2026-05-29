#!/bin/bash
# AI Memory System - Scheduler Cron Wrapper
# Runs the daily summary task via node-cron

# Load from local env file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env.local" ]; then
  source "$SCRIPT_DIR/../.env.local"
else
  echo "Error: .env.local not found. Copy .env.local.example to .env.local and add your API key."
  exit 1
fi
export LLM_BASE_URL="https://token-plan-sgp.xiaomimimo.com/v1"
export LLM_MODEL="mimo-v2.5-pro"
export EMBEDDING_BASE_URL="http://localhost:1234/v1"
export EMBEDDING_MODEL="text-embedding-qwen3-embedding-8b"
export EMBEDDING_DIMENSIONS="4096"
export EMBEDDING_API_KEY="lm-studio"

cd /Users/cq/WorkingProjects/ai-memory-system
./src/scheduler/node_modules/.bin/tsx scripts/start-scheduler.ts >> /Users/cq/.memory-tdai/scheduler.log 2>&1
