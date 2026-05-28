/**
 * OpenClawLLMRunner — wraps the existing CleanContextRunner as a host-neutral LLMRunner.
 *
 * This is a compatibility bridge: TDAI Core modules (L1 extractor, L2 scene extractor,
 * L3 persona generator, L1 dedup) can depend on the `LLMRunner` interface, while
 * OpenClaw continues to use its native `runEmbeddedPiAgent` mechanism under the hood.
 *
 * Usage:
 *   const factory = new OpenClawLLMRunnerFactory({ config, agentRuntime, logger });
 *   const runner = factory.createRunner({ modelRef: "openai/gpt-4o", enableTools: true });
 *   const result = await runner.run({ prompt: "...", taskId: "l1-extraction" });
 */
import { CleanContextRunner } from "../../utils/clean-context-runner.js";
import type { EmbeddedAgentRuntimeLike } from "../../utils/clean-context-runner.js";
import type { LLMRunner, LLMRunParams, LLMRunnerFactory, LLMRunnerCreateOptions, Logger } from "../../core/types.js";
/**
 * LLMRunner implementation backed by CleanContextRunner.
 *
 * Each instance is configured with a fixed model + tools setting.
 * Create via `OpenClawLLMRunnerFactory.createRunner()`.
 */
export declare class OpenClawLLMRunner implements LLMRunner {
    private runner;
    constructor(runner: CleanContextRunner);
    run(params: LLMRunParams): Promise<string>;
}
export interface OpenClawLLMRunnerFactoryOptions {
    /** OpenClaw config object (passed to CleanContextRunner). */
    config: unknown;
    /** Preferred embedded agent runtime (host-injected). */
    agentRuntime?: EmbeddedAgentRuntimeLike;
    /** Logger for runner tracing. */
    logger?: Logger;
}
/**
 * Factory that creates OpenClawLLMRunner instances.
 *
 * Encapsulates the OpenClaw-specific dependencies (config, agentRuntime)
 * so that callers only need to specify model + tools.
 */
export declare class OpenClawLLMRunnerFactory implements LLMRunnerFactory {
    private config;
    private agentRuntime?;
    private logger?;
    constructor(opts: OpenClawLLMRunnerFactoryOptions);
    createRunner(opts?: LLMRunnerCreateOptions): LLMRunner;
}
//# sourceMappingURL=llm-runner.d.ts.map