import { ToggleLeft, ToggleRight } from "lucide-react";

export const ExpireToggle = ({
    active,
    onClick,
}: {
    active: boolean;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        aria-label="Show expired jobs"
        aria-pressed={!active}
        type="button"
        className="cursor-pointer bg-none border-none flex gap-1 items-center"
    >
        {active ? (
            <ToggleRight size={32} color="#22c55e" /> // Green when ON
        ) : (
            <ToggleLeft size={32} color="#6b7280" /> // Gray when OFF
        )}
        <span className="text-lg font-bold">
            {active ? "Active" : "Expired"}
        </span>
    </button>
);
