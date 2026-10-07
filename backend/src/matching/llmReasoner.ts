import "dotenv/config";
import OpenAI from "openai";
import { JobLLMMatchResult, JobMatchResult } from "../types/job";
import { constructJobText } from "./jobText";
import { getResume } from "../db/resumeRepository";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { LLM_THRESHOLD } from "./constants";

/**
 * Matches jobs to resumes in two steps:
 *  1. The LLM acts as a strict auditor: it extracts requirements, quotes resume evidence,
 *     and flags environment mismatches. It does NOT produce the score.
 *  2. The score is computed deterministically in code from that audit, so it is
 *     consistent, tunable, and not inflated by the model's "transferable skills" bias.
 */

const OPENAI_MODEL = "gpt-4o-mini";
const CONCURRENCY = 5;

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your .env file.");
}

const openai = new OpenAI({ apiKey });

// ---------------------------------------------------------------------------
// Schema: what the LLM returns (an audit, not a score)
// ---------------------------------------------------------------------------

const RequirementSchema = z.object({
    requirement: z.string(),
    category: z.enum([
        "language",
        "framework",
        "years",
        "seniority",
        "degree",
        "domain",
        "location",
        "other",
    ]),
    mustHave: z.boolean(),
    // Short quote from the resume's work experience, or null if there is none.
    resumeEvidence: z.string().nullable(),
    status: z.enum(["met", "partial", "missing"]),
});

const LLMAuditSchema = z.object({
    requirements: z.array(RequirementSchema),
    // Does the resume's primary language/stack match the job's primary language/stack?
    primaryLanguageMatch: z.boolean(),
    seniorityGap: z.enum(["none", "one_level", "two_plus"]),
    // e.g. "Java-based apps required; resume is Node/TypeScript"
    environmentMismatches: z.array(z.string()),
    // One sentence, neutral tone.
    summary: z.string(),
});
type LLMAudit = z.infer<typeof LLMAuditSchema>;

type LLMResult = { score: number; reasoning: string };

// ---------------------------------------------------------------------------
// Scoring (tune these without touching the prompt)
// ---------------------------------------------------------------------------

const STATUS_VALUE = { met: 1, partial: 0.4, missing: 0 } as const;
const MUST_HAVE_WEIGHT = 3;
const NICE_TO_HAVE_WEIGHT = 1;

// Hard caps: these mean "not a fit", so they must stay below LLM_THRESHOLD.
const CAP_PRIMARY_LANGUAGE_MISMATCH = 0.3;
const CAP_SENIORITY_TWO_PLUS = 0.3;
const CAP_TWO_MISSING_MUST_HAVES = 0.35;
// Soft cap: limits how high the score can go, but the job can still pass.
const CAP_SENIORITY_ONE_LEVEL = 0.7;
const PENALTY_PER_ENV_MISMATCH = 0.05;

const computeScore = (audit: LLMAudit): number => {
    const weight = (r: { mustHave: boolean }) =>
        r.mustHave ? MUST_HAVE_WEIGHT : NICE_TO_HAVE_WEIGHT;

    const total =
        audit.requirements.reduce((sum, r) => sum + weight(r), 0) || 1;
    const earned = audit.requirements.reduce(
        (sum, r) => sum + weight(r) * STATUS_VALUE[r.status],
        0
    );

    let score = earned / total;

    if (!audit.primaryLanguageMatch) {
        score = Math.min(score, CAP_PRIMARY_LANGUAGE_MISMATCH);
    }
    if (audit.seniorityGap === "one_level") {
        score = Math.min(score, CAP_SENIORITY_ONE_LEVEL);
    }
    if (audit.seniorityGap === "two_plus") {
        score = Math.min(score, CAP_SENIORITY_TWO_PLUS);
    }

    const missingMustHaves = audit.requirements.filter(
        (r) => r.mustHave && r.status === "missing"
    ).length;
    if (missingMustHaves >= 2) {
        score = Math.min(score, CAP_TWO_MISSING_MUST_HAVES);
    }

    score -= PENALTY_PER_ENV_MISMATCH * audit.environmentMismatches.length;

    return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
};

/** Build the stored llmReasoning string (same field as before) from the audit. */
const buildReasoning = (audit: LLMAudit): string => {
    const parts = [audit.summary.trim()];

    const missing = audit.requirements
        .filter((r) => r.mustHave && r.status === "missing")
        .map((r) => r.requirement)
        .slice(0, 3);
    if (missing.length > 0) {
        parts.push(`Missing required: ${missing.join("; ")}.`);
    }

    if (audit.environmentMismatches.length > 0) {
        parts.push(
            `Mismatch: ${audit.environmentMismatches.slice(0, 3).join("; ")}.`
        );
    }

    return parts.join(" ");
};

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a strict job-fit auditor, not a recruiter. Do not be generous.
Rules:
- Evaluate each requirement in the job separately.
- Mark a requirement "met" ONLY if the resume shows it in actual work experience, and quote that evidence briefly in resumeEvidence.
- A skill that appears only in a skills list, with no role or project using it, is "partial".
- Do NOT credit transferable skills. For example, Node.js experience does not satisfy a Java requirement.
- If a requirement includes years of experience, compare it with the actual years in the work history.
- Set primaryLanguageMatch to false if the job's main required language or stack is not used in the resume's work experience.
- Compare the job's seniority level with the resume's total experience and titles.
- List every environment mismatch: primary language/stack, seniority, domain, onsite or location, work authorization.
- Ignore boilerplate (benefits, equal opportunity text, legal notices, buttons).`;

/** Remove trailing boilerplate that only adds noise to the model input. */
const stripBoilerplate = (jobText: string): string => {
    const cutMarkers = [
        "Additional Information",
        "Equal Opportunity Employer",
        "Privacy Notice",
    ];
    let end = jobText.length;
    for (const marker of cutMarkers) {
        const idx = jobText.indexOf(marker);
        if (idx > 0 && idx < end) end = idx;
    }
    return jobText.slice(0, end).trim();
};

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

/** Ask the LLM to audit a job against a resume, then compute the score in code. Returns null if the model gives no parsed result. */
const scoreJobFitWithLLM = async (
    jobText: string,
    resumeText: string
): Promise<LLMResult | null> => {
    const response = await openai.chat.completions.parse({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: zodResponseFormat(LLMAuditSchema, "llm_audit"),
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `JOB DESCRIPTION:\n${stripBoilerplate(
                    jobText
                )}\n\nRESUME:\n${resumeText}`,
            },
        ],
    });

    const audit = response.choices[0].message.parsed;
    if (!audit) return null;

    return {
        score: computeScore(audit),
        reasoning: buildReasoning(audit),
    };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Run async work over items with a max number of concurrent calls to avoid rate limits. */
const mapWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> => {
    const results: PromiseSettledResult<R>[] = [];
    for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        results.push(...(await Promise.allSettled(chunk.map(fn))));
    }
    return results;
};

/** Score each job/resume match with the LLM and split results into passed vs. rejected by LLM_THRESHOLD. */
export const classifyJobsByLLMScore = async (
    matches: JobMatchResult[]
): Promise<{
    passed: JobLLMMatchResult[];
    rejected: JobLLMMatchResult[];
}> => {
    const passed: JobLLMMatchResult[] = [];
    const rejected: JobLLMMatchResult[] = [];

    const results = await mapWithConcurrency(
        matches,
        CONCURRENCY,
        async (match) => {
            const jobText = constructJobText(match.job);
            const resume = await getResume(match.resumeId);
            if (!resume?.text) return;

            const llmResult = await scoreJobFitWithLLM(jobText, resume.text);
            if (!llmResult) return;

            const entry: JobLLMMatchResult = {
                job: match.job,
                llmScore: llmResult.score,
                llmReasoning: llmResult.reasoning,
                llmThreshold: LLM_THRESHOLD,
            };

            (llmResult.score >= LLM_THRESHOLD ? passed : rejected).push(entry);
        }
    );

    results.forEach((result, index) => {
        if (result.status === "rejected") {
            console.error(
                `Failed to classify job "${matches[index].job.title}" (${matches[index].job.id}):`,
                result.reason
            );
        }
    });

    return { passed, rejected };
};
