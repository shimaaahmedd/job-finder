import { getAllActiveResumesWithEmbedding } from "../db/resumeRepository";
import { ApifyJobResult, JobMatchResult } from "../types/job";
import { Resume } from "../types/resume";
import { COSINE_THRESHOLD } from "./constants";
import { generateEmbeddings } from "./embeddings";
import { constructJobText } from "./jobText";

/**
 * Semantic matcher: embeds each job and picks the active resume whose
 * embedding is closest to it. Jobs whose best match clears COSINE_THRESHOLD
 * move on to LLM scoring; the rest are rejected.
 */

/** Calculate the cosine similarity between two vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

/** Compare a job against all resumes and return the best match. Expects a non-empty `resumes`. */
export async function matchJobToResume(
    jobEmbedding: number[],
    resumes: Resume[]
): Promise<{
    resumeId: string;
    cosineScore: number;
}> {
    const joinMatchResults = resumes.map((resume) => {
        const cosineScore = cosineSimilarity(
            jobEmbedding,
            resume.embedding ?? []
        );
        return {
            resumeId: resume.id,
            cosineScore,
        };
    });

    const bestMatch = joinMatchResults.reduce(
        (best, current) =>
            current.cosineScore > best.cosineScore ? current : best,
        joinMatchResults[0]
    );
    return bestMatch;
}

/**
 * Match every job to its best resume and split by COSINE_THRESHOLD.
 * With no embedded resumes there's nothing to match against, so both lists
 * come back empty (jobs keep their current status).
 */
export async function matchJobs(jobs: ApifyJobResult[]): Promise<{
    passed: JobMatchResult[];
    rejected: JobMatchResult[];
}> {
    // Nothing to embed; OpenAI rejects an empty `input`.
    if (jobs.length === 0) {
        return {
            passed: [],
            rejected: [],
        };
    }

    const resumes = await getAllActiveResumesWithEmbedding(); // load once

    if (resumes.length === 0) {
        return {
            passed: [],
            rejected: [],
        };
    }

    const jobEmbeddings = await generateEmbeddings(
        jobs.map((job) => constructJobText(job))
    );

    const jobMatches = await Promise.all(
        jobEmbeddings.map(async (jobEmbedding, index) => {
            const matchedJob = await matchJobToResume(jobEmbedding, resumes);

            return {
                ...matchedJob,
                job: jobs[index],
                cosineThreshold: COSINE_THRESHOLD,
            };
        })
    );

    // Compare on the raw score and round to 2 decimals only for storage,
    // so e.g. 0.395 doesn't round up past the threshold.
    const rounded = (j: JobMatchResult): JobMatchResult => ({
        ...j,
        cosineScore: Math.round(j.cosineScore * 100) / 100,
    });

    return {
        passed: jobMatches
            .filter((j) => j.cosineScore >= COSINE_THRESHOLD)
            .map(rounded),
        rejected: jobMatches
            .filter((j) => j.cosineScore < COSINE_THRESHOLD)
            .map(rounded),
    };
}
