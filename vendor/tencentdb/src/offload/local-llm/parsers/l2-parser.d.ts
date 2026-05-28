export interface L2ParsedResponse {
    fileAction: "write" | "replace";
    mmdContent?: string;
    replaceBlocks?: Array<{
        startLine: number;
        endLine: number;
        content: string;
    }>;
    nodeMapping: Record<string, string>;
}
/**
 * Parse L2 LLM response into structured L2 result.
 * Returns null if parsing fails completely.
 */
export declare function parseL2Response(raw: string): L2ParsedResponse | null;
//# sourceMappingURL=l2-parser.d.ts.map