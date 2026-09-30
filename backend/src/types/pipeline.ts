/** State of a pipeline run as tracked by pipelineRunner (not a job's status). */
export const PipelineRunStatus = {
    Idle: "idle",
    Running: "running",
    Completed: "completed",
    Failed: "failed",
} as const;

export type PipelineRunStatus =
    (typeof PipelineRunStatus)[keyof typeof PipelineRunStatus];

/** What GET /api/pipeline/status returns. Timestamps are ISO strings. */
export interface PipelineState {
    status: PipelineRunStatus;
    startedAt: string | null;
    finishedAt: string | null;
    /** Whether the run fetched from Apify (true) or only resumed DB jobs (false); null before any run. */
    discovery: boolean | null;
    /** Error message when status is 'failed', else null. */
    error: string | null;
}
