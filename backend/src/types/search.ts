/**
 * Shape of config/search.json — the saved LinkedIn search the pipeline runs.
 * Trailing comments give the LinkedIn URL codes each value maps to (see
 * linkedinUrlBuilder.ts).
 */

export type DatePosted =
    | "past_1_hour"
    | "past_24_hours"
    | "past_week"
    | "past_month";
export type JobType =
    "full_time" | "part_time" | "contract" | "temporary" | "internship";
export type WorkType = "on_site" | "remote" | "hybrid";
export type ExperienceLevel =
    | "internship"
    | "entry_level"
    | "associate"
    | "mid_senior"
    | "director"
    | "executive";

export interface LinkedInSearchConfig {
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
