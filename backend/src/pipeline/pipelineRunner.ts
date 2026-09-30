import { PipelineRunStatus, PipelineState } from "../types/pipeline";
import { runPipeline } from "./runPipeline";

/**
 * In-process runner around runPipeline: lets the API kick off a run without
 * waiting for it, and exposes its progress for polling.
 *
 * State lives in module memory, so it resets on server restart and isn't
 * shared across multiple server processes.
 */

/** The run currently executing, or null when idle. Guards against overlap. */
let inFlightRun: Promise<void> | null = null;

/** Status of the current or most recent run, served by GET /api/pipeline/status. */
let state: PipelineState = {
    status: PipelineRunStatus.Idle,
    startedAt: null,
    finishedAt: null,
    discovery: null,
    error: null,
};

/** Snapshot of the current or most recent run. */
export function getPipelineState(): PipelineState {
    return state;
}

/**
 * Starts a run in the background. Returns immediately.
 * If a run is already in flight, does nothing (single-flight).
 */
export function startPipeline(discovery: boolean = true): { started: boolean } {
    if (inFlightRun) {
        return { started: false };
    }

    state = {
        status: PipelineRunStatus.Running,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        discovery,
        error: null,
    };

    inFlightRun = runPipeline(discovery)
        .then(() => {
            state = {
                ...state,
                status: PipelineRunStatus.Completed,
                finishedAt: new Date().toISOString(),
            };
        })
        .catch((error) => {
            console.error("Pipeline run failed:", error);
            state = {
                ...state,
                status: PipelineRunStatus.Failed,
                finishedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        })
        .finally(() => {
            inFlightRun = null;
        });

    return { started: true };
}
