import {
    PipelineRunStatus,
    PipelineState,
    StartOutcome,
    StartResult,
} from "../types/pipeline";
import { getCooldownMs, getCooldownRemainingMs } from "./cooldown";
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
/**
 * When the last successful discovery run ended. Drives the cooldown; failed
 * runs don't set it, so a fixed config can be retried right away.
 */
let lastDiscoveryFinishedAt: Date | null = null;

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
 * If a run is already in flight, does nothing (single-flight). A discovery run
 * within the cooldown of the last successful one is refused with the wait time.
 */
export function startPipeline(discovery: boolean = true): StartResult {
    if (inFlightRun) {
        return { outcome: StartOutcome.AlreadyRunning };
    }

    if (discovery) {
        const retryAfterMs = getCooldownRemainingMs(
            lastDiscoveryFinishedAt,
            new Date(),
            getCooldownMs()
        );
        if (retryAfterMs > 0) {
            return { outcome: StartOutcome.CoolingDown, retryAfterMs };
        }
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

            if (discovery) lastDiscoveryFinishedAt = new Date();
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

    return { outcome: StartOutcome.Started };
}
