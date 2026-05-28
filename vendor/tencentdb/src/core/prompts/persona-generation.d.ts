/**
 * Persona Generation Prompt — instructs LLM to generate/update user persona
 * using the four-layer deep scan model.
 *
 * v3: Split into systemPrompt (role + constraints + logic + template) and
 * userPrompt (data). Tool names aligned to OpenClaw actual API (write/edit).
 */
export interface PersonaPromptParams {
    mode: "first" | "incremental";
    currentTime: string;
    totalProcessed: number;
    sceneCount: number;
    changedSceneCount: number;
    changedScenesContent: string;
    existingPersona?: string;
    triggerInfo?: string;
    /** @deprecated Kept for call-site compatibility; no longer used in prompt. */
    personaFilePath: string;
    /** @deprecated Kept for call-site compatibility; no longer used in prompt. */
    checkpointPath: string;
}
export interface PersonaPromptResult {
    systemPrompt: string;
    userPrompt: string;
}
export declare function buildPersonaPrompt(params: PersonaPromptParams): PersonaPromptResult;
//# sourceMappingURL=persona-generation.d.ts.map