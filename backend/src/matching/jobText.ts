import { ApifyJobResult } from "../types/job";

/**
 * Description cap for embeddings. Kept short to bound token cost; the other
 * fields carry most of the signal for semantic matching. Changing it changes
 * every cosine score, so retune COSINE_THRESHOLD if you do.
 */
export const EMBEDDING_DESCRIPTION_LIMIT = 2000;

/**
 * Flatten a job into the plain text we embed and send to the LLM, with the
 * description cut to `descriptionLimit` characters. Empty fields are left out,
 * so a missing value never becomes the literal text "undefined" or "null".
 */
export function constructJobText(
    job: ApifyJobResult,
    descriptionLimit = EMBEDDING_DESCRIPTION_LIMIT
): string {
    const fields: [string, string | null | undefined][] = [
        ["Job Title", job.title],
        ["Company", job.companyName],
        ["Location", job.location],
        ["Seniority", job.seniorityLevel],
        ["Industry", job.industries],
        ["Description", job.descriptionText?.slice(0, descriptionLimit)],
        ["Employment Type", job.employmentType],
    ];
    return fields
        .filter(([, value]) => value != null && value.trim() !== "")
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n");
}
