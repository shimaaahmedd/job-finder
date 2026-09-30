"use client";

import { useStartPipeline } from "@/hooks/useStartPipeline";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { PipelineRunStatus } from "@/types/pipeline";

export function RunPipelineButton() {
    const { mutate: startPipeline, isPending } = useStartPipeline();
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
            {isMine && status?.status === PipelineRunStatus.Failed && (
                <p>Error: {status.error}</p>
            )}
        </div>
    );
}
