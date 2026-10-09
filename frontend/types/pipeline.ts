/** Pipeline run types. Mirrors backend/src/types/pipeline.ts. */

/** State of a pipeline run (not a job's status). */
export const PipelineRunStatus = {
    Idle: "idle",
    Running: "running",
    Completed: "completed",
    Failed: "failed",
} as const;
export type PipelineRunStatus =
    (typeof PipelineRunStatus)[keyof typeof PipelineRunStatus];

export interface PipelineState {
    status: PipelineRunStatus;
    startedAt: string | null;
    finishedAt: string | null;
    /** true = fetched from Apify, false = resumed DB jobs only, null = no run yet. */
    discovery: boolean | null;
    error: string | null;
}

/** POST /api/pipeline response: the run state, plus whether one was already going. */
export interface StartPipelineResponse extends PipelineState {
    alreadyRunning: boolean;
}

/** POST /api/pipeline 429 body: discovery is cooling down. */
export interface PipelineCooldownError {
    status: "error";
    message: string;
    retryAfterMs: number;
}
