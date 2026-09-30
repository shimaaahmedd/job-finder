/**
 * Shape of config/rules.json — the configurable rule-gate settings.
 * Every rule has `enabled` and a human-readable `description`.
 */

interface BaseRule {
    enabled: boolean;
    description: string;
}

export interface ExperienceThresholdRule extends BaseRule {
    /** Reject jobs requiring more than this many years of experience. */
    maxYears: number;
}

export interface SalaryFloorRule extends BaseRule {
    /** Reject jobs whose max advertised salary is below this (USD/year). */
    minimumUSD: number;
}

/** A rule that rejects when any of `keywords` is found in the relevant text. */
export interface KeywordRule extends BaseRule {
    keywords: string[];
}

export interface RulesConfig {
    experienceThreshold: ExperienceThresholdRule;
    excludedTitleKeywords: KeywordRule;
    excludedDescriptionKeywords: KeywordRule;
    salaryFloor: SalaryFloorRule;
    excludeInternships: KeywordRule;
    excludedKeywords: KeywordRule;
    excludeApplyTypes: KeywordRule;
}
