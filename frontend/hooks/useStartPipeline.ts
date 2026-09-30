import { startPipeline } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Mutation that starts a pipeline run (no-op on the server if one is running).
 * Call `mutate(true)` to fetch from Apify, `mutate(false)` to only resume DB jobs.
 */
export function useStartPipeline() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (discovery: boolean) => startPipeline(discovery),
        // The 202 response already carries the new "running" state, so use it
        // immediately and polling starts without waiting for another request.
        onSuccess: (data) =>
            queryClient.setQueryData(queryKeys.pipelineStatus, data),
    });
}
