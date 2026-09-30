/**
 * Shared types for the job-finder domain.
 *
 * - ApifyJob:    the raw shape returned by the Apify LinkedIn actor (camelCase).
 * - JobRecord:   a row in our `jobs` Postgres table (snake_case columns).
 * - JobStatus:   the lifecycle state a job moves through in our pipeline.
 * - JobListItem: the camelCase shape the API returns to the frontend.
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

/** Which pipeline stage rejected a job. Details go in rejection_details. */
export const RejectionReason = {
    Rule: "rejected_rule",
    Semantic: "rejected_semantic",
    Llm: "rejected_llm",
} as const;

export type RejectionReason =
    (typeof RejectionReason)[keyof typeof RejectionReason];

/** How an application is submitted. */
export const ApplyType = {
    External: "external",
    EasyApply: "easy_apply",
    Unknown: "unknown",
} as const;

export type ApplyType = (typeof ApplyType)[keyof typeof ApplyType];

/** Job board a job was discovered on. */
export type JobSource = "linkedin" | "indeed";

/**
 * Raw item from the `curious_coder/linkedin-jobs-scraper` Apify actor.
 * Most fields are optional because the actor doesn't always populate them.
 */
export interface ApifyJob {
    id: string;
    title: string;
    companyName: string;
    location?: string;
    descriptionText?: string;
    seniorityLevel?: string;
    employmentType?: string;
    salary?: string;
    postedAt?: string;
    applyUrl?: string;
    link?: string;
    companyWebsite?: string;
    companyDescription?: string;
    jobPosterProfileUrl?: string;
    industries?: string;
    jobFunction?: string;
    applicantsCount?: string;
}

/** An ApifyJob tagged at discovery time with its apply type, source, and search URL. */
export interface ApifyJobResult extends ApifyJob {
    applyType: ApplyType;
    source: JobSource;
    inputUrl: string;
}

/** A row in the `jobs` table. Mirrors schema.sql exactly. */
export interface JobRecord {
    id: string;
    title: string;
    company_name: string;
    location: string | null;
    description_text: string | null;
    seniority_level: string | null;
    employment_type: string | null;
    salary: string | null;
    posted_at: string | null;
    apply_url: string | null;
    link: string | null;
    company_website: string | null;
    company_description: string | null;
    job_poster_profile_url: string | null;
    apply_type: ApplyType | null;
    status: JobStatus;
    rejection_reason: RejectionReason | null;
    rejection_details: string | null;
    input_url: string | null;
    source: string | null;
    cosine_score: number | null;
    llm_score: number | null;
    llm_reasoning: string | null;
    suggested_resume: string | null;
    industries: string | null;
    job_function: string | null;
    applicants_count: number | null;
    threshold: number | null;
    created_at: string;
    updated_at: string;
}

/** A job paired with its best-matching resume from the semantic matcher. */
export interface JobMatchResult {
    job: ApifyJobResult;
    resumeId: string;
    cosineScore: number;
    threshold: number; // 0.7 by default
}

/** A job's LLM fit score and one-line reasoning. */
export interface JobLLMMatchResult {
    job: ApifyJobResult;
    llmScore: number;
    llmReasoning: string;
    threshold: number; // 0.7 by default
}

/** One row in the jobs list. No description: that lives on JobDetail. */
export interface JobListItem {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    seniorityLevel: string | null;
    employmentType: string | null;
    salary: string | null;
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
    postedAt: Date | null;
    createdAt: Date;
}

export interface JobDetail extends JobListItem {
    descriptionText: string | null;
    companyDescription: string | null;
}

/** Generic wrapper so any paginated endpoint can reuse it. */
export interface Paginated<T> {
    items: T[];
    total: number;
}
