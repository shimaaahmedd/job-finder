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

/** Largest "N years" / "N+ yrs" figure mentioned in the text, else null. */
function parseMaxRequiredYears(text?: string): number | null {
    if (!text) return null;
    const matches = [...text.matchAll(/(\d+)\s*\+?\s*(?:years|yrs)/gi)];
    if (matches.length === 0) return null;
    return Math.max(...matches.map((m) => Number(m[1])));
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

/** Does `text` contain any of `keywords` (case-insensitive)? Returns the hit. */
function findKeyword(text: string, keywords: string[]): string | undefined {
    const haystack = text.toLowerCase();
    return keywords.find((k) => haystack.includes(k.toLowerCase()));
}

// --- rule evaluation ----------------------------------------------------

/** Returns a rejection reason for the first failing rule, or null if it passes. */
function evaluate(job: ApifyJobResult): string | null {
    // 1. Too many years of experience required.
    const exp = rules.experienceThreshold;
    if (exp.enabled) {
        const required = parseMaxRequiredYears(job.descriptionText);
        if (required !== null && required > exp.maxYears) {
            return `Requires ${required} years of experience (max ${exp.maxYears})`;
        }
    }

    // 2. Excluded keyword in the job title.
    const titleKeywords = rules.excludedTitleKeywords;
    if (titleKeywords.enabled) {
        const hit = findKeyword(job.title, titleKeywords.keywords);
        if (hit) return `Excluded title keyword: "${hit}"`;
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
