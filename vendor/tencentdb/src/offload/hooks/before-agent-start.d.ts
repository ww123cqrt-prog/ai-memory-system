import type { OffloadStateManager } from "../state-manager.js";
import type { PluginLogger, TaskJudgment } from "../types.js";
/**
 * Normalize a raw L1.5 judgment response (from backend)
 * into a safe TaskJudgment with guaranteed boolean fields.
 * Handles null/undefined values from backend fallback responses.
 */
export declare function normalizeJudgment(raw: Record<string, unknown>): TaskJudgment | null;
export declare function handleTaskTransition(stateManager: OffloadStateManager, judgment: TaskJudgment, logger: PluginLogger): Promise<void>;
//# sourceMappingURL=before-agent-start.d.ts.map