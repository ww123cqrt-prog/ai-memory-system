/**
 * `openclaw memory-tdai seed` command definition.
 *
 * Responsibilities:
 * - Define CLI parameters and help text
 * - Interactive confirmation for timestamp auto-fill
 * - Output directory resolution and checkpoint detection
 * - Delegate to seed-runtime for actual execution
 */
import type { Command } from "commander";
import type { SeedCliContext } from "../index.ts";
/**
 * Register the `seed` subcommand under the memory-tdai CLI namespace.
 */
export declare function registerSeedCommand(parent: Command, ctx: SeedCliContext): void;
//# sourceMappingURL=seed.d.ts.map