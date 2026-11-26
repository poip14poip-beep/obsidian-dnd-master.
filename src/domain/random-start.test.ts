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

  it("keeps only confirmed equipment, adds a background kit, assigns weights and generates starting money", () => {
    const result = generateRandomStart(40, () => 0, {
      background: "Солдат",
      generateBackgroundKit: true,
      retainedInventory: [
        { id: "katana", name: "Катана в ножнах", quantity: 1, notes: "Подтверждённое оружие", certainty: "KNOWN", location: "CARRIED", unitWeightLb: null },
        { id: "armor", name: "Кожа Последнего Часа", quantity: 1, notes: "Авторский лёгкий доспех", certainty: "KNOWN", location: "WORN", unitWeightLb: null },
        { id: "cloak", name: "Плащ", quantity: 1, notes: "Одежда из досье", certainty: "KNOWN", location: "WORN", unitWeightLb: null },
      ],
    });
    expect(result.replaceInventory).toBe(true);
    expect(result.inventory.map((item) => item.name)).toContain("Катана в ножнах");
    expect(result.inventory.map((item) => item.name)).toContain("Кожа Последнего Часа");
    expect(result.inventory.map((item) => item.name)).toContain("Набор целителя");
    expect(result.inventory.map((item) => item.name)).not.toContain("Короткий лук");
    expect(result.inventory.map((item) => item.name)).not.toContain("Дорожная одежда");
    expect(result.inventory.every((item) => item.unitWeightLb !== null && item.unitWeightLb !== undefined)).toBe(true);
    expect(result.characterPatch.currency).toEqual({ cp: 1, sp: 1, ep: 0, gp: 10, pp: 0 });
    expect(result.characterPatch.background).toBe("Soldier");
    expect(result.narrative).toContain("Случайный стартовый капитал");
  });

  it("always starts with full HP instead of unexplained random injuries", () => {
    const result = generateRandomStart(184, () => 0);
    expect(result.hpCurrent).toBe(184);
    expect(result.healthLabel).toBe("Без заметных ранений");
    expect(result.healthDescription).toContain("полными HP");
  });
});
