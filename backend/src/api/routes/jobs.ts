import { Router } from "express";
import { getJobsByStatus, updateJob } from "../../db/jobRepository";
import { JobStatus } from "../../types/job";

/**
 * Job listing and status endpoints.
 */
const router = Router();

// TODO: GET    /api/jobs/:id        — fetch a single job
// TODO: DELETE /api/jobs/rejected   — clear all rejected jobs

// GET /api/jobs?status=&limit=&offset= — list jobs in one status, or every
// job when status is omitted. Returns { items, total }.
router.get("/", async (req, res) => {
    try {
        const status = (req.query.status as JobStatus) || undefined;
        const limit = Number(req.query.limit);
        const offset = Number(req.query.offset);
        const jobs = await getJobsByStatus(status, limit, offset);
        res.status(200).json(jobs);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch jobs",
        });
    }
});

// PATCH /api/jobs/:id — update a job's status and/or pipeline fields.
// Body uses updateJob's camelCase keys, e.g. { "status": "applied" }.
router.patch("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const job = await updateJob(id, req.body);
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

export default router;
