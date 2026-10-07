import { ApplicationStatus } from "@/types/job";
import { ChevronDown } from "lucide-react";

export const ApplicationStatusFilter = ({
    onChange,
    applicationStatus,
}: {
    onChange: (s: ApplicationStatus | undefined) => void;
    applicationStatus: ApplicationStatus | undefined;
}) => (
    <div className="relative inline-block max-w-full">
        <select
            value={applicationStatus ?? ""}
            // "" is the "All" option: no status filter
            onChange={(e) =>
                onChange((e.target.value as ApplicationStatus) || undefined)
            }
            className="appearance-none rounded-full border border-violet-200 bg-violet-50 py-2 pl-4 pr-9 text-sm font-medium text-violet-700 outline-none transition hover:bg-violet-100 focus:ring-2 focus:ring-violet-300"
        >
            <option key="all" value="">
                All
            </option>
            {Object.values(ApplicationStatus).map((s) => {
                const formattedLabel = s
                    .split("_")
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(" ");
                return (
                    <option key={s} value={s}>
                        {formattedLabel}
                    </option>
                );
            })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
    </div>
);
