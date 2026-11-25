import { describe, expect, it } from "vitest";
import { createInitialPlayerCharacterState } from "./defaults";
import { calculatePlayerInventoryWeight } from "./inventory-weight";
describe("player inventory weight", () => {
  it("includes carried and worn items and currency, but excludes stored and dropped items", () => {
    const character = createInitialPlayerCharacterState();
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
  it("does not claim a definitive load while carried item weights are unknown", () => {
    const character = createInitialPlayerCharacterState();
    character.inventory = [{ id: "x", name: "Рюкзак", quantity: 1, notes: "", certainty: "UNKNOWN", location: "CARRIED", unitWeightLb: null }];
    expect(calculatePlayerInventoryWeight(character).overCapacity).toBeNull();
  });
});
