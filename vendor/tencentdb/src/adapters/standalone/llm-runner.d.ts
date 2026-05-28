/**
 * StandaloneLLMRunner — powered by Vercel AI SDK (`ai` + `@ai-sdk/openai`).
 *
 * This runner does NOT depend on OpenClaw's `runEmbeddedPiAgent`. It is designed
 * for the Hermes Gateway scenario where TDAI runs as an independent Node.js sidecar
 * without the OpenClaw host.
 *
 * Capabilities:
 * - `enableTools: false`: pure text output (L1 extraction, L1 dedup)
 * - `enableTools: true`: automatic tool-call loop with local file operations
 *   (L2 scene, L3 persona) via AI SDK's `maxSteps`
 *
 * Tool sandbox:
 *   When tools are enabled, three basic file operations are exposed:
 *   `read_file`, `write_to_file`, `replace_in_file`.
 *   All file paths are resolved relative to `workspaceDir`, enforcing sandbox boundaries.
 */
import type { LLMRunner, LLMRunParams, LLMRunnerFactory, LLMRunnerCreateOptions, Logger } from "../../core/types.js";
export interface StandaloneLLMConfig {
    /** OpenAI-compatible API base URL (e.g. "https://api.openai.com/v1"). */
    baseUrl: string;
    /** API key for authentication. */
    apiKey: string;
    /** Default model name (e.g. "gpt-4o"). */
    model: string;
    /** Default max output tokens. */
    maxTokens?: number;
    /** Request timeout in milliseconds (default: 120_000). */
    timeoutMs?: number;
}
export declare class StandaloneLLMRunner implements LLMRunner {
    private config;
    private model;
    private enableTools;
    private logger?;
    constructor(opts: {
        config: StandaloneLLMConfig;
        model?: string;
        enableTools?: boolean;
        logger?: Logger;
    });
    run(params: LLMRunParams): Promise<string>;
}
export interface StandaloneLLMRunnerFactoryOptions {
    /** LLM API configuration. */
    config: StandaloneLLMConfig;
    /** Logger instance. */
    logger?: Logger;
}
/**
 * Factory that creates StandaloneLLMRunner instances.
 *
 * Used by the Gateway and Hermes host adapters.
 */
export declare class StandaloneLLMRunnerFactory implements LLMRunnerFactory {
    private config;
    private logger?;
    constructor(opts: StandaloneLLMRunnerFactoryOptions);
    createRunner(opts?: LLMRunnerCreateOptions): LLMRunner;
}
//# sourceMappingURL=llm-runner.d.ts.map