# Memory bridge operation and scope

The bridge is one MCP server built from `src/bridge/src/mcp-server.ts` to `src/bridge/dist/mcp-server.js`. The root package and bridge workspace are two packages in one repository, not two running versions. The vendored TencentDB core is its implementation dependency; mem0 supplies integration references.

Codex native `memories` / `memories_v2` directories are separate from this bridge. This project reads Codex session sources and persists its own L0-L3 data in `MEMORY_DATA_DIR` (default `~/.memory-tdai`). It does not synchronize those native memory directories.

`restore-codex-history` diagnoses or repairs Codex thread catalog/provider/index visibility. It shares rollout files as a source with this project's Codex importer but does not build bridge memories or FTS indexes. Repairing one does not repair the other; do not rewrite history metadata for a bridge retrieval failure.

## Build and verification

Use Node 22.16 or later and the declared workspace dependencies. Install the vendored core's dependencies as required by its existing setup. Then run from the repository root:

```sh
npm run build
npm test --workspace=memory-bridge
npm run test:protocol --workspace=memory-bridge
```

The bridge uses read-only SQL pagination and primary-key lookup against the configured database. `user_id` and `agent_id` independently filter their respective session-key components before pagination or scoped FTS LIMIT. Mixed page layer arrays contain only entries from the returned combined page, with separate full layer counts.

Unscoped L1 search retains the existing semantic/hybrid core path. Scoped L1 search uses FTS because the core does not accept a scope filter; the response reports `fts`. `limit` bounds each layer separately. User/agent labels select records within the local store; they are not an authentication mechanism.

On initialization the bridge fills missing L0 FTS entries, using the core's tokenizer. It does not re-embed records, rewrite conversation content, or change L1 extraction. Direct daily imports update metadata and FTS in one transaction. A failed index write rolls back that import; repeated raw imports remain idempotent.

Before repairing a real database, take a SQLite online snapshot. Verify matching IDs and counts, FTS integrity, and unchanged source/vector fingerprints. An index-only repair does not prove semantic correctness of every stored memory.

Entity operations distinguish users, agents and runs. App entities are not stored, so their deletion is rejected. Bulk deletion remains explicitly unsupported, and `update_memory` currently updates L1 records. These limitations are not reported as success.

Rebuild output must be used by a newly connected MCP process. An existing client process may retain its loaded JavaScript until reconnection. Do not terminate unrelated clients as part of deployment.

This repair does not change native Codex memory stores, history metadata, LLM endpoints or nightly summary-generation behavior.
