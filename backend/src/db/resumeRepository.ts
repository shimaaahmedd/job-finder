import { pool } from "./connection";
import type { NewResume, Resume } from "../types/resume";

/**
 * Data-access layer for the `resumes` table. Everything that touches resume
 * rows goes through here so SQL stays in one place.
 *
 * Resumes are insert-only: each upload is a new (user_id, label, version) row,
 * never an overwrite. Callers decide when a label's old version should stop
 * being active via deactivateResume.
 */

const UNIQUE_VIOLATION = "23505";

/**
 * pg has no built-in parser for the pgvector `vector` type, so `SELECT *`
 * comes back with `embedding` as a raw string (e.g. "[0.01,0.02,...]")
 * rather than a number[]. Every query below routes through this so the
 * `Resume.embedding` type is actually true at runtime.
 */
function parseEmbedding(row: Resume): Resume {
    return {
        ...row,
        embedding:
            typeof row.embedding === "string"
                ? JSON.parse(row.embedding)
                : row.embedding,
    };
}

/** Insert a new resume version. Rejects if (user_id, label, version) already exists. */
export async function saveResume(resume: NewResume): Promise<Resume> {
    try {
        const { rows } = await pool.query<Resume>(
            `INSERT INTO resumes (user_id, label, version, text, file_path, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [
                resume.user_id,
                resume.label,
                resume.version,
                resume.text,
                resume.file_path,
                resume.is_active,
            ]
        );
        return parseEmbedding(rows[0]);
    } catch (err) {
        if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            err.code === UNIQUE_VIOLATION
        ) {
            throw new Error(
                `This resume version already exists (label "${resume.label}", version ${resume.version}). Did you mean to create a new version?`
            );
        }
        throw err;
    }
}

/** Fetch a single resume by id, or null if it doesn't exist. */
export async function getResume(id: string): Promise<Resume | null> {
    const { rows } = await pool.query<Resume>(
        `SELECT * FROM resumes WHERE id = $1`,
        [id]
    );
    return rows[0] ? parseEmbedding(rows[0]) : null;
}

/** All active resumes for a user (defaults to the single-user 'default' id). */
export async function getActiveResumes(userId = "default"): Promise<Resume[]> {
    const { rows } = await pool.query<Resume>(
        `SELECT * FROM resumes WHERE user_id = $1 AND is_active = true ORDER BY label`,
        [userId]
    );
    return rows.map(parseEmbedding);
}

/** Mark a resume version as no longer active (superseded by a newer upload). */
export async function deactivateResume(id: string): Promise<void> {
    await pool.query(
        `UPDATE resumes SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [id]
    );
}

/** The highest-version row for a (user_id, label), or null if none exists yet. */
export async function getLatestByLabel(
    userId: string,
    label: string
): Promise<Resume | null> {
    const { rows } = await pool.query<Resume>(
        `SELECT * FROM resumes WHERE user_id = $1 AND label = $2 ORDER BY version DESC LIMIT 1`,
        [userId, label]
    );
    return rows[0] ? parseEmbedding(rows[0]) : null;
}

/** All resumes that haven't been embedded yet. */
export async function getResumesMissingEmbedding(): Promise<Resume[]> {
    const { rows } = await pool.query<Resume>(
        `SELECT * FROM resumes WHERE embedding IS NULL`
    );
    return rows.map(parseEmbedding);
}

/** Store a freshly generated pgvector embedding for a resume. */
export async function updateEmbedding(
    id: string,
    embedding: number[]
): Promise<void> {
    await pool.query(
        `UPDATE resumes SET embedding = $2::vector, updated_at = NOW() WHERE id = $1`,
        [id, `[${embedding.join(",")}]`]
    );
}

/** All active resumes with embeddings. */
export async function getAllActiveResumesWithEmbedding(
    userId = "default"
): Promise<Resume[]> {
    const { rows } = await pool.query<Resume>(
        `SELECT * FROM resumes WHERE user_id = $1 AND is_active = true AND embedding IS NOT NULL`,
        [userId]
    );
    return rows.map(parseEmbedding);
}
