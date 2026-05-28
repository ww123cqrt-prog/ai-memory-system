/**
 * PersonaTrigger: determines whether to trigger persona generation.
 * Implements the 5 trigger conditions from the legacy system.
 */
interface TriggerLogger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
export interface TriggerResult {
    should: boolean;
    reason: string;
}
export declare class PersonaTrigger {
    private dataDir;
    private interval;
    private logger;
    constructor(opts: {
        dataDir: string;
        interval: number;
        logger?: TriggerLogger;
    });
    shouldGenerate(): Promise<TriggerResult>;
    private hasSceneFiles;
    /**
     * Check whether persona.md has a non-empty body (excluding scene navigation).
     * Returns false if the file doesn't exist, is empty, or only contains
     * scene navigation (no actual persona content).
     */
    private hasPersonaBody;
}
export {};
//# sourceMappingURL=persona-trigger.d.ts.map