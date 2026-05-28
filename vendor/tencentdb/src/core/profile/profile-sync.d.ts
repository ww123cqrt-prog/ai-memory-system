import type { IMemoryStore, ProfileRecord } from "../store/types.js";
interface Logger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
export interface ProfileBaseline {
    version: number;
    contentMd5: string;
    createdAtMs: number;
}
export declare function buildProfileStableId(scope: string, type: "l2" | "l3", filename: string): string;
export declare function listLocalProfiles(dataDir: string): Promise<ProfileRecord[]>;
export declare function pullProfilesToLocal(dataDir: string, store: IMemoryStore, logger: Logger): Promise<Map<string, ProfileBaseline>>;
export declare function syncLocalProfilesToStore(dataDir: string, store: IMemoryStore, baselineMap: Map<string, ProfileBaseline>, logger: Logger): Promise<void>;
export declare function ensureL2L3Local(dataDir: string, store: IMemoryStore, logger: Logger): Promise<Map<string, ProfileBaseline>>;
export {};
//# sourceMappingURL=profile-sync.d.ts.map