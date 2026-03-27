export const PARTIAL_DATE_TIME_PLACEHOLDER = 'YYYY-MM-DD [HH[:mm[:ss]]]';

const PARTIAL_DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2})(?::(\d{2})(?::(\d{2}))?)?)?$/;

export function isValidPartialDateTime(searchText) {
  const trimmed = String(searchText || '').trim();
  const match = trimmed.match(PARTIAL_DATE_TIME_REGEX);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] !== undefined ? Number(match[4]) : 0;
  const minute = match[5] !== undefined ? Number(match[5]) : 0;
  const second = match[6] !== undefined ? Number(match[6]) : 0;

  if (month < 1 || month > 12) return false;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;

  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}