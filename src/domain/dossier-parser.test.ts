import { describe, expect, it } from "vitest";
import { extractDossierBasics } from "./dossier-parser";
describe("player dossier summary extraction", () => {
  it("extracts only explicit summary facts and keeps current HP unknown", () => {
    const result = extractDossierBasics("ЛИЯ ВЕЙН\nПолное досье\nРодилась: 121 год. Человек. Fighter 20 / Champion + один эпический уровень кампании.\nD&D: общий 21-й уровень по домашнему эпическому расширению — Fighter 20 / Champion + эпический уровень кампании. 184 HP, PB +6, четыре атаки за Attack, КБ 20.");
    expect(result.name).toBe("ЛИЯ ВЕЙН");
    expect(result.level).toBe(21);
    expect(result.hitPointMaximum).toBe(184);
    expect(result.armorClass).toBe(20);
    expect(result.speciesAndClass).toContain("Fighter 20");
  });
  it("does not invent missing values", () => {
    const result = extractDossierBasics("Персонаж\nБиография без игровых характеристик.");
    expect(result.hitPointMaximum).toBeNull();
    expect(result.armorClass).toBeNull();
    expect(result.level).toBeNull();
  });
});
