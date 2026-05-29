/**
 * Scheduler configuration loader
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SchedulerConfig, TaskConfig } from './types.js';

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  timezone: 'Asia/Shanghai',
  logLevel: 'info',
  tasks: {},
};

/**
 * 从 JSON 文件加载调度器配置
 */
export function loadConfig(configPath: string): SchedulerConfig {
  const fullPath = resolve(configPath);
  
  let raw: string;
  try {
    raw = readFileSync(fullPath, 'utf-8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${fullPath}`);
    }
    throw new Error(`Failed to read config file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in config file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Config file ${fullPath} must contain a JSON object`);
  }
  
  const config = parsed as Record<string, unknown>;
  
  return {
    ...DEFAULT_CONFIG,
    ...config,
    tasks: {
      ...DEFAULT_CONFIG.tasks,
      ...(typeof config.tasks === 'object' && config.tasks !== null ? config.tasks : {}),
    },
  };
}

/**
 * 验证 cron 表达式格式
 */
export function validateCronExpression(cron: string): boolean {
  // 基本格式验证：5 个字段
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  // 检查每个字段的范围
  const ranges = [
    { min: 0, max: 59 },  // 分钟
    { min: 0, max: 23 },  // 小时
    { min: 1, max: 31 },  // 日
    { min: 1, max: 12 },  // 月
    { min: 0, max: 6 },   // 星期
  ];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const range = ranges[i];

    // 跳过通配符
    if (part === '*') continue;

    // 检查步长
    if (part.includes('/')) {
      const [base, step] = part.split('/');
      if (base !== '*' && (parseInt(base) < range.min || parseInt(base) > range.max)) {
        return false;
      }
      if (parseInt(step) < 1) {
        return false;
      }
      continue;
    }

    // 检查范围
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (start < range.min || end > range.max || start > end) {
        return false;
      }
      continue;
    }

    // 检查列表
    if (part.includes(',')) {
      const values = part.split(',').map(Number);
      for (const val of values) {
        if (val < range.min || val > range.max) {
          return false;
        }
      }
      continue;
    }

    // 单个值
    const val = parseInt(part);
    if (isNaN(val) || val < range.min || val > range.max) {
      return false;
    }
  }

  return true;
}
