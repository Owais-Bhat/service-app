const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_UTC_OFFSET_MINUTES = 330;

function secondsUntilNextMidnight(
    nowMs = Date.now(),
    utcOffsetMinutes = DEFAULT_CACHE_UTC_OFFSET_MINUTES
) {
    const shiftedNowMs = nowMs + utcOffsetMinutes * 60 * 1000;
    const elapsedTodayMs = ((shiftedNowMs % DAY_MS) + DAY_MS) % DAY_MS;
    return Math.max(1, Math.ceil((DAY_MS - elapsedTodayMs) / 1000));
}

function cacheTtlUntilMidnight(
    requestedTtlSeconds,
    nowMs = Date.now(),
    utcOffsetMinutes = DEFAULT_CACHE_UTC_OFFSET_MINUTES
) {
    const requested = Math.max(1, Math.floor(Number(requestedTtlSeconds) || 1));
    return Math.min(requested, secondsUntilNextMidnight(nowMs, utcOffsetMinutes));
}

module.exports = {
    DEFAULT_CACHE_UTC_OFFSET_MINUTES,
    cacheTtlUntilMidnight,
    secondsUntilNextMidnight,
};
