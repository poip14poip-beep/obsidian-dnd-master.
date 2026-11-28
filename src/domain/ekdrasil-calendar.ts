/**
 * Canonical Ekdrasil calendar, sourced from Ekdrasil World Bible 2.4 §76.
 * 12 months × 30 days, five intercalary days, and a sixth intercalary day
 * every fourth year. Year 0 is the epoch; the first leap year is year 4.
 * Intercalary days are numbered because canon does not establish their names.
 */
export const EKDRASIL_CALENDAR_NAME = "Календарь Экдрасиля 2.4";
export const EKDRASIL_MONTHS = [
  "Вейра", "Арвен", "Лот", "Селен", "Сол", "Меран",
  "Кхар", "Дрен", "Варн", "Норр", "Скельд", "Морн",
] as const;
export const EKDRASIL_SEASONS = [
  { name: "Весна", months: EKDRASIL_MONTHS.slice(0, 3) },
  { name: "Лето", months: EKDRASIL_MONTHS.slice(3, 6) },
  { name: "Осень", months: EKDRASIL_MONTHS.slice(6, 9) },
  { name: "Зима", months: EKDRASIL_MONTHS.slice(9, 12) },
] as const;
export const EKDRASIL_REGULAR_DAYS_PER_YEAR = 365;
export const EKDRASIL_LEAP_DAY_INTERVAL = 4;

export function isEkdrasilLeapYear(year: number): boolean {
  if (!Number.isInteger(year) || year < 0) throw new Error("Год Экдрасиля должен быть целым неотрицательным числом.");
  return year > 0 && year % EKDRASIL_LEAP_DAY_INTERVAL === 0;
}
export function ekdrasilDaysInYear(year: number): number {
  return EKDRASIL_REGULAR_DAYS_PER_YEAR + (isEkdrasilLeapYear(year) ? 1 : 0);
}
function daysBeforeYear(year: number): number {
  return EKDRASIL_REGULAR_DAYS_PER_YEAR * year + Math.floor(Math.max(0, year - 1) / EKDRASIL_LEAP_DAY_INTERVAL);
}
export interface EkdrasilDate {
  year: number; dayOfYear: number; season: string | null; month: string | null;
  dayOfMonth: number | null; intercalaryDay: string | null;
  hour: number | null; minute: number | null; formatted: string;
}
export function resolveEkdrasilDate(dayOfYear: number, year: number, hour: number | null = null, minute: number | null = null): EkdrasilDate {
  if (!Number.isInteger(year) || year < 0) throw new Error("Год Экдрасиля должен быть целым неотрицательным числом.");
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > ekdrasilDaysInYear(year)) {
    throw new Error(`День года должен быть в диапазоне от 1 до ${ekdrasilDaysInYear(year)} для ${year} года.`);
  }
  if ((hour === null) !== (minute === null) ||
      (hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) ||
      (minute !== null && (!Number.isInteger(minute) || minute < 0 || minute > 59))) {
    throw new Error("Некорректное время.");
  }
  const clock = hour === null || minute === null ? "время не установлено" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  let season: string | null = null;
  let month: string | null = null;
  let dayOfMonth: number | null = null;
  let intercalaryDay: string | null = null;
  let dateLabel: string;
  if (dayOfYear <= 360) {
    const monthIndex = Math.floor((dayOfYear - 1) / 30);
    dayOfMonth = ((dayOfYear - 1) % 30) + 1;
    month = EKDRASIL_MONTHS[monthIndex]!;
    season = EKDRASIL_SEASONS[Math.floor(monthIndex / 3)]!.name;
    dateLabel = `${dayOfMonth} ${month}`;
  } else {
    const number = dayOfYear - 360;
    intercalaryDay = `Межгодовой день ${number}`;
    dateLabel = intercalaryDay;
  }
  return {
    year, dayOfYear, season, month, dayOfMonth, intercalaryDay, hour, minute,
    formatted: `${dateLabel}, ${year} год · ${clock} · ${EKDRASIL_CALENDAR_NAME}`,
  };
}
export function parseEkdrasilDateTime(value: string): number | null {
  const parts = value.split(" · ");
  const datePart = parts[0]?.trim() ?? "";
  const clockMatch = parts.slice(1).join(" · ").match(/(?:^|\s)([01]\d|2[0-3]):([0-5]\d)(?:\s|$)/);
  if (!clockMatch) return null;
  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);
  const regular = datePart.match(/^(\d{1,2})\s+(.+),\s*(\d+)\s+год$/);
  const intercalary = datePart.match(/^Межгодовой день (\d+),\s*(\d+)\s+год$/i);
  let year: number;
  let dayOfYear: number;
  if (regular) {
    const day = Number(regular[1]);
    year = Number(regular[3]);
    const monthIndex = EKDRASIL_MONTHS.findIndex((name) => name === regular[2]);
    if (monthIndex < 0 || day < 1 || day > 30) return null;
    dayOfYear = monthIndex * 30 + day;
  } else if (intercalary) {
    const day = Number(intercalary[1]);
    year = Number(intercalary[2]);
    if (!Number.isInteger(year) || year < 0 || day < 1 || day > ekdrasilDaysInYear(year) - 360) return null;
    dayOfYear = 360 + day;
  } else return null;
  if (!Number.isInteger(year) || year < 0 || dayOfYear > ekdrasilDaysInYear(year)) return null;
  const absoluteMinutes = (daysBeforeYear(year) + dayOfYear - 1) * 1440 + hour * 60 + minute;
  return Number.isSafeInteger(absoluteMinutes) ? absoluteMinutes : null;
}
export function advanceEkdrasilDateByElapsedMinutes(startDate: string, elapsedMinutes: number): string | null {
  if (!Number.isSafeInteger(elapsedMinutes) || elapsedMinutes < 0) return null;
  const start = parseEkdrasilDateTime(startDate);
  if (start === null) return null;
  const total = start + elapsedMinutes;
  if (!Number.isSafeInteger(total)) return null;
  const absoluteDay = Math.floor(total / 1440);
  const minuteOfDay = total % 1440;
  let low = 0;
  let high = Math.floor(absoluteDay / EKDRASIL_REGULAR_DAYS_PER_YEAR) + 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (daysBeforeYear(middle) <= absoluteDay) low = middle;
    else high = middle - 1;
  }
  const year = low;
  const dayOfYear = absoluteDay - daysBeforeYear(year) + 1;
  return resolveEkdrasilDate(dayOfYear, year, Math.floor(minuteOfDay / 60), minuteOfDay % 60).formatted;
}
