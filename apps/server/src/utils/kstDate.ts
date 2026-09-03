const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Formats `date` as a "YYYY-MM-DD" calendar date in Asia/Seoul (KST,
 * UTC+9) — completely independent of the server process's own local
 * timezone. Never uses `Date`'s local-timezone getters (getFullYear/
 * getMonth/getDate, or an Intl timeZone string that depends on ICU data
 * being present): the input instant is shifted by the fixed +9h KST
 * offset first, then read back out with the UTC getters, which always
 * report those shifted absolute wall-clock fields regardless of where
 * the process happens to be running.
 *
 * Used as `rankingDate` for games with GameMetadata.rankingPeriod ===
 * "daily" — a leaderboard automatically resets the moment this string's
 * value changes (00:00 KST), with no cron job or row deletion involved.
 */
export function kstDateString(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
