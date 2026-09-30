import {
    attachJobStatus,
    getResumableJobs,
    saveJob,
    updateJob,
} from "../db/jobRepository";
import { fetchApifyJobs } from "../discovery/linkedin/apify";
import { applyRuleGate } from "../filters/ruleGate";
import { classifyJobsByLLMScore } from "../matching/llmReasoner";
import { matchJobs } from "../matching/semanticMatcher";
import { JobStatus, RejectionReason } from "../types/job";

/**
 * One end-to-end pass: discover -> rule gate -> semantic match -> LLM score.
 *
 * Each stage persists its outcome before the next one runs, so a job's DB
 * status records how far it got. Jobs already in the DB are resumed from their
 * saved status (e.g. a 'passed_rule' job from an earlier failed run goes
 * straight to the semantic matcher) instead of being reprocessed from scratch.
 * Jobs in a terminal status (rejected / passed_llm / applied) are skipped.
 *
 * Per-job DB write failures are logged and don't abort the run; a failure in
 * a stage as a whole (Apify, OpenAI) does.
 */
export async function runPipeline(discovery: boolean): Promise<void> {
    try {
        console.log("Running pipeline...");
        // discovery on:  fetch from Apify and look up how far each job got.
        // discovery off: skip Apify, resume jobs left mid-pipeline in the DB.
        const jobsAttachedStatus = discovery
            ? await attachJobStatus(await fetchApifyJobs())
            : await getResumableJobs();

        // Never seen before: not in the DB yet.
        const filteredJobsWithoutStatus = jobsAttachedStatus
            .filter((job) => job.status == undefined)
            .map((_) => _.job);

        // Save all new jobs to database
        const newJobResults = await Promise.allSettled(
            filteredJobsWithoutStatus.map(async (job) =>
                saveJob(job, {
                    status: JobStatus.New,
                    source: job.source,
                })
            )
        );

        newJobResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Failed to save job "${filteredJobsWithoutStatus[index].title}" (${filteredJobsWithoutStatus[index].id}):`,
                    result.reason
                );
            }
        });

        // Saved by an earlier run that stopped before the rule gate.
        const filteredJobsWithNewStatus = jobsAttachedStatus
            .filter((job) => job.status == JobStatus.New)
            .map((_) => _.job);

        // Apply rule gate with reasoning
        const { passed, rejected } = applyRuleGate([
            ...filteredJobsWithoutStatus,
            ...filteredJobsWithNewStatus,
        ]);

        // Save rejected jobs with reasons
        const rejectedResults = await Promise.allSettled(
            rejected.map(async ({ job, details }) =>
                updateJob(job.id, {
                    status: JobStatus.Rejected,
                    rejectionReason: RejectionReason.Rule,
                    rejectionDetails: details,
                })
            )
        );

        rejectedResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Failed to update job "${rejected[index].job.title}" (${rejected[index].job.id}):`,
                    result.reason
                );
            }
        });

        // Save passed rule gate jobs to db
        const passedResults = await Promise.allSettled(
            passed.map(async (job) =>
                updateJob(job.id, {
                    status: JobStatus.PassedRule,
                })
            )
        );

        passedResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Failed to update job "${passed[index].title}" (${passed[index].id}):`,
                    result.reason
                );
            }
        });

        // Passed the rule gate in an earlier run but never got matched.
        const filteredJobsWithPassedStatus = jobsAttachedStatus
            .filter((job) => job.status == JobStatus.PassedRule)
            .map((_) => _.job);

        // Semantic matcher with resumes for passed jobs
        const { passed: matchedResumeJobs, rejected: rejectedResumeJobs } =
            await matchJobs([...passed, ...filteredJobsWithPassedStatus]);

        // Save passed jobs with suggested resume to database
        const matchedResumeResults = await Promise.allSettled(
            matchedResumeJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.MatchedResume,
                    suggestedResume: match.resumeId,
                    cosineScore: match.cosineScore,
                    threshold: match.threshold,
                })
            )
        );

        matchedResumeResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Failed to update job "${matchedResumeJobs[index].job.title}" (${matchedResumeJobs[index].job.id}):`,
                    result.reason
                );
            }
        });

        // Update rejected jobs with semantic matching details to database
        const rejectedResumeResults = await Promise.allSettled(
            rejectedResumeJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.Rejected,
                    suggestedResume: match.resumeId,
                    rejectionReason: RejectionReason.Semantic,
                    cosineScore: match.cosineScore,
                    threshold: match.threshold,
                })
            )
        );

        rejectedResumeResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Failed to update job "${rejectedResumeJobs[index].job.title}" (${rejectedResumeJobs[index].job.id}):`,
                    result.reason
                );
            }
        });

        // Matched a resume in an earlier run but never got LLM-scored. The
        // saved match data is needed to rebuild a JobMatchResult for them.
        const filteredJobsWithMatchedStatus = jobsAttachedStatus.filter(
            (
                m
            ): m is typeof m & {
                suggestedResume: string;
                cosineScore: number;
                threshold: number;
                status: JobStatus;
            } =>
                m.suggestedResume !== null &&
                m.cosineScore !== null &&
                m.threshold !== null &&
                m.status == JobStatus.MatchedResume
        );

        // Score resumed + freshly matched jobs with the LLM.
        const { passed: passedJobs, rejected: rejectedJobs } =
            await classifyJobsByLLMScore([
                ...filteredJobsWithMatchedStatus.map((_) => ({
                    job: _.job,
                    resumeId: _.suggestedResume,
                    threshold: _.threshold,
                    cosineScore: _.cosineScore,
                })),
                ...matchedResumeJobs,
            ]);

        // Update passed jobs status and reasonings to db
        const passedLLMResults = await Promise.allSettled(
            passedJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.PassedLlm,
                    llmReasoning: match.llmReasoning,
                    llmScore: match.llmScore,
                })
            )
        );

        passedLLMResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Failed to update job "${passedJobs[index].job.title}" (${passedJobs[index].job.id}):`,
                    result.reason
                );
            }
        });

        // Update rejected jobs details to db
        const rejectedLLMResults = await Promise.allSettled(
            rejectedJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.Rejected,
                    llmReasoning: match.llmReasoning,
                    llmScore: match.llmScore,
                    rejectionReason: RejectionReason.Llm,
                    rejectionDetails: match.llmReasoning,
                })
            )
        );

        rejectedLLMResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Failed to update job "${rejectedJobs[index].job.title}" (${rejectedJobs[index].job.id}):`,
                    result.reason
                );
            }
        });

        console.log(passedJobs, rejectedJobs);
    } catch (error) {
        console.error(error);
        throw new Error("Failed to run pipeline");
    }
}
