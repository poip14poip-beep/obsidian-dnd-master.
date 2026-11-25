export interface DossierResource { name: string; current: null; max: number; recovery: string; certainty: "KNOWN"; }
export interface DossierInventoryItem {
  name: string; quantity: number; notes: string; location: "WORN" | "CARRIED"; certainty: "KNOWN" | "APPROXIMATE";
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
  inventory: DossierInventoryItem[];
  resources: DossierResource[];
  evidence: string[];
}
/** Extracts explicit sheet values and item rows; current HP, coin balance and origin are never inferred. */
export function extractDossierBasics(text: string): DossierBasics {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = lines.find((line) => /^[А-ЯЁ][А-ЯЁ\s-]{2,}$/u.test(line))?.replace(/\s+/g, " ") ?? null;
  const summary = text;
  const classMatch = summary.match(/(Человек|Эльф|Дварф|Полуэльф|Полуорк|Гном|Тифлинг|Драконорождённый)[.,; —-]{0,12}((?:Fighter|Воин|Wizard|Rogue|Paladin|Боец)[^\r\n]{0,120})/i);
  const speciesAndClass = classMatch ? `${classMatch[1]}. ${classMatch[2].trim()}` : null;
  const levelMatch = text.match(/(?:общий\s+уровень\s*\|\s*)(\d{1,2})\b/i)
    ?? text.match(/(?:общий\s*)?(\d{1,2})-й\s+уровень[^\n]{0,120}(?:Fighter\s*20|эпическ)/i)
    ?? text.match(/общий\s+(\d{1,2})-й\s+уровень/i);
  const level = levelMatch ? Number(levelMatch[1]) : null;
  const classLevelMatch = text.match(/Классовые уровни\s*\|\s*[^\d]*(\d{1,2})\b/i);
  const classLevel = classLevelMatch ? Number(classLevelMatch[1]) : null;
  const epicCampaignLevels = level !== null && classLevel !== null && level > classLevel ? level - classLevel : 0;
  const hpMatch = text.match(/^\s*HP\s*\|\s*([1-9]\d{1,2})\b/im) ?? text.match(/(?:^|[\s·])([1-9]\d{1,2})\s*HP\b/i);
  const acMatch = text.match(/^\s*КБ\s*\|\s*КБ\s*(\d{1,2})\b/im) ?? text.match(/КБ\s*(\d{1,2})/i);
  const abilityRow = text.match(/Сила\s*\|\s*Ловкость\s*\|\s*Телосложение\s*\|\s*Интеллект\s*\|\s*Мудрость\s*\|\s*Харизма[\s\S]{0,180}?(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)/i);
  const abilityScores = abilityRow ? {
    strength: Number(abilityRow[1]), dexterity: Number(abilityRow[2]), constitution: Number(abilityRow[3]),
    intelligence: Number(abilityRow[4]), wisdom: Number(abilityRow[5]), charisma: Number(abilityRow[6]),
  } : null;
  const proficiencyMatch = text.match(/Бонус мастерства\s*\|\s*\+?(\d+)/i);
  const speedMatch = text.match(/Скорость\s*\|\s*(\d+)\s*фут/i);
  const hitDiceMatch = text.match(/Кость хитов\s*\|\s*([\d]+d\d+)/i);
  const inventory: DossierInventoryItem[] = [];
  let inventoryLocation: "WORN" | "CARRIED" | null = null;
  for (const line of lines) {
    const heading = line.replace(/^#{1,6}\s*/, "");
    if (/^11\.1\./.test(heading)) inventoryLocation = "WORN";
    else if (/^11\.[2-5]\./.test(heading)) inventoryLocation = "CARRIED";
    else if (/^11\.(?:6|7|8|9|10|11)\./.test(heading) || /^12\./.test(heading)) inventoryLocation = null;
    if (!inventoryLocation || !line.includes("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 2 || /^(?:кол-во|количество)$/i.test(cells[0]) || /^(?:предмет|оружие)$/i.test(cells[1])) continue;
    const quantityText = cells[0];
    const quantityMatch = quantityText.match(/^(\d+)(?!\s*[–—-])/);
    if (!quantityMatch || /[–—-]/.test(quantityText) || /дня|дней|недел/i.test(quantityText)) continue;
    if (!quantityMatch) continue;
    const quantity = Number(quantityMatch[1]);
    if (!Number.isInteger(quantity) || quantity < 1) continue;
    const name = cells[1].replace(/^["«]|["»]$/g, "").trim();
    if (!name) continue;
    const unitNote = quantityText.replace(/^\d+\s*/, "").trim();
    const notes = [unitNote, cells.slice(2).join(" | ")].filter(Boolean).join("; ");
    inventory.push({ name, quantity, notes, location: inventoryLocation,
      certainty: /[–—-]/.test(quantityText) ? "APPROXIMATE" : "KNOWN" });
  }
  const numberWords: Record<string, number> = { "один": 1, "одна": 1, "два": 2, "две": 2, "три": 3, "четыре": 4 };
  const resources: DossierResource[] = [];
  const resourcePatterns: Array<{ name: string; pattern: RegExp; recovery: string }> = [
    { name: "Second Wind", pattern: /Second Wind:\s*(один|одна|два|две|три|четыре|\d+)\s+использован(?:ия|ие|ий|о)?/iu, recovery: "UNKNOWN" },
    { name: "Action Surge", pattern: /Action Surge:\s*(один|одна|два|две|три|четыре|\d+)\s+использован(?:ия|ие|ий|о)?[^.]{0,100}?(?:между|до) продолжительными отдыхами/iu, recovery: "Long Rest" },
    { name: "Indomitable", pattern: /Indomitable:\s*(один|одна|два|две|три|четыре|\d+)\s+использован(?:ия|ие|ий|о)?/iu, recovery: "UNKNOWN" },
  ];
  for (const resource of resourcePatterns) {
    const match = text.match(resource.pattern);
    if (!match) continue;
    const count = /^\d+$/.test(match[1]) ? Number(match[1]) : numberWords[match[1].toLocaleLowerCase()];
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
  ].filter(Boolean);
  return { name, speciesAndClass, level, classLevel, epicCampaignLevels, hitPointMaximum: hpMatch ? Number(hpMatch[1]) : null,
    armorClass: acMatch ? Number(acMatch[1]) : null, abilityScores, proficiencyBonus: proficiencyMatch ? Number(proficiencyMatch[1]) : null,
    speedFeet: speedMatch ? Number(speedMatch[1]) : null, hitDice: hitDiceMatch?.[1] ?? null, inventory, resources, evidence };
}
