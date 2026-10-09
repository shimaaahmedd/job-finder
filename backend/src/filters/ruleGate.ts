import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApifyJobResult } from "../types/job";
import type { RulesConfig } from "../types/rules";

/**
 * The rule gate: a fast, deterministic first-pass filter that rejects jobs
 * using the configurable rules in config/rules.json.
 *
 * It is a PURE function — no database access, no network, no mutation of the
 * input. The only side effect is a single summary log line at the end.
 */

export interface RejectedJob {
    job: ApifyJobResult;
    details: string;
}

// Load the rules once, at module startup.
const rulesPath = join(__dirname, "../../config/rules.json");
const rules: RulesConfig = JSON.parse(readFileSync(rulesPath, "utf8"));

// --- small text parsers -------------------------------------------------

/** Lowest "N years of experience" requirement in the text, or null if none is found. */
function parseRequiredYears(text?: string): number | null {
    if (!text) return null;

    // Ignore numbers above this (e.g. "over 100 years" of company history)
    const MAX_PLAUSIBLE_YEARS = 15;

    // "7+ years", "4-6+ years", "3 to 5 yrs": group 1 is always the minimum
    const YEARS_RE =
        /\b(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b/gi;

    // The segment must mention experience
    const EXPERIENCE_RE = /\bexp(?:erience[ds]?)?\b/i;

    // Split into bullets (newlines) and sentences
    const SEGMENT_SPLIT_RE = /\n|(?<=[.!?])\s+/;

    const values: number[] = [];

    for (const segment of text.split(SEGMENT_SPLIT_RE)) {
        // Skip segments that don't talk about experience
        if (!EXPERIENCE_RE.test(segment)) continue;

        // Collect every "N years" figure in the segment
        for (const match of segment.matchAll(YEARS_RE)) {
            const years = Number(match[1]);
            if (years <= MAX_PLAUSIBLE_YEARS) values.push(years);
        }
    }

    // Use the lowest requirement: "2+ yrs React, 5+ yrs AWS" -> 2 (passes a max of 4)
    return values.length > 0 ? Math.min(...values) : null;
}

/**
 * Largest USD figure in a salary string, annualized. Handles "$120,000",
 * "$120K", ranges, and hourly rates ("$55/hr" -> ~$114k). Returns null when
 * there's no parseable figure (so we don't reject jobs with unknown salary).
 */
function parseMaxSalaryUSD(salary?: string): number | null {
    if (!salary) return null;
    const values = [...salary.matchAll(/([\d,]+(?:\.\d+)?)\s*([kK])?/g)]
        .map((m) => {
            const num = Number(m[1].replace(/,/g, ""));
            if (Number.isNaN(num)) return null;
            return m[2] ? num * 1000 : num;
        })
        .filter((n): n is number => n !== null);

    if (values.length === 0) return null;

    let max = Math.max(...values);
    // Annualize hourly pay (~40h/week * 52 weeks).
    if (/hour|\/\s*hr|\bhr\b|\/h\b/i.test(salary)) {
        max = max * 40 * 52;
    }
    return max;
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `text` contain any of `keywords` as a whole word (case-insensitive)?
 * Returns the hit. "intern" won't match "Internal", "Lead" won't match
 * "Leading". Phrases in `allowed` are removed first, so allowing
 * "Mid-Senior" keeps it from tripping "Senior".
 */
function findKeyword(
    text: string,
    keywords: string[],
    allowed: string[] = []
): string | undefined {
    const haystack = allowed.reduce(
        (acc, phrase) =>
            acc.replace(new RegExp(escapeRegExp(phrase), "gi"), " "),
        text
    );
    return keywords.find((k) =>
        new RegExp(`(?<![a-z0-9])${escapeRegExp(k)}(?![a-z0-9])`, "i").test(
            haystack
        )
    );
}

// --- rule evaluation ----------------------------------------------------

/** Returns a rejection reason for the first failing rule, or null if it passes. */
function evaluate(job: ApifyJobResult): string | null {
    // 1. Excluded keyword in the job title. Checked first: the title is the
    // clearest signal, so it's the reason recorded when both rules would fail.
    const titleKeywords = rules.excludedTitleKeywords;
    if (titleKeywords.enabled) {
        const hit = findKeyword(
            job.title,
            titleKeywords.keywords,
            titleKeywords.allowedPhrases
        );
        if (hit) return `Excluded title keyword: "${hit}"`;
    }

    // 2. Too many years of experience required.
    const exp = rules.experienceThreshold;
    if (exp.enabled) {
        const required = parseRequiredYears(job.descriptionText);
        if (required !== null && required > exp.maxYears) {
            return `Requires ${required} years of experience (max ${exp.maxYears})`;
        }
    }

    // 3. Excluded keyword in the job description.
    const descriptionKeywords = rules.excludedDescriptionKeywords;
    if (descriptionKeywords.enabled && job.descriptionText) {
        const hit = findKeyword(
            job.descriptionText,
            descriptionKeywords.keywords
        );
        if (hit) return `Excluded description keyword: "${hit}"`;
    }

    // 4. Max salary is below the floor (only when a salary is present).
    const salaryFloor = rules.salaryFloor;
    if (salaryFloor.enabled) {
        const maxSalary = parseMaxSalaryUSD(job.salary);
        if (maxSalary !== null && maxSalary < salaryFloor.minimumUSD) {
            return `Max salary $${Math.round(maxSalary)} below floor $${salaryFloor.minimumUSD}`;
        }
    }

    // 5. Internship role.
    const internships = rules.excludeInternships;
    if (internships.enabled) {
        const text = `${job.title} ${job.employmentType ?? ""}`;
        const hit = findKeyword(text, internships.keywords);
        if (hit) return `Internship indicator: "${hit}"`;
    }

    // 6. Apply type
    const applyType = rules.excludeApplyTypes;
    if (applyType.enabled) {
        if (applyType.keywords.includes(job.applyType)) {
            return `Apply type is ${job.applyType}`;
        }
    }

    // 7. Custom excluded keywords.
    const custom = rules.excludedKeywords;
    if (custom.enabled && custom.keywords.length > 0) {
        const text = `${job.title} ${job.descriptionText ?? ""}`;
        const hit = findKeyword(text, custom.keywords);
        if (hit) return `Excluded keyword: "${hit}"`;
    }

    return null;
}

/**
 * Splits jobs into those that pass every enabled rule and those rejected,
 * each rejection carrying the reason it failed.
 */
export function applyRuleGate(jobs: ApifyJobResult[]): {
    passed: ApifyJobResult[];
    rejected: RejectedJob[];
} {
    const passed: ApifyJobResult[] = [];
    const rejected: RejectedJob[] = [];

    for (const job of jobs) {
        const detailedReason = evaluate(job);
        if (detailedReason) {
            rejected.push({ job, details: detailedReason });
        } else {
            passed.push(job);
        }
    }

    console.log(
        `Rule gate: ${passed.length} passed, ${rejected.length} rejected`
    );
    return { passed, rejected };
}
