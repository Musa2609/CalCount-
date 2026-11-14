import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSameDay,
  parse,
  startOfWeek,
  subDays,
} from 'date-fns';

const DATE_KEY_FORMAT = 'yyyy-MM-dd';

/** Local (not UTC) calendar key. Prevents off-by-one day bugs around midnight. */
export function toDateKey(date: Date): string {
  return format(date, DATE_KEY_FORMAT);
}

export function fromDateKey(key: string): Date {
  const parsed = parse(key, DATE_KEY_FORMAT, new Date());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDaysToKey(key: string, days: number): string {
  return toDateKey(addDays(fromDateKey(key), days));
}

export function subtractDaysFromKey(key: string, days: number): string {
  return toDateKey(subDays(fromDateKey(key), days));
}

export function isTodayKey(key: string): boolean {
  return isSameDay(fromDateKey(key), new Date());
}

export function isFutureKey(key: string): boolean {
  return key > todayKey();
}

export function isPastKey(key: string): boolean {
  return key < todayKey();
}

export function differenceInDaysKeys(later: string, earlier: string): number {
  return differenceInCalendarDays(fromDateKey(later), fromDateKey(earlier));
}

export function formatFriendlyDate(key: string): string {
  const date = fromDateKey(key);
  const today = new Date();
  const diff = differenceInCalendarDays(date, today);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  if (diff > -7 && diff < 0) return format(date, 'EEEE');
  if (date.getFullYear() === today.getFullYear()) return format(date, 'EEE, d MMM');
  return format(date, 'd MMM yyyy');
}

export function formatLongDate(key: string): string {
  return format(fromDateKey(key), 'EEEE, d MMMM');
}

export function formatShortDate(key: string): string {
  return format(fromDateKey(key), 'd MMM');
}

export function formatMonthYear(key: string): string {
  return format(fromDateKey(key), 'MMM yyyy');
}

export function formatWeekRange(startKey: string, endKey: string): string {
  return `${format(fromDateKey(startKey), 'd MMM')} – ${format(fromDateKey(endKey), 'd MMM')}`;
}

export function startOfWeekKey(key: string): string {
  return toDateKey(startOfWeek(fromDateKey(key), { weekStartsOn: 1 }));
}

/** Ascending list of local date keys ending at `endKey` (inclusive). */
export function dateRangeKeys(endKey: string, days: number): string[] {
  const safeDays = Math.max(1, Math.floor(days));
  const end = fromDateKey(endKey);
  const start = subDays(end, safeDays - 1);
  return eachDayOfInterval({ start, end }).map(toDateKey);
}

export function dateRangeBetween(startKey: string, endKey: string): string[] {
  if (startKey > endKey) return [];
  return eachDayOfInterval({ start: fromDateKey(startKey), end: fromDateKey(endKey) }).map(
    toDateKey,
  );
}

export function weekdayInitial(key: string): string {
  return format(fromDateKey(key), 'EEEEE');
}

export function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'h:mm a');
}
