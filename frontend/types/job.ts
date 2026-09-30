/**
 * Job types as the API returns them. Mirrors backend/src/types/job.ts; keep
 * the two in sync. Dates arrive as ISO strings (JSON has no Date type).
 */

/** Lifecycle states for a job as it moves through the pipeline. */
export const JobStatus = {
    New: "new", // just discovered, not yet evaluated
    PassedRule: "passed_rule", // passed rule gate
    MatchedResume: "matched_resume", // passed resume matcher
    PassedLlm: "passed_llm", // passed LLM matcher
    Rejected: "rejected", // filtered out (see rejection_reason)
    Applied: "applied", // we have applied to it
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** How an application is submitted. */
export const ApplyType = {
    External: "external",
    EasyApply: "easy_apply",
    Unknown: "unknown",
} as const;

export type ApplyType = (typeof ApplyType)[keyof typeof ApplyType];

/** Which pipeline stage rejected a job. */
export const RejectionReason = {
    Rule: "rejected_rule",
    Semantic: "rejected_semantic",
    Llm: "rejected_llm",
} as const;

export type RejectionReason =
    (typeof RejectionReason)[keyof typeof RejectionReason];

/** One row in the jobs list (backend JobListItem). */
export interface Job {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    seniorityLevel: string | null;
    employmentType: string | null;
    salary: string | null;
    postedAt: string | null;
    applyUrl: string | null;
    link: string | null;
    applyType: ApplyType;
    status: JobStatus;
    rejectionReason: RejectionReason | null;
    rejectionDetails: string | null;
    source: string;
    cosineScore: number | null;
    llmScore: number | null;
    llmReasoning: string | null;
    suggestedResume: string | null;
    suggestedResumeLabel: string | null;
    suggestedResumeVersion: number | null;
    threshold: number | null;
    createdAt: string;
}

export interface JobDetail extends Job {
    descriptionText: string | null;
    companyDescription: string | null;
}

/** Generic wrapper so any paginated endpoint can reuse it. */
export interface Paginated<T> {
    items: T[];
    total: number;
}
