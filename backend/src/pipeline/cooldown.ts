const DEFAULT_COOLDOWN_MINUTES = 30;

/** Cooldown length in ms, from PIPELINE_COOLDOWN_MINUTES (falls back to the default if unset or invalid). */
export function getCooldownMs(): number {
    const minutes = Number(process.env.PIPELINE_COOLDOWN_MINUTES);
    const isValid = Number.isFinite(minutes) && minutes > 0;
    return (isValid ? minutes : DEFAULT_COOLDOWN_MINUTES) * 60_000;
}

/** Milliseconds left before another run is allowed; 0 means go ahead. */
export function getCooldownRemainingMs(
    finishedAt: Date | null,
    now: Date,
    cooldownMs: number
): number {
    if (!finishedAt) return 0;
    const elapsed = now.getTime() - finishedAt.getTime();
    return Math.max(0, cooldownMs - elapsed);
}
