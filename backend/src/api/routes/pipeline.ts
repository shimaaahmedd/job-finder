import { Router } from "express";
import { getPipelineState, startPipeline } from "../../pipeline/pipelineRunner";
import { StartOutcome } from "../../types/pipeline";

/**
 * Pipeline management endpoints.
 */
const router = Router();

// POST /api/pipeline — start a run (or report that one is already in flight).
// Returns 202 immediately with the run state plus `alreadyRunning`. A discovery
// run inside the cooldown gets 429 with Retry-After and `retryAfterMs`.
router.post("/", (req, res) => {
    const discovery = req.body?.discovery ?? true;
    if (typeof discovery !== "boolean") {
        return res
            .status(400)
            .json({ status: "error", message: "discovery must be a boolean" });
    }
    const result = startPipeline(discovery);

    if (result.outcome === StartOutcome.CoolingDown) {
        res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000));
        return res.status(429).json({
            status: "error",
            message: "Discovery is cooling down",
            retryAfterMs: result.retryAfterMs,
        });
    }

    res.status(202).json({
        ...getPipelineState(),
        alreadyRunning: result.outcome === StartOutcome.AlreadyRunning,
    });
});

// GET /api/pipeline/status — poll this for progress.
router.get("/status", (_req, res) => {
    res.status(200).json(getPipelineState());
});

export default router;
