/**
 * Resolve the effective user ID. Priority:
 *   1. `configuredUserId` from plugin config (trimmed, non-empty)
 *   2. Primary non-loopback IPv4 address of the host
 *   3. Literal `"unknown-host"` fallback
 *
 * Result and source are cached — subsequent calls are O(1).
 */
export declare function resolveUserId(configuredUserId?: string | null): string;
/** Returns how the currently-cached user id was resolved (or null if unresolved). */
export declare function getUserIdSource(): "config" | "ip" | "fallback" | null;
/** Testing hook: wipe the cache so the next resolve() re-evaluates. */
export declare function _resetUserIdCacheForTests(): void;
//# sourceMappingURL=user-id.d.ts.map