import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    redact: {
        paths: [
            "req.headers.authorization",
            'req.headers["x-api-key"]',
            "*.apiKey",
        ],
        censor: "[redacted]",
    },
    ...(isDev && {
        transport: { target: "pino-pretty", options: { colorize: true } },
    }),
});

export const Stage = {
    Discovery: "discovery",
    RuleGate: "rule_gate",
    Semantic: "semantic",
    Llm: "llm",
    Persist: "persist",
} as const;
