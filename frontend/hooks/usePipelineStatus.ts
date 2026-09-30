import { getPipelineStatus } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { PipelineRunStatus } from "@/types/pipeline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Current pipeline run state. Polls while a run is active and refreshes the
 * jobs list once the run finishes, so new results show up on their own.
 */
export function usePipelineStatus() {
    const queryClient = useQueryClient();
    // Status from the previous render, to spot the running -> done transition.
    const previous = useRef<PipelineRunStatus | undefined>(undefined);
    const query = useQuery({
        queryKey: queryKeys.pipelineStatus,
        queryFn: getPipelineStatus,
        // Poll every 2s only while a run is active.
        refetchInterval: (q) =>
            q.state.data?.status === PipelineRunStatus.Running ? 2000 : false,
    });

    const status = query.data?.status;

    // When a run stops (completed or failed), refresh the table.
    useEffect(() => {
        if (
            previous.current === PipelineRunStatus.Running &&
            status != PipelineRunStatus.Running
        ) {
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
        }

        previous.current = status;
    }, [status, queryClient]);

    return query;
}
