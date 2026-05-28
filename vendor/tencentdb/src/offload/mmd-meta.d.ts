/**
 * MMD metadata parsing utility.
 * Extracted from prompts/l15.ts — pure data parsing, not a prompt.
 */
export interface MmdMeta {
    filename: string;
    path: string;
    taskGoal: string;
    createdTime: string | null;
    updatedTime: string | null;
    doneCount: number;
    doingCount: number;
    todoCount: number;
    nodeSummaries: Array<{
        nodeId: string;
        status: string;
        summary: string;
    }>;
}
export declare function parseMmdMeta(filename: string, mmdPath: string, content: string): MmdMeta;
//# sourceMappingURL=mmd-meta.d.ts.map