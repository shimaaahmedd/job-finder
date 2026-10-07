import "dotenv/config";
import express, { type Application } from "express";
import jobsRouter from "./routes/jobs";
import searchRouter from "./routes/search";
import resumesRouter from "./routes/resumes";
import pipelineRouter from "./routes/pipeline";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger";

/**
 * Builds the Express application: middleware + mounted routes.
 * Kept separate from index.ts so it can be imported in tests without
 * actually binding to a port.
 */
export function createServer(): Application {
    const app = express();

    app.use(cors({ origin: process.env.FRONTEND_URL }));

    app.use(pinoHttp({ logger }));

    // Parse JSON request bodies into req.body.
    app.use(express.json());

    // Lightweight liveness check.
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    // Feature routes.
    app.use("/api/jobs", jobsRouter);
    app.use("/api/search", searchRouter);
    app.use("/api/resumes", resumesRouter);
    app.use("/api/pipeline", pipelineRouter);

    return app;
}
