import { Router } from "express";
import { getPipelineState, startPipeline } from "../../pipeline/pipelineRunner";

/**
 * Pipeline management endpoints.
 */
const router = Router();

// POST /api/pipeline — start a run (or report that one is already in flight).
// Returns 202 immediately with the run state plus `alreadyRunning`.
router.post("/", (req, res) => {
    const discovery = req.body?.discovery ?? true;
    if (typeof discovery !== "boolean") {
        return res
            .status(400)
            .json({ status: "error", message: "discovery must be a boolean" });
    }
    const { started } = startPipeline(discovery);
    res.status(202).json({
        ...getPipelineState(),
        alreadyRunning: !started,
    });
});

// GET /api/pipeline/status — poll this for progress.
router.get("/status", (_req, res) => {
    res.status(200).json(getPipelineState());
});

export default router;
