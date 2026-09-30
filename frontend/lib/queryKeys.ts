import { GetJobOptions } from "@/lib/api";

/**
 * React Query cache keys, kept in one place so reads and invalidations agree.
 * Every jobs key starts with "jobs", so invalidating ["jobs"] refreshes all
 * filters and pages at once.
 */
export const queryKeys = {
    jobs: (options?: GetJobOptions) => ["jobs", options] as const,
    pipelineStatus: ["pipeline", "status"] as const,
};
