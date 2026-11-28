import { describe, expect, it } from "vitest";
import { prepareGmRoll, preparePlayerRoll } from "../../supabase/functions/obsidian-gm/dnd-engine";

const character = {
  abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
  savingThrowBonuses: { strength: 1, dexterity: 2, constitution: 1, intelligence: 0, wisdom: 5, charisma: -1 },
  skillBonuses: [
    { name: "Perception", bonus: 5, basis: "Мудрость + владение" },
    { name: "Восприятие", bonus: 5, basis: "Мудрость + владение" },
  ],
};

describe("Lorekeeper-style Ekdrasil D&D adjudication adapter", () => {
  it("does not create a roll for an obvious action", () => {
    expect(preparePlayerRoll({ requiresRoll: false, reason: "Обычная прогулка по свободной улице" }, character))
      .toEqual({ noRoll: true, reason: "Обычная прогулка по свободной улице" });
  });
  it("derives a Perception roll from the verified character skill bonus", () => {
    expect(preparePlayerRoll({
      requiresRoll: true, roller: "PLAYER", kind: "skill_check", skill: "perception",
      difficulty: "moderate", advantage: "none", reason: "Осмотреть улицу на подозрительных людей",
    }, character)).toMatchObject({
      roller: "PLAYER", label: "Мудрость (Восприятие)", formula: "1d20+5",
      dc: 15, result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
    });
  });
  it("derives a saving throw from the verified saving-throw bonus", () => {
    expect(preparePlayerRoll({
      requiresRoll: true, roller: "PLAYER", kind: "saving_throw",
      ability: "wis", dc: 14, advantage: "advantage", reason: "Сопротивление воздействию",
    }, character)).toMatchObject({ formula: "2d20kh1+5", dc: 14 });
  });
  it("refuses to invent a skill modifier that is absent from the sheet", () => {
    expect(preparePlayerRoll({
      requiresRoll: true, roller: "PLAYER", kind: "skill_check", skill: "stealth",
      difficulty: "hard", reason: "Скрыться",
    }, character)).toMatchObject({ error: expect.stringContaining("нет подтверждённого бонуса") });
  });
  it("accepts only a supported formula for a server-owned NPC roll", () => {
    expect(prepareGmRoll({
      requiresRoll: true, roller: "GM", kind: "custom", expression: "1d20+3", reason: "Проверка NPC",
    })).toMatchObject({ roller: "GM", formula: "1d20+3" });
    expect(prepareGmRoll({
      requiresRoll: true, roller: "GM", kind: "custom", expression: "1d7+99", reason: "Неподдерживаемая кость",
    })).toMatchObject({ error: expect.any(String) });
  });
});
