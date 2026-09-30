import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

// Initialize the plugin once here
dayjs.extend(relativeTime);

/**
 * Converts an ISO timestamp into a human-readable relative time string (e.g., "2 hours ago")
 */
export function formatRelativeTime(isoString: string): string {
    if (!isoString) return "";
    return dayjs(isoString).fromNow();
}

export function formatPlainDate(isoString: string): string {
    if (!isoString) return "";
    return dayjs(isoString).format("YYYY-MM-DD");
}
