import { Router } from "express";
import { listResumeSummaries } from "../../db/resumeRepository";

/**
 * Resume management endpoints.
 */
const router = Router();

// TODO: POST   /api/resumes      — upload / register a new resume
// TODO: DELETE /api/resumes/:id  — remove a resume

// GET /api/resumes — list the active resume version for each label.
router.get("/", async (_req, res) => {
    try {
        res.status(200).json(await listResumeSummaries());
    } catch (error) {
        console.error("Failed to load resumes:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to load resumes",
        });
    }
});

export default router;
