/**
 * OffloadReclaimer: periodic cleanup of stale offload data files.
 *
 * Reclaims disk space by removing:
 *   Step 1 — Expired session JSONL files (offload-*.jsonl)
 *   Step 2 — Orphaned ref MD files (refs/*.md)
 *   Step 3 — Expired MMD files (mmds/*.mmd), protecting active MMD
 *   Step 4 — Oversized debug log files (*.log truncation)
 *   Step 5 — Stale sessions-registry.json entries
 *
 * Each step is independently try/caught — a failure in one step
 * does not prevent subsequent steps from running.
 *
 * All file-age checks use mtime (last modification time).
 */
import type { PluginLogger } from "./types.js";
/** Configuration for the reclaim operation. */
export interface ReclaimConfig {
    /** Retention period in days. Values < 3 disable reclamation entirely. */
    retentionDays: number;
    /** Max total size in MB for debug log files. 0 = no log rotation. */
    logMaxSizeMb: number;
}
/** Statistics returned after a reclaim run. */
export interface ReclaimStats {
    deletedJsonl: number;
    deletedRefs: number;
    deletedMmds: number;
    truncatedLogs: number;
    prunedRegistryEntries: number;
}
/**
 * Run a full reclamation pass over the offload data directory.
 *
 * Safe to call concurrently (each step is idempotent) but designed
 * for single-caller-per-process via a 24h setInterval.
 */
export declare function reclaimOffloadData(dataRoot: string, config: ReclaimConfig, logger: PluginLogger): Promise<ReclaimStats>;
//# sourceMappingURL=reclaimer.d.ts.map