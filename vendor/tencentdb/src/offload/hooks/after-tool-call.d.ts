import type { OffloadStateManager } from "../state-manager.js";
import type { PluginConfig, PluginLogger } from "../types.js";
import type { BackendClient } from "../backend-client.js";
export declare function createAfterToolCallHandler(stateManager: OffloadStateManager, logger: PluginLogger, getContextWindow: (() => number) | undefined, pluginConfig: Partial<PluginConfig> | undefined, backendClient?: BackendClient | null): (event: any, ctx: any) => Promise<void>;
//# sourceMappingURL=after-tool-call.d.ts.map