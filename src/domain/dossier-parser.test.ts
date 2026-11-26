import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractDossierBasics } from "./dossier-parser";
describe("player dossier summary extraction", () => {
  it("extracts only explicit summary facts and keeps current HP unknown", () => {
    const result = extractDossierBasics("ЛИЯ ВЕЙН\nПолное досье\nРодилась: 121 год. Человек. Fighter 20 / Champion + один эпический уровень кампании.\nD&D: общий 21-й уровень по домашнему эпическому расширению — Fighter 20 / Champion + эпический уровень кампании. 184 HP, PB +6, четыре атаки за Attack, КБ 20.\nКлассовые уровни | Fighter 20");
    expect(result.name).toBe("ЛИЯ ВЕЙН");
    expect(result.level).toBe(21);
    expect(result.classLevel).toBe(20);
    expect(result.epicCampaignLevels).toBe(1);
    expect(result.hitPointMaximum).toBe(184);
    expect(result.armorClass).toBe(20);
    expect(result.speciesAndClass).toContain("Fighter 20");
  });
  it("extracts ability scores and inventory rows from DOCX table text", () => {
    const result = extractDossierBasics([
      "ЛИЯ ВЕЙН",
      "Общий уровень | 21 (домашнее эпическое расширение)",
      "Классовые уровни | Fighter 20",
      "HP | 184",
      "КБ | КБ 20",
      "Сила | Ловкость | Телосложение | Интеллект | Мудрость | Харизма",
      "20 (+5) | 16 (+3) | 16 (+3) | 18 (+4) | 14 (+2) | 16 (+3)",
      "Бонус мастерства | +6",
      "Скорость | 30 футов",
      "Кость хитов | 20d10",
      "## 9.2. Спасброски",
      "+11 | +3 | +9 | +4 | +2 | +3",
      "Cloak of Protection добавляет +1 ко всем спасброскам: итог +12, +4, +10, +5, +3, +4 соответственно.",
      "## 9.3. Навыки и пассивные показатели",
      "Атлетика | +11 | Сила +5, владение +6; Soldier",
      "История | +10 | Интеллект +4, владение +6; Skilled",
      "## 9.4. Fighter 20: способности по уровням",
      "1 | Fighting Style, Second Wind, Weapon Mastery",
      "20 | Three Extra Attacks — всего 4 атаки",
      "## 9.5. Боевые стили и оружие",
      "Катана (Longsword) | +11 | 1d8+5 одной рукой; 1d10+5 двумя руками | Sap",
      "Кинжал (Dagger) | +11 | 1d4+5 | Nick",
      "## 11.1. Надетые предметы",
      "1 | Кожа Последнего Часа | Лёгкий доспех",
      "1 | Cloak of Protection | +1 КБ",
      "## 11.2. Оружие и обслуживание",
      "Second Wind: четыре использования; Action Surge: два использования между продолжительными отдыхами. Indomitable: три использования.",
      "2–3 дня | Сухой паёк | Пополняется в пути",
      "1 | Катана в ножнах | Основное оружие",
      "## 11.3. Инструменты, исследования и медицина",
      "1 | Инструменты кузнеца | Осмотр и мелкий ремонт",
    ].join("\n"));
    expect(result.level).toBe(21);
    expect(result.hitPointMaximum).toBe(184);
    expect(result.armorClass).toBe(20);
    expect(result.abilityScores).toEqual({ strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 });
    expect(result.proficiencyBonus).toBe(6);
    expect(result.speedFeet).toBe(30);
    expect(result.hitDice).toBe("20d10");
    expect(result.baseSavingThrowBonuses).toEqual({ strength: 11, dexterity: 3, constitution: 9, intelligence: 4, wisdom: 2, charisma: 3 });
    expect(result.baseSavingThrowBonuses).toEqual({ strength: 11, dexterity: 3, constitution: 9, intelligence: 4, wisdom: 2, charisma: 3 });
    expect(result.savingThrowBonuses).toEqual({ strength: 12, dexterity: 4, constitution: 10, intelligence: 5, wisdom: 3, charisma: 4 });
    expect(result.skillBonuses).toHaveLength(2);
    expect(result.skillBonuses[0]).toMatchObject({ name: "Атлетика", bonus: 11 });
    expect(result.classFeaturesByLevel).toHaveLength(2);
    expect(result.weaponAttacks).toHaveLength(2);
    expect(result.weaponAttacks[0]).toMatchObject({ weapon: "Катана (Longsword)", attackBonus: 11, mastery: "Sap" });
    expect(result.inventory).toHaveLength(4);
    expect(result.inventory[0]).toMatchObject({ name: "Кожа Последнего Часа", location: "WORN", startPolicy: "KEEP_FROM_DOSSIER" });
    expect(result.inventory[2]).toMatchObject({ name: "Катана в ножнах", location: "UNKNOWN", startPolicy: "KEEP_FROM_DOSSIER" });
    expect(result.inventory[3]).toMatchObject({ name: "Инструменты кузнеца", location: "UNKNOWN", startPolicy: "KEEP_FROM_DOSSIER" });
    expect(result.resources).toEqual([
      { name: "Second Wind", current: null, max: 4, recovery: "UNKNOWN", certainty: "KNOWN" },
      { name: "Action Surge", current: null, max: 2, recovery: "UNKNOWN", certainty: "KNOWN" },
      { name: "Indomitable", current: null, max: 3, recovery: "UNKNOWN", certainty: "KNOWN" },
    ]);
  });
  it("parses aligned DOCX table columns without inventing current HP", () => {
    const result = extractDossierBasics([
      "ЛИЯ ВЕЙН",
      "Родилась: 121 год. Возраст в 2000 году: 1879 лет. Человек.",
      "Fighter 20 / Champion + один эпический уровень кампании.",
      "Общий уровень                                           21 (домашнее эпическое расширение)",
      "Классовые уровни                                        Fighter 20",
      "Бонус мастерства                                        +6",
      "HP                                                      184",
      "Кость хитов                                             20d10",
      "Скорость                                                30 футов",
      "КБ                                                      КБ 20",
      "Сила               Ловкость          Телосложение       Интеллект          Мудрость            Харизма",
      "20 (+5)            16 (+3)           16 (+3)            18 (+4)            14 (+2)             16 (+3)",
      "## 9.2. Спасброски",
      "+11                +3                +9                 +4                 +2                  +3",
      "## 9.3. Навыки и пассивные показатели",
      "Атлетика                             +11                                   Сила +5, владение +6; Soldier",
      "## 9.4. Fighter 20: способности по уровням",
      "1                                                       Fighting Style, Second Wind, Weapon Mastery",
      "## 9.5. Боевые стили и оружие",
      "Катана (Longsword)                   +11                               1d8+5 одной рукой; 1d10+5 двумя руками             Sap",
      "## 11.1. Надетые предметы",
      "1                                      Кожа Последнего Часа                Авторский проклятый лёгкий доспех",
      "## 11.2. Оружие и обслуживание",
      "1                                      Катана в ножнах                     Основное оружие",
      "Second Wind: четыре использования. Action Surge: два использования между продолжительными отдыхами. Indomitable: три использования.",
    ].join("\n"));

    expect(result.name).toBe("ЛИЯ ВЕЙН");
    expect(result.level).toBe(21);
    expect(result.classLevel).toBe(20);
    expect(result.epicCampaignLevels).toBe(1);
    expect(result.hitPointMaximum).toBe(184);
    expect(result.armorClass).toBe(20);
    expect(result.abilityScores).toEqual({ strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 });
    expect(result.proficiencyBonus).toBe(6);
    expect(result.speedFeet).toBe(30);
    expect(result.hitDice).toBe("20d10");
    expect(result.baseSavingThrowBonuses).toEqual({ strength: 11, dexterity: 3, constitution: 9, intelligence: 4, wisdom: 2, charisma: 3 });
    expect(result.skillBonuses[0]).toMatchObject({ name: "Атлетика", bonus: 11 });
    expect(result.classFeaturesByLevel[0]?.level).toBe(1);
    expect(result.weaponAttacks[0]).toMatchObject({ weapon: "Катана (Longsword)", attackBonus: 11, mastery: "Sap" });
    expect(result.inventory).toHaveLength(2);
    expect(result.inventory.every((item) => item.startPolicy === "KEEP_FROM_DOSSIER")).toBe(true);
    expect(result.resources.map((resource) => resource.max)).toEqual([4, 2, 3]);
  });

  it("parses the complete bundled Lii dossier without inventing live state", () => {
    const dossier = readFileSync("public/seed/Liya_Vein_Full_Dossier_Ekdrasil.md", "utf8");
    const result = extractDossierBasics(dossier);
    expect(result.name).toBe("ЛИЯ ВЕЙН");
    expect(result.level).toBe(21);
    expect(result.classLevel).toBe(20);
    expect(result.hitPointMaximum).toBe(184);
    expect(result.abilityScores).toEqual({ strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 });
    expect(result.proficiencyBonus).toBe(6);
    expect(result.speedFeet).toBe(30);
    expect(result.hitDice).toBe("20d10");
    expect(result.skillBonuses).toHaveLength(8);
    expect(result.weaponAttacks).toHaveLength(2);
    expect(result.resources.map((resource) => [resource.name, resource.max])).toEqual([
      ["Second Wind", 4], ["Action Surge", 2], ["Indomitable", 3],
    ]);
    expect(result.inventory.some((item) => item.name.includes("Кожа Последнего Часа") && item.location === "WORN")).toBe(true);
    expect(result.inventory.some((item) => item.location === "UNKNOWN")).toBe(true);
    expect(result.inventory.every((item) => item.startPolicy === "KEEP_FROM_DOSSIER")).toBe(true);
  });
  it("does not invent missing values", () => {
    const result = extractDossierBasics("Персонаж\nБиография без игровых характеристик.");
    expect(result.hitPointMaximum).toBeNull();
    expect(result.armorClass).toBeNull();
    expect(result.level).toBeNull();
  });
});
