import { Router } from "express";
import { getPipelineState, startPipeline } from "../../pipeline/pipelineRunner";
import { StartOutcome } from "../../types/pipeline";

/**
 * Pipeline management endpoints.
 */
const router = Router();

// POST /api/pipeline: start a run (or report that one is already in flight).
// Body must include `discovery` (boolean): true fetches from Apify (paid),
// false only resumes jobs already in the DB. Returns 202 with the run state
// plus `alreadyRunning`. A discovery run inside the cooldown gets 429 with
// Retry-After (seconds) and `retryAfterMs`.
router.post("/", (req, res) => {
    const discovery = req.body?.discovery;
    if (typeof discovery !== "boolean") {
        res.status(400).json({
            status: "error",
            message: "discovery must be a boolean",
        });
        return;
    }

    const result = startPipeline(discovery);

    if (result.outcome === StartOutcome.CoolingDown) {
        res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000));
        res.status(429).json({
            status: "error",
            message: "Discovery is cooling down",
            retryAfterMs: result.retryAfterMs,
        });
        return;
    }

    res.status(202).json({
        ...getPipelineState(),
        alreadyRunning: result.outcome === StartOutcome.AlreadyRunning,
    });
});

// GET /api/pipeline/status: poll this for progress.
router.get("/status", (_req, res) => {
    res.status(200).json(getPipelineState());
});

export default router;
