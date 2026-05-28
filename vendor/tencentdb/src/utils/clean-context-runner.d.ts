/**
 * CleanContextRunner: executes LLM calls in a fully isolated context
 * using runEmbeddedPiAgent (same mechanism as the llm-task extension).
 *
 * Guarantees:
 * 1. Blank conversation history (temporary session file)
 * 2. Independent system prompt (only the task prompt)
 * 3. No tool calls (tools restricted to minimal read-only set to avoid empty tools[] rejection by some providers)
 * 4. No contamination from the main agent's context
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
interface RunnerLogger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
type RunEmbeddedPiAgentFn = OpenClawPluginApi["runtime"]["agent"]["runEmbeddedPiAgent"];
export interface EmbeddedAgentRuntimeLike {
    runEmbeddedPiAgent?: RunEmbeddedPiAgentFn;
}
export declare function setPreferredEmbeddedAgentRuntime(agentRuntime: EmbeddedAgentRuntimeLike | undefined): void;
/**
 * Pre-warm the embedded agent import. Call this during plugin init to avoid
 * the cold-start penalty on the first actual extraction run.
 * Returns immediately (fire-and-forget) — errors are swallowed.
 */
export declare function prewarmEmbeddedAgent(logger?: RunnerLogger, agentRuntime?: EmbeddedAgentRuntimeLike): void;
/** Parsed model reference: { provider, model } */
export interface ModelRef {
    provider: string;
    model: string;
}
/**
 * Parse a "provider/model" string into its components.
 * Returns undefined if the input is empty or doesn't contain a "/".
 *
 * Examples:
 *   "azure/gpt-5.2-chat"          → { provider: "azure", model: "gpt-5.2-chat" }
 *   "custom-host/org/model-v2"    → { provider: "custom-host", model: "org/model-v2" }
 *   ""                            → undefined
 *   "bare-model-name"             → undefined (no "/" — may be an alias)
 */
export declare function parseModelRef(raw: string | undefined): ModelRef | undefined;
/**
 * Resolve the user's default model from the main OpenClaw config.
 *
 * Resolution order:
 * 1. Read `agents.defaults.model` (string or { primary })
 * 2. If the value contains "/", parse directly
 * 3. If not (may be an alias), look up in `agents.defaults.models` alias table
 * 4. Return undefined if nothing resolves — let the core use its built-in default
 */
export declare function resolveModelFromMainConfig(config: unknown): ModelRef | undefined;
export interface CleanContextRunnerOptions {
    config: unknown;
    provider?: string;
    model?: string;
    /**
     * Convenience field: full "provider/model" string.
     * Takes precedence over separate `provider`/`model` fields.
     * When all three (modelRef, provider, model) are omitted,
     * automatically falls back to the main config's `agents.defaults.model`.
     */
    modelRef?: string;
    /** Preferred runtime seam. When absent, falls back to the legacy dist bridge. */
    agentRuntime?: EmbeddedAgentRuntimeLike;
    /** Allow the LLM to use tools (read_file, write_to_file, etc). Default: false */
    enableTools?: boolean;
    /** Logger instance for detailed tracing */
    logger?: RunnerLogger;
}
export declare class CleanContextRunner {
    private options;
    private logger;
    /** Resolved provider after modelRef / config fallback */
    private resolvedProvider;
    /** Resolved model after modelRef / config fallback */
    private resolvedModel;
    constructor(options: CleanContextRunnerOptions);
    /**
     * Run a prompt in a fully isolated clean context.
     * Returns the LLM's text output.
     *
     * When `workspaceDir` is provided it overrides the default `process.cwd()`,
     * letting the LLM's file-tool calls resolve paths relative to a custom root.
     */
    run(params: {
        prompt: string;
        /** Optional system prompt. When provided, `prompt` is used as the user message. */
        systemPrompt?: string;
        taskId: string;
        timeoutMs?: number;
        maxTokens?: number;
        workspaceDir?: string;
        /** Plugin instance ID for llm_call metric (optional) */
        instanceId?: string;
    }): Promise<string>;
}
export {};
//# sourceMappingURL=clean-context-runner.d.ts.map