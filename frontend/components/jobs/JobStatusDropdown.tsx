import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { ApplicationStatus } from "@/types/job";

const STATUS_OPTIONS = [
    { value: ApplicationStatus.NotApplied, label: "Not Applied" },
    { value: ApplicationStatus.Applied, label: "Applied" },
    { value: ApplicationStatus.DeclinedByCompany, label: "Rejected" },
    { value: ApplicationStatus.Interviewing, label: "Interviewing" },
    { value: ApplicationStatus.NotInterested, label: "Not Interested" },
    { value: ApplicationStatus.Offer, label: "Got Offer" },
    { value: ApplicationStatus.Saved, label: "Saved" },
] as const;

type JobApplicationStatusDropdownProps = {
    jobId: string;
    applicationStatus: ApplicationStatus | null;
    onChange: (jobId: string, applicationStatus: ApplicationStatus) => void;
};

export const JobStatusDropdown = ({
    jobId,
    applicationStatus,
    onChange,
}: JobApplicationStatusDropdownProps) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape
    useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) =>
            e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const current = STATUS_OPTIONS.find((o) => o.value === applicationStatus);

    return (
        // stopPropagation so clicks don't trigger the JobCard's own onClick
        <div
            ref={ref}
            className="relative"
            onClick={(e) => e.stopPropagation()}
        >
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors cursor-pointer"
            >
                <span>{current?.label ?? "Set status"}</span>
                <ChevronDownIcon
                    className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open && (
                <ul className="absolute right-0 z-10 mt-1 w-44 rounded-md bg-gray-800 py-1 shadow-lg ring-1 ring-black/10">
                    {STATUS_OPTIONS.map((opt) => (
                        <li key={opt.value}>
                            <button
                                onClick={() => {
                                    setOpen(false);
                                    if (opt.value !== applicationStatus)
                                        onChange(jobId, opt.value);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm text-white hover:bg-gray-700 cursor-pointer"
                            >
                                {opt.label}
                                {opt.value === applicationStatus && (
                                    <CheckIcon className="w-4 h-4" />
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
