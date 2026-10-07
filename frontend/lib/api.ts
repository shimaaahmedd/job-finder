import { ApplicationStatus, Job, JobStatus, Paginated } from "@/types/job";
import type { PipelineState, StartPipelineResponse } from "@/types/pipeline";
import ky from "ky";

/**
 * Typed client for the backend API. All requests go through here.
 */

// Backend base URL, e.g. http://localhost:3000. NEXT_PUBLIC_ vars are inlined
// at build time, so changing it requires restarting `next dev` / rebuilding.
const prefix = process.env.NEXT_PUBLIC_API_URL;

if (!prefix) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
}

const kyClient = ky.create({ prefix });

/** Filters/pagination for GET /api/jobs. Omitted fields use the server defaults. */
export interface GetJobOptions {
    status?: JobStatus;
    applicationStatus?: ApplicationStatus;
    active?: boolean;
    limit?: number;
    offset?: number;
}

/** GET /api/jobs — one page of jobs; omitted filters match everything. */
export const getJobs = async ({
    status,
    applicationStatus,
    active,
    limit,
    offset,
}: GetJobOptions = {}): Promise<Paginated<Job>> => {
    return kyClient
        .get("api/jobs", {
            searchParams: { status, applicationStatus, active, limit, offset },
        })
        .json<Paginated<Job>>();
};

/** POST /api/pipeline — start a run in the background. */
export const startPipeline = async (
    discovery = true
): Promise<StartPipelineResponse> => {
    return kyClient
        .post("api/pipeline", { json: { discovery } })
        .json<StartPipelineResponse>();
};

/** GET /api/pipeline/status — state of the current or last run. */
export const getPipelineStatus = async (): Promise<PipelineState> => {
    return kyClient.get("api/pipeline/status").json<PipelineState>();
};

/**
 * PATCH /api/jobs/:id — set a job's application status; returns the updated job.
 * Errors (400/404/500) throw a ky HTTPError instead of resolving.
 */
export const markJobAs = async (
    jobId: string,
    applicationStatus: ApplicationStatus
): Promise<{ status: "success"; data: Job }> => {
    return kyClient
        .patch(`api/jobs/${jobId}`, { json: { applicationStatus } })
        .json<{ status: "success"; data: Job }>();
};

/** PATCH /api/jobs/:id/close — mark a job expired; returns the updated job. */
export const markAsClosedJob = async (
    jobId: string
): Promise<{ status: "success"; data: Job }> => {
    return kyClient
        .patch(`api/jobs/${jobId}/close`)
        .json<{ status: "success"; data: Job }>();
};
