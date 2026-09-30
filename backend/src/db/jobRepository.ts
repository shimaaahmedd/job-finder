import { pool } from "./connection";
import type {
    ApifyJobResult,
    JobListItem,
    JobSource,
    JobStatus,
    Paginated,
    RejectionReason,
} from "../types/job";

/**
 * Data-access layer for the `jobs` table. Everything that touches job rows
 * goes through here so SQL stays in one place.
 */

/** "25 applicants" / "Over 100 applicants" -> 25 / 100; non-numeric -> null. */
function parseApplicants(value?: string): number | null {
    if (!value) return null;
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
}

/** Best-effort parse of the actor's postedAt into an ISO date; else null. */
function parseDate(value?: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? null
        : date.toISOString().slice(0, 10);
}

/**
 * Insert a freshly discovered job, or update its discovery fields if we've
 * seen it before. `extras` covers the pipeline fields set at discovery time
 * (status defaults to 'new' via the schema when omitted).
 */
export async function saveJob(
    job: ApifyJobResult,
    details?: {
        status?: JobStatus;
        rejectionReason?: RejectionReason | null;
        rejectionDetails?: string | null;
        llmReasoning?: string | null;
        llmScore?: number | null;
        suggestedResume?: string | null;
        cosineScore?: number | null;
        threshold?: number | null;
        source?: JobSource | null;
    }
): Promise<void> {
    await pool.query(
        `INSERT INTO jobs (
       id, title, company_name, location, description_text, seniority_level,
       employment_type, salary, posted_at, apply_url, link, company_website,
       company_description, job_poster_profile_url, apply_type, industries,
       job_function, applicants_count, status, rejection_reason, rejection_details, source,
       input_url, llm_score, llm_reasoning, suggested_resume, cosine_score, threshold
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
       COALESCE($19, 'new'), $20, $21, $22, $23, $24, $25, $26, $27, $28
     )
     ON CONFLICT (id) DO UPDATE SET
       title                  = EXCLUDED.title,
       company_name           = EXCLUDED.company_name,
       location               = EXCLUDED.location,
       description_text       = EXCLUDED.description_text,
       seniority_level        = EXCLUDED.seniority_level,
       employment_type        = EXCLUDED.employment_type,
       salary                 = EXCLUDED.salary,
       posted_at              = EXCLUDED.posted_at,
       apply_url              = EXCLUDED.apply_url,
       link                   = EXCLUDED.link,
       company_website        = EXCLUDED.company_website,
       company_description    = EXCLUDED.company_description,
       job_poster_profile_url = EXCLUDED.job_poster_profile_url,
       apply_type             = EXCLUDED.apply_type,
       industries             = EXCLUDED.industries,
       job_function           = EXCLUDED.job_function,
       applicants_count       = EXCLUDED.applicants_count,
       status                 = EXCLUDED.status,
       rejection_reason       = EXCLUDED.rejection_reason,
       rejection_details      = EXCLUDED.rejection_details,
       source                 = EXCLUDED.source,
       input_url              = EXCLUDED.input_url,
       llm_score              = EXCLUDED.llm_score,
       llm_reasoning          = EXCLUDED.llm_reasoning,
       suggested_resume       = EXCLUDED.suggested_resume,
       cosine_score           = EXCLUDED.cosine_score,
       threshold              = EXCLUDED.threshold,
       updated_at             = NOW()`,
        [
            job.id,
            job.title,
            job.companyName,
            job.location ?? null,
            job.descriptionText ?? null,
            job.seniorityLevel ?? null,
            job.employmentType ?? null,
            job.salary ?? null,
            parseDate(job.postedAt),
            job.applyUrl ?? null,
            job.link ?? null,
            job.companyWebsite ?? null,
            job.companyDescription ?? null,
            job.jobPosterProfileUrl ?? null,
            job.applyType ?? null,
            job.industries ?? null,
            job.jobFunction ?? null,
            parseApplicants(job.applicantsCount),
            details?.status ?? null,
            details?.rejectionReason ?? null,
            details?.rejectionDetails ?? null,
            job.source ?? null,
            job.inputUrl ?? null,
            details?.llmScore ?? null,
            details?.llmReasoning ?? null,
            details?.suggestedResume ?? null,
            details?.cosineScore ?? null,
            details?.threshold ?? null,
        ]
    );
}

type UpdateJobDetails = {
    status: JobStatus;
    rejectionReason?: RejectionReason | null;
    rejectionDetails?: string | null;
    cosineScore?: number | null;
    llmScore?: number | null;
    llmReasoning?: string | null;
    suggestedResume?: string | null;
    source?: JobSource | null;
    threshold?: number | null;
};

/** snake_case DB column for each updatable field. */
const JOB_COLUMNS: Record<keyof UpdateJobDetails, string> = {
    status: "status",
    rejectionReason: "rejection_reason",
    rejectionDetails: "rejection_details",
    cosineScore: "cosine_score",
    llmScore: "llm_score",
    llmReasoning: "llm_reasoning",
    suggestedResume: "suggested_resume",
    source: "source",
    threshold: "threshold",
};

/**
 * Move a job to a new status. Only fields present in `details` are written —
 * an omitted field is left untouched, while an explicit `null` clears it.
 */
export async function updateJob(
    id: string,
    details: UpdateJobDetails
): Promise<void> {
    const entries = (
        Object.entries(details) as [keyof UpdateJobDetails, unknown][]
    ).filter(([, value]) => value !== undefined);

    const setClause = entries
        .map(([key], i) => `${JOB_COLUMNS[key]} = $${i + 2}`)
        .join(", ");
    const values = entries.map(([, value]) => value);

    await pool.query(
        `UPDATE jobs SET ${setClause}, updated_at = NOW() WHERE id = $1`,
        [id, ...values]
    );
}

/** Return all jobs in a given status (or every job when omitted), newest first. */
export async function getJobsByStatus(
    status: JobStatus | undefined,
    limit = 25,
    offset = 0
): Promise<Paginated<JobListItem>> {
    const listQuery = `
        SELECT
            j.id,
            j.title,
            j.company_name         AS "companyName",
            j.location,
            j.seniority_level      AS "seniorityLevel",
            j.employment_type      AS "employmentType",
            j.salary,
            j.apply_url            AS "applyUrl",
            j.link,
            j.apply_type           AS "applyType",
            j.status,
            j.rejection_reason     AS "rejectionReason",
            j.rejection_details    AS "rejectionDetails",
            j.source,
            j.cosine_score         AS "cosineScore",
            j.llm_score            AS "llmScore",
            j.llm_reasoning        AS "llmReasoning",
            j.suggested_resume     AS "suggestedResume",
            r.label                AS "suggestedResumeLabel",
            r.version              AS "suggestedResumeVersion",
            j.threshold,
            j.posted_at            AS "postedAt",
            j.created_at           AS "createdAt"
        FROM jobs j
        -- suggested_resume holds a resumes.id (uuid) in a varchar column.
        LEFT JOIN resumes r ON r.id::text = j.suggested_resume
        WHERE $1::varchar IS NULL OR j.status = $1
        ORDER BY
            j.llm_score DESC NULLS LAST,
            j.posted_at DESC NULLS LAST,
            j.created_at DESC,
            j.id
        LIMIT $2 OFFSET $3
    `;

    const countQuery = `SELECT count(*)::int AS total FROM jobs WHERE $1::varchar IS NULL OR status = $1`;

    const [listResult, countResult] = await Promise.all([
        pool.query<JobListItem>(listQuery, [status ?? null, limit, offset]),
        pool.query<{ total: number }>(countQuery, [status ?? null]),
    ]);

    return {
        items: listResult.rows,
        total: countResult.rows[0].total,
    };
}

/** Permanently delete every rejected job. Returns how many were removed. */
export async function clearRejected(): Promise<number> {
    const { rowCount } = await pool.query(
        `DELETE FROM jobs WHERE status IN ('rejected')`
    );
    return rowCount ?? 0;
}

/** A job paired with its DB status and any saved match data. */
export type JobWithStatus = {
    job: ApifyJobResult;
    status: JobStatus | undefined;
    suggestedResume: string | null;
    cosineScore: number | null;
    threshold: number | null;
};

/**
 * Every job stuck mid-pipeline ('new' / 'passed_rule' / 'matched_resume'),
 * rebuilt from its stored columns so it can be resumed without re-fetching.
 */
export async function getResumableJobs(): Promise<JobWithStatus[]> {
    const { rows } = await pool.query<
        ApifyJobResult & {
            status: JobStatus;
            suggestedResume: string | null;
            cosineScore: number | null;
            threshold: number | null;
        }
    >(
        `SELECT
            id,
            title,
            company_name                     AS "companyName",
            location,
            description_text                 AS "descriptionText",
            seniority_level                  AS "seniorityLevel",
            employment_type                  AS "employmentType",
            salary,
            to_char(posted_at, 'YYYY-MM-DD') AS "postedAt",
            apply_url                        AS "applyUrl",
            link,
            company_website                  AS "companyWebsite",
            company_description              AS "companyDescription",
            job_poster_profile_url           AS "jobPosterProfileUrl",
            industries,
            job_function                     AS "jobFunction",
            applicants_count::text           AS "applicantsCount",
            apply_type                       AS "applyType",
            source,
            input_url                        AS "inputUrl",
            status,
            suggested_resume                 AS "suggestedResume",
            cosine_score                     AS "cosineScore",
            threshold
        FROM jobs
        WHERE status IN ('new', 'passed_rule', 'matched_resume')`
    );

    return rows.map(
        ({ status, suggestedResume, cosineScore, threshold, ...job }) => ({
            job,
            status,
            suggestedResume,
            cosineScore,
            threshold,
        })
    );
}

/** Each fetched job's existing DB status, plus any saved match data (for jobs stuck at 'matched_resume'). */
export async function attachJobStatus(
    jobs: ApifyJobResult[]
): Promise<JobWithStatus[]> {
    const { rows } = await pool.query<{
        id: string;
        status: JobStatus;
        suggested_resume: string | null;
        cosine_score: number | null;
        threshold: number | null;
    }>(
        `SELECT id, status, suggested_resume, cosine_score, threshold FROM jobs WHERE id = ANY($1)`,
        [jobs.map((job) => job.id)]
    );

    const rowById = new Map(rows.map((row) => [row.id, row]));
    return jobs.map((job) => {
        const row = rowById.get(job.id);
        return {
            job,
            status: row?.status,
            suggestedResume: row?.suggested_resume ?? null,
            cosineScore: row?.cosine_score ?? null,
            threshold: row?.threshold ?? null,
        };
    });
}
