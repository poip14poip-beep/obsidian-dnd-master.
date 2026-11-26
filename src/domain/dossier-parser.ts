export interface DossierResource { name: string; current: null; max: number; recovery: string; certainty: "KNOWN"; }
export interface DossierInventoryItem {
  name: string; quantity: number; notes: string; location: "WORN" | "OTHER"; certainty: "KNOWN" | "APPROXIMATE";
  startPolicy: "KEEP_FROM_DOSSIER" | "REGENERATE_AT_START";
}
export interface DossierBasics {
  name: string | null;
  speciesAndClass: string | null;
  level: number | null;
  classLevel: number | null;
  epicCampaignLevels: number;
  hitPointMaximum: number | null;
  armorClass: number | null;
  abilityScores: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number } | null;
  proficiencyBonus: number | null;
  speedFeet: number | null;
  hitDice: string | null;
  savingThrowBonuses: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number } | null;
  baseSavingThrowBonuses: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number } | null;
  skillBonuses: Array<{ name: string; bonus: number; basis: string }>;
  classFeaturesByLevel: Array<{ level: number; features: string }>;
  weaponAttacks: Array<{ weapon: string; attackBonus: number; damage: string; mastery: string }>;
  inventory: DossierInventoryItem[];
  resources: DossierResource[];
  evidence: string[];
}
/** Extracts explicit sheet values and item rows; current HP, coin balance and origin are never inferred. */
export function extractDossierBasics(text: string): DossierBasics {
  // DOCX text extraction often preserves table columns as aligned spaces rather than pipes.
  // Normalize those rows for the same parser used by Markdown dossier imports.
  const normalizedText = text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^<PARSED TEXT FOR PAGE:/i.test(trimmed) || /^<!-- Страница /i.test(trimmed)) return line;
    const cells = trimmed.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
    return cells.length >= 2 ? cells.join(" | ") : line;
  }).join("\n");
  const lines = normalizedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = lines.find((line) => /^[А-ЯЁ][А-ЯЁ\s-]{2,}$/u.test(line))?.replace(/\s+/g, " ") ?? null;
  const summary = normalizedText.replace(/(Человек|Эльф|Дварф|Полуэльф|Полуорк|Гном|Тифлинг|Драконорождённый)\s*\.\s*\n\s*(Fighter|Воин|Wizard|Rogue|Paladin|Боец)/i, "$1. $2");
  const classMatch = summary.match(/(Человек|Эльф|Дварф|Полуэльф|Полуорк|Гном|Тифлинг|Драконорождённый)[.,; —-]{0,12}((?:Fighter|Воин|Wizard|Rogue|Paladin|Боец)[^\r\n]{0,120})/i)
    ?? summary.match(/(Человек|Эльф|Дварф|Полуэльф|Полуорк|Гном|Тифлинг|Драконорождённый)[\s\S]{0,120}?(Fighter\s*\d+[^\r\n]{0,100})/i);
  const speciesAndClass = classMatch ? `${classMatch[1]!}. ${classMatch[2]!.trim()}` : null;
  const levelMatch = normalizedText.match(/(?:общий\s+уровень\s*\|\s*)(\d{1,2})\b/i)
    ?? normalizedText.match(/(?:общий\s*)?(\d{1,2})-й\s+уровень[^\n]{0,120}(?:Fighter\s*20|эпическ)/i)
    ?? normalizedText.match(/общий\s+(\d{1,2})-й\s+уровень/i);
  const level = levelMatch ? Number(levelMatch[1]) : null;
  const classLevelMatch = normalizedText.match(/Классовые уровни\s*\|\s*[^\d]*(\d{1,2})\b/i);
  const classLevel = classLevelMatch ? Number(classLevelMatch[1]) : null;
  const epicCampaignLevels = level !== null && classLevel !== null && level > classLevel ? level - classLevel : 0;
  const hpMatch = normalizedText.match(/^\s*HP\s*\|\s*([1-9]\d{1,2})\b/im) ?? normalizedText.match(/(?:^|[\s·])([1-9]\d{1,2})\s*HP\b/i);
  const acMatch = normalizedText.match(/^\s*КБ\s*\|\s*КБ\s*(\d{1,2})\b/im) ?? normalizedText.match(/КБ\s*(\d{1,2})/i);
  const abilityRow = normalizedText.match(/Сила\s*\|\s*Ловкость\s*\|\s*Телосложение\s*\|\s*Интеллект\s*\|\s*Мудрость\s*\|\s*Харизма[\s\S]{0,180}?(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)/i);
  const abilityScores = abilityRow ? {
    strength: Number(abilityRow[1]), dexterity: Number(abilityRow[2]), constitution: Number(abilityRow[3]),
    intelligence: Number(abilityRow[4]), wisdom: Number(abilityRow[5]), charisma: Number(abilityRow[6]),
  } : null;
  const proficiencyMatch = normalizedText.match(/Бонус мастерства\s*\|\s*\+?(\d+)/i);
  const speedMatch = normalizedText.match(/Скорость\s*\|\s*(\d+)\s*фут/i);
  const hitDiceMatch = normalizedText.match(/Кость хитов\s*\|\s*([\d]+d\d+)/i);
  const inventory: DossierInventoryItem[] = [];
  let inventoryLocation: "WORN" | "OTHER" | null = null;
  for (const line of lines) {
    const heading = line.replace(/^#{1,6}\s*/, "");
    if (/^11\.1\./.test(heading)) inventoryLocation = "WORN";
    else if (/^11\.[2-5]\./.test(heading)) inventoryLocation = "OTHER";
    else if (/^11\.(?:6|7|8|9|10|11)\./.test(heading) || /^12\./.test(heading)) inventoryLocation = null;
    if (!inventoryLocation || !line.includes("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 2 || /^(?:кол-во|количество)$/i.test(cells[0]!) || /^(?:предмет|оружие)$/i.test(cells[1]!)) continue;
    const quantityText = cells[0]!;
    const quantityMatch = quantityText.match(/^(\d+)(?!\s*[–—-])/);
    if (!quantityMatch || /[–—-]/.test(quantityText) || /дня|дней|недел/i.test(quantityText)) continue;
    if (!quantityMatch) continue;
    const quantity = Number(quantityMatch[1]!);
    if (!Number.isInteger(quantity) || quantity < 1) continue;
    const name = cells[1]!.replace(/^["«]|["»]$/g, "").trim();
    if (!name) continue;
    const unitNote = quantityText.replace(/^\d+\s*/, "").trim();
    const notes = [unitNote, cells.slice(2).join(" | ")].filter(Boolean).join("; ");
    inventory.push({ name, quantity, notes, location: inventoryLocation, startPolicy: inventoryStartPolicy,
      certainty: /[–—-]/.test(quantityText) ? "APPROXIMATE" : "KNOWN" });
  }
  const section = (startPrefix: string, endPrefix: string): string[] => {
    const clean = (line: string) => line.replace(/^#{1,6}\s*/, "").trim();
    const start = lines.findIndex((line) => clean(line).startsWith(startPrefix));
    if (start < 0) return [];
    const end = lines.findIndex((line, index) => index > start && clean(line).startsWith(endPrefix));
    return lines.slice(start + 1, end < 0 ? lines.length : end);
  };
  const saveRows = section("9.2.", "9.3.");
  const saveValues = saveRows.map((line) => line.split("|").map((cell) => cell.trim()))
    .find((cells) => cells.length >= 6 && cells.slice(0, 6).every((cell) => /^[+-]\d+$/.test(cell)));
  const baseSavingThrowBonuses = saveValues ? {
    strength: Number(saveValues[0]), dexterity: Number(saveValues[1]), constitution: Number(saveValues[2]),
    intelligence: Number(saveValues[3]), wisdom: Number(saveValues[4]), charisma: Number(saveValues[5]),
  } : null;
  const finalSaveMatch = normalizedText.match(/итог\s*([+-]\d+)\s*,\s*([+-]\d+)\s*,\s*([+-]\d+)\s*,\s*([+-]\d+)\s*,\s*([+-]\d+)\s*,\s*([+-]\d+)\s+соответственно/i);
  const savingThrowBonuses = finalSaveMatch ? {
    strength: Number(finalSaveMatch[1]), dexterity: Number(finalSaveMatch[2]), constitution: Number(finalSaveMatch[3]),
    intelligence: Number(finalSaveMatch[4]), wisdom: Number(finalSaveMatch[5]), charisma: Number(finalSaveMatch[6]),
  } : baseSavingThrowBonuses;
  const skillBonuses = section("9.3.", "9.4.").flatMap((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 3 || !cells[0]! || !/^[+-]\d+$/.test(cells[1]!)) return [];
    if (/^навык$/i.test(cells[0]!)) return [];
    return [{ name: cells[0]!, bonus: Number(cells[1]!), basis: cells.slice(2).join(" | ") }];
  });
  const classFeaturesByLevel = section("9.4.", "9.5.").flatMap((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 2 || !/^\d{1,2}$/.test(cells[0]!)) return [];
    const level = Number(cells[0]!);
    return level >= 1 && level <= 20 && cells[1]! ? [{ level, features: cells.slice(1).join(" | ") }] : [];
  });
  const weaponAttacks = section("9.5.", "10.").flatMap((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 4 || !/^[+-]\d+$/.test(cells[1]!) || /^оружие$/i.test(cells[0]!)) return [];
    return [{ weapon: cells[0]!, attackBonus: Number(cells[1]!), damage: cells[2]!, mastery: cells[3]! }];
  });
  const numberWords: Record<string, number> = { "один": 1, "одна": 1, "два": 2, "две": 2, "три": 3, "четыре": 4 };
  const resources: DossierResource[] = [];
  const resourcePatterns: Array<{ name: string; pattern: RegExp; recovery: string }> = [
    { name: "Second Wind", pattern: /Second Wind:\s*(один|одна|два|две|три|четыре|\d+)\s+использован(?:ия|ие|ий|о)?/iu, recovery: "UNKNOWN" },
    { name: "Action Surge", pattern: /Action Surge:\s*(один|одна|два|две|три|четыре|\d+)\s+использован(?:ия|ие|ий|о)?[^.]{0,100}?(?:между|до) продолжительными отдыхами/iu, recovery: "UNKNOWN" },
    { name: "Indomitable", pattern: /Indomitable:\s*(один|одна|два|две|три|четыре|\d+)\s+использован(?:ия|ие|ий|о)?/iu, recovery: "UNKNOWN" },
  ];
  for (const resource of resourcePatterns) {
    const match = normalizedText.match(resource.pattern);
    if (!match) continue;
    const count = /^\d+$/.test(match[1]!) ? Number(match[1]!) : numberWords[match[1]!.toLocaleLowerCase()];
    if (count !== undefined) resources.push({ name: resource.name, current: null, max: count, recovery: resource.recovery, certainty: "KNOWN" });
  }
  const evidence = [
    name ? `Имя: ${name}` : "",
    speciesAndClass ? `Вид/класс: ${speciesAndClass}` : "",
    level !== null ? `Уровень: ${level}` : "",
    hpMatch ? `HP: ${hpMatch[0].trim()}` : "",
    acMatch ? `КБ: ${acMatch[0]}` : "",
    abilityScores ? "Характеристики: STR " + abilityScores.strength + ", DEX " + abilityScores.dexterity + ", CON " + abilityScores.constitution + ", INT " + abilityScores.intelligence + ", WIS " + abilityScores.wisdom + ", CHA " + abilityScores.charisma : "",
    inventory.length ? `Предметов импортировано: ${inventory.length}` : "",
    resources.length ? `Классовых ресурсов распознано: ${resources.map((item) => item.name + " " + item.max).join(", ")}` : "",
    skillBonuses.length ? `Навыков распознано: ${skillBonuses.length}` : "",
    weaponAttacks.length ? `Атак распознано: ${weaponAttacks.length}` : "",
  ].filter(Boolean);
  return { name, speciesAndClass, level, classLevel, epicCampaignLevels, hitPointMaximum: hpMatch ? Number(hpMatch[1]) : null,
    armorClass: acMatch ? Number(acMatch[1]) : null, abilityScores, proficiencyBonus: proficiencyMatch ? Number(proficiencyMatch[1]) : null,
    speedFeet: speedMatch ? Number(speedMatch[1]) : null, hitDice: hitDiceMatch?.[1] ?? null,
    savingThrowBonuses, baseSavingThrowBonuses, skillBonuses, classFeaturesByLevel, weaponAttacks, inventory, resources, evidence };
}
