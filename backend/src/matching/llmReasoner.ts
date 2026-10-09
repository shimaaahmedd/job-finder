import "dotenv/config";
import OpenAI from "openai";
import { JobLLMMatchResult, JobMatchResult } from "../types/job";
import { constructJobText } from "./jobText";
import { getResume } from "../db/resumeRepository";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { LLM_THRESHOLD } from "./constants";
import { loadSearchConfig } from "../discovery/linkedin/apify";

/**
 * Matches jobs to resumes in two steps:
 *  1. The LLM acts as a strict auditor: it extracts requirements, quotes resume evidence,
 *     and flags environment mismatches. It does NOT produce the score.
 *  2. The score is computed deterministically in code from that audit, so it is
 *     consistent, tunable, and not inflated by the model's "transferable skills" bias.
 */

const OPENAI_MODEL = "gpt-4o-mini";
const CONCURRENCY = 5;
// Requirements usually sit past the first 2000 chars, so the LLM gets far more
// of the description than the embedding does. Covers the longest postings
// seen so far (~11k chars, ~3k tokens).
const LLM_DESCRIPTION_LIMIT = 12000;

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
// Soft cap: limits how high the score can go, but the job can still pass, so
// it must stay at or above LLM_THRESHOLD. A one-level stretch job that passes
// always ranks below a strong job at your level.
const CAP_SENIORITY_ONE_LEVEL = LLM_THRESHOLD;
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

    // Penalties first, caps last: a cap is a ceiling on the final score, so a
    // penalty applied after it could push a soft-capped job under the threshold.
    score -= PENALTY_PER_ENV_MISMATCH * audit.environmentMismatches.length;

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
- Extract only hard requirements: programming languages, frameworks, tools, years of experience, seniority, degree, and domain. Evaluate each one separately.
- Ignore soft skills and culture phrases (e.g. fast-paced, customer-facing, communication, team player, ownership, self-starter). They are never requirements.
- Category "language" means programming languages only. Ignore spoken-language requirements unless a language other than English is required.
- Location and work arrangement are never requirements; handle them only as environment mismatches.
- Mark a requirement "met" ONLY if the resume shows it in actual work experience, and quote that evidence briefly in resumeEvidence.
- A skill that appears only in a skills list, with no role or project using it, is "partial".
- Do NOT credit transferable skills. For example, Node.js experience does not satisfy a Java requirement.
- If a requirement includes years of experience, compare it with the actual years in the work history.
- Set primaryLanguageMatch to false if the job's main required language or stack is not used in the resume's work experience.
- Compare the job's seniority level with the resume's total experience and titles.
- List every environment mismatch: primary language/stack, seniority, domain, work authorization, and work arrangement or location. Judge work arrangement and location only against CANDIDATE PREFERENCES, never against the resume.
- Ignore boilerplate (benefits, equal opportunity text, legal notices, buttons).`;

const WORK_TYPE_LABELS: Record<WorkType, string> = {
    on_site: "on-site",
    remote: "remote",
    hybrid: "hybrid",
};

/**
 * The candidate's work arrangement and location preferences, taken from the
 * saved search (config/search.json), so the LLM doesn't guess them from the resume.
 */
const buildCandidatePreferences = (): string => {
    const { workTypes, location } = loadSearchConfig();
    const accepted = workTypes?.length
        ? workTypes.map((type) => WORK_TYPE_LABELS[type]).join(", ")
        : "any work arrangement";
    return [
        `- Accepts ${accepted} roles. Do not flag these as mismatches.`,
        `- Open to roles located anywhere in ${location}.`,
    ].join("\n");
};

/**
 * Remove trailing boilerplate from a job description. Run it on the description
 * alone, before the length cut: on the full job text it would also drop the
 * fields that come after the description.
 */
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
    resumeText: string,
    preferences: string
): Promise<LLMResult | null> => {
    const response = await openai.chat.completions.parse({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: zodResponseFormat(LLMAuditSchema, "llm_audit"),
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `JOB DESCRIPTION:\n${jobText}\n\nRESUME:\n${resumeText}\n\nCANDIDATE PREFERENCES:\n${preferences}`,
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
    // Read once per run; the same for every job.
    const preferences = buildCandidatePreferences();

    const results = await mapWithConcurrency(
        matches,
        CONCURRENCY,
        async (match) => {
            // Strip boilerplate first so the length limit is spent on real content.
            const jobText = constructJobText(
                {
                    ...match.job,
                    descriptionText: stripBoilerplate(
                        match.job.descriptionText ?? ""
                    ),
                },
                LLM_DESCRIPTION_LIMIT
            );
            const resume = await getResume(match.resumeId);
            if (!resume?.text) return;

            const llmResult = await scoreJobFitWithLLM(
                jobText,
                resume.text,
                preferences
            );
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
