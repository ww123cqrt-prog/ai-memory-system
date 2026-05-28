import type { OffloadStateManager } from "../state-manager.js";
import type { PluginConfig, PluginLogger } from "../types.js";
export declare function createBeforePromptBuildHandler(stateManager: OffloadStateManager, logger: PluginLogger, getContextWindow: (() => number) | undefined, pluginConfig: Partial<PluginConfig> | undefined): (event: any, _ctx: any) => Promise<undefined>;
//# sourceMappingURL=before-prompt-build.d.ts.map