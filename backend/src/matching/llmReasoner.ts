import "dotenv/config";
import OpenAI from "openai";
import { JobLLMMatchResult, JobMatchResult, JobStatus } from "../types/job";
import { constructJobText } from "./jobText";
import { getResume } from "../db/resumeRepository";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { PASSING_THRESHOLD } from "./constants";

/**
 * Generates LLM reasoning via OpenAI so Jobs are really matched to resumes based on score
 */

const OPENAI_MODEL = "gpt-4o-mini";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your .env file.");
}

const openai = new OpenAI({ apiKey });

const LLMResultSchema = z.object({
    score: z.number().min(0).max(1),
    reasoning: z.string(),
});
type LLMResult = z.infer<typeof LLMResultSchema>;

/** Ask the LLM to score how well a job fits a resume, returning null if the model gives no parsed result. */
const scoreJobFitWithLLM = async (
    jobText: string,
    resumeText: string
): Promise<LLMResult | null> => {
    const response = await openai.chat.completions.parse({
        model: OPENAI_MODEL,
        response_format: zodResponseFormat(LLMResultSchema, "llm_result"),
        messages: [
            {
                role: "system",
                content:
                    "You are a job fit analyzer. Always respond with valid JSON only.",
            },
            {
                role: "user",
                content: `
              Analyze this job against this resume and return a JSON object.
              
              Job Description: ${jobText}
              Resume Text: ${resumeText}
              
              Return ONLY this JSON:
              {
                "score": number between 0-1,
                "reasoning": "one sentence explanation",
              }
            `,
            },
        ],
    });

    const result = response.choices[0].message.parsed;

    return result;
};

/** Score each job/resume match with the LLM and split results into passed vs. rejected by PASSING_THRESHOLD. */
export const classifyJobsByLLMScore = async (
    matches: JobMatchResult[]
): Promise<{
    passed: JobLLMMatchResult[];
    rejected: JobLLMMatchResult[];
}> => {
    const passed: JobLLMMatchResult[] = [];
    const rejected: JobLLMMatchResult[] = [];

    const results = await Promise.allSettled(
        matches.map(async (match) => {
            const jobText = constructJobText(match.job);
            const resume = await getResume(match.resumeId);
            if (!resume?.text) return;

            const llmResult = await scoreJobFitWithLLM(jobText, resume.text);
            if (!llmResult) return;

            if (llmResult.score >= PASSING_THRESHOLD) {
                passed.push({
                    job: match.job,
                    llmScore: llmResult.score,
                    llmReasoning: llmResult.reasoning,
                    threshold: PASSING_THRESHOLD,
                });
            } else {
                rejected.push({
                    job: match.job,
                    llmScore: llmResult.score,
                    llmReasoning: llmResult.reasoning,
                    threshold: PASSING_THRESHOLD,
                });
            }
        })
    );

    results.forEach((result, index) => {
        if (result.status === JobStatus.Rejected) {
            console.error(
                `Failed to classify job "${matches[index].job.title}" (${matches[index].job.id}):`,
                result.reason
            );
        }
    });

    return { passed, rejected };
};
