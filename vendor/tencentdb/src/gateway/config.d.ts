/**
 * TDAI Gateway — Configuration management.
 *
 * Reads gateway configuration from:
 * 1. `tdai-gateway.yaml` (or JSON) in CWD or data dir
 * 2. Environment variables (override individual fields)
 *
 * Minimal config: just LLM API credentials. Everything else has sensible defaults.
 */
import type { MemoryTdaiConfig } from "../config.js";
import type { StandaloneLLMConfig } from "../adapters/standalone/llm-runner.js";
export interface GatewayConfig {
    server: {
        port: number;
        host: string;
        /**
         * Optional API token for HTTP authentication.
         *
         * When set (non-empty string), every route except `GET /health` and CORS
         * preflight (`OPTIONS *`) requires an `Authorization: Bearer <apiKey>`
         * header. Requests without a valid token receive HTTP 401.
         *
         * **Default: undefined** — authentication is disabled, all routes are
         * open (preserves legacy behaviour). A WARN is emitted at startup if the
         * gateway binds to a non-loopback host without an API key set, to avoid
         * silently exposing an unauthenticated endpoint to the network.
         *
         * env: `TDAI_GATEWAY_API_KEY`
         * yaml: `server.apiKey`
         */
        apiKey?: string;
        /**
         * Optional CORS allow-list.
         *
         * When empty (default), the gateway sends **no** `Access-Control-Allow-*`
         * headers and rejects CORS preflight (`OPTIONS`) with 403 if an `Origin`
         * header is present — browsers will then block all cross-origin requests
         * via same-origin policy.
         *
         * When set, each request's `Origin` is matched against this list and
         * `Access-Control-Allow-Origin` is echoed back only on match. Use the
         * single entry `"*"` to restore the legacy permissive behaviour (only
         * appropriate for local development).
         *
         * env: `TDAI_CORS_ORIGINS` (comma-separated)
         * yaml: `server.corsOrigins` (string[])
         */
        corsOrigins: string[];
    };
    data: {
        /** Base directory for TDAI data storage. */
        baseDir: string;
    };
    llm: StandaloneLLMConfig;
    /** Parsed memory-tdai plugin config (recall, capture, extraction, pipeline, etc.). */
    memory: MemoryTdaiConfig;
}
/**
 * Load gateway config from file + environment variables.
 *
 * Resolution order for config file:
 * 1. `TDAI_GATEWAY_CONFIG` env var (explicit path)
 * 2. `./tdai-gateway.yaml` or `./tdai-gateway.json` in CWD
 * 3. `<dataDir>/tdai-gateway.yaml` or `<dataDir>/tdai-gateway.json`
 * 4. Pure environment-variable config (no file)
 */
export declare function loadGatewayConfig(overrides?: Partial<GatewayConfig>): GatewayConfig;
//# sourceMappingURL=config.d.ts.map