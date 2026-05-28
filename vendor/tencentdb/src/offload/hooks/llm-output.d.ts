/**
 * llm_output hook handler.
 * Detects when L1 should be force-triggered based on pending pair count.
 *
 * Backend-only mode: local LLM pipeline references removed.
 */
import type { OffloadStateManager } from "../state-manager.js";
import type { PluginConfig } from "../types.js";
/**
 * Check if L1 should be force-triggered (called from after_tool_call when
 * pending count exceeds threshold).
 */
export declare function shouldForceL1(stateManager: OffloadStateManager, pluginConfig: Partial<PluginConfig> | undefined): boolean;
//# sourceMappingURL=llm-output.d.ts.map