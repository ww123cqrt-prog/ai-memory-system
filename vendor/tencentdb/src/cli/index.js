/**
 * memory-tdai CLI entry point.
 *
 * Registers the `memory-tdai` namespace under the OpenClaw CLI and
 * wires up all subcommands (currently: `seed`).
 *
 * Integration path:
 *   index.ts → api.registerCli() → registerMemoryTdaiCli() → registerSeedCommand()
 */
import { registerSeedCommand } from "./commands/seed.js";
// ============================
// Top-level registration
// ============================
/**
 * Register all memory-tdai CLI subcommands under the given Commander program.
 *
 * This function is called by the plugin's `api.registerCli()` registrar.
 * It creates the `memory-tdai` namespace and delegates to individual
 * command registrars.
 *
 * @param program - The `memory-tdai` Commander command (already created by the registrar)
 * @param ctx - CLI context with config, state dir, and logger
 */
export function registerMemoryTdaiCli(program, ctx) {
    // Register subcommands
    registerSeedCommand(program, ctx);
    // Future: registerQueryCommand(program, ctx);
    // Future: registerStatsCommand(program, ctx);
}
//# sourceMappingURL=index.js.map