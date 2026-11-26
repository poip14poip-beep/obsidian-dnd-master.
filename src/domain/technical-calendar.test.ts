import { describe, expect, it } from "vitest";
import {
  INTERCALARY_DAYS,
  TECHNICAL_CALENDAR_DAYS_PER_YEAR,
  TECHNICAL_SEASONS,
  advanceTechnicalDateByElapsedMinutes,
  resolveTechnicalDate,
} from "./technical-calendar";

describe("technical Ekdrasil calendar", () => {
  it("defines four seasons with three 30-day months each", () => {
    expect(TECHNICAL_SEASONS).toHaveLength(4);
    expect(TECHNICAL_SEASONS.flatMap((season) => season.months)).toHaveLength(12);
    expect(TECHNICAL_SEASONS.every((season) => season.months.length === 3)).toBe(true);
    expect(TECHNICAL_CALENDAR_DAYS_PER_YEAR).toBe(365);
  });

  it("formats a regular date without inventing a clock time", () => {
    const date = resolveTechnicalDate(91, 2000);
    expect(date.season).toBe("Лето");
    expect(date.month).toBe("Солар");
    expect(date.dayOfMonth).toBe(1);
    expect(date.hour).toBeNull();
    expect(date.minute).toBeNull();
    expect(date.formatted).toContain("1 Солар, 2000 год");
    expect(date.formatted).toContain("время не установлено");
  });

  it("keeps five intercalary days outside the twelve months", () => {
    expect(INTERCALARY_DAYS).toHaveLength(5);
    const first = resolveTechnicalDate(361, 2000);
    const last = resolveTechnicalDate(365, 2000);
    expect(first.intercalaryDay).toBe("День Пробуждения");
    expect(first.month).toBeNull();
    expect(last.intercalaryDay).toBe("День Возвращения Света");
    expect(last.season).toBeNull();
    expect(last.formatted).toContain("время не установлено");
  });

  it("rejects invalid day-of-year and year values", () => {
    expect(() => resolveTechnicalDate(0, 2000)).toThrow();
    expect(() => resolveTechnicalDate(366, 2000)).toThrow();
    expect(() => resolveTechnicalDate(1, -1)).toThrow();
    expect(() => resolveTechnicalDate(1, 2000.5)).toThrow();
  });

  it("advances the date only after full 24-hour periods since campaign start", () => {
    const start = resolveTechnicalDate(91, 2000).formatted;
    expect(advanceTechnicalDateByElapsedMinutes(start, 1439)).toContain("1 Солар, 2000 год");
    expect(advanceTechnicalDateByElapsedMinutes(start, 1440)).toContain("2 Солар, 2000 год");
    expect(advanceTechnicalDateByElapsedMinutes(start, 2880)).toContain("3 Солар, 2000 год");
  });

  it("crosses month, intercalary-day, and year boundaries", () => {
    const beforeMonth = resolveTechnicalDate(30, 2000).formatted;
    expect(advanceTechnicalDateByElapsedMinutes(beforeMonth, 1440)).toContain("1 Эльвар, 2000 год");

    const beforeIntercalary = resolveTechnicalDate(360, 2000).formatted;
    expect(advanceTechnicalDateByElapsedMinutes(beforeIntercalary, 1440)).toContain("День Пробуждения, 2000 год");

    const lastDay = resolveTechnicalDate(365, 2000).formatted;
    expect(advanceTechnicalDateByElapsedMinutes(lastDay, 1440)).toContain("1 Лиорен, 2001 год");
  });

  it("returns null for unsupported dates or invalid elapsed time", () => {
    expect(advanceTechnicalDateByElapsedMinutes("UNKNOWN", 1440)).toBeNull();
    expect(advanceTechnicalDateByElapsedMinutes(resolveTechnicalDate(1, 2000).formatted, -1)).toBeNull();
    expect(advanceTechnicalDateByElapsedMinutes(resolveTechnicalDate(1, 2000).formatted, 1.5)).toBeNull();
  });

});
