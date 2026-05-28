/**
 * Scene navigation: generates a summary navigation section appended to persona.md.
 *
 * The navigation includes **absolute** file paths so the agent can directly
 * use read_file for on-demand scene loading (progressive disclosure).
 */
import type { SceneIndexEntry } from "./scene-index.js";
/**
 * Generate the scene navigation Markdown section.
 *
 * @param entries - Scene index entries
 * @param dataDir - Absolute path to the plugin data directory; when provided,
 *                  scene paths are rendered as absolute paths so the agent can
 *                  call read_file directly without path concatenation.
 */
export declare function generateSceneNavigation(entries: SceneIndexEntry[], dataDir?: string): string;
/**
 * Strip the scene navigation section from persona content.
 */
export declare function stripSceneNavigation(personaContent: string): string;
//# sourceMappingURL=scene-navigation.d.ts.map