/**
 * PersonaGenerator: generates or updates user persona using the four-layer
 * deep scan model via CleanContextRunner.
 */
import type { LLMRunner } from "../types.js";
interface Logger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
export declare class PersonaGenerator {
    private dataDir;
    private runner;
    private logger;
    private backupCount;
    private instanceId;
    constructor(opts: {
        dataDir: string;
        config: unknown;
        model?: string;
        backupCount?: number;
        logger?: Logger;
        /** Plugin instance ID for metric reporting (optional) */
        instanceId?: string;
        /**
         * Host-neutral LLM runner. When provided, used instead of creating
         * a CleanContextRunner (decouples from OpenClaw runtime).
         * Must be configured with `enableTools: true`.
         */
        llmRunner?: LLMRunner;
    });
    /**
     * Execute local persona generation without advancing checkpoint.
     */
    generateLocalPersona(triggerReason?: string): Promise<boolean>;
    /**
     * Backward-compatible wrapper: local generation + checkpoint advance.
     */
    generate(triggerReason?: string): Promise<boolean>;
}
export {};
//# sourceMappingURL=persona-generator.d.ts.map