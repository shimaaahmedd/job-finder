import "dotenv/config";
import OpenAI from "openai";
import { pool } from "../db/connection";
import {
    getResumesMissingEmbedding,
    updateEmbedding,
} from "../db/resumeRepository";

/**
 * Generates resume embeddings via OpenAI so resumes can be matched against
 * job postings with pgvector cosine similarity.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your .env file.");
}

const openai = new OpenAI({ apiKey });

/** Send texts to OpenAI and return their embedding vectors (1536 dimensions each). */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
    });
    // Sort by the API's own index rather than trusting array order, since callers
    // (matchJobs, embedAllResumes) map these back to their source texts by position.
    return [...response.data]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
}

/** Embed every resume that doesn't have an embedding yet, saving as it goes. */
export async function embedAllResumes(): Promise<void> {
    const resumes = await getResumesMissingEmbedding();
    if (resumes.length === 0) return;

    const embeddings = await generateEmbeddings(resumes.map((r) => r.text));

    for (const [index, resume] of resumes.entries()) {
        console.log(`Embedding resume ${resume.label}...`);
        try {
            await updateEmbedding(resume.id, embeddings[index]);
        } catch (err) {
            console.error(`Failed to embed resume ${resume.label}:`, err);
        }
    }
}

if (require.main === module) {
    embedAllResumes()
        .catch((err) => {
            console.error("Failed to embed resumes:", err);
            process.exitCode = 1;
        })
        .finally(() => pool.end());
}
