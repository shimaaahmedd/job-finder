import { cn } from "@/lib/utils";

const getBadgeColor = (
    score: number,
    threshold: number | null,
    highScore: number | null
) => {
    if (threshold === null) return "bg-gray-100 text-gray=600";
    if (score < threshold) return "bg-gray-100 text-gray-600";
    if (highScore != null && score >= highScore)
        return "bg-green-100 text-green-800";
    return "bg-yellow-100 text=yellow-800";
};

export const ScoreBadge = ({
    score,
    highScore,
    threshold,
}: {
    score: number;
    highScore: number;
    threshold: number;
}) => {
    const mode = getBadgeColor(score, threshold, highScore);

    return <div className={cn("rounded-xl m-1 px-3 py-1", mode)}>{score}</div>;
};
