import type { TaskJudgment } from "../../types.js";
/**
 * Parse L1.5 LLM response into TaskJudgment.
 * Returns null if the response is completely unparseable or all-null (backend unavailable).
 */
export declare function parseL15Response(raw: string): TaskJudgment | null;
//# sourceMappingURL=l15-parser.d.ts.map