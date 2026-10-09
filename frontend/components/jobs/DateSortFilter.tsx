import { SortDirection } from "@/types/job";
import { ChevronDown } from "lucide-react";

export const DateSortFilter = ({
    onChange,
    sort,
}: {
    onChange: (s: SortDirection | undefined) => void;
    sort: SortDirection | undefined;
}) => (
    <div className="relative inline-block max-w-full">
        <select
            value={sort ?? ""}
            // "" is the "Best match" option: no date sort
            onChange={(e) =>
                onChange((e.target.value as SortDirection) || undefined)
            }
            className="appearance-none rounded-full border border-violet-200 bg-violet-50 py-2 pl-4 pr-9 text-sm font-medium text-violet-700 outline-none transition hover:bg-violet-100 focus:ring-2 focus:ring-violet-300"
        >
            <option value="">Best match</option>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
    </div>
);
