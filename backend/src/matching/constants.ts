/**
 * Minimum score (0-1) a job needs to advance. Used for both the semantic
 * matcher's cosine similarity and the LLM's fit score, and stored on the job
 * row as `threshold` so we know what cutoff it was judged against.
 */
export const PASSING_THRESHOLD = 0.7;
