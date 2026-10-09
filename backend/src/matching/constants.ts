/**
 * Minimum cosine similarity (0-1) between a job and its best resume for the
 * job to move on to LLM scoring. Stored on the job row as `cosine_threshold`
 * so we know what cutoff it was judged against.
 */
export const COSINE_THRESHOLD = 0.5;

/**
 * Minimum LLM fit score (0-1) a job needs to pass. Stored on the job row as
 * `llm_threshold`. The hard caps in llmReasoner must stay below this, or they
 * won't reject anything.
 */
export const LLM_THRESHOLD = 0.8;
