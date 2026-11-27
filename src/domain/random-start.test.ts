import { describe, expect, it } from "vitest";
import { generateRandomStart, RANDOM_START_CITY_COUNT } from "./random-start";
import { calculatePlayerInventoryWeight } from "./inventory-weight";
import { createInitialPlayerCharacterState } from "./defaults";

describe("generateRandomStart", () => {
  it("uses deterministic draws for city and scene while preserving full HP", () => {
    const draws = [7, 2, 0, 9, 5];
    const result = generateRandomStart(184, (length) => {
      const value = draws.shift();
      if (value === undefined || value >= length) throw new Error("Invalid test draw");
      return value;
    });
    expect(result.city.name).toBe("Морвейн");
    expect(result.city.region).toBe("Эстерваль");
    expect(result.scene).toBe("На городском рынке");
    expect(result.placeName).toBe("На городском рынке");
    expect(result.date).toContain("09:05");
    expect(result.hpCurrent).toBe(184);
    expect(result.healthLabel).toBe("Без заметных ранений");
    expect(result.characterPatch.hpMax).toBeUndefined();
    expect(result.characterPatch.hpCurrent).toBe(184);
    expect(draws).toHaveLength(0);
  });

  it("selects only one of the 16 canonically listed main cities", () => {
    expect(RANDOM_START_CITY_COUNT).toBe(16);
    for (let cityIndex = 0; cityIndex < RANDOM_START_CITY_COUNT; cityIndex += 1) {
      const result = generateRandomStart(184, (length) => Math.min(cityIndex, length - 1));
      expect(result.city.name).toBeTruthy();
      expect(result.location.sourceId).toBe("src-ekdrasil-chronicle");
    }
  });

  it("uses the canonical Ekdrasil calendar with a generated clock and no invented quest", () => {
    const result = generateRandomStart(184, () => 0);
    expect(result.date).toContain("2000 год");
    expect(result.date).toContain("00:00");
    expect(result.date).toContain("Календарь Экдрасиля 2.4");
    expect(result.narrative).toContain("не задание");
    expect(result.inventory).toEqual([]);
    expect(result.characterPatch.hpMax).toBeUndefined();
    expect(result.characterPatch.abilityScores).toBeUndefined();
  });

  it("preserves confirmed gear, adds only random consumables and generates starting money", () => {
    const result = generateRandomStart(40, () => 0, {
      background: "Солдат",
      generateStartingSupplies: true,
      retainedInventory: [
        { id: "katana", name: "Катана в ножнах", quantity: 1, notes: "Подтверждённое оружие", certainty: "KNOWN", location: "CARRIED", unitWeightLb: null },
        { id: "armor", name: "Кожа Последнего Часа", quantity: 1, notes: "Авторский лёгкий доспех", certainty: "KNOWN", location: "WORN", unitWeightLb: null },
        { id: "cloak", name: "Плащ", quantity: 1, notes: "Одежда из досье", certainty: "KNOWN", location: "WORN", unitWeightLb: null },
      ],
    });
    expect(result.replaceInventory).toBe(true);
    expect(result.inventory.map((item) => item.name)).toContain("Катана в ножнах");
    expect(result.inventory.map((item) => item.name)).toContain("Кожа Последнего Часа");
    expect(result.inventory.map((item) => item.name)).toContain("Рационы");
    expect(result.inventory.map((item) => item.name)).toContain("Факелы");
    expect(result.inventory.map((item) => item.name)).not.toContain("Набор целителя");
    expect(result.inventory.map((item) => item.name)).not.toContain("Дорожная одежда");
    expect(result.inventory.every((item) => item.unitWeightLb !== null && item.unitWeightLb !== undefined)).toBe(true);
    expect(result.characterPatch.currency).toEqual({ cp: 1, sp: 1, ep: 0, gp: 10, pp: 0 });
    expect(result.characterPatch.background).toBeUndefined();
    expect(result.narrative).toContain("Случайный стартовый капитал");
  });

  it("adds matching ammunition only when the imported character already has a ranged weapon", () => {
    const result = generateRandomStart(30, () => 0, {
      generateStartingSupplies: true,
      retainedInventory: [
        { id: "bow", name: "Длинный лук", quantity: 1, notes: "", certainty: "KNOWN", location: "CARRIED", unitWeightLb: 2 },
      ],
    });
    expect(result.inventory.find((item) => item.name === "Стрелы")?.quantity).toBe(10);
    expect(result.inventory.some((item) => item.name === "Арбалетные болты")).toBe(false);
    expect(result.inventory.find((item) => item.name === "Длинный лук")).toBeDefined();
  });

  it("resolves carried-item weights and currency so the standard starting load is calculable", () => {
    const generated = generateRandomStart(40, () => 0, {
      background: "Солдат",
      generateStartingSupplies: true,
      retainedInventory: [
        { id: "sword", name: "Длинный меч", quantity: 1, notes: "", certainty: "KNOWN", location: "CARRIED", unitWeightLb: null },
        { id: "armor", name: "Кожаный доспех", quantity: 1, notes: "", certainty: "KNOWN", location: "WORN", unitWeightLb: null },
      ],
    });
    const character = {
      ...createInitialPlayerCharacterState(),
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 },
      size: "MEDIUM" as const,
      currency: generated.characterPatch.currency!,
      inventory: generated.inventory,
    };
    const load = calculatePlayerInventoryWeight(character, "STANDARD");
    expect(load.unknownCarriedItems).toEqual([]);
    expect(load.unknownLocationItems).toEqual([]);
    expect(load.currencyWeightLb).not.toBeNull();
    expect(load.carryingCapacityLb).toBe(240);
    expect(load.encumbranceStatus).not.toBe("UNKNOWN");
  });

  it("always starts with full HP instead of unexplained random injuries", () => {
    const result = generateRandomStart(184, () => 0);
    expect(result.hpCurrent).toBe(184);
    expect(result.healthLabel).toBe("Без заметных ранений");
    expect(result.healthDescription).toContain("полными HP");
  });
});
