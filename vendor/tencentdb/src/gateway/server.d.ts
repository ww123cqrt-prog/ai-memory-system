/**
 * TDAI Gateway — HTTP server for the Hermes sidecar.
 *
 * Exposes TDAI Core capabilities as HTTP endpoints:
 *   GET  /health              — Health check
 *   POST /recall              — Memory recall (prefetch)
 *   POST /capture             — Conversation capture (sync_turn)
 *   POST /search/memories     — L1 memory search
 *   POST /search/conversations — L0 conversation search
 *   POST /session/end         — Session end + flush
 *   POST /seed               — Batch seed historical conversations (L0 → L1)
 *
 * Built with Node.js native `http` module — no Express/Fastify dependency.
 * Designed to run as a managed sidecar alongside Hermes.
 */
import type { GatewayConfig } from "./config.js";
export declare class TdaiGateway {
    private config;
    private logger;
    private core;
    private server;
    private startTime;
    constructor(configOverrides?: Partial<GatewayConfig>);
    /**
     * Start the Gateway HTTP server.
     */
    start(): Promise<void>;
    /**
     * Emit a one-shot security posture summary at startup.
     *
     * Goals:
     *   1. Make the "auth disabled" state highly visible to anyone reading logs
     *      (this is the documented default, but operators must know it before
     *      they expose the port).
     *   2. Loudly warn when the gateway is bound to anything other than the
     *      loopback interface without an API key — that exact combination is
     *      what the security audit flagged as a real exposure.
     *   3. Never log the key itself.
     */
    private logSecurityPosture;
    /**
     * Gracefully stop the Gateway.
     */
    stop(): Promise<void>;
    private handleRequest;
    /**
     * Verify the `Authorization: Bearer <apiKey>` header against the configured
     * shared secret using a constant-time comparison.
     *
     * When `server.apiKey` is unset (`undefined`), this returns `true` without
     * inspecting the request — this is the documented default and matches the
     * pre-existing open behaviour. Operators are reminded of this at startup
     * via `logSecurityPosture`.
     *
     * Returns `false` (and writes 401) when the token is missing, malformed, or
     * does not match. Callers must short-circuit on `false`.
     */
    private checkAuth;
    /**
     * Echo `Access-Control-Allow-Origin` (and friends) only for whitelisted
     * origins. With no list configured we emit no CORS headers at all, which
     * makes the browser refuse the cross-origin request as desired.
     *
     * The single-entry list `["*"]` opts back into permissive CORS (development
     * use only; the startup log flags this loudly).
     */
    private applyCorsHeaders;
    private handleHealth;
    private handleRecall;
    private handleCapture;
    private handleSearchMemories;
    private handleSearchConversations;
    private handleSessionEnd;
    private handleSeed;
}
//# sourceMappingURL=server.d.ts.map