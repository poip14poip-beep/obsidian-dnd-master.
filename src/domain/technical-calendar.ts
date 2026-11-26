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
  hour: null;
  minute: null;
  formatted: string;
}

export function resolveTechnicalDate(dayOfYear: number, year: number): TechnicalDate {
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > TECHNICAL_CALENDAR_DAYS_PER_YEAR) {
    throw new Error("День года должен быть в диапазоне от 1 до 365.");
  }
  if (!Number.isInteger(year) || year < 0) throw new Error("Год должен быть целым неотрицательным числом.");

  if (dayOfYear > TECHNICAL_CALENDAR_MONTH_COUNT * TECHNICAL_CALENDAR_DAYS_PER_MONTH) {
    const intercalaryDay = INTERCALARY_DAYS[dayOfYear - 361]!;
    return {
      year, dayOfYear, season: null, month: null, dayOfMonth: null, intercalaryDay,
      hour: null, minute: null,
      formatted: `${intercalaryDay}, ${year} год · время не установлено · ${TECHNICAL_CALENDAR_NAME}`,
    };
  }

  const monthIndex = Math.floor((dayOfYear - 1) / TECHNICAL_CALENDAR_DAYS_PER_MONTH);
  const dayOfMonth = ((dayOfYear - 1) % TECHNICAL_CALENDAR_DAYS_PER_MONTH) + 1;
  const season = TECHNICAL_SEASONS[Math.floor(monthIndex / 3)]!;
  const month = season.months[monthIndex % 3]!;
  return {
    year, dayOfYear, season: season.name, month, dayOfMonth, intercalaryDay: null,
    hour: null, minute: null,
    formatted: `${dayOfMonth} ${month}, ${year} год · время не установлено · ${TECHNICAL_CALENDAR_NAME}`,
  };
}


/**
 * Advances the technical date by full 24-hour periods since the campaign start.
 * The campaign start clock is intentionally unknown, so the first calendar day
 * begins at campaign start rather than assuming an invented midnight.
 */
export function advanceTechnicalDateByElapsedMinutes(
  startDate: string,
  elapsedMinutes: number,
): string | null {
  if (!Number.isInteger(elapsedMinutes) || elapsedMinutes < 0) return null;

  const datePart = startDate.split(" · ")[0]?.trim();
  if (!datePart) return null;

  let dayOfYear: number | null = null;
  let year: number | null = null;

  const regularDate = datePart.match(/^(\d{1,2})\s+(.+),\s*(\d+)\s+год$/);
  if (regularDate) {
    const day = Number(regularDate[1]);
    const monthName = regularDate[2];
    year = Number(regularDate[3]);
    const monthIndex = TECHNICAL_SEASONS.flatMap((season) => season.months)
      .findIndex((month) => month === monthName);
    if (monthIndex < 0 || day < 1 || day > TECHNICAL_CALENDAR_DAYS_PER_MONTH) return null;
    dayOfYear = monthIndex * TECHNICAL_CALENDAR_DAYS_PER_MONTH + day;
  } else {
    const intercalaryDate = datePart.match(/^(.+),\s*(\d+)\s+год$/);
    if (!intercalaryDate) return null;
    const intercalaryIndex = INTERCALARY_DAYS.findIndex((name) => name === intercalaryDate[1]);
    if (intercalaryIndex < 0) return null;
    year = Number(intercalaryDate[2]);
    dayOfYear = TECHNICAL_CALENDAR_MONTH_COUNT * TECHNICAL_CALENDAR_DAYS_PER_MONTH + intercalaryIndex + 1;
  }

  if (year === null || !Number.isInteger(year) || year < 0 || dayOfYear === null) return null;
  const absoluteDay = year * TECHNICAL_CALENDAR_DAYS_PER_YEAR + dayOfYear - 1 +
    Math.floor(elapsedMinutes / 1440);
  const nextYear = Math.floor(absoluteDay / TECHNICAL_CALENDAR_DAYS_PER_YEAR);
  const nextDayOfYear = (absoluteDay % TECHNICAL_CALENDAR_DAYS_PER_YEAR) + 1;
  return resolveTechnicalDate(nextDayOfYear, nextYear).formatted;
}
