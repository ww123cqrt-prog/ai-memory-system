/**
 * Estimate token count for a string without doing BPE encoding.
 * Targets cl100k_base (GPT-4/Claude/DeepSeek/GLM/MiniMax).
 * Error typically <5% for code/English, <10% for CJK/mixed.
 */
export declare function fastEstimateTokens(text: string): number;
/**
 * Estimate tokens for an array of messages (same as buildTiktokenContextSnapshot
 * but using fast estimation instead of tiktoken).
 */
export declare function fastEstimateMessages(messages: any[], jsonReplacer?: (key: string, value: unknown) => unknown): number;
//# sourceMappingURL=fast-token-estimate.d.ts.map