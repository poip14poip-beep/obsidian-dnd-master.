import { describe, expect, it } from "vitest";
import { generateRandomCharacter } from "./random-character";

describe("SRD 5.2.1 random character generator", () => {
  it("creates a complete level-one Fighter with calculated defenses, attacks, gear and currency", () => {
    const result = generateRandomCharacter(() => 0);
    expect(result.summary.className).toBe("Fighter");
    expect(result.summary.classNameRu).toBe("Воин");
    expect(result.summary.speciesRu).toBe("Человек");
    expect(result.summary.backgroundRu).toBe("Послушник");
    expect(result.summary.background).toBe("Acolyte");
    expect(result.summary.species).toBe("Human");
    expect(result.character.level).toBe(1);
    expect(result.character.hpMax).toBeGreaterThan(0);
    expect(result.character.hpCurrent).toBe(result.character.hpMax);
    expect(result.character.armorClass).toBe(17);
    expect(result.character.weaponAttacks?.[0]?.damage).toContain("2d6");
    expect(result.character.baseSavingThrowBonuses).toBeDefined();
    expect(result.character.skillBonuses?.length).toBeGreaterThanOrEqual(4);
    expect(result.character.classFeaturesByLevel?.[0]?.features).toContain("Second Wind");
    expect(result.character.currency?.gp).toBeGreaterThanOrEqual(4);
    expect(result.character.inventory?.some((entry) => entry.name === "Кольчуга")).toBe(true);
    expect(result.character.biography?.birthplace).toContain("Вальтерра");
    expect(result.character.biography?.inventedDetailsNotice).toContain("сгенерированы");
  });

  it("creates a Rogue with Expertise and an Elf's traits", () => {
    const result = generateRandomCharacter((length) => Math.min(1, length - 1));
    expect(result.summary.className).toBe("Rogue");
    expect(result.summary.classNameRu).toBe("Плут");
    expect(result.summary.speciesRu).toBe("Эльф");
    expect(result.summary.backgroundRu).toBe("Преступник");
    expect(result.summary.background).toBe("Criminal");
    expect(result.summary.species).toBe("Elf");
    expect(result.character.classFeaturesByLevel?.[0]?.features).toContain("Expertise:");
    expect(result.character.skillBonuses?.filter((skill) => skill.basis.includes("экспертность"))).toHaveLength(2);
    expect(result.character.speedFeet).toBe(30);
    expect(result.character.skillBonuses?.some((skill) => skill.name === "Perception")).toBe(true);
    expect(new Set(result.character.inventory?.map((entry) => entry.id)).size).toBe(result.character.inventory?.length);
    expect(result.character.classFeaturesByLevel?.[0]?.features).not.toContain("Наследие фей");
    expect(result.character.classFeaturesByLevel?.[0]?.features).not.toContain("Prestidigitation");
    expect(result.character.biography?.preCampaignDesire).toBeTruthy();
    expect(result.character.armorClass).toBe(11 + Math.floor(((result.character.abilityScores?.dexterity ?? 10) - 10) / 2));
    expect(result.character.currency?.gp).toBeGreaterThanOrEqual(8);
    expect(result.character.skillBonuses?.find((skill) => skill.name === "Perception")?.basis).toContain("владение");
  });
  it("uses the master-selected identity while recalculating every mechanical field", () => {
    const result = generateRandomCharacter(() => 0, {
      name: "Эллариэн Вейр",
      species: "Elf",
      className: "Rogue",
      background: "Sage",
      birthplace: "Элион",
      ageYears: 34,
      genderPresentation: "женщина",
      family: "Она выросла в семье переписчиков при городском архиве, где каждый член семьи отвечал за отдельную часть большого собрания документов.",
      upbringing: "С детства её учили бережно обращаться с рукописями, сверять даты и не делать выводов по одному свидетельству.",
      lifeEvents: ["После ошибки в копии договора ей пришлось несколько лет восстанавливать доверие заказчиков.", "Позднее она покинула архив и стала искать независимую работу."],
      personalityTraits: ["внимательная к деталям", "ироничная", "недоверчивая к громким обещаниям"],
      ideal: "Правда должна выдерживать проверку источниками.",
      bond: "Хранит письмо наставницы, которое не решается перечитать.",
      flaw: "Иногда слишком долго проверяет очевидное.",
      motivation: "Хочет доказать, что может самостоятельно раскрыть старую подделку.",
      preCampaignDesire: "Найти работу, которая позволит ей добраться до закрытого архива в Элионе."
    });
    expect(result.character.name).toBe("Эллариэн Вейр");
    expect(result.summary.species).toBe("Elf");
    expect(result.summary.className).toBe("Rogue");
    expect(result.summary.background).toBe("Sage");
    expect(result.character.biography?.birthplace).toContain("Элион");
    expect(result.character.biography?.ageYears).toBe(34);
    expect(result.character.biography?.family).toContain("переписчиков");
    expect(result.character.armorClass).toBe(11 + Math.floor(((result.character.abilityScores?.dexterity ?? 10) - 10) / 2));
    expect(result.character.weaponAttacks?.[0]?.weapon).toBe("Короткий меч");
  });

});


describe("SRD 5.2.1 origin backgrounds", () => {
  it("offers all four SRD backgrounds with their origin feats", () => {
    const seen = new Map<string, string>();
    for (let seed = 1; seed <= 300; seed++) {
      let state = seed;
      const random = (length: number) => {
        state = (state * 48271) % 2147483647;
        return Math.floor((state / 2147483647) * length);
      };
      const result = generateRandomCharacter(random);
      const feature = result.character.classFeaturesByLevel?.[0]?.features ?? "";
      seen.set(result.summary.background, feature);
    }
    expect([...seen.keys()].sort()).toEqual(["Acolyte","Criminal","Sage","Soldier"]);
    expect(seen.get("Acolyte")).toContain("Ритуальная подготовка");
    expect(seen.get("Sage")).toContain("Исследовательская подготовка");
    expect(seen.get("Criminal")).toContain("Alert");
    expect(seen.get("Soldier")).toContain("Savage Attacker");
  });
});


describe("Ekdrasil canon integration", () => {
  it("uses only confirmed major cities from all three continents as generated birthplaces", () => {
    const cities = new Set<string>();
    const continents = new Set<string>();
    for (let seed = 1; seed <= 500; seed++) {
      let state = seed;
      const random = (length: number) => {
        state = (state * 48271) % 2147483647;
        return Math.floor((state / 2147483647) * length);
      };
      const result = generateRandomCharacter(random);
      const birthplace = result.character.biography?.birthplace ?? "";
      cities.add(birthplace.split(", ")[0] ?? "");
      continents.add(birthplace.split(", ")[2] ?? "");
    }
    expect(cities.size).toBe(16);
    expect(continents).toEqual(new Set(["Вальтерра","Сахр-Зар","Нордвальд"]));
  });

  it("does not grant free spellcasting through adapted Acolyte or Sage backgrounds", () => {
    for (let seed = 1; seed <= 500; seed++) {
      let state = seed;
      const random = (length: number) => {
        state = (state * 48271) % 2147483647;
        return Math.floor((state / 2147483647) * length);
      };
      const result = generateRandomCharacter(random);
      const feature = result.character.classFeaturesByLevel?.[0]?.features ?? "";
      if (result.summary.background === "Acolyte" || result.summary.background === "Sage") {
        expect(feature).not.toContain("Magic Initiate");
        expect(feature).not.toContain("заговор");
        expect(feature).not.toContain("заклинание");
      }
    }
  });
});
