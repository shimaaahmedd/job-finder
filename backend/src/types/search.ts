/**
 * Shape of config/search.json — the saved LinkedIn search the pipeline runs.
 *
 * Note: this file has no imports/exports, so TypeScript treats it as a global
 * script and these types are visible everywhere without importing. Adding an
 * import or export here would turn it into a module and break those usages.
 * The trailing comments give the LinkedIn URL codes each value maps to (see
 * linkedinUrlBuilder.ts).
 */

type DatePosted = "past_1_hour" | "past_24_hours" | "past_week" | "past_month";
type JobType =
    "full_time" | "part_time" | "contract" | "temporary" | "internship";
type WorkType = "on_site" | "remote" | "hybrid";
type ExperienceLevel =
    | "internship"
    | "entry_level"
    | "associate"
    | "mid_senior"
    | "director"
    | "executive";

interface LinkedInSearchConfig {
    id: string;
    label: string;
    keywords: string;
    location: string;
    geoId?: string;
    datePosted?: DatePosted; // r86400, r604800, r2592000
    jobTypes?: JobType[]; // F, P, C, T
    experienceLevels?: ExperienceLevel[]; // 1,2,3,4,5,6
    workTypes?: WorkType[]; // 1=onsite, 2=remote, 3=hybrid
    enabled: boolean;
}
