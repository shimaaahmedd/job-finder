import "dotenv/config";
import { ApifyClient } from "apify-client";
import { ApifyJob, ApifyJobResult, ApplyType } from "../../types/job";
import { join } from "path";
import { readFileSync } from "fs";
import { buildLinkedInUrl } from "./linkedinUrlBuilder";

/**
 * Discovery via Apify.
 *
 * Runs the `curious_coder/linkedin-jobs-scraper` actor against a LinkedIn jobs
 * SEARCH URL (not a single posting), waits for it to finish, then returns
 * each job found tagged with its apply type, source, and the search URL.
 *
 * Why Apify instead of driving LinkedIn ourselves: the actor runs on Apify's
 * infrastructure with their proxies and anti-bot handling, so our IP and any
 * LinkedIn account stay out of it. We only ever talk to Apify's REST API.
 */

// How many jobs to pull. Keep small while testing — Apify bills per run/result.
const JOB_COUNT = 10;
const ACTOR_ID = "curious_coder/linkedin-jobs-scraper";

/** Read the saved search config fresh each call, so edits don't need a server restart. */
function loadSearchConfig(): LinkedInSearchConfig {
    const searchPath = join(__dirname, "../../../config/search.json");
    const { linkedInSearch } = JSON.parse(readFileSync(searchPath, "utf8"));
    return linkedInSearch;
}

/**
 * Infer how the job is applied to from its apply URL: a linkedin.com URL
 * means LinkedIn Easy Apply, anything else is the company's own site.
 */
const classifyApplyType =(job: ApifyJob): ApplyType => {
    if (!job.applyUrl || job.applyUrl === "") return "unknown";
    if (job.applyUrl.includes("linkedin.com")) return "easy_apply";
    return "external";
};

/**
 * Run the saved search (config/search.json) through the Apify actor and
 * return the jobs it found. Throws if the run fails or returns no jobs.
 */
export async function fetchApifyJobs(): Promise<ApifyJobResult[]> {
    const token = process.env.APIFY_TOKEN;
    if (!token) {
        throw new Error("APIFY_TOKEN is missing. Add it to your .env file.");
    }

    const client = new ApifyClient({ token });

    const search = loadSearchConfig();
    const params = buildLinkedInUrl(search);
    const searchUrl = `https://www.linkedin.com/jobs/search?${params}`;

    console.log(`Starting Apify actor for:\n  ${searchUrl}\n`);

    // .call() starts the run AND blocks until it finishes (or fails/times out).
    const run = await client.actor(ACTOR_ID).call({
        count: JOB_COUNT,
        scrapeCompany: true,
        splitByLocation: false,
        splitCountry: "US",
        urls: [searchUrl],
    });

    if (run.status !== "SUCCEEDED") {
        throw new Error(
            `Actor run did not succeed (status: ${run.status}). Run id: ${run.id}`
        );
    }

    // Results land in the run's default dataset; fetch the rows from there.
    const { items } = await client
        .dataset<ApifyJob>(run.defaultDatasetId)
        .listItems();

    if (items.length === 0) {
        throw new Error(`No items were fetched from apify`);
    }

    console.log(`Found ${items.length} jobs:\n`);
    return items.map((job) => ({
        ...job,
        applyType: classifyApplyType(job),
        inputUrl: searchUrl,
        source: "linkedin",
    }));
}
