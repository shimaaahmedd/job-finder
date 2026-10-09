import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";

const keysMatch = (provided: string, expected: string): boolean => {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    // timingSafeEqual throws if the lengths differ
    if (providedBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(providedBuffer, expectedBuffer);
};

export const requireApiKey = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const expectedKey = process.env.API_KEY;

    if (!expectedKey) {
        res.status(500).json({ error: "Server is not configured" });
        return;
    }

    const providedKey = req.header("x-api-key");

    if (!providedKey || !keysMatch(providedKey, expectedKey)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    next();
};
