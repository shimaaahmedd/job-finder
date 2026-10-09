"use client";

import { useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { ApplicationStatus, JobStatus, SortDirection } from "@/types/job";
import { JobCard } from "./JobCard";
import { HighScoreInput } from "./HighScoreInput";
import { StatusFilter } from "./StatusFilter";
import { ApplicationStatusFilter } from "./ApplicationStatusFilter";
import { ExpireToggle } from "./ExpireToggle";
import { DateSortFilter } from "./DateSortFilter";

const PAGE_SIZE = 21;

export function JobsList() {
    const [highScore, setHighScore] = useState<number | null>(null);
    const [page, setPage] = useState(0);
    const [status, setStatus] = useState<JobStatus | undefined>(
        JobStatus.PassedLlm
    );
    const [applicationStatus, setApplicationStatus] = useState<
        ApplicationStatus | undefined
    >(ApplicationStatus.NotApplied);
    const [active, setActive] = useState(true);
    const [sort, setSort] = useState<SortDirection | undefined>(undefined);

    const handleStatusChange = (newStatus: JobStatus | undefined) => {
        setStatus(newStatus);
        setPage(0); // reset page so you don't land on an empty page
    };

    const handleApplicationStatusChange = (
        newStatus: ApplicationStatus | undefined
    ) => {
        setApplicationStatus(newStatus);
        setPage(0); // reset page so you don't land on an empty page
    };

    const handleSortChange = (newSort: SortDirection | undefined) => {
        setSort(newSort);
        setPage(0); // a new order starts from the first page
    };

    const toggleExpiryStatusChange = () => {
        setActive((prev) => !prev);
        setPage(0);
    };

    const { data, isLoading, isError } = useJobs({
        status,
        applicationStatus,
        active,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sort,
    });

    const filter = (
        <StatusFilter status={status} onChange={handleStatusChange} />
    );

    const applicationFilter = (
        <ApplicationStatusFilter
            applicationStatus={applicationStatus}
            onChange={handleApplicationStatusChange}
        />
    );

    const sortFilter = (
        <DateSortFilter sort={sort} onChange={handleSortChange} />
    );

    const expiryToggle = (
        <ExpireToggle active={active} onClick={toggleExpiryStatusChange} />
    );

    if (isLoading)
        return (
            <div className="flex flex-col p-4">
                <div className="flex gap-4">
                    {filter}
                    {applicationFilter}
                    {sortFilter}
                    {expiryToggle}
                </div>
                <p>Loading...</p>
            </div>
        );

    if (isError)
        return (
            <div className="flex flex-col p-4">
                <div className="flex gap-4">
                    {filter}
                    {applicationFilter}
                    {sortFilter}
                    {expiryToggle}
                </div>
                <p>Something went wrong.</p>
            </div>
        );

    if (!data || data.items.length === 0)
        return (
            <div className="flex flex-col p-4 gap-4">
                <div className="flex gap-4">
                    {filter}
                    {applicationFilter}
                    {sortFilter}
                    {expiryToggle}
                </div>
                <p className="pl-4">No jobs yet.</p>
            </div>
        );

    const totalPages = Math.ceil(data.total / PAGE_SIZE);

    return (
        <div className="flex flex-col p-4 w-full justify-between gap-4">
            <div className="flex gap-4 flex-col">
                <div className="flex  justify-between w-full flex-wrap">
                    <div className="flex gap-4">
                        {filter}
                        {applicationFilter}
                        {sortFilter}
                        {expiryToggle}
                    </div>
                    <HighScoreInput
                        onChange={setHighScore}
                        highScore={highScore}
                    />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(500px,1fr))] gap-4">
                    {data.items.map((job) => (
                        <JobCard key={job.id} job={job} highScore={highScore} />
                    ))}
                </div>
            </div>

            <div className="flex justify-between">
                <button
                    type="button"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 0}
                    className="cursor-pointer text-blue-600 underline hover:text-blue-800 transition-colors disabled:no-underline disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                    Prev
                </button>
                <span>
                    Page {page + 1} of {totalPages}
                </span>
                <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page + 1 >= totalPages}
                    className="cursor-pointer text-blue-600 underline hover:text-blue-800 transition-colors disabled:no-underline disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
