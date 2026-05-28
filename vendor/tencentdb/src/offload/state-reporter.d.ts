/**
 * Plugin state & L3 token consumption reporter.
 *
 * Uploads runtime diagnostics to the backend `/offload/v1/store` endpoint
 * so operators can inspect plugin activity and L3 compression efficiency
 * off-host.
 *
 * The backend keys stored documents by `X-User-Id` (upsert semantics), so
 * every report represents the latest snapshot for that user. We therefore
 * include BOTH:
 *   - `cumulative`: monotonically-increasing counters (total tokens saved,
 *     total tool calls, total L3 triggers) maintained as module-level
 *     globals so they survive across per-trigger reports.
 *   - `recent`: the most recent L3 trigger's detailed accounting
 *     (tokens/msgs before and after) for spot inspection.
 *
 * Four pieces of information are reported on every L3 trigger:
 *   1. Plugin state snapshot (active MMD, pending pairs, L1.5 settled, etc.)
 *   2. L3 token accounting (tokensBefore/After, savings, fixed overhead)
 *   3. Cumulative + recent counters
 *   4. Patch-health signal — only meaningful for `after_tool_call` hook:
 *      the upstream runtime patch is expected to populate `event.messages`
 *      with the current conversation. If `event.messages` is missing/empty
 *      the patch did NOT take effect and L3 cannot operate from this hook.
 *
 * All reporting is fire-and-forget — rejection is logged but never thrown
 * back to the caller so hook execution stays unaffected.
 */
import type { BackendClient } from "./backend-client.js";
import type { OffloadStateManager } from "./state-manager.js";
import type { PluginLogger } from "./types.js";
/**
 * Fixed L3 "patch overhead" charged per trigger.
 *
 * The context-offload runtime patch injects a small amount of boilerplate
 * (scanner loops, message-mutation wrappers, sentinel fields like
 * `_offloaded` / `_mmdContextMessage`) before the compression routine runs.
 * That boilerplate adds a roughly constant token cost per invocation that
 * is NOT captured by the tiktoken snapshot delta (which only measures
 * compressed vs uncompressed messages).
 *
 * We account for it here with a single fixed constant so cost/benefit
 * tracking on the backend is monotonic. The value is a conservative estimate
 * that can be tuned as the runtime patch evolves.
 */
export declare const L3_FIXED_PATCH_COST_TOKENS = 80;
/** L3 trigger site — matches the three places that invoke L3 compression. */
export type L3TriggerStage = "after_tool_call" | "llm_input" | "assemble";
/**
 * Patch-effectiveness signal derived from the after_tool_call event.
 *
 * The upstream runtime patch is expected to attach the current `messages`
 * array to the event object. When the patch is missing, `event.messages`
 * is undefined and L3 cannot inspect or mutate the conversation.
 */
export type PatchEffective = "effective" | "missing_field" | "empty_messages" | "n/a";
/** Inspects `event.messages` to classify patch health for after_tool_call. */
export declare function classifyPatchEffectiveness(event: unknown, stage: L3TriggerStage): {
    status: PatchEffective;
    messagesLen: number;
};
interface CumulativeCounters {
    /** Total tokens saved by L3 compression (sum of max(0, before-after)). */
    totalTokensSaved: number;
    /** Net savings after subtracting fixed patch cost from each trigger. */
    totalNetTokensSaved: number;
    /** Total number of after_tool_call events observed (incl. heartbeats/skips). */
    totalToolCalls: number;
    /** Total number of L3 trigger reports emitted across all stages. */
    totalL3Triggers: number;
    /** Per-stage L3 trigger counts. */
    totalL3TriggersByStage: Record<L3TriggerStage, number>;
    /** Total messages deleted by aggressive compression. */
    totalAggressiveDeleted: number;
    /** Total messages replaced by mild compression. */
    totalMildReplaced: number;
    /** Total emergency compression triggers. */
    totalEmergencyTriggered: number;
    /** Total messages deleted by emergency compression. */
    totalEmergencyDeleted: number;
    /** Timestamp when counters started accumulating. */
    startedAt: string;
}
/**
 * Record a tool-call observation. Called from the `after_tool_call` hook
 * entry regardless of whether L3 compression fires — it counts *all* tool
 * invocations the plugin has seen.
 */
export declare function recordToolCall(): void;
/** Returns a shallow copy of the current cumulative counters. */
export declare function getCumulativeCounters(): CumulativeCounters;
/** Testing hook — wipes counters so unit tests stay isolated. */
export declare function _resetCumulativeCountersForTests(): void;
/** Stable report type tag — one line per reporting category. */
export declare const REPORT_TYPE_L3: "offload.l3.trigger";
/** Per-L3-trigger report payload. */
export interface L3TriggerReport {
    reportType: typeof REPORT_TYPE_L3;
    reportedAt: string;
    sessionKey: string | null;
    stage: L3TriggerStage;
    triggerReason: string;
    pluginState: {
        activeMmdFile: string | null;
        l15Settled: boolean;
        pendingCount: number;
        confirmedOffloadCount: number;
        deletedOffloadCount: number;
    };
    /** Detailed accounting for THIS trigger only. */
    recent: {
        tokensBefore: number;
        tokensAfter: number;
        tokensSaved: number;
        netTokensSaved: number;
        messagesBefore: number;
        messagesAfter: number;
        messagesRemoved: number;
        durationMs: number;
    };
    /** Threshold context so the report is self-describing. */
    thresholds: {
        contextWindow: number;
        mildThreshold: number;
        aggressiveThreshold: number;
        fixedPatchCostTokens: number;
        utilisationBeforePct: number;
        utilisationAfterPct: number;
    };
    compression: {
        aboveMild: boolean;
        aboveAggressive: boolean;
        mildReplacedCount: number;
        aggressiveDeletedCount: number;
        emergencyTriggered: boolean;
        emergencyDeletedCount: number;
    };
    /** Process-lifetime cumulative counters (not per-report). */
    cumulative: CumulativeCounters;
    patch: {
        status: PatchEffective;
        messagesLen: number;
    };
}
export interface BuildL3ReportInput {
    stage: L3TriggerStage;
    triggerReason: string;
    stateManager: OffloadStateManager;
    event?: unknown;
    contextWindow: number;
    mildThreshold: number;
    aggressiveThreshold: number;
    tokensBefore: number;
    tokensAfter: number;
    /** Message count before L3 compression ran. */
    messagesBefore: number;
    /** Message count after L3 compression ran. */
    messagesAfter: number;
    durationMs: number;
    aboveMild: boolean;
    aboveAggressive: boolean;
    mildReplacedCount?: number;
    aggressiveDeletedCount?: number;
    emergencyTriggered?: boolean;
    emergencyDeletedCount?: number;
}
export declare function buildL3TriggerReport(input: BuildL3ReportInput): L3TriggerReport;
/**
 * Fire-and-forget upload of an L3 report to the backend store endpoint.
 * Must never throw — rejection is logged at warn level only.
 */
export declare function reportL3Trigger(backendClient: BackendClient | null, report: L3TriggerReport, logger: PluginLogger): void;
export {};
//# sourceMappingURL=state-reporter.d.ts.map