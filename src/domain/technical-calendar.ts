/**
 * Technical Calendar 1.0 for the Ekdrasil Game Master.
 * This is an application timekeeping convention, NOT world canon.
 * 365 days: 12 named months of 30 days, followed by five intercalary days.
 */
export const TECHNICAL_CALENDAR_NAME = "Технический календарь мастера 1.0";

export const TECHNICAL_SEASONS = [
  { name: "Весна", months: ["Лиорен", "Эльвар", "Цветозар"] },
  { name: "Лето", months: ["Солар", "Златень", "Огнеяр"] },
  { name: "Осень", months: ["Янтар", "Туманель", "Листопад"] },
  { name: "Зима", months: ["Иневар", "Снежень", "Долгосвет"] },
] as const;

export const INTERCALARY_DAYS = [
  "День Пробуждения",
  "День Высокого Солнца",
  "День Урожая",
  "День Угасания",
  "День Возвращения Света",
] as const;

export const TECHNICAL_CALENDAR_DAYS_PER_YEAR = 365;
export const TECHNICAL_CALENDAR_DAYS_PER_MONTH = 30;
export const TECHNICAL_CALENDAR_MONTH_COUNT = 12;

export interface TechnicalDate {
  year: number;
  dayOfYear: number;
  season: string | null;
  month: string | null;
  dayOfMonth: number | null;
  intercalaryDay: string | null;
  /** Time is deliberately unset until the game establishes it. */
  hour: number | null;
  minute: number | null;
  formatted: string;
}

export function resolveTechnicalDate(dayOfYear: number, year: number, hour: number | null = null, minute: number | null = null): TechnicalDate {
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > TECHNICAL_CALENDAR_DAYS_PER_YEAR) {
    throw new Error("День года должен быть в диапазоне от 1 до 365.");
  }
  if (!Number.isInteger(year) || year < 0) throw new Error("Год должен быть целым неотрицательным числом.");
  if ((hour === null) !== (minute === null) || (hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) || (minute !== null && (!Number.isInteger(minute) || minute < 0 || minute > 59))) throw new Error("Некорректное время.");
  const clock = hour === null || minute === null ? "время не установлено" : String(hour).padStart(2,"0") + ":" + String(minute).padStart(2,"0");

  if (dayOfYear > TECHNICAL_CALENDAR_MONTH_COUNT * TECHNICAL_CALENDAR_DAYS_PER_MONTH) {
    const intercalaryDay = INTERCALARY_DAYS[dayOfYear - 361]!;
    return {
      year, dayOfYear, season: null, month: null, dayOfMonth: null, intercalaryDay,
      hour, minute,
      formatted: `${intercalaryDay}, ${year} год · ${clock} · ${TECHNICAL_CALENDAR_NAME}`,
    };
  }

  const monthIndex = Math.floor((dayOfYear - 1) / TECHNICAL_CALENDAR_DAYS_PER_MONTH);
  const dayOfMonth = ((dayOfYear - 1) % TECHNICAL_CALENDAR_DAYS_PER_MONTH) + 1;
  const season = TECHNICAL_SEASONS[Math.floor(monthIndex / 3)]!;
  const month = season.months[monthIndex % 3]!;
  return {
    year, dayOfYear, season: season.name, month, dayOfMonth, intercalaryDay: null,
    hour, minute,
    formatted: `${dayOfMonth} ${month}, ${year} год · ${clock} · ${TECHNICAL_CALENDAR_NAME}`,
  };
}


/** Advances the calendar date and clock from the campaign-start time. */
export function advanceTechnicalDateByElapsedMinutes(startDate: string, elapsedMinutes: number): string | null {
  if (!Number.isInteger(elapsedMinutes) || elapsedMinutes < 0) return null;
  const parts = startDate.split(" · "); const datePart = parts[0]?.trim(); if (!datePart) return null;
  const clockMatch = parts.slice(1).join(" · ").match(/(?:^|\\s)([01]\\d|2[0-3]):([0-5]\\d)(?:\\s|$)/);
  const initialHour = clockMatch ? Number(clockMatch[1]) : null; const initialMinute = clockMatch ? Number(clockMatch[2]) : null;
  let dayOfYear: number | null = null; let year: number | null = null;
  const regular = datePart.match(/^(\\d{1,2})\\s+(.+),\\s*(\\d+)\\s+год$/);
  if (regular) {
    const day = Number(regular[1]); year = Number(regular[3]);
    const monthIndex = TECHNICAL_SEASONS.flatMap((season) => season.months).findIndex((month) => month === regular[2]);
    if (monthIndex < 0 || day < 1 || day > 30) return null; dayOfYear = monthIndex * 30 + day;
  } else {
    const intercalary = datePart.match(/^(.+),\\s*(\\d+)\\s+год$/); if (!intercalary) return null;
    const index = INTERCALARY_DAYS.findIndex((name) => name === intercalary[1]); if (index < 0) return null;
    year = Number(intercalary[2]); dayOfYear = 360 + index + 1;
  }
  if (year === null || !Number.isInteger(year) || year < 0 || dayOfYear === null) return null;
  const clockStart = initialHour === null || initialMinute === null ? null : initialHour * 60 + initialMinute;
  const total = (clockStart ?? 0) + elapsedMinutes; const absoluteDay = year * 365 + dayOfYear - 1 + Math.floor(total / 1440);
  const nextYear = Math.floor(absoluteDay / 365); const nextDay = absoluteDay % 365 + 1;
  const nextHour = clockStart === null ? null : Math.floor((total % 1440) / 60); const nextMinute = clockStart === null ? null : total % 60;
  return resolveTechnicalDate(nextDay, nextYear, nextHour, nextMinute).formatted;
}
