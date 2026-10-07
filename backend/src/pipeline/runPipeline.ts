import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
    attachJobStatus,
    getResumableJobs,
    saveJob,
    updateJob,
} from "../db/jobRepository";
import { fetchApifyJobs } from "../discovery/linkedin/apify";
import { applyRuleGate } from "../filters/ruleGate";
import { logger, Stage } from "../lib/logger";
import { classifyJobsByLLMScore } from "../matching/llmReasoner";
import { matchJobs } from "../matching/semanticMatcher";
import { JobStatus, RejectionReason } from "../types/job";

type Stage = (typeof Stage)[keyof typeof Stage];

/**
 * Log each failed per-job DB write. Failures don't abort the run, so this only
 * reports them. Returns how many failed.
 */
function logWriteFailures(
    log: Logger,
    stage: Stage,
    results: PromiseSettledResult<unknown>[],
    jobs: { id: string; title: string }[]
): number {
    let failed = 0;
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            failed++;
            log.error(
                {
                    stage,
                    jobId: jobs[index].id,
                    title: jobs[index].title,
                    err: result.reason,
                },
                "Failed to persist job"
            );
        }
    });
    return failed;
}

/** "Excluded title keyword: \"Senior\"" x3 -> { 'Excluded title keyword: "Senior"': 3 }. */
function countBy(values: string[]): Record<string, number> {
    return values.reduce<Record<string, number>>((counts, value) => {
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
    }, {});
}

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
    // Every line from this run carries runId, so overlapping logs can be split apart.
    const log = logger.child({ runId: randomUUID(), discovery });
    const startedAt = Date.now();
    // Tracks where we are, so a crash reports which stage failed.
    let stage: Stage = Stage.Discovery;

    try {
        log.info("Pipeline run started");

        // discovery on:  fetch from Apify and look up how far each job got.
        // discovery off: skip Apify, resume jobs left mid-pipeline in the DB.
        const jobsAttachedStatus = discovery
            ? await attachJobStatus(await fetchApifyJobs())
            : await getResumableJobs();

        // Never seen before: not in the DB yet.
        const filteredJobsWithoutStatus = jobsAttachedStatus
            .filter((job) => job.status == undefined)
            .map((_) => _.job);

        log.info(
            {
                stage,
                loaded: jobsAttachedStatus.length,
                new: filteredJobsWithoutStatus.length,
                byStatus: countBy(
                    jobsAttachedStatus.map((job) => job.status ?? "unsaved")
                ),
            },
            discovery ? "Fetched jobs from Apify" : "Loaded resumable jobs"
        );
        log.debug(
            {
                stage,
                titles: filteredJobsWithoutStatus.map((job) => job.title),
            },
            "New jobs"
        );

        // Save all new jobs to database
        stage = Stage.Persist;
        const newJobResults = await Promise.allSettled(
            filteredJobsWithoutStatus.map(async (job) =>
                saveJob(job, {
                    status: JobStatus.New,
                    source: job.source,
                })
            )
        );
        logWriteFailures(log, stage, newJobResults, filteredJobsWithoutStatus);

        // Saved by an earlier run that stopped before the rule gate.
        const filteredJobsWithNewStatus = jobsAttachedStatus
            .filter((job) => job.status == JobStatus.New)
            .map((_) => _.job);

        // Apply rule gate with reasoning
        stage = Stage.RuleGate;
        const { passed, rejected } = applyRuleGate([
            ...filteredJobsWithoutStatus,
            ...filteredJobsWithNewStatus,
        ]);

        log.info(
            {
                stage,
                passed: passed.length,
                rejected: rejected.length,
                reasons: countBy(rejected.map((r) => r.details)),
            },
            "Rule gate done"
        );

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
        logWriteFailures(
            log,
            stage,
            rejectedResults,
            rejected.map((r) => r.job)
        );

        // Save passed rule gate jobs to db
        const passedResults = await Promise.allSettled(
            passed.map(async (job) =>
                updateJob(job.id, {
                    status: JobStatus.PassedRule,
                })
            )
        );
        logWriteFailures(log, stage, passedResults, passed);

        // Passed the rule gate in an earlier run but never got matched.
        const filteredJobsWithPassedStatus = jobsAttachedStatus
            .filter((job) => job.status == JobStatus.PassedRule)
            .map((_) => _.job);

        // Semantic matcher with resumes for passed jobs
        stage = Stage.Semantic;
        const { passed: matchedResumeJobs, rejected: rejectedResumeJobs } =
            await matchJobs([...passed, ...filteredJobsWithPassedStatus]);

        log.info(
            {
                stage,
                matched: matchedResumeJobs.length,
                rejected: rejectedResumeJobs.length,
            },
            "Semantic match done"
        );

        // Save passed jobs with suggested resume to database
        const matchedResumeResults = await Promise.allSettled(
            matchedResumeJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.MatchedResume,
                    suggestedResume: match.resumeId,
                    cosineScore: match.cosineScore,
                    cosineThreshold: match.cosineThreshold,
                })
            )
        );
        logWriteFailures(
            log,
            stage,
            matchedResumeResults,
            matchedResumeJobs.map((m) => m.job)
        );

        // Update rejected jobs with semantic matching details to database
        const rejectedResumeResults = await Promise.allSettled(
            rejectedResumeJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.Rejected,
                    suggestedResume: match.resumeId,
                    rejectionReason: RejectionReason.Semantic,
                    cosineScore: match.cosineScore,
                    cosineThreshold: match.cosineThreshold,
                })
            )
        );
        logWriteFailures(
            log,
            stage,
            rejectedResumeResults,
            rejectedResumeJobs.map((m) => m.job)
        );

        // Matched a resume in an earlier run but never got LLM-scored. The
        // saved match data is needed to rebuild a JobMatchResult for them.
        const filteredJobsWithMatchedStatus = jobsAttachedStatus.filter(
            (
                m
            ): m is typeof m & {
                suggestedResume: string;
                cosineScore: number;
                cosineThreshold: number;
                status: JobStatus;
            } =>
                m.suggestedResume !== null &&
                m.cosineScore !== null &&
                m.cosineThreshold !== null &&
                m.status == JobStatus.MatchedResume
        );

        // Score resumed + freshly matched jobs with the LLM.
        stage = Stage.Llm;
        const { passed: passedJobs, rejected: rejectedJobs } =
            await classifyJobsByLLMScore([
                ...filteredJobsWithMatchedStatus.map((_) => ({
                    job: _.job,
                    resumeId: _.suggestedResume,
                    cosineThreshold: _.cosineThreshold,
                    cosineScore: _.cosineScore,
                })),
                ...matchedResumeJobs,
            ]);

        log.info(
            { stage, passed: passedJobs.length, rejected: rejectedJobs.length },
            "LLM scoring done"
        );
        log.debug(
            {
                stage,
                passed: passedJobs.map((m) => ({
                    title: m.job.title,
                    score: m.llmScore,
                })),
            },
            "LLM passed jobs"
        );

        // Update passed jobs status and reasonings to db
        const passedLLMResults = await Promise.allSettled(
            passedJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.PassedLlm,
                    llmReasoning: match.llmReasoning,
                    llmScore: match.llmScore,
                    llmThreshold: match.llmThreshold,
                })
            )
        );
        logWriteFailures(
            log,
            stage,
            passedLLMResults,
            passedJobs.map((m) => m.job)
        );

        // Update rejected jobs details to db
        const rejectedLLMResults = await Promise.allSettled(
            rejectedJobs.map(async (match) =>
                updateJob(match.job.id, {
                    status: JobStatus.Rejected,
                    llmReasoning: match.llmReasoning,
                    llmScore: match.llmScore,
                    llmThreshold: match.llmThreshold,
                    rejectionReason: RejectionReason.Llm,
                    rejectionDetails: match.llmReasoning,
                })
            )
        );
        logWriteFailures(
            log,
            stage,
            rejectedLLMResults,
            rejectedJobs.map((m) => m.job)
        );

        log.info(
            {
                durationMs: Date.now() - startedAt,
                passedLlm: passedJobs.length,
            },
            "Pipeline run finished"
        );
    } catch (error) {
        log.error(
            { stage, durationMs: Date.now() - startedAt, err: error },
            "Pipeline run failed"
        );
        throw new Error(`Failed to run pipeline at stage "${stage}"`, {
            cause: error,
        });
    }
}
