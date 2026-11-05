import { describe, it, expect } from 'vitest';
import {
  formatMonthYear,
  cleanNamePart,
  buildReportFileName,
  resolveGroupName,
} from './reportFileName';

describe('formatMonthYear', () => {
  it('formats January and December correctly', () => {
    expect(formatMonthYear(new Date(2027, 0, 15))).toBe('Jan-2027');
    expect(formatMonthYear(new Date(2026, 11, 31))).toBe('Dec-2026');
  });

  it('formats October correctly', () => {
    expect(formatMonthYear(new Date(2026, 9, 5))).toBe('Oct-2026');
  });

  it('handles invalid date safely', () => {
    expect(formatMonthYear(new Date(NaN))).toBe('Jan-1970');
  });
});

describe('cleanNamePart', () => {
  it('removes illegal characters and normalizes spaces, dots, hyphens, and underscores', () => {
    expect(cleanNamePart('Mr.  Al-Hassan__Khan', 'Member')).toBe('Mr_Al_Hassan_Khan');
  });

  it('removes illegal file characters (\\ / : * ? " < > | # % &) and control characters', () => {
    expect(cleanNamePart('Report: 100% #1 "Best" <test> | & * ? \x00\x1f', 'Group')).toBe('Report_100_1_Best_test');
  });

  it('handles "../etc/passwd" producing no path separator, dot or space', () => {
    const cleaned = cleanNamePart('../etc/passwd', 'Group');
    expect(cleaned).toBe('etcpasswd');
    expect(cleaned).not.toMatch(/[\\/.\s]/);
  });

  it('preserves Urdu names with proper underscores', () => {
    expect(cleanNamePart('منیر خان', 'Member')).toBe('منیر_خان');
    expect(cleanNamePart('فیصل حیات', 'Member')).toBe('فیصل_حیات');
  });

  it('falls back to default on empty or whitespace strings', () => {
    expect(cleanNamePart('', 'Member')).toBe('Member');
    expect(cleanNamePart('   ', 'Group')).toBe('Group');
    expect(cleanNamePart(undefined, 'Fallback')).toBe('Fallback');
    expect(cleanNamePart(null, 'Fallback')).toBe('Fallback');
    expect(cleanNamePart('___...---', 'Fallback')).toBe('Fallback');
  });

  it('cuts to 30 characters without trailing underscore', () => {
    // 35 characters: 29 'a', then '_', then 5 'b' -> 30th char is '_' which must be trimmed
    const longName = 'a'.repeat(29) + '_' + 'b'.repeat(5);
    const cleaned = cleanNamePart(longName, 'Member');
    expect(cleaned).toBe('a'.repeat(29));
    expect(cleaned.endsWith('_')).toBe(false);
    expect(Array.from(cleaned).length).toBeLessThanOrEqual(30);
  });

  it('does not split an emoji at the cut point', () => {
    // 29 letters followed by an emoji (e.g. 👍)
    const withEmoji = 'a'.repeat(29) + '👍' + 'extra';
    const cleaned = cleanNamePart(withEmoji, 'Member');
    // The emoji at position 30 is kept intact, and not broken into a partial surrogate
    expect(cleaned).toBe('a'.repeat(29) + '👍');
    expect(Array.from(cleaned).length).toBe(30);
  });
});

describe('buildReportFileName', () => {
  const date = new Date(2026, 9, 15); // Oct 2026

  it('builds individual report pattern [Month-Year]-[User Name]-[Group Name]', () => {
    const name = buildReportFileName({
      date,
      groupName: 'Flat Mates',
      userName: 'Munir Khan',
    });
    expect(name).toBe('Oct-2026-Munir_Khan-Flat_Mates');
  });

  it('builds collective report pattern [Month-Year]-[Group Name] when userName is undefined', () => {
    const name = buildReportFileName({
      date,
      groupName: 'Flat Mates',
      userName: undefined,
    });
    expect(name).toBe('Oct-2026-Flat_Mates');
  });

  it('treats empty string userName as individual and falls back to Member', () => {
    const name = buildReportFileName({
      date,
      groupName: 'Flat Mates',
      userName: '',
    });
    expect(name).toBe('Oct-2026-Member-Flat_Mates');
  });

  it('falls back to Group when groupName is empty or missing', () => {
    const name = buildReportFileName({
      date,
      groupName: '',
      userName: undefined,
    });
    expect(name).toBe('Oct-2026-Group');
  });
});

describe('resolveGroupName', () => {
  it('finds the active team name from userTeams list', () => {
    const userTeams = [
      { teamId: 't1', teamName: 'Office Khata' },
      { teamId: 't2', teamName: 'Flat Mates' },
    ];
    expect(resolveGroupName(userTeams, 't2')).toBe('Flat Mates');
  });

  it('falls back to "Group" when activeTeamId is not found or empty', () => {
    const userTeams = [{ teamId: 't1', teamName: 'Office Khata' }];
    expect(resolveGroupName(userTeams, 't999')).toBe('Group');
    expect(resolveGroupName(userTeams, null)).toBe('Group');
    expect(resolveGroupName(undefined, 't1')).toBe('Group');
    expect(resolveGroupName([{ teamId: 't1', teamName: '   ' }], 't1')).toBe('Group');
  });
});
