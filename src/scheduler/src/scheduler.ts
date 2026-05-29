/**
 * CronScheduler - Generic cron scheduler for AI memory system tasks
 */

import cron from 'node-cron';
import type {
  TaskDefinition,
  SchedulerConfig,
  TaskStatus,
  Logger,
} from './types.js';
import { loadConfig, validateCronExpression } from './config.js';

const DEFAULT_LOGGER: Logger = {
  debug: (msg, ...args) => console.debug(`[scheduler] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[scheduler] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[scheduler] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[scheduler] ${msg}`, ...args),
};

export class CronScheduler {
  private tasks = new Map<string, TaskDefinition>();
  private scheduledTasks = new Map<string, cron.ScheduledTask>();
  private taskStatuses = new Map<string, TaskStatus>();
  private activeTasks = new Map<string, Promise<void>>();
  private config: SchedulerConfig;
  private logger: Logger;
  private running = false;
  private stopped = false;
  private runningTasks = new Set<string>();

  constructor(config: SchedulerConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || DEFAULT_LOGGER;
  }

  /**
   * 从配置文件创建调度器
   */
  static fromConfigFile(configPath: string, logger?: Logger): CronScheduler {
    const config = loadConfig(configPath);
    return new CronScheduler(config, logger);
  }

  /**
   * 注册任务
   */
  register(task: TaskDefinition): void {
    // Merge with config overrides (config wins over hardcoded defaults)
    const merged = this.mergeWithConfig(task);

    // 验证 cron 表达式
    if (!validateCronExpression(merged.cron)) {
      throw new Error(`Invalid cron expression for task "${merged.name}": ${merged.cron}`);
    }

    this.tasks.set(merged.name, merged);
    this.taskStatuses.set(merged.name, {
      name: merged.name,
      enabled: merged.enabled,
      cron: merged.cron,
      description: merged.description,
    });

    this.logger.info(`Registered task: ${merged.name} (${merged.cron})`);
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.info('Scheduler is disabled in config');
      return;
    }

    if (this.running) {
      this.logger.warn('Scheduler is already running');
      return;
    }

    for (const [name, task] of this.tasks) {
      if (!task.enabled) {
        this.logger.info(`Task "${name}" is disabled, skipping`);
        continue;
      }

      const scheduledTask = cron.schedule(
        task.cron,
        async () => {
          await this.executeTask(name);
        },
        {
          timezone: this.config.timezone,
        }
      );

      this.scheduledTasks.set(name, scheduledTask);
      this.logger.info(`Scheduled task: ${name}`);
    }

    this.stopped = false;
    this.running = true;
    this.logger.info(`Scheduler started with ${this.scheduledTasks.size} tasks`);
  }

  /**
   * 停止调度器，等待正在执行的任务完成
   *
   * Stops accepting new tasks and waits for all in-flight tasks to settle
   * before returning. Uses `Promise.allSettled` so individual task failures
   * do not prevent the shutdown from completing.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    for (const [name, task] of this.scheduledTasks) {
      task.stop();
      this.logger.info(`Stopped task: ${name}`);
    }

    this.scheduledTasks.clear();
    this.stopped = true;
    this.running = false;

    if (this.activeTasks.size > 0) {
      this.logger.info(`Waiting for ${this.activeTasks.size} active task(s) to complete...`);
      await Promise.allSettled([...this.activeTasks.values()]);
      this.logger.info('All active tasks completed');
    }

    if (this.runningTasks.size > 0) {
      this.logger.warn(`Scheduler stopped with ${this.runningTasks.size} task(s) still tracked: [${[...this.runningTasks].join(', ')}]`);
    }

    this.logger.info('Scheduler stopped');
  }

  /**
   * 手动触发任务
   */
  async trigger(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Task "${taskName}" not found`);
    }

    await this.executeTask(taskName);
  }

  /**
   * 获取所有任务状态
   */
  getStatus(): TaskStatus[] {
    return Array.from(this.taskStatuses.values());
  }

  /**
   * 获取单个任务状态
   */
  getTaskStatus(taskName: string): TaskStatus | undefined {
    return this.taskStatuses.get(taskName);
  }

  /**
   * 检查调度器是否正在运行
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Merge a task definition with config overrides.
   *
   * Looks up `this.config.tasks[task.name]` and, if present, lets the config
   * values win over the hardcoded defaults passed in `task`.  Fields merged:
   * `cron`, `enabled`, `retryOnFail`, `maxRetries`, `description`.
   *
   * If no matching config entry exists the original task is returned unchanged,
   * preserving full backward compatibility.
   *
   * @param task - The task definition as registered by application code
   * @returns A new TaskDefinition with config values merged in
   */
  private mergeWithConfig(task: TaskDefinition): TaskDefinition {
    const taskConfig = this.config.tasks[task.name];
    if (!taskConfig) {
      return task;
    }

    return {
      ...task,
      cron: taskConfig.cron ?? task.cron,
      enabled: taskConfig.enabled ?? task.enabled,
      retryOnFail: taskConfig.retryOnFail ?? task.retryOnFail,
      maxRetries: taskConfig.maxRetries ?? task.maxRetries,
      description: taskConfig.description ?? task.description,
    };
  }

  /**
   * 执行任务（带重试逻辑和 promise 追踪）
   */
  private async executeTask(taskName: string): Promise<void> {
    const taskPromise = this.executeTaskInner(taskName);
    this.activeTasks.set(taskName, taskPromise);
    try {
      await taskPromise;
    } finally {
      this.activeTasks.delete(taskName);
    }
  }

  /**
   * 任务实际执行逻辑（带重试）
   */
  private async executeTaskInner(taskName: string): Promise<void> {
    if (this.runningTasks.has(taskName)) {
      this.logger.warn(`Task "${taskName}" is already running, skipping`);
      return;
    }

    const task = this.tasks.get(taskName);
    if (!task) {
      this.logger.error(`Task "${taskName}" not found`);
      return;
    }

    this.runningTasks.add(taskName);

    try {
      const status = this.taskStatuses.get(taskName)!;
      status.lastRun = new Date();
      status.lastStatus = 'running';

      this.logger.info(`Executing task: ${taskName}`);

      let retries = 0;
      const maxRetries = task.retryOnFail ? task.maxRetries : 0;

      while (retries <= maxRetries) {
        try {
          await task.handler();
          status.lastStatus = 'success';
          status.lastError = undefined;
          this.logger.info(`Task "${taskName}" completed successfully`);
          return;
        } catch (error) {
          retries++;
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (retries > maxRetries) {
            status.lastStatus = 'error';
            status.lastError = errorMessage;
            this.logger.error(`Task "${taskName}" failed after ${retries} attempts: ${errorMessage}`);
            return;
          }

          this.logger.warn(
            `Task "${taskName}" failed (attempt ${retries}/${maxRetries + 1}): ${errorMessage}`
          );

          if (this.stopped) {
            this.logger.info(`Scheduler stopped, aborting retry for task "${taskName}"`);
            throw error;
          }

          // 等待后重试（指数退避）
          const delay = Math.min(1000 * Math.pow(2, retries - 1), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } finally {
      this.runningTasks.delete(taskName);
    }
  }
}
