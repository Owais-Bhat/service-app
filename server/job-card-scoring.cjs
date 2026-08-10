// Pure functions for job-card time scoring and the monthly technician
// leaderboard. No DB or Express dependency — keep it that way so it stays
// directly unit-testable (mirrors the server/cache-expiry.cjs pattern).

/**
 * Ratio of expected time to actual time, capped at 1.0 so finishing early
 * doesn't earn more than full credit (avoids rewarding rushed jobs).
 * Returns null if either input is missing/invalid.
 */
function computeTimeEfficiency(expectedMinutes, actualMinutes) {
  const expected = Number(expectedMinutes);
  const actual = Number(actualMinutes);
  if (!expected || expected <= 0 || !actual || actual <= 0) return null;
  return Math.min(1, expected / actual);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * jobs: array of
 *   { assigned_employee_id, assigned_employee_name,
 *     secondary_employee_id, secondary_employee_name,
 *     feedback_rating, expected_time_minutes, actual_minutes }
 * Only verified jobs (verification_call_status IN confirmed_ok/issue_found)
 * should be passed in — filtering happens at the SQL layer, not here.
 *
 * Returns an array sorted by combinedScore descending:
 *   { employeeId, name, avgRating, avgTimeEfficiency, jobsCount, combinedScore }
 */
function computeLeaderboard(jobs) {
  const byEmployee = new Map();

  const credit = (id, name, rating, efficiency) => {
    if (!id) return;
    let entry = byEmployee.get(id);
    if (!entry) {
      entry = { employeeId: id, name: name || 'Unknown', ratings: [], efficiencies: [], jobsCount: 0 };
      byEmployee.set(id, entry);
    }
    entry.jobsCount += 1;
    if (rating != null) entry.ratings.push(Number(rating));
    if (efficiency != null) entry.efficiencies.push(efficiency);
  };

  for (const job of jobs) {
    const efficiency = computeTimeEfficiency(job.expected_time_minutes, job.actual_minutes);
    credit(job.assigned_employee_id, job.assigned_employee_name, job.feedback_rating, efficiency);
    if (job.secondary_employee_id) {
      credit(job.secondary_employee_id, job.secondary_employee_name, job.feedback_rating, efficiency);
    }
  }

  const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null);

  const rows = Array.from(byEmployee.values()).map((e) => {
    const avgRating = avg(e.ratings);
    const avgTimeEfficiency = avg(e.efficiencies);
    const components = [];
    if (avgRating != null) components.push((avgRating / 5) * 100);
    if (avgTimeEfficiency != null) components.push(avgTimeEfficiency * 100);
    const combinedScore = components.length ? round2(avg(components)) : 0;
    return {
      employeeId: e.employeeId,
      name: e.name,
      avgRating: avgRating != null ? round2(avgRating) : null,
      avgTimeEfficiency: avgTimeEfficiency != null ? round2(avgTimeEfficiency) : null,
      jobsCount: e.jobsCount,
      combinedScore,
    };
  });

  rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return rows;
}

module.exports = { computeTimeEfficiency, computeLeaderboard };
