import { Router } from "express";
import { getActiveResumes } from "../../db/resumeRepository";

/**
 * Resume management endpoints.
 */
const router = Router();

// TODO: POST   /api/resumes      — upload / register a new resume
// TODO: DELETE /api/resumes/:id  — remove a resume

// GET /api/resumes — list the active resume version for each label.
router.get("/", async (_req, res) => {
    const resumes = await getActiveResumes();
    res.status(200).json(resumes);
});

export default router;
