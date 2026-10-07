import { Router } from "express";
import { z } from "zod";
import {
    getJobsByStatus,
    markJobAsClosed,
    updateJob,
} from "../../db/jobRepository";
import { ApplicationStatus, JobStatus } from "../../types/job";

/**
 * Job listing and status endpoints.
 */
const router = Router();

/**
 * Allowed PATCH /api/jobs/:id body: only the fields a user may change.
 * Pipeline fields are written by the pipeline through updateJob directly.
 * Strict, so unknown keys (e.g. closedAt, set only via /close) are rejected.
 * appliedAt is left out on purpose: updateJob sets it from applicationStatus.
 */
const UpdateJobBodySchema = z.strictObject({
    applicationStatus: z.enum(ApplicationStatus),
});

/**
 * GET /api/jobs query. Query values arrive as strings (or undefined when
 * omitted), so numbers are coerced and missing limit/offset get defaults.
 * Not strict: extra params (e.g. cache-busters) are ignored, not a 400.
 */
const GetJobsQuerySchema = z.object({
    status: z.enum(JobStatus).optional(),
    applicationStatus: z.enum(ApplicationStatus).optional(),
    // Not z.coerce.boolean(): that turns "false" into true.
    active: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
});

// TODO: GET    /api/jobs/:id        — fetch a single job
// TODO: DELETE /api/jobs/rejected   — clear all rejected jobs

// GET /api/jobs?status=&applicationStatus=&active=&limit=&offset= — list jobs,
// filtered by any of status / applicationStatus / active (true = not closed,
// false = closed); omitted filters match everything. Returns { items, total }.
router.get("/", async (req, res) => {
    try {
        const parsed = GetJobsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                status: "error",
                message: "Invalid query parameters",
                errors: parsed.error.issues,
            });
        }
        const { status, applicationStatus, active, limit, offset } =
            parsed.data;
        const jobs = await getJobsByStatus(
            status,
            applicationStatus,
            active,
            limit,
            offset
        );
        res.status(200).json(jobs);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch jobs",
        });
    }
});

// PATCH /api/jobs/:id — set a job's application status.
// Body: { "applicationStatus": "applied" }. Anything else is a 400; an unknown
// id is a 404. Returns the updated job.
router.patch("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const parsed = UpdateJobBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                status: "error",
                message: "Invalid request body",
                errors: parsed.error.issues,
            });
        }
        const job = await updateJob(id, parsed.data);
        if (!job) {
            return res
                .status(404)
                .json({ status: "error", message: "Job not found" });
        }
        res.status(200).json({
            status: "success",
            data: job,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Failed to update job",
        });
    }
});

// PATCH /api/jobs/:id/close — mark a job closed ("expired" in the UI). Closing
// again keeps the first closed_at. An unknown id is a 404. Returns the updated job.
router.patch("/:id/close", async (req, res) => {
    try {
        const id = req.params.id;
        const job = await markJobAsClosed(id);
        if (!job) {
            return res
                .status(404)
                .json({ status: "error", message: "Job not found" });
        }
        res.status(200).json({
            status: "success",
            data: job,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Failed to close job",
        });
    }
});

export default router;
