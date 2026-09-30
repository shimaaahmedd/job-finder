import { ApifyJobResult } from "../types/job";

/**
 * Flatten a job into the plain text we embed and send to the LLM. The
 * description is capped at 2000 chars to bound token cost; the other fields
 * carry most of the signal for matching.
 */
export function constructJobText(job: ApifyJobResult): string {
    const descriptionText = job.descriptionText?.slice(0, 2000) ?? "";
    return `
        Job Title: ${job.title}
        Company: ${job.companyName}
        Location: ${job.location}
        Seniority: ${job.seniorityLevel}
        Industry: ${job.industries}
        Description: ${descriptionText}
        Employment Type: ${job.employmentType}
    `.trim();
}
