/**
 * Turns a LinkedInSearchConfig into the query string of a LinkedIn jobs
 * search URL, translating our readable enum values into LinkedIn's filter
 * codes (f_TPR, f_JT, f_E, f_WT).
 */

// --- LinkedIn filter codes -----------------------------------------------

/** f_TPR: "posted within the last N seconds". */
const LINKEDIN_DATE_POSTED_CODES: Record<DatePosted, string> = {
    past_1_hour: "r3600",
    past_24_hours: "r86400",
    past_week: "r604800",
    past_month: "r2592000",
};

/** f_JT: employment type. */
const LINKEDIN_JOB_TYPE_CODES: Record<JobType, string> = {
    full_time: "F",
    part_time: "P",
    contract: "C",
    temporary: "T",
    internship: "I",
};

/** f_E: experience level. */
const LINKEDIN_EXPERIENCE_LEVEL_CODES: Record<ExperienceLevel, string> = {
    internship: "1",
    entry_level: "2",
    associate: "3",
    mid_senior: "4",
    director: "5",
    executive: "6",
};

/** f_WT: on-site / remote / hybrid. */
const LINKEDIN_WORK_TYPE_CODES: Record<WorkType, string> = {
    on_site: "1",
    remote: "2",
    hybrid: "3",
};

// --- converters ------------------------------------------------------------

const getDatePostedLinkedInFormat = (date: DatePosted): string => {
    // default to past 24 hours if an unrecognized value slips through
    return LINKEDIN_DATE_POSTED_CODES[date] ?? "r86400";
};

const getJobTypeLinkedInFormat = (jobTypes: JobType[]): string[] => {
    return jobTypes.map((jobType) => LINKEDIN_JOB_TYPE_CODES[jobType]) ?? "F";
};

const getExperienceLevelLinkedInFormat = (
    experienceLevels: ExperienceLevel[]
): string[] => {
    return experienceLevels.map(
        (experienceLevel) =>
            LINKEDIN_EXPERIENCE_LEVEL_CODES[experienceLevel] ?? "2"
    );
};

const getWorkTypesLinkedInFormat = (workTypes: WorkType[]): string[] => {
    return workTypes.map(
        (workType) => LINKEDIN_WORK_TYPE_CODES[workType] ?? "2"
    );
};

/**
 * Build the query string (no leading "?") for a LinkedIn jobs search.
 * Optional filters left out of the config are left out of the URL.
 * Multi-value filters are comma-joined, e.g. f_JT=F,C.
 */
export const buildLinkedInUrl =(config: LinkedInSearchConfig): string => {
    const params = new URLSearchParams();

    params.set("keywords", config.keywords);
    params.set("location", config.location);

    if (config.geoId) {
        params.set("geoId", config.geoId);
    }

    if (config.datePosted) {
        const datePosted = getDatePostedLinkedInFormat(config.datePosted);
        params.set("f_TPR", datePosted);
    }

    if (config.jobTypes) {
        const jobTypes = getJobTypeLinkedInFormat(config.jobTypes);
        params.set("f_JT", jobTypes.join(","));
    }

    if (config.experienceLevels) {
        const experienceLevels = getExperienceLevelLinkedInFormat(
            config.experienceLevels
        );
        params.set("f_E", experienceLevels.join(","));
    }

    if (config.workTypes) {
        const workTypes = getWorkTypesLinkedInFormat(config.workTypes);
        params.set("f_WT", workTypes.join(","));
    }

    return params.toString();
};
