import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getJobs, type GetJobOptions } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/** Fetch one page of jobs with the given filters. Cached per filter/page combo. */
export function useJobs(options: GetJobOptions = {}) {
    return useQuery({
        queryKey: queryKeys.jobs(options),
        queryFn: () => getJobs(options),
        placeholderData: keepPreviousData, // no empty flash between pages
    });
}
