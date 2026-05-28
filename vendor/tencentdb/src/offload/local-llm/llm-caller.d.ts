import type { PluginLogger } from "../types.js";
export interface LlmCallerConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    timeoutMs: number;
}
export interface CallLlmOpts {
    systemPrompt: string;
    userPrompt: string;
    /** Override temperature for this call */
    temperature?: number;
    /** Override timeout for this call */
    timeoutMs?: number;
    /** Label for logging (e.g. "L1", "L1.5", "L2") */
    label?: string;
}
/**
 * Call LLM with the given prompts and return the text response.
 * Throws on timeout or API errors.
 */
export declare function callLlm(config: LlmCallerConfig, opts: CallLlmOpts, logger?: PluginLogger): Promise<string>;
//# sourceMappingURL=llm-caller.d.ts.map