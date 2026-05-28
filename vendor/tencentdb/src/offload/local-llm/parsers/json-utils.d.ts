/**
 * Tolerant JSON parsing utilities for LLM responses.
 *
 * LLMs often wrap JSON in markdown code fences, include trailing commas,
 * or prepend explanatory text. These utilities handle common deviations.
 */
/**
 * Extract JSON from LLM output — handles code fences, prefix text, etc.
 * Returns the parsed object/array, or null if parsing fails.
 */
export declare function extractJson<T = unknown>(raw: string): T | null;
/**
 * Extract mermaid content from a code fence.
 * Returns the raw mermaid text (without fence markers).
 */
export declare function extractMermaidFromFence(text: string): string | null;
//# sourceMappingURL=json-utils.d.ts.map