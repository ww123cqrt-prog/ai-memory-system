/**
 * OpenClawHostAdapter — translates OpenClaw's plugin API into TDAI Core's
 * unified HostAdapter interface.
 *
 * This is the "thin shell" that keeps OpenClaw-specific dependencies
 * (OpenClawPluginApi, pluginConfig, resolveStateDir, event system)
 * confined to the adapter layer while TDAI Core remains host-neutral.
 *
 * Usage (in index.ts):
 *   const adapter = new OpenClawHostAdapter({ api, pluginDataDir, config });
 *   const core = new TdaiCore({ hostAdapter: adapter, config: parsedConfig });
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { HostAdapter, RuntimeContext, Logger, LLMRunnerFactory } from "../../core/types.js";
export interface OpenClawHostAdapterOptions {
    /** OpenClaw plugin API instance. */
    api: OpenClawPluginApi;
    /** Resolved plugin data directory (e.g. ~/.openclaw/state/memory-tdai). */
    pluginDataDir: string;
    /** Parsed OpenClaw config (for LLM model resolution). */
    openclawConfig: unknown;
}
export declare class OpenClawHostAdapter implements HostAdapter {
    readonly hostType: "openclaw";
    private api;
    private pluginDataDir;
    private openclawConfig;
    private runnerFactory;
    constructor(opts: OpenClawHostAdapterOptions);
    /**
     * Build a RuntimeContext from the current OpenClaw session.
     *
     * In OpenClaw, sessionKey and sessionId come from the event/ctx objects
     * passed to hooks. This method returns a context with sensible defaults;
     * callers can override sessionKey/sessionId per-hook invocation using
     * `buildRuntimeContextForSession()`.
     */
    getRuntimeContext(): RuntimeContext;
    /**
     * Build a RuntimeContext for a specific session (used per-hook).
     *
     * This is an OpenClaw-specific convenience that merges session-level
     * identifiers from hook ctx into the base context.
     */
    buildRuntimeContextForSession(sessionKey: string, sessionId?: string): RuntimeContext;
    getLogger(): Logger;
    getLLMRunnerFactory(): LLMRunnerFactory;
    /** Get the raw OpenClaw plugin API (for legacy callers during migration). */
    getPluginApi(): OpenClawPluginApi;
    /** Get the OpenClaw config object (for legacy callers during migration). */
    getOpenClawConfig(): unknown;
    /** Get the resolved plugin data directory. */
    getPluginDataDir(): string;
}
//# sourceMappingURL=host-adapter.d.ts.map