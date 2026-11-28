import { describe, expect, it } from "vitest";
import { createInitialPlayerCharacterState } from "./defaults";
import { calculatePlayerInventoryWeight } from "./inventory-weight";
describe("player inventory weight", () => {
  it("includes carried and worn items and currency, but excludes stored and dropped items", () => {
    const character = createInitialPlayerCharacterState();
    character.size = "MEDIUM";
    character.abilityScores = { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 };
    character.currency = { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 };
    character.inventory = [
      { id: "a", name: "Катана", quantity: 1, notes: "", certainty: "KNOWN", location: "CARRIED", unitWeightLb: 3 },
      { id: "b", name: "Доспех", quantity: 1, notes: "", certainty: "KNOWN", location: "WORN", unitWeightLb: 13 },
      { id: "c", name: "Книги", quantity: 2, notes: "", certainty: "KNOWN", location: "STORED", unitWeightLb: 5 },
      { id: "d", name: "Факел", quantity: 1, notes: "", certainty: "KNOWN", location: "DROPPED", unitWeightLb: 1 },
    ];
    const result = calculatePlayerInventoryWeight(character, "STANDARD");
    expect(result.knownCarriedWeightLb).toBe(16);
    expect(result.currencyWeightLb).toBe(1);
    expect(result.carryingCapacityLb).toBe(300);
    expect(result.storedWeightLb).toBe(10);
    expect(result.droppedWeightLb).toBe(1);
    expect(result.overCapacity).toBe(false);
  });
  it("uses variant encumbrance thresholds when selected", () => {
    const character = createInitialPlayerCharacterState();
    character.size = "MEDIUM";
    character.abilityScores = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    character.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    character.inventory = [{ id: "x", name: "Груз", quantity: 1, notes: "", certainty: "KNOWN", location: "CARRIED", unitWeightLb: 110 }];
    const result = calculatePlayerInventoryWeight(character, "VARIANT");
    expect(result.encumbranceStatus).toBe("HEAVILY_ENCUMBERED");
    expect(result.encumberedAtLb).toBe(50);
    expect(result.heavilyEncumberedAtLb).toBe(100);
  });
  it("does not guess whether imported OTHER items are carried, worn or stored", () => {
    const character = createInitialPlayerCharacterState();
    character.abilityScores = { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 };
    character.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    character.inventory = [{ id: "unknown-location", name: "Комплект инструментов", quantity: 1, notes: "Категория из досье; точное место не указано", certainty: "KNOWN", location: "OTHER", unitWeightLb: 8 }];
    const result = calculatePlayerInventoryWeight(character, "STANDARD");
    expect(result.knownCarriedWeightLb).toBe(0);
    expect(result.unknownCarriedItems).toEqual([]);
    expect(result.unknownLocationItems).toEqual(["Комплект инструментов"]);
    expect(result.encumbranceStatus).toBe("UNKNOWN");
  });
  it("does not claim a definitive load while carried item weights are unknown", () => {
    const character = createInitialPlayerCharacterState();
    character.inventory = [{ id: "x", name: "Рюкзак", quantity: 1, notes: "", certainty: "UNKNOWN", location: "CARRIED", unitWeightLb: null }];
    expect(calculatePlayerInventoryWeight(character).overCapacity).toBeNull();
  });
});

describe("unknown character load data", () => {
  it("does not assume an omitted inventory location is carried", () => {
    const character = createInitialPlayerCharacterState();
    character.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    character.inventory = [{ id: "u", name: "Неуточнённый предмет", quantity: 1, notes: "", certainty: "KNOWN", unitWeightLb: 2 }];
    const result = calculatePlayerInventoryWeight(character, "STANDARD");
    expect(result.unknownLocationItems).toEqual(["Неуточнённый предмет"]);
    expect(result.encumbranceStatus).toBe("UNKNOWN");
  });
  it("requires confirmed size before calculating carrying capacity", () => {
    const character = createInitialPlayerCharacterState();
    character.abilityScores = { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 };
    character.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    expect(calculatePlayerInventoryWeight(character, "STANDARD").carryingCapacityLb).toBeNull();
    character.size = "SMALL";
    expect(calculatePlayerInventoryWeight(character, "STANDARD").carryingCapacityLb).toBe(300);
    character.size = "LARGE";
    expect(calculatePlayerInventoryWeight(character, "STANDARD").carryingCapacityLb).toBe(600);
  });
  it("rejects incomplete currency denominations for definitive weight", () => {
    const character = createInitialPlayerCharacterState();
    character.size = "MEDIUM";
    character.abilityScores = { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 };
    character.currency = { cp: 0, sp: 0, ep: 0, gp: 0 } as NonNullable<typeof character.currency>;
    expect(calculatePlayerInventoryWeight(character, "STANDARD").currencyWeightLb).toBeNull();
    expect(calculatePlayerInventoryWeight(character, "STANDARD").encumbranceStatus).toBe("UNKNOWN");
  });
  it("rejects invalid currency balances for definitive weight", () => {
    const character = createInitialPlayerCharacterState();
    character.size = "MEDIUM";
    character.abilityScores = { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 };
    character.currency = { cp: -1, sp: 0, ep: 0, gp: 0, pp: 0 };
    expect(calculatePlayerInventoryWeight(character, "STANDARD").currencyWeightLb).toBeNull();
    expect(calculatePlayerInventoryWeight(character, "STANDARD").encumbranceStatus).toBe("UNKNOWN");
  });
});
