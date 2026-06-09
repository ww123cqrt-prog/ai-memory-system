/**
 * SceneExtractor: LLM-driven memory extraction into scene blocks.
 *
 * Replaces the keyword-based SceneManager.processNewMemories() with an
 * LLM agent that autonomously reads/writes scene block files using tools.
 *
 * Security: The LLM is sandboxed — workspaceDir is set to scene_blocks/
 * so it can ONLY operate on .md scene files. System files (checkpoint,
 * scene_index, persona.md) are physically invisible to the LLM.
 *
 * Flow:
 *   1. Backup + load scene index + build summaries
 *   2. Assemble extraction prompt with memories + scene context
 *   3. Run via CleanContextRunner (tools enabled, sandboxed to scene_blocks/)
 *   4. Cleanup: remove soft-deletes, sync index, update navigation
 *   5. Parse LLM text output for out-of-band persona update signals
 */

import fs from "node:fs/promises";
import path from "node:path";
import { CleanContextRunner } from "../../utils/clean-context-runner.js";
import { CheckpointManager } from "../../utils/checkpoint.js";
import { BackupManager } from "../../utils/backup.js";
import { readSceneIndex, syncSceneIndex } from "../scene/scene-index.js";
import type { SceneIndexEntry } from "../scene/scene-index.js";
import { formatSceneBlock, parseSceneBlock } from "../scene/scene-format.js";
import { generateSceneNavigation, stripSceneNavigation } from "../scene/scene-navigation.js";
import { normalizeSceneFilename, normalizeSceneFilenames } from "./filename-normalizer.js";
import { buildSceneExtractionPrompt } from "../prompts/scene-extraction.js";
import { report } from "../report/reporter.js";
import type { LLMRunner } from "../types.js";

const TAG = "[memory-tdai] [extractor]";

interface ExtractorLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface ExtractionResult {
  memoriesProcessed: number;
  success: boolean;
  error?: string;
}

export interface SceneExtractorOptions {
  dataDir: string;
  config: unknown;
  model?: string;
  maxScenes?: number;
  sceneBackupCount?: number;
  timeoutMs?: number;
  logger?: ExtractorLogger;
  /** Plugin instance ID for metric reporting (optional) */
  instanceId?: string;
  /**
   * Host-neutral LLM runner. When provided, used instead of creating
   * a CleanContextRunner (decouples from OpenClaw runtime).
   * Must be configured with `enableTools: true`.
   */
  llmRunner?: LLMRunner;
}

interface StructuredSceneOutput {
  scenes: StructuredSceneFile[];
  personaUpdateReason?: string;
}

interface StructuredSceneFile {
  filename: string;
  summary?: string;
  heat?: number;
  created?: string;
  updated?: string;
  content: string;
  delete?: boolean;
}

function supportsFileTools(runner: LLMRunner): boolean {
  return runner.supportsFileTools !== false;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function findJsonPayload(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const starts = [objectStart, arrayStart].filter((idx) => idx >= 0);
  if (starts.length === 0) {
    throw new Error("No JSON object or array found in scene extraction response");
  }

  const start = Math.min(...starts);
  const end = text.lastIndexOf(text[start] === "[" ? "]" : "}");
  if (end <= start) {
    throw new Error("Incomplete JSON in scene extraction response");
  }

  return JSON.parse(text.slice(start, end + 1));
}

function parseStructuredSceneOutput(raw: string): StructuredSceneOutput {
  const parsed = findJsonPayload(raw);
  const root = Array.isArray(parsed)
    ? { scenes: parsed }
    : parsed;
  if (!root || typeof root !== "object") {
    throw new Error("Scene extraction response must be a JSON object or array");
  }

  const obj = root as Record<string, unknown>;
  const scenesRaw = Array.isArray(obj.scenes)
    ? obj.scenes
    : Array.isArray(obj.files)
      ? obj.files
      : undefined;
  if (!scenesRaw) {
    throw new Error("Scene extraction response missing scenes array");
  }

  const scenes: StructuredSceneFile[] = [];
  for (const item of scenesRaw) {
    if (!item || typeof item !== "object") continue;
    const scene = item as Record<string, unknown>;
    const filename = typeof scene.filename === "string"
      ? scene.filename
      : typeof scene.path === "string"
        ? scene.path
        : "";
    const content = typeof scene.content === "string"
      ? scene.content
      : typeof scene.markdown === "string"
        ? scene.markdown
        : "";
    if (!filename || (!content && scene.delete !== true)) continue;
    scenes.push({
      filename,
      content,
      summary: typeof scene.summary === "string" ? scene.summary : undefined,
      heat: typeof scene.heat === "number" ? scene.heat : undefined,
      created: typeof scene.created === "string" ? scene.created : undefined,
      updated: typeof scene.updated === "string" ? scene.updated : undefined,
      delete: scene.delete === true,
    });
  }

  return {
    scenes,
    personaUpdateReason:
      typeof obj.persona_update_reason === "string"
        ? obj.persona_update_reason
        : typeof obj.personaUpdateReason === "string"
          ? obj.personaUpdateReason
          : undefined,
  };
}

/**
 * Parse LLM text output for a persona update request signal.
 *
 * Supports multiple formats for robustness:
 * - Block: [PERSONA_UPDATE_REQUEST]reason: xxx[/PERSONA_UPDATE_REQUEST]
 * - Inline: PERSONA_UPDATE_REQUEST: xxx
 */
export function parsePersonaUpdateSignal(text: string): { reason: string } | null {
  // Block format: [PERSONA_UPDATE_REQUEST]...[/PERSONA_UPDATE_REQUEST]
  const blockMatch = text.match(
    /\[PERSONA_UPDATE_REQUEST\]\s*(?:reason:\s*)?(.+?)\s*\[\/PERSONA_UPDATE_REQUEST\]/s,
  );
  if (blockMatch) return { reason: blockMatch[1]!.trim() };

  // Inline format: PERSONA_UPDATE_REQUEST: reason text
  const inlineMatch = text.match(
    /PERSONA_UPDATE_REQUEST:\s*(.+?)(?:\n|$)/,
  );
  if (inlineMatch) return { reason: inlineMatch[1]!.trim() };

  return null;
}

export class SceneExtractor {
  private dataDir: string;
  private runner: LLMRunner;
  private maxScenes: number;
  private sceneBackupCount: number;
  private timeoutMs: number;
  private logger: ExtractorLogger | undefined;
  private instanceId: string | undefined;

  constructor(opts: SceneExtractorOptions) {
    this.dataDir = opts.dataDir;
    this.maxScenes = opts.maxScenes ?? 15;
    this.sceneBackupCount = opts.sceneBackupCount ?? 10;
    this.timeoutMs = opts.timeoutMs ?? 300_000; // 5 min — LLM may do multiple tool calls
    this.logger = opts.logger;
    this.instanceId = opts.instanceId;

    // Use injected LLMRunner if available, otherwise fall back to CleanContextRunner
    this.runner = opts.llmRunner ?? new CleanContextRunner({
      config: opts.config,
      modelRef: opts.model,
      enableTools: true,
      logger: opts.logger,
    });

    this.logger?.debug?.(`${TAG} Created: dataDir=${opts.dataDir}, model=${opts.model ?? "(default)"}, maxScenes=${this.maxScenes}, timeout=${this.timeoutMs}ms`);
  }

  /**
   * Extract a batch of memories into scene blocks using the LLM agent.
   *
   * @param memories - Array of raw memory records from the API
   * @returns Extraction result with count and success flag
   */
  async extract(memories: Array<{ content: string; created_at: string; id?: string }>): Promise<ExtractionResult> {
    const extractStartMs = Date.now();
    this.logger?.info(`${TAG} extract() start: ${memories.length} memories`);

    if (memories.length === 0) {
      this.logger?.debug?.(`${TAG} extract() skipped: no memories`);
      return { memoriesProcessed: 0, success: true };
    }

    const sceneBlocksDir = path.join(this.dataDir, "scene_blocks");
    const metadataDir = path.join(this.dataDir, ".metadata");

    // Ensure directories exist
    await fs.mkdir(sceneBlocksDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });

    // Phase 1: Backup
    const backupStartMs = Date.now();
    const cpManager = new CheckpointManager(this.dataDir);
    const cp = await cpManager.read();
    const bm = new BackupManager(path.join(this.dataDir, ".backup"));
    await bm.backupDirectory(sceneBlocksDir, "scene_blocks", `offset${cp.total_processed}`, this.sceneBackupCount);
    this.logger?.debug?.(`${TAG} extract() backup phase: ${Date.now() - backupStartMs}ms`);

    // Phase 2: Load scene index
    const indexStartMs = Date.now();
    const index = await readSceneIndex(this.dataDir);
    this.logger?.debug?.(`${TAG} extract() scene index loaded: ${index.length} entries (${Date.now() - indexStartMs}ms)`);

    // Build scene summaries for the prompt (relative filenames only)
    const { summaries: sceneSummaries, filenames: existingSceneFiles } =
      this.buildSceneSummaries(index);

    // Build scene count warning (tiered system)
    let sceneCountWarning: string | undefined;
    const sceneCount = index.length;
    if (sceneCount >= this.maxScenes) {
      sceneCountWarning = `当前场景数量为 **${sceneCount} 个**，已达到或超过 ${this.maxScenes} 个上限！\n**你必须先执行 MERGE 操作**，将最相似的 2-4 个场景合并为 1 个，然后再处理新记忆。\n参考合并对象：热度最低或主题高度重叠的场景。`;
      this.logger?.warn(`${TAG} extract() scene count at limit: ${sceneCount}/${this.maxScenes}`);
    } else if (sceneCount === this.maxScenes - 1) {
      sceneCountWarning = `当前场景数量为 **${sceneCount} 个**，距离上限只差 1 个！\n本次处理**只能 UPDATE 现有场景，不能 CREATE 新场景**。`;
      this.logger?.warn(`${TAG} extract() scene count near limit (CREATE blocked): ${sceneCount}/${this.maxScenes}`);
    } else if (sceneCount >= this.maxScenes - 3) {
      sceneCountWarning = `当前场景数量为 **${sceneCount} 个**，建议优先考虑 UPDATE 或主动 MERGE 相似场景。`;
      this.logger?.debug?.(`${TAG} extract() scene count approaching limit: ${sceneCount}/${this.maxScenes}`);
    }

    // Snapshot scene index + content before LLM — used later to diff created/updated/deleted
    const preExtractIndex = new Map(index.map((e) => [e.filename, e.summary]));
    // Also snapshot scene content so we can detect content-only changes vs metadata-only changes
    const preExtractContent = new Map<string, string>();
    for (const e of index) {
      try {
        const raw = await fs.readFile(path.join(sceneBlocksDir, e.filename), "utf-8");
        const block = parseSceneBlock(raw, e.filename);
        preExtractContent.set(e.filename, block.content);
      } catch { /* non-fatal */ }
    }

    // Phase 3: Build prompt
    const promptStartMs = Date.now();
    const memoriesJson = JSON.stringify(
      memories.map((m) => ({
        content: m.content,
        created_at: m.created_at,
        id: m.id ?? "",
      })),
      null,
      2,
    );

    const currentTimestamp = formatTimestamp(new Date());

    const { systemPrompt, userPrompt } = buildSceneExtractionPrompt({
      memoriesJson,
      sceneSummaries: sceneSummaries || "(无已有场景)",
      currentTimestamp,
      sceneCountWarning,
      existingSceneFiles,
      maxScenes: this.maxScenes,
    });
    this.logger?.debug?.(`${TAG} extract() prompt built: ${userPrompt.length} chars (${Date.now() - promptStartMs}ms)`);

    // Phase 4: Run LLM agent.
    //
    // OpenClaw/CleanContext runners can write scene files through sandboxed
    // file tools. Plain OpenAI-compatible chat runners (LM Studio/Ollama-style)
    // cannot, so ask for structured JSON and apply the filesystem writes here.
    let llmOutput = "";
    let llmDurationMs = 0;
    let structuredFallbackWrites: number | undefined;
    try {
      const runnerSupportsFileTools = supportsFileTools(this.runner);
      this.logger?.debug?.(`${TAG} extract() starting LLM runner (timeout=${this.timeoutMs}ms, maxTokens=model default, fileTools=${runnerSupportsFileTools})...`);
      const runnerStartMs = Date.now();
      if (runnerSupportsFileTools) {
        llmOutput = await this.runner.run({
          systemPrompt,
          prompt: userPrompt,
          taskId: `scene-extract-${Date.now()}`,
          timeoutMs: this.timeoutMs,
          // maxTokens omitted → core uses the resolved model's maxTokens from catalog
          workspaceDir: sceneBlocksDir,
        }) ?? "";
      } else {
        const structuredPrompt = this.buildStructuredFallbackPrompt({
          memoriesJson,
          sceneSummaries: sceneSummaries || "(无已有场景)",
          currentTimestamp,
          sceneCountWarning,
          existingSceneFiles,
        });
        llmOutput = await this.runner.run({
          systemPrompt:
            "You consolidate user memories into scene markdown files. Respond only with strict JSON.",
          prompt: structuredPrompt,
          taskId: `scene-extract-json-${Date.now()}`,
          timeoutMs: this.timeoutMs,
          maxTokens: readPositiveIntegerEnv("MEMORY_L2_MAX_TOKENS", 2048),
        }) ?? "";
        structuredFallbackWrites = await this.applyStructuredFallbackOutput(llmOutput, sceneBlocksDir, currentTimestamp);
      }
      llmDurationMs = Date.now() - runnerStartMs;
      this.logger?.debug?.(`${TAG} extract() LLM runner completed: ${llmDurationMs}ms`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const totalMs = Date.now() - extractStartMs;
      this.logger?.error(`${TAG} extract() LLM runner failed after ${totalMs}ms: ${errMsg}`);

      // Restore scene_blocks/ from the Phase 1 backup so partial LLM writes
      // (or a wiped sandbox) don't leak into the next recall cycle.
      // Fail-soft: a restore failure must never mask the original LLM error.
      try {
        const result = await bm.restoreLatestDirectory("scene_blocks", sceneBlocksDir);
        if (result.restored) {
          this.logger?.warn(`${TAG} extract() restored scene_blocks/ from backup: ${result.from}`);
        } else {
          this.logger?.debug?.(`${TAG} extract() no scene_blocks backup to restore from (first run or empty)`);
        }
      } catch (restoreErr) {
        const rMsg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
        this.logger?.warn(`${TAG} extract() restore failed (non-fatal, original LLM error preserved): ${rMsg}`);
      }

      return { memoriesProcessed: 0, success: false, error: errMsg };
    }

    // Phase 5: Subsequent processing — safe cleanup of soft-deleted files
    //
    // Security: The LLM has no `exec` tool and cannot run shell commands.
    // Instead, it "deletes" files by writing the marker `[DELETED]` to the file
    // (writing empty/whitespace-only content is rejected by core's write tool
    // parameter validation). Here we detect and remove those soft-deleted files
    // before syncing the index, so syncSceneIndex won't re-index stale entries.
    //
    // We also detect "META-only" files — files that contain only a META header
    // (e.g. [ARCHIVE] or [CONSOLIDATED] markers) but no actual scene content.
    // These are artifacts of LLM merges that didn't properly delete old files.
    const cleanupStartMs = Date.now();
    let cleanedCount = 0;
    try {
      const allFiles = (await fs.readdir(sceneBlocksDir)).filter((f) => f.endsWith(".md"));
      for (const file of allFiles) {
        const filePath = path.join(sceneBlocksDir, file);
        const raw = await fs.readFile(filePath, "utf-8");
        if (raw.trim().length === 0 || raw.trim() === "[DELETED]") {
          // Empty file or [DELETED] marker — soft-delete
          await fs.unlink(filePath);
          cleanedCount++;
          this.logger?.debug?.(`${TAG} extract() removed soft-deleted file: ${file}`);
        } else {
          // Check if file has only META header but no actual content
          const block = parseSceneBlock(raw, file);
          if (!block.content || block.content.trim().length === 0) {
            await fs.unlink(filePath);
            cleanedCount++;
            this.logger?.debug?.(`${TAG} extract() removed META-only file (no content): ${file}`);
          }
        }
      }
    } catch (cleanupErr) {
      // Non-fatal — log and continue to index sync
      this.logger?.warn(`${TAG} extract() soft-delete cleanup error: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`);
    }
    this.logger?.debug?.(`${TAG} extract() soft-delete cleanup: removed ${cleanedCount} empty files (${Date.now() - cleanupStartMs}ms)`);

    // Phase 5b: Normalize filenames (defensive — LLM occasionally produces names
    // with spaces / punctuation despite the prompt forbidding them, e.g.
    // "Daily Rhythm in Shanghai.md". Such names break downstream consumers
    // that parse Markdown navigation refs with `\S+\.md` style regexes
    // (health-checker), shell tools, and URL-encoded path consumers.
    //
    // Renaming here — *before* syncSceneIndex — means scene_index.json and
    // every downstream reader (PersonaGenerator, recall, profile-sync) only
    // ever sees canonical filenames. Idempotent and safe to run repeatedly.
    const normStartMs = Date.now();
    try {
      const normResult = await normalizeSceneFilenames(sceneBlocksDir, this.logger);
      if (normResult.renamed > 0) {
        this.logger?.info(
          `${TAG} extract() filename normalization: renamed ${normResult.renamed}, skipped ${normResult.skipped} (${Date.now() - normStartMs}ms)`,
        );
      } else {
        this.logger?.debug?.(
          `${TAG} extract() filename normalization: skipped ${normResult.skipped} (${Date.now() - normStartMs}ms)`,
        );
      }
    } catch (normErr) {
      // Non-fatal — log and continue. Index sync below will simply pick up
      // whatever names are present on disk.
      this.logger?.warn(`${TAG} extract() filename normalization error: ${normErr instanceof Error ? normErr.message : String(normErr)}`);
    }

    // Phase 6: Sync scene index (rebuilds from remaining non-empty files)
    const syncStartMs = Date.now();
    await syncSceneIndex(this.dataDir);
    this.logger?.debug?.(`${TAG} extract() scene index synced: ${Date.now() - syncStartMs}ms`);

    // Phase 7: Update persona.md navigation (GAP-4 fix)
    const navStartMs = Date.now();
    try {
      await this.updateSceneNavigation();
      this.logger?.debug?.(`${TAG} extract() persona.md navigation updated: ${Date.now() - navStartMs}ms`);
    } catch (navErr) {
      // Non-fatal — log and continue
      this.logger?.warn(`${TAG} extract() failed to update persona navigation: ${navErr instanceof Error ? navErr.message : String(navErr)}`);
    }

    // Phase 8: Parse LLM output for out-of-band persona update signal
    if (llmOutput) {
      const signal = parsePersonaUpdateSignal(llmOutput);
      if (signal) {
        await cpManager.setPersonaUpdateRequest(signal.reason);
        this.logger?.debug?.(`${TAG} extract() persona update requested by LLM: ${signal.reason}`);
      }
    }

    const totalMs = Date.now() - extractStartMs;
    if (structuredFallbackWrites !== undefined && structuredFallbackWrites <= 0) {
      const message = "structured fallback produced no scene files";
      this.logger?.warn(`${TAG} extract() ${message}; L2 cursor will not advance`);
      return { memoriesProcessed: 0, success: false, error: message };
    }

    this.logger?.info(`${TAG} extract() completed: ${memories.length} memories processed in ${totalMs}ms`);

    // ── l2_extraction metric ──
    if (this.instanceId && this.logger) {
      // Read updated scene index to report final state + diff against pre-extract snapshot
      let resultScenes: Array<{ title: string; summary: string; content: string; status: "created" | "updated" }> = [];
      let scenesCreated = 0;
      let scenesUpdated = 0;
      let scenesDeleted = 0;
      try {
        const finalIndex = await readSceneIndex(this.dataDir);
        const postFilenames = new Set<string>();
        for (const e of finalIndex) {
          postFilenames.add(e.filename);
          const oldSummary = preExtractIndex.get(e.filename);
          // Read scene block content from disk
          let content = "";
          try {
            const blockPath = path.join(sceneBlocksDir, e.filename);
            const raw = await fs.readFile(blockPath, "utf-8");
            const block = parseSceneBlock(raw, e.filename);
            content = block.content;
          } catch { /* file read failure is non-fatal */ }

          if (oldSummary === undefined) {
            // New scene
            scenesCreated++;
            resultScenes.push({
              title: e.filename.replace(/\.md$/, ""),
              summary: e.summary,
              content,
              status: "created",
            });
          } else {
            // Existing scene — check if content actually changed (not just metadata)
            const oldContent = preExtractContent.get(e.filename) ?? "";
            if (content !== oldContent) {
              scenesUpdated++;
              resultScenes.push({
                title: e.filename.replace(/\.md$/, ""),
                summary: e.summary,
                content,
                status: "updated",
              });
            }
            // If only metadata (summary/heat) changed but content is the same, skip
          }
        }
        // Scenes in pre-extract but missing from post-extract = deleted
        for (const [filename] of preExtractIndex) {
          if (!postFilenames.has(filename)) {
            scenesDeleted++;
          }
        }
      } catch { /* non-fatal */ }

      report("l2_extraction", {
        inputMemoryCount: memories.length,
        resultSceneCount: resultScenes.length,
        resultScenes,
        scenesCreated,
        scenesUpdated,
        scenesDeleted,
        llmDurationMs,
        totalDurationMs: totalMs,
        success: true,
        error: null,
      });
    }

    return { memoriesProcessed: memories.length, success: true };
  }

  /**
   * Build human-readable scene summaries for the prompt,
   * and collect the list of existing scene filenames (relative).
   *
   * Includes a capacity counter at the top (e.g. "当前场景总数：5 / 15")
   * so the LLM can immediately see how close it is to the limit.
   */
  private buildSceneSummaries(
    index: SceneIndexEntry[],
  ): { summaries: string; filenames: string[] } {
    if (index.length === 0) return { summaries: "", filenames: [] };

    const lines: string[] = [];
    const filenames: string[] = [];

    // Inject capacity counter at the top — LLM sees this first
    lines.push(`**当前场景总数：${index.length} / ${this.maxScenes}**`);
    lines.push("");

    for (const entry of index) {
      filenames.push(entry.filename);
      lines.push(`### ${entry.filename}`);
      lines.push(`**热度**: ${entry.heat} | **更新**: ${entry.updated}`);
      lines.push(`**summary**: ${entry.summary}`);
      lines.push("");
    }
    return { summaries: lines.join("\n"), filenames };
  }

  private buildStructuredFallbackPrompt(params: {
    memoriesJson: string;
    sceneSummaries: string;
    currentTimestamp: string;
    sceneCountWarning?: string;
    existingSceneFiles: string[];
  }): string {
    const fileList = params.existingSceneFiles.length > 0
      ? params.existingSceneFiles.map((f) => `- ${f}`).join("\n")
      : "(none)";

    return `You are updating long-term memory scene blocks, but you do not have file tools.
Return strict JSON only. Do not wrap it in markdown.

Output schema:
{
  "scenes": [
    {
      "filename": "normalized-file-name.md",
      "summary": "30-40 word concise summary",
      "heat": 1,
      "content": "Markdown body without META block"
    }
  ],
  "persona_update_reason": ""
}

Rules:
- Write at most 1 scene unless updating an existing scene from the file list.
- Prefer updating an existing scene when it is related.
- Filenames must end with .md and use only letters, numbers, CJK, hyphen, underscore, and dot.
- Content must be narrative and concise. Do not output a simple list of raw memories.
- Content should include useful sections such as 用户基础信息, 用户核心特征, 用户偏好, 隐性信号, 核心叙事, 演变轨迹, 待确认/矛盾点 when applicable.
- Keep each scene content under 1500 Chinese characters or 1200 English words.
- If no meaningful scene can be produced, return {"scenes":[]}.

Current timestamp: ${params.currentTimestamp}
Scene warning: ${params.sceneCountWarning || "(none)"}

Existing scene files:
${fileList}

Existing scene summaries:
${params.sceneSummaries}

New memories:
${params.memoriesJson}`;
  }

  private async applyStructuredFallbackOutput(
    rawOutput: string,
    sceneBlocksDir: string,
    currentTimestamp: string,
  ): Promise<number> {
    const structured = parseStructuredSceneOutput(rawOutput);
    if (structured.personaUpdateReason) {
      const cpManager = new CheckpointManager(this.dataDir);
      await cpManager.setPersonaUpdateRequest(structured.personaUpdateReason);
    }

    let written = 0;
    for (const scene of structured.scenes) {
      const filename = normalizeSceneFilename(scene.filename);
      const targetPath = path.join(sceneBlocksDir, filename);

      if (scene.delete) {
        await fs.writeFile(targetPath, "[DELETED]", "utf-8");
        continue;
      }

      const content = scene.content.trim();
      if (!content) continue;

      const rawScene = formatSceneBlock({
        created: scene.created || currentTimestamp,
        updated: scene.updated || currentTimestamp,
        summary: scene.summary || content.replace(/\s+/g, " ").slice(0, 160),
        heat: Number.isFinite(scene.heat) && scene.heat! > 0 ? scene.heat! : 1,
      }, content);

      await fs.writeFile(targetPath, rawScene, "utf-8");
      written++;
    }

    this.logger?.debug?.(`${TAG} extract() structured fallback wrote ${written} scene file(s)`);
    return written;
  }

  /**
   * Update the scene navigation section at the end of persona.md.
   *
   * Reads the current scene index, generates the navigation block, then
   * strips any existing navigation from persona.md and appends the new one.
   *
   * IMPORTANT: If the persona body is empty (PersonaGenerator hasn't run yet),
   * we skip writing to avoid creating a persona.md that only contains the
   * scene navigation. PersonaGenerator.generate() will write the full
   * persona + navigation when it runs.
   */
  private async updateSceneNavigation(): Promise<void> {
    const personaPath = path.join(this.dataDir, "persona.md");
    const index = await readSceneIndex(this.dataDir);
    const nav = generateSceneNavigation(index);

    let existing = "";
    try {
      existing = await fs.readFile(personaPath, "utf-8");
    } catch {
      // No persona file yet — PersonaGenerator will create it with navigation.
      // Don't write a navigation-only file.
      this.logger?.debug?.(`${TAG} updateSceneNavigation() skipped: no persona file yet, waiting for PersonaGenerator`);
      return;
    }

    if (!existing.trim() && !nav) return;

    const stripped = stripSceneNavigation(existing).trimEnd();

    // If the persona body is empty (only navigation existed), don't overwrite
    // with a navigation-only file. Let PersonaGenerator handle full generation.
    if (!stripped) {
      this.logger?.debug?.(`${TAG} updateSceneNavigation() skipped: persona body is empty, waiting for PersonaGenerator`);
      return;
    }

    const updated = nav ? `${stripped}\n\n${nav}\n` : `${stripped}\n`;

    // persona.md is at dataDir root, no subdir needed
    await fs.writeFile(personaPath, updated, "utf-8");
  }
}

function formatTimestamp(d: Date): string {
  return d.toISOString();
}
