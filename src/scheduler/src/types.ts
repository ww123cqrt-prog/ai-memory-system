/**
 * Scheduler module type definitions
 */

export interface TaskDefinition {
  /** 任务唯一名称 */
  name: string;
  /** Cron 表达式，如 "0 22 * * *" */
  cron: string;
  /** 任务处理函数 */
  handler: () => Promise<void>;
  /** 是否启用 */
  enabled: boolean;
  /** 失败时是否重试 */
  retryOnFail: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 任务描述（用于日志） */
  description?: string;
}

export interface SchedulerConfig {
  /** 是否启用调度器 */
  enabled: boolean;
  /** 时区 */
  timezone: string;
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 任务配置 */
  tasks: Record<string, TaskConfig>;
}

export interface TaskConfig {
  /** Cron 表达式 */
  cron: string;
  /** 是否启用 */
  enabled: boolean;
  /** 任务描述 */
  description?: string;
  /** 失败重试 */
  retryOnFail?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
}

export interface TaskStatus {
  /** 任务名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** Cron 表达式 */
  cron: string;
  /** 描述 */
  description?: string;
  /** 下次运行时间 */
  nextRun?: Date;
  /** 上次运行时间 */
  lastRun?: Date;
  /** 上次运行状态 */
  lastStatus?: 'success' | 'error' | 'running';
  /** 上次错误信息 */
  lastError?: string;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
