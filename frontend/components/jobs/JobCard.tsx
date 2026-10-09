import { Job } from "@/types/job";
import { ScoreBadge } from "./ScoreBadge";
import { useState } from "react";
import { formatPlainDate, formatRelativeTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useMarkJobAs } from "@/hooks/useMarkJobAs";
import { JobStatusDropdown } from "./JobStatusDropdown";
import { ExpireButton } from "./ExpireButton";
import { useMarkJobAsExpired } from "@/hooks/useMarkJobAsExpired";

type JobCardProps = {
    job: Job;
    highScore: number | null;
};

export const JobCard = ({ job, highScore }: JobCardProps) => {
    const [expanded, setExpanded] = useState(false);
    const [expandedReason, setExpandedReason] = useState(false);
    const { mutate: markAs } = useMarkJobAs();
    const { mutate: markJobAsExpired } = useMarkJobAsExpired();

    const {
        title,
        companyName,
        location,
        seniorityLevel,
        employmentType,
        salary,
        postedAt,
        applyUrl,
        link,
        applyType,
        status,
        applicationStatus,
        rejectionReason,
        rejectionDetails,
        source,
        cosineScore,
        llmScore,
        llmReasoning,
        suggestedResumeLabel,
        suggestedResumeVersion,
        cosineThreshold,
        llmThreshold,
        closedAt,
        appliedAt,
        createdAt,
    } = job;

    const formattedAppliedAt = appliedAt ? formatRelativeTime(appliedAt) : null;
    const formattedClosedAt = closedAt ? formatRelativeTime(closedAt) : null;

    return (
        <div
            className="shadow rounded-xl p-4 w-full cursor-pointer"
            onClick={() => setExpanded((prev) => !prev)}
        >
            <div className="flex w-full flex-col gap-2">
                <div className="flex justify-between items-center">
                    <p className="font-bold text-2xl">{companyName}</p>
                    <ScoreBadge
                        score={llmScore ?? 0}
                        highScore={highScore ?? 0.7}
                        threshold={llmThreshold ?? 0.8}
                    />
                </div>
                <p className="font-semibold text-2xl">{title}</p>
                <p className="text-xl font-semibold">{employmentType}</p>
                <p className="text-xl">
                    <span className="font-semibold">Location:</span> {location}
                </p>
                <p className="text-xl">
                    <span className="font-semibold">Seniority Level: </span>
                    {seniorityLevel}
                </p>
                {salary && <p className="text-xl">{salary}</p>}
                <div className="flex justify-between items-center gap-4">
                    <p className="text-xl">
                        <span className="font-semibold">Status: </span>
                        {status
                            .split("_")
                            .map((_) => _.charAt(0).toUpperCase() + _.slice(1))
                            .join(" ")}
                    </p>
                    {postedAt && (
                        <p className="text-lg">
                            {formatRelativeTime(postedAt)}
                        </p>
                    )}
                    {!postedAt && createdAt && (
                        <p className="text-lg">
                            <span>Created At</span>
                            {formatPlainDate(createdAt)}
                        </p>
                    )}
                </div>
                {expanded ? (
                    <>
                        {suggestedResumeLabel && (
                            <p className="text-xl">
                                <span className="font-semibold">
                                    Suggested Resume:{" "}
                                </span>
                                {suggestedResumeLabel} v{suggestedResumeVersion}
                            </p>
                        )}
                        {rejectionReason && (
                            <p className="text-xl">
                                <span className="font-semibold">
                                    Rejection Reason:{" "}
                                </span>
                                {rejectionReason
                                    .split("_")
                                    .map(
                                        (_) =>
                                            _.charAt(0).toUpperCase() +
                                            _.slice(1)
                                    )
                                    .join(" ")}
                            </p>
                        )}
                        {llmReasoning ? (
                            <>
                                <p
                                    className={cn(
                                        "text-xl",
                                        !expandedReason &&
                                            llmReasoning.length > 120 &&
                                            "line-clamp-2"
                                    )}
                                >
                                    <span className="font-semibold">
                                        Llm Reasoning:
                                    </span>
                                    {llmReasoning}
                                </p>

                                {llmReasoning.length > 120 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedReason((prev) => !prev);
                                        }}
                                        className="mt-1 text-xs text-blue-600 hover:underline"
                                    >
                                        {expandedReason
                                            ? "See less"
                                            : "See more"}
                                    </button>
                                )}
                            </>
                        ) : rejectionDetails ? (
                            <>
                                <p
                                    className={cn(
                                        "text-xl",
                                        !expandedReason &&
                                            rejectionDetails.length > 120 &&
                                            "line-clamp-2"
                                    )}
                                >
                                    <span className="font-semibold">
                                        Rejection Details:{" "}
                                    </span>
                                    {rejectionDetails}
                                </p>

                                {rejectionDetails.length > 120 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedReason((prev) => !prev);
                                        }}
                                        className="mt-1 text-xs text-blue-600 hover:underline"
                                    >
                                        {expandedReason
                                            ? "See less"
                                            : "See more"}
                                    </button>
                                )}
                            </>
                        ) : null}
                        {applyType && (
                            <p className="text-xl">
                                <span className="font-semibold">
                                    Apply Type:{" "}
                                </span>
                                {applyType}
                            </p>
                        )}
                        {source && (
                            <p className="text-xl">
                                <span className="font-semibold">Source: </span>
                                {source.charAt(0).toUpperCase() +
                                    source.slice(1)}
                            </p>
                        )}
                        {cosineScore != null && (
                            <p className="text-xl">
                                <span className="font-semibold">
                                    Cosine Score:{" "}
                                </span>
                                {cosineScore}
                            </p>
                        )}
                        {cosineThreshold != null && (
                            <p className="text-xl">
                                <span className="font-semibold">
                                    Cosine Threshold:{" "}
                                </span>
                                {cosineThreshold}
                            </p>
                        )}
                        {llmThreshold != null && (
                            <p className="text-xl">
                                <span className="font-semibold">
                                    LLM Threshold:{" "}
                                </span>
                                {llmThreshold}
                            </p>
                        )}
                        <div className="flex justify-between items-center gap-4">
                            {(applyUrl || link) && (
                                <a
                                    href={applyUrl || link || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xl text-blue-600 underline hover:text-blue-800 transition-colors w-16"
                                >
                                    Link
                                </a>
                            )}
                            <JobStatusDropdown
                                applicationStatus={applicationStatus}
                                jobId={job.id}
                                onChange={(jobId, applicationStatus) =>
                                    markAs({ jobId, applicationStatus })
                                }
                            />
                        </div>
                        {formattedAppliedAt && (
                            <p
                                title={`Applied ${formattedAppliedAt}`}
                                className="text-sm text-gray-500"
                            >
                                Applied {formattedAppliedAt}
                            </p>
                        )}
                        {formattedClosedAt ? (
                            <p
                                className="text-sm text-gray-500"
                                title={`Closed ${formattedClosedAt}`}
                            >
                                Closed {formattedClosedAt}
                            </p>
                        ) : (
                            <ExpireButton
                                id={job.id}
                                onClick={(jobId) => markJobAsExpired({ jobId })}
                            />
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
};
