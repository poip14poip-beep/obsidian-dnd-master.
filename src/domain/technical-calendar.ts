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
