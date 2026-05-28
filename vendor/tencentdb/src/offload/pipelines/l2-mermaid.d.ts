/**
 * L2 Mermaid Generation Pipeline (Independent Trigger):
 *
 * L2 is NO LONGER triggered directly from L1. Instead it runs independently:
 *   - Trigger condition A: offload.jsonl has >= l2NullThreshold entries with node_id=null
 *   - Trigger condition B: time since last L2 trigger exceeds l2TimeoutSeconds
 */
import { type OffloadEntry, type PluginConfig, type PluginLogger } from "../types.js";
import { type StorageContext } from "../storage.js";
import type { OffloadStateManager } from "../state-manager.js";
export declare function checkL2Trigger(stateManager: OffloadStateManager, pluginConfig: Partial<PluginConfig> | undefined, logger: PluginLogger): Promise<{
    shouldTrigger: boolean;
    reason: string;
    entriesByMmd: Map<string, OffloadEntry[]>;
}>;
export declare function backfillNodeIds(ctx: StorageContext, nodeMapping: Record<string, string>, waitIds: Set<string>, logger: PluginLogger, options?: {
    mmdFallbackText?: string | null;
    mmdPrefix?: string;
}): Promise<void>;
//# sourceMappingURL=l2-mermaid.d.ts.map