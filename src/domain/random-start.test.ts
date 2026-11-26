import { describe, expect, it } from "vitest";
import { generateRandomStart, RANDOM_START_CITY_COUNT } from "./random-start";

describe("generateRandomStart", () => {
  it("uses deterministic draws for city and scene while preserving full HP", () => {
    const draws = [7, 2];
    const result = generateRandomStart(184, (length) => {
      const value = draws.shift();
      if (value === undefined || value >= length) throw new Error("Invalid test draw");
      return value;
    });
    expect(result.city.name).toBe("Морвейн");
    expect(result.city.region).toBe("Эстерваль");
    expect(result.scene).toBe("На городском рынке");
    expect(result.hpCurrent).toBe(184);
    expect(result.healthLabel).toBe("Без заметных ранений");
    expect(result.characterPatch.hpMax).toBeUndefined();
    expect(result.characterPatch.hpCurrent).toBe(184);
  });

  it("selects only one of the 16 canonically listed main cities", () => {
    expect(RANDOM_START_CITY_COUNT).toBe(16);
    for (let cityIndex = 0; cityIndex < RANDOM_START_CITY_COUNT; cityIndex += 1) {
      const result = generateRandomStart(184, (length) => Math.min(cityIndex, length - 1));
      expect(result.city.name).toBeTruthy();
      expect(result.location.sourceId).toBe("src-ekdrasil-chronicle");
    }
  });

  it("does not invent an exact date, cash balance, or quest", () => {
    const result = generateRandomStart(184, () => 0);
    expect(result.date).toContain("день и время UNKNOWN");
    expect(result.narrative).toContain("не задание");
    expect(result.inventory).toEqual([]);
    expect(result.characterPatch.hpMax).toBeUndefined();
    expect(result.characterPatch.abilityScores).toBeUndefined();
  });

  it("always starts with full HP instead of unexplained random injuries", () => {
    const result = generateRandomStart(184, () => 0);
    expect(result.hpCurrent).toBe(184);
    expect(result.healthLabel).toBe("Без заметных ранений");
    expect(result.healthDescription).toContain("полными HP");
  });
});
