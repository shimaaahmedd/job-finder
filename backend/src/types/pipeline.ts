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

export const StartOutcome = {
    Started: "started",
    AlreadyRunning: "already_running",
    CoolingDown: "cooling_down",
} as const;

export type StartOutcome = (typeof StartOutcome)[keyof typeof StartOutcome];

/** What startPipeline returns: the outcome, plus the wait time when it is cooling down. */
export type StartResult =
    | { outcome: typeof StartOutcome.Started }
    | { outcome: typeof StartOutcome.AlreadyRunning }
    | { outcome: typeof StartOutcome.CoolingDown; retryAfterMs: number };
