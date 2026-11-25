export interface DossierBasics {
  name: string | null;
  speciesAndClass: string | null;
  level: number | null;
  hitPointMaximum: number | null;
  armorClass: number | null;
  evidence: string[];
}
/** Extracts only explicit summary values; current HP, inventory and origin are never inferred. */
export function extractDossierBasics(text: string): DossierBasics {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = lines.find((line) => /^[А-ЯЁ][А-ЯЁ\s-]{2,}$/u.test(line))?.replace(/\s+/g, " ") ?? null;
  const summary = lines.slice(0, 12).join(" ");
  const classMatch = summary.match(/(Человек|Эльф|Дварф|Полуэльф|Полуорк|Гном|Тифлинг|Драконорождённый)[^.]{0,120}?(?:Fighter|Воин|Wizard|Rogue|Paladin|Боец)[^.]{0,100}/i);
  const speciesAndClass = classMatch?.[0]?.trim() ?? null;
  const levelMatch = text.match(/(?:общий\s*)?(\d{1,2})-й\s+уровень[^\n]{0,120}(?:Fighter\s*20|эпическ)/i)
    ?? text.match(/общий\s+(\d{1,2})-й\s+уровень/i);
  const level = levelMatch ? Number(levelMatch[1]) : null;
  const hpMatch = text.match(/(?:^|[\s·])([1-9]\d{1,2})\s*HP\b/i);
  const acMatch = text.match(/КБ\s*(\d{1,2})/i);
  const evidence = [
    name ? `Имя: ${name}` : "",
    speciesAndClass ? `Вид/класс: ${speciesAndClass}` : "",
    level !== null ? `Уровень: ${level}` : "",
    hpMatch ? `HP: ${hpMatch[0].trim()}` : "",
    acMatch ? `КБ: ${acMatch[0]}` : "",
  ].filter(Boolean);
  return { name, speciesAndClass, level, hitPointMaximum: hpMatch ? Number(hpMatch[1]) : null,
    armorClass: acMatch ? Number(acMatch[1]) : null, evidence };
}
