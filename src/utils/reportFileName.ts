/**
 * Utilities for formatting and cleaning report file names.
 * Pure module without React Native dependencies.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Formats a Date as 3-letter month and 4-digit year (e.g. "Oct-2026", "Jan-2027").
 */
export function formatMonthYear(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Jan-1970';
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/**
 * Cleans a name segment for use in file names and file:// URIs:
 * - Removes illegal characters (\ / : * ? " < > | # % & and control characters).
 * - Turns any run of spaces, dots, hyphens, or underscores into a single "_".
 * - Trims leading and trailing "_".
 * - Preserves letters of any script (Urdu, etc.).
 * - Cuts to max 30 code points without splitting multi-byte characters or emojis.
 * - Removes any trailing "_" after cutting.
 * - Falls back to the given fallback if empty or missing.
 */
export function cleanNamePart(raw: string | undefined | null, fallback: string): string {
  if (raw === undefined || raw === null) {
    return fallback;
  }

  // 1. Remove characters that are illegal in file names or break file:// URIs (\ / : * ? " < > | # % & and control chars)
  let s = raw.replace(/[\\/:*?"<>|#%&\x00-\x1f\x7f-\x9f]/g, '');

  // 2. Turn any run of spaces, dots, hyphens, or underscores into a single "_"
  s = s.replace(/[\s.\-_]+/g, '_');

  // 3. Trim leading and trailing "_"
  s = s.replace(/^_+|_+$/g, '');

  if (!s) {
    return fallback;
  }

  // 4. Cut to 30 characters by code points / graphemes (never split an emoji or multi-byte letter)
  let chars: string[];
  if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function') {
    const segmenter = new (Intl as any).Segmenter();
    chars = Array.from(segmenter.segment(s), (item: any) => item.segment);
  } else {
    chars = Array.from(s);
  }

  if (chars.length > 30) {
    s = chars.slice(0, 30).join('');
    s = s.replace(/_+$/g, '');
  }

  return s || fallback;
}

/**
 * Builds standard report base file name (without extension):
 * - Individual: [Month-Year]-[User Name]-[Group Name]
 * - Collective: [Month-Year]-[Group Name] (when userName === undefined)
 */
export function buildReportFileName(params: {
  date: Date;
  groupName: string;
  userName?: string;
}): string {
  const monthYear = formatMonthYear(params.date);
  const group = cleanNamePart(params.groupName, 'Group');

  if (params.userName === undefined) {
    return `${monthYear}-${group}`;
  }

  const user = cleanNamePart(params.userName, 'Member');
  return `${monthYear}-${user}-${group}`;
}

/**
 * Resolves active team name from store userTeams list, falling back to 'Group'.
 */
export function resolveGroupName(
  userTeams: Array<{ teamId?: string; teamName?: string; name?: string; [key: string]: any }> | undefined | null,
  activeTeamId: string | undefined | null
): string {
  if (!userTeams || !activeTeamId) return 'Group';
  const team = userTeams.find(t => t && t.teamId === activeTeamId);
  const rawName = team?.teamName || team?.name;
  if (!rawName || typeof rawName !== 'string') return 'Group';
  const trimmed = rawName.trim();
  return trimmed || 'Group';
}
