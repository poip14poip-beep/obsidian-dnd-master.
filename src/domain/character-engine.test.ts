import { describe, expect, it } from "vitest";
import { calculateInventoryLoad, canActivateCharacter, validateCharacterSheet, type CharacterSheetV2 } from "./character-engine";

function sheet(): CharacterSheetV2 {
  return {
    schemaVersion: 2, id: "pc-1", name: "Тестовый персонаж",
    origin: { mode: "GENERATED", homeRegionId: null, homeLocationId: null, birthDate: "UNKNOWN", arrivalDate: "2000-01-01", biography: "Тест", canonFit: "PENDING_REVIEW", canonFactIds: [], unresolvedQuestions: [], sourceDossierId: null },
    rules: {
      ruleset: "DND_2024_SRD_5_2_1", className: "Fighter", subclassName: null, level: 1,
      background: "Soldier", species: "Human", size: "MEDIUM", proficiencyBonus: 2,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 },
      hitPointMaximum: 12, hitPoints: 12, temporaryHitPoints: 0, armorClass: 16, speedFeet: 30,
      savingThrowProficiencies: [], skillProficiencies: [], toolProficiencies: [], languages: ["Common"],
      originFeat: null, feats: [], weaponMasteries: [], classResources: [],
      spellcasting: { ability: null, spellSaveDc: null, spellAttackBonus: null, preparedSpellIds: [], knownSpellIds: [], slots: [] },
      ruleSourceIds: ["SRD-5.2.1"],
    },
    inventory: [
      { id: "sword", name: "Меч", category: "WEAPON", quantity: 1, unitWeightLb: 3, location: "CARRIED", equipped: true, attuned: false, chargesCurrent: null, chargesMaximum: null, condition: "исправен", origin: "стартовое снаряжение", sourceRuleId: null, certainty: "KNOWN" },
      { id: "armor", name: "Доспех", category: "ARMOR", quantity: 1, unitWeightLb: 20, location: "WORN", equipped: true, attuned: false, chargesCurrent: null, chargesMaximum: null, condition: "исправен", origin: "стартовое снаряжение", sourceRuleId: null, certainty: "KNOWN" },
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    conditions: [], concentration: null, exhaustionLevel: 0, deathSaves: { successes: 0, failures: 0 },
    hitDice: [{ die: "d10", current: 1, maximum: 1 }], currentLocationId: null, notes: [],
  };
}

describe("character engine foundation", () => {
  it("calculates carried and worn load plus coin weight", () => {
    const candidate = sheet();
    candidate.currency.gp = 50;
    const result = calculateInventoryLoad(candidate);
    expect(result.carriedWeightLb).toBe(24);
    expect(result.currencyWeightLb).toBe(1);
    expect(result.carryingCapacityLb).toBe(240);
    expect(result.overCapacity).toBe(false);
  });
  it("does not activate a character before canon review", () => {
    const result = canActivateCharacter(sheet());
    expect(result.ok).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("проверку совместимости"))).toBe(true);
  });
  it("requires provenance for a compatible canon claim", () => {
    const candidate = sheet();
    candidate.origin.canonFit = "COMPATIBLE";
    expect(validateCharacterSheet(candidate)).toContain("Совместимость с каноном нельзя подтвердить без ссылок на проверенные факты.");
  });
  it("rejects invalid inventory quantity and unsupported epic level as RAW", () => {
    const candidate = sheet();
    candidate.inventory[0]!.quantity = -1;
    candidate.rules.level = 21;
    const errors = validateCharacterSheet(candidate);
    expect(errors.some((error) => error.includes("Некорректное количество"))).toBe(true);
    expect(errors.some((error) => error.includes("эпические уровни"))).toBe(true);
  });
});
