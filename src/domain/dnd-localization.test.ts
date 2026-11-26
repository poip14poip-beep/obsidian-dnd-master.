import { describe, expect, it } from "vitest";
import { getSkillDescription, localizeInventoryItemName, localizeSkillName } from "./dnd-localization";

describe("D&D Russian display localization", () => {
  it("translates imported standard item names and keeps enhancement bonuses", () => {
    expect(localizeInventoryItemName("Studded Leather +3")).toBe("Клёпаный кожаный доспех +3");
    expect(localizeInventoryItemName("Cloak of Protection")).toBe("Плащ защиты");
    expect(localizeInventoryItemName("Boots of Elvenkind")).toBe("Сапоги эльфийского рода");
  });

  it("does not rewrite custom item names", () => {
    expect(localizeInventoryItemName("Кожа Последнего Часа")).toBe("Кожа Последнего Часа");
  });

  it("localizes all eighteen standard skills and provides a description for each", () => {
    const names = [
      "Athletics", "Acrobatics", "Sleight of Hand", "Stealth", "Arcana", "History",
      "Investigation", "Nature", "Religion", "Animal Handling", "Insight", "Medicine",
      "Perception", "Survival", "Deception", "Intimidation", "Performance", "Persuasion",
    ];
    expect(names.map(localizeSkillName)).toEqual([
      "Атлетика", "Акробатика", "Ловкость рук", "Скрытность", "Магия", "История",
      "Анализ", "Природа", "Религия", "Уход за животными", "Проницательность", "Медицина",
      "Внимательность", "Выживание", "Обман", "Запугивание", "Выступление", "Убеждение",
    ]);
    for (const name of names) expect(getSkillDescription(name).length).toBeGreaterThan(20);
  });
});
