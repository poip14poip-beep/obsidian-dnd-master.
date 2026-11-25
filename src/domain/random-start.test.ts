import { describe, expect, it } from "vitest";
import { generateRandomStart, RANDOM_START_CITY_COUNT } from "./random-start";

describe("generateRandomStart", () => {
  it("uses supplied deterministic draws for city, scene, health and HP", () => {
    const draws = [7, 2, 1, 18];
    const result = generateRandomStart((length) => {
      const value = draws.shift();
      if (value === undefined || value >= length) throw new Error("Invalid test draw");
      return value;
    });

    expect(result.city.name).toBe("Морвейн");
    expect(result.city.region).toBe("Эстерваль");
    expect(result.scene).toBe("На городском рынке");
    expect(result.hpCurrent).toBe(183);
    expect(result.healthLabel).toBe("Незначительные повреждения");
    expect(result.characterPatch.hpMax).toBe(184);
    expect(result.characterPatch.hpCurrent).toBe(183);
  });

  it("selects only one of the 16 canonically listed main cities", () => {
    expect(RANDOM_START_CITY_COUNT).toBe(16);
    for (let cityIndex = 0; cityIndex < RANDOM_START_CITY_COUNT; cityIndex += 1) {
      const draws = [cityIndex, 0, 0];
      const result = generateRandomStart((length) => {
        const value = draws.shift();
        if (value === undefined || value >= length) throw new Error("Invalid test draw");
        return value;
      });
      expect(result.city.name).toBeTruthy();
      expect(result.location.sourceId).toBe("src-ekdrasil-chronicle");
    }
  });

  it("does not invent an exact date, cash balance, or quest", () => {
    const draws = [0, 0, 0];
    const result = generateRandomStart((length) => {
      const value = draws.shift();
      if (value === undefined || value >= length) throw new Error("Invalid test draw");
      return value;
    });
    expect(result.date).toContain("день и время UNKNOWN");
    expect(result.narrative).toContain("не задание");
    expect(result.inventory.find((item) => item.name === "Кошелёк")?.certainty).toBe("UNKNOWN");
    expect(result.characterPatch.conditions).toEqual([]);
  });

  it("keeps generated HP inside the selected non-lethal starting ranges", () => {
    const cases = [
      { draws: [0, 0, 0], expected: 184 },
      { draws: [0, 0, 1, 18], expected: 183 },
      { draws: [0, 0, 2, 29], expected: 164 },
      { draws: [0, 0, 3, 34], expected: 134 },
    ];
    for (const item of cases) {
      const draws = [...item.draws];
      const result = generateRandomStart((length) => {
        const value = draws.shift();
        if (value === undefined || value >= length) throw new Error("Invalid test draw");
        return value;
      });
      expect(result.hpCurrent).toBe(item.expected);
      expect(result.hpCurrent).toBeGreaterThan(0);
      expect(result.hpCurrent).toBeLessThanOrEqual(184);
    }
  });
});
