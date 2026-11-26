import { describe, expect, it } from "vitest";
import {
  INTERCALARY_DAYS,
  TECHNICAL_CALENDAR_DAYS_PER_YEAR,
  TECHNICAL_SEASONS,
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
});
