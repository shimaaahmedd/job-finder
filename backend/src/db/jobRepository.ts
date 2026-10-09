import { pool } from "./connection";
import {
    ApifyJobResult,
    ApplicationStatus,
    JobListItem,
    JobSource,
    JobStatus,
    Paginated,
    RejectionReason,
    SortDirection,
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
        cosineThreshold?: number | null;
        llmThreshold?: number | null;
        source?: JobSource | null;
    }
): Promise<void> {
    await pool.query(
        `INSERT INTO jobs (
       id, title, company_name, location, description_text, seniority_level,
       employment_type, salary, posted_at, apply_url, link, company_website,
       company_description, job_poster_profile_url, apply_type, industries,
       job_function, applicants_count, status, rejection_reason, rejection_details, source,
       input_url, llm_score, llm_reasoning, suggested_resume, cosine_score,
       cosine_threshold, llm_threshold
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
       COALESCE($19, 'new'), $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
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
       cosine_threshold       = EXCLUDED.cosine_threshold,
       llm_threshold          = EXCLUDED.llm_threshold,
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
            details?.cosineThreshold ?? null,
            details?.llmThreshold ?? null,
        ]
    );
}

type UpdateJobDetails = {
    status?: JobStatus;
    applicationStatus?: ApplicationStatus;
    rejectionReason?: RejectionReason | null;
    rejectionDetails?: string | null;
    cosineScore?: number | null;
    llmScore?: number | null;
    llmReasoning?: string | null;
    suggestedResume?: string | null;
    source?: JobSource | null;
    cosineThreshold?: number | null;
    llmThreshold?: number | null;
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
    cosineThreshold: "cosine_threshold",
    llmThreshold: "llm_threshold",
    applicationStatus: "application_status",
};

/**
 * The JobListItem columns, shared by every query that returns one. Expects the
 * job row aliased as `j`; pair it with JOB_LIST_RESUME_JOIN for the resume label.
 */
const JOB_LIST_COLUMNS = `
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
    j.cosine_threshold     AS "cosineThreshold",
    j.llm_threshold        AS "llmThreshold",
    j.application_status   AS "applicationStatus",
    j.closed_at            AS "closedAt",
    j.applied_at           AS "appliedAt",
    j.posted_at            AS "postedAt",
    j.created_at           AS "createdAt"
`;

// suggested_resume holds a resumes.id (uuid) in a varchar column.
const JOB_LIST_RESUME_JOIN = `LEFT JOIN resumes r ON r.id::text = j.suggested_resume`;

/**
 * Move a job to a new status. Only fields present in `details` are written —
 * an omitted field is left untouched, while an explicit `null` clears it.
 * Setting applicationStatus to applied stamps applied_at once; not_applied
 * clears it.
 * Returns the updated job (same shape as the list), or null if `id` doesn't exist.
 */
export async function updateJob(
    id: string,
    details: UpdateJobDetails
): Promise<JobListItem | null> {
    const entries = (
        Object.entries(details) as [keyof UpdateJobDetails, unknown][]
    ).filter(([, value]) => value !== undefined);

    const assignments = entries.map(
        ([key], i) => `${JOB_COLUMNS[key]} = $${i + 2}`
    );
    // Keep the first applied date: going Applied -> Interviewing -> Applied
    // shouldn't move it (same idea as closed_at in markJobAsClosed).
    if (details.applicationStatus === ApplicationStatus.Applied) {
        assignments.push("applied_at = COALESCE(applied_at, NOW())");
    } else if (details.applicationStatus === ApplicationStatus.NotApplied) {
        // Undoing "applied" clears the date.
        assignments.push("applied_at = NULL");
    }

    assignments.push("updated_at = NOW()");

    const setClause = assignments.join(", ");
    const values = entries.map(([, value]) => value);

    // The CTE lets one round trip both update the row and join its resume label.
    const { rows } = await pool.query<JobListItem>(
        `WITH j AS (
            UPDATE jobs SET ${setClause} WHERE id = $1 RETURNING *
        )
        SELECT ${JOB_LIST_COLUMNS} FROM j ${JOB_LIST_RESUME_JOIN}`,
        [id, ...values]
    );
    return rows[0] ?? null;
}

/**
 * One page of jobs filtered by status, applicationStatus and active (true = not
 * closed); an undefined filter matches everything. With `sort`, ordered by
 * posted date in that direction; without it, best LLM score first, then newest.
 */
export async function getJobsByStatus(
    status: JobStatus | undefined,
    applicationStatus: ApplicationStatus | undefined,
    active: boolean | undefined,
    limit = 25,
    offset = 0,
    sort?: SortDirection
): Promise<Paginated<JobListItem>> {
    // Picked from a fixed set, never from raw input: ASC/DESC can't be a query parameter.
    const direction = sort === "asc" ? "ASC" : "DESC";
    const orderBy = sort
        ? `j.posted_at ${direction} NULLS LAST, j.created_at ${direction}`
        : `j.llm_score DESC NULLS LAST, j.posted_at DESC NULLS LAST, j.created_at DESC`;

    const listQuery = `
        SELECT ${JOB_LIST_COLUMNS}
        FROM jobs j
        ${JOB_LIST_RESUME_JOIN}
        WHERE ($1::varchar IS NULL OR j.status = $1) AND ($2::varchar IS NULL OR j.application_status = $2) AND ($3::boolean IS NULL OR (j.closed_at IS NULL) = $3)
        ORDER BY ${orderBy}, j.id
        LIMIT $4 OFFSET $5
    `;

    const countQuery = `SELECT count(*)::int AS total FROM jobs WHERE ($1::varchar IS NULL OR status = $1) AND ($2::varchar IS NULL OR application_status = $2) AND ($3::boolean IS NULL OR (closed_at IS NULL) = $3)`;

    const [listResult, countResult] = await Promise.all([
        pool.query<JobListItem>(listQuery, [
            status ?? null,
            applicationStatus ?? null,
            active ?? null,
            limit,
            offset,
        ]),
        pool.query<{ total: number }>(countQuery, [
            status ?? null,
            applicationStatus ?? null,
            active ?? null,
        ]),
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
    cosineThreshold: number | null;
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
            cosineThreshold: number | null;
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
            cosine_threshold                 AS "cosineThreshold"
        FROM jobs
        WHERE status IN ('new', 'passed_rule', 'matched_resume')`
    );

    return rows.map(
        ({
            status,
            suggestedResume,
            cosineScore,
            cosineThreshold,
            ...job
        }) => ({
            job,
            status,
            suggestedResume,
            cosineScore,
            cosineThreshold,
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
        cosine_threshold: number | null;
    }>(
        `SELECT id, status, suggested_resume, cosine_score, cosine_threshold FROM jobs WHERE id = ANY($1)`,
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
            cosineThreshold: row?.cosine_threshold ?? null,
        };
    });
}

/** Mark a job as closed. Returns the updated job, or null if `id` doesn't exist. */
export async function markJobAsClosed(id: string): Promise<JobListItem | null> {
    const { rows } = await pool.query<JobListItem>(
        `WITH j AS (
            UPDATE jobs SET closed_at = COALESCE(closed_at, NOW()), updated_at = NOW() WHERE id = $1 RETURNING *
        )
        SELECT ${JOB_LIST_COLUMNS} FROM j ${JOB_LIST_RESUME_JOIN}`,
        [id]
    );
    return rows[0] ?? null;
}
