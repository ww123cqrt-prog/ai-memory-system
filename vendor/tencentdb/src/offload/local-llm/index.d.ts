import type { PluginLogger } from "../types.js";
import type { L1Request, L1Response, L15Request, L15Response, L2Request, L2Response } from "../backend-client.js";
export interface LocalLlmClientConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
    timeoutMs?: number;
}
export declare class LocalLlmClient {
    private config;
    private logger?;
    constructor(cfg: LocalLlmClientConfig, logger?: PluginLogger);
    l1Summarize(req: L1Request): Promise<L1Response>;
    l15Judge(req: L15Request): Promise<L15Response>;
    l2Generate(req: L2Request): Promise<L2Response>;
    /** No-op in local mode — state reporting requires a remote backend. */
    storeState(_payload: unknown): Promise<void>;
    /** L4 Skill generation is not supported in local mode. */
    l4Generate(_req: unknown): Promise<unknown>;
}
//# sourceMappingURL=index.d.ts.map