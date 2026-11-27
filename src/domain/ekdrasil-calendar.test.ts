import { describe, expect, it } from "vitest";
import {
  EKDRASIL_CALENDAR_NAME, EKDRASIL_MONTHS, EKDRASIL_SEASONS,
  advanceEkdrasilDateByElapsedMinutes, ekdrasilDaysInYear, isEkdrasilLeapYear,
  parseEkdrasilDateTime, resolveEkdrasilDate,
} from "./ekdrasil-calendar";

describe("canonical Ekdrasil calendar 2.4", () => {
  it("uses the twelve canon months and four seasonal groups", () => {
    expect(EKDRASIL_MONTHS).toEqual(["Вейра","Арвен","Лот","Селен","Сол","Меран","Кхар","Дрен","Варн","Норр","Скельд","Морн"]);
    expect(EKDRASIL_SEASONS.map((season) => season.months.length)).toEqual([3,3,3,3]);
    expect(EKDRASIL_CALENDAR_NAME).toBe("Календарь Экдрасиля 2.4");
  });
  it("adds the sixth intercalary day every fourth year", () => {
    expect(isEkdrasilLeapYear(2000)).toBe(true);
    expect(isEkdrasilLeapYear(2001)).toBe(false);
    expect(ekdrasilDaysInYear(2000)).toBe(366);
    expect(ekdrasilDaysInYear(2001)).toBe(365);
    expect(resolveEkdrasilDate(366, 2000).intercalaryDay).toBe("Межгодовой день 6");
    expect(() => resolveEkdrasilDate(366, 2001)).toThrow();
  });
  it("formats canonical month and season names", () => {
    const date = resolveEkdrasilDate(91, 2000, 9, 5);
    expect(date.month).toBe("Селен");
    expect(date.season).toBe("Лето");
    expect(date.formatted).toContain("1 Селен, 2000 год · 09:05");
    expect(date.formatted).toContain(EKDRASIL_CALENDAR_NAME);
  });
  it("advances across months, intercalary days, leap day and year boundary", () => {
    const monthEnd = resolveEkdrasilDate(30, 2000, 23, 30).formatted;
    expect(advanceEkdrasilDateByElapsedMinutes(monthEnd, 45)).toContain("1 Арвен, 2000 год · 00:15");
    const beforeLeapDay = resolveEkdrasilDate(365, 2000, 23, 59).formatted;
    expect(advanceEkdrasilDateByElapsedMinutes(beforeLeapDay, 1)).toContain("Межгодовой день 6, 2000 год · 00:00");
    const lastLeapDay = resolveEkdrasilDate(366, 2000, 23, 59).formatted;
    expect(advanceEkdrasilDateByElapsedMinutes(lastLeapDay, 1)).toContain("1 Вейра, 2001 год · 00:00");
  });
  it("parses valid dates and rejects unsupported or malformed dates", () => {
    const date = resolveEkdrasilDate(1, 2000, 8, 30).formatted;
    expect(parseEkdrasilDateTime(date)).not.toBeNull();
    expect(parseEkdrasilDateTime("31 Вейра, 2000 год · 08:30 · Календарь Экдрасиля 2.4")).toBeNull();
    expect(parseEkdrasilDateTime("Межгодовой день 6, 2001 год · 08:30 · Календарь Экдрасиля 2.4")).toBeNull();
    expect(advanceEkdrasilDateByElapsedMinutes("UNKNOWN", 10)).toBeNull();
  });
});
