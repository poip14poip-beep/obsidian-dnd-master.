import { describe, expect, it } from "vitest";
import { generateRandomCharacter } from "./random-character";

describe("SRD 5.2.1 random character generator", () => {
  it("creates a complete level-one Fighter with calculated defenses, attacks, gear and currency", () => {
    const result = generateRandomCharacter(() => 0);
    expect(result.summary.className).toBe("Fighter");
    expect(result.summary.background).toBe("Soldier");
    expect(result.summary.species).toBe("Human");
    expect(result.character.level).toBe(1);
    expect(result.character.hpMax).toBeGreaterThan(0);
    expect(result.character.hpCurrent).toBe(result.character.hpMax);
    expect(result.character.armorClass).toBe(17);
    expect(result.character.weaponAttacks?.[0]?.damage).toContain("2d6");
    expect(result.character.baseSavingThrowBonuses).toBeDefined();
    expect(result.character.skillBonuses?.length).toBeGreaterThanOrEqual(4);
    expect(result.character.classFeaturesByLevel?.[0]?.features).toContain("Second Wind");
    expect(result.character.currency?.gp).toBe(18);
    expect(result.character.inventory?.some((entry) => entry.name === "Кольчуга")).toBe(true);
    expect(result.character.biography?.birthplace).toContain("Вальтерра");
    expect(result.character.biography?.inventedDetailsNotice).toContain("сгенерированы");
  });

  it("creates a Rogue with Expertise and an Elf's traits", () => {
    const result = generateRandomCharacter((length) => Math.min(1, length - 1));
    expect(result.summary.className).toBe("Rogue");
    expect(result.summary.background).toBe("Criminal");
    expect(result.summary.species).toBe("Elf");
    expect(result.character.classFeaturesByLevel?.[0]?.features).toContain("Expertise:");
    expect(result.character.skillBonuses?.filter((skill) => skill.basis.includes("экспертность"))).toHaveLength(2);
    expect(result.character.speedFeet).toBe(30);
    expect(result.character.skillBonuses?.some((skill) => skill.name === "Perception")).toBe(true);
    expect(new Set(result.character.inventory?.map((entry) => entry.id)).size).toBe(result.character.inventory?.length);
    expect(result.character.classFeaturesByLevel?.[0]?.features).toContain("Наследие фей");
    expect(result.character.armorClass).toBe(11 + Math.floor(((result.character.abilityScores?.dexterity ?? 10) - 10) / 2));
    expect(result.character.currency?.gp).toBe(24);
    expect(result.character.skillBonuses?.find((skill) => skill.name === "Perception")?.basis).toContain("владение");
  });
});
