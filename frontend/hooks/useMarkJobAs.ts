import { markJobAs } from "@/lib/api";
import type { ApplicationStatus, Job, Paginated } from "@/types/job";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Mutation that sets a job's application status. On success the returned job
 * replaces the old copy in every cached jobs page so the card updates at once,
 * then the jobs queries refetch since the job may no longer match the filter.
 */
export function useMarkJobAs() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            jobId,
            applicationStatus,
        }: {
            jobId: string;
            applicationStatus: ApplicationStatus;
        }) => markJobAs(jobId, applicationStatus),
        onSuccess: ({ data: updated }) => {
            queryClient.setQueriesData<Paginated<Job>>(
                { queryKey: ["jobs"] },
                (page) =>
                    page && {
                        ...page,
                        items: page.items.map((job) =>
                            job.id === updated.id ? updated : job
                        ),
                    }
            );
            return queryClient.invalidateQueries({ queryKey: ["jobs"] });
        },
    });
}
