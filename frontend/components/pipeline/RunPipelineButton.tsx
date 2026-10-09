"use client";

import { HTTPError } from "ky";
import { useStartPipeline } from "@/hooks/useStartPipeline";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { PipelineCooldownError, PipelineRunStatus } from "@/types/pipeline";

/** "Try again in N min" for a cooldown 429, or null for any other error. */
const getCooldownMessage = (error: Error | null): string | null => {
    if (!(error instanceof HTTPError) || error.response.status !== 429) {
        return null;
    }
    const data = error.data as PipelineCooldownError | undefined;
    if (!data?.retryAfterMs)
        return "Discovery is cooling down. Try again later.";
    const minutes = Math.ceil(data.retryAfterMs / 60_000);
    return `Discovery is cooling down. Try again in ${minutes} min.`;
};

export function RunPipelineButton() {
    const { mutate: startPipeline, isPending, error } = useStartPipeline();
    const cooldownMessage = getCooldownMessage(error);
    const { data: status } = usePipelineStatus();

    const isRunning = status?.status === PipelineRunStatus.Running;
    // Only reflect the run's state when this button started it.
    const isMine = status?.discovery === true;

    return (
        <div>
            <button
                type="button"
                onClick={() => startPipeline(true)}
                disabled={isPending || isRunning}
                className="cursor-pointer rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
            >
                {isRunning && isMine ? "Running..." : "Run Pipeline"}
            </button>
            {cooldownMessage && <p>{cooldownMessage}</p>}
            {isMine && status?.status === PipelineRunStatus.Failed && (
                <p>Error: {status.error}</p>
            )}
        </div>
    );
}
