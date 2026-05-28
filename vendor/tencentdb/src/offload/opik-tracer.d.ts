/**
 * Opik observability tracer for context offload plugin.
 * Wraps the opik npm package with graceful degradation when not installed.
 */
import type { PluginLogger } from "./types.js";
export declare function initOffloadOpikTracer(openClawConfig: Record<string, unknown>, logger: PluginLogger): void;
export declare function traceOffloadDecision(params: {
    sessionKey?: string | null;
    stage: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    logger?: PluginLogger;
}): void;
/**
 * Trace a full messages snapshot — used for debugging message state at key points.
 * Creates a separate "messages-snapshot" category trace.
 */
export declare function traceMessagesSnapshot(params: {
    sessionKey?: string | null;
    stage: string;
    messages: any[];
    label?: string;
    extra?: Record<string, unknown>;
    logger?: PluginLogger;
}): void;
export declare function traceOffloadModelIo(params: {
    sessionKey?: string | null;
    stage: string;
    provider?: string;
    model: string;
    url: string;
    systemPrompt: string;
    userPrompt: string;
    responseContent: string;
    usage?: Record<string, unknown>;
    status: "ok" | "error";
    errorMessage?: string;
    durationMs: number;
    logger?: PluginLogger;
}): void;
//# sourceMappingURL=opik-tracer.d.ts.map