#!/bin/bash
# AI Memory System - Scheduler Cron Wrapper
# Runs the daily summary task via node-cron

export LLM_API_KEY="tp-s6wizppnb4mx98viw6j7eewj4drlrojql2qzoieodqmhcjdr"
export LLM_BASE_URL="https://token-plan-sgp.xiaomimimo.com/v1"
export LLM_MODEL="mimo-v2.5-pro"
export EMBEDDING_BASE_URL="http://localhost:1234/v1"
export EMBEDDING_MODEL="text-embedding-qwen3-embedding-8b"
export EMBEDDING_DIMENSIONS="4096"
export EMBEDDING_API_KEY="lm-studio"

cd /Users/cq/WorkingProjects/ai-memory-system
./src/scheduler/node_modules/.bin/tsx scripts/start-scheduler.ts >> /Users/cq/.memory-tdai/scheduler.log 2>&1
