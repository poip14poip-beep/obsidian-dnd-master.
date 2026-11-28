import type { CertaintyStatus } from "./types";

/**
 * @deprecated Legacy prototype only. The canonical persisted and active model is PlayerCharacterState
 * in types.ts, used by the store, importer and character route. Do not create or persist CharacterSheetV2;
 * migrate any future fields into PlayerCharacterState instead.
 */

export type CharacterOriginMode = "GENERATED" | "PLAYER_DOSSIER";
export type CanonFitStatus = "PENDING_REVIEW" | "COMPATIBLE" | "CONFLICT" | "UNKNOWN";
export type InventoryLocation = "CARRIED" | "WORN" | "STORED" | "DROPPED" | "OTHER";
export type ItemCategory =
  | "WEAPON" | "ARMOR" | "AMMUNITION" | "TOOL" | "GEAR" | "CONSUMABLE"
  | "TREASURE" | "CURRENCY" | "MAGIC_ITEM" | "QUEST_ITEM" | "OTHER";

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface CharacterOrigin {
  mode: CharacterOriginMode;
  homeRegionId: string | null;
  homeLocationId: string | null;
  birthDate: string;
  arrivalDate: string;
  biography: string;
  canonFit: CanonFitStatus;
  canonFactIds: string[];
  unresolvedQuestions: string[];
  sourceDossierId: string | null;
}

export interface CharacterRulesProfile {
  ruleset: "DND_2024_SRD_5_2_1";
  className: string;
  subclassName: string | null;
  level: number;
  background: string;
  species: string;
  size: "TINY" | "SMALL" | "MEDIUM" | "LARGE" | "HUGE" | "GARGANTUAN";
  proficiencyBonus: number;
  abilityScores: AbilityScores;
  hitPointMaximum: number;
  hitPoints: number;
  temporaryHitPoints: number;
  armorClass: number;
  speedFeet: number;
  savingThrowProficiencies: string[];
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages: string[];
  originFeat: string | null;
  feats: string[];
  weaponMasteries: string[];
  classResources: Array<{
    id: string;
    name: string;
    current: number | null;
    maximum: number | null;
    recovery: string;
    sourceRuleId: string;
  }>;
  spellcasting: {
    ability: keyof AbilityScores | null;
    spellSaveDc: number | null;
    spellAttackBonus: number | null;
    preparedSpellIds: string[];
    knownSpellIds: string[];
    slots: Array<{ level: number; current: number; maximum: number }>;
  };
  ruleSourceIds: string[];
}

export interface TrackedInventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  unitWeightLb: number | null;
  location: InventoryLocation;
  equipped: boolean;
  attuned: boolean;
  chargesCurrent: number | null;
  chargesMaximum: number | null;
  condition: string;
  origin: string;
  sourceRuleId: string | null;
  certainty: CertaintyStatus;
}

export interface CharacterSheetV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  origin: CharacterOrigin;
  rules: CharacterRulesProfile;
  inventory: TrackedInventoryItem[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  conditions: Array<{ name: string; source: string; startedAt: string; endsAt: string | null }>;
  concentration: { spellId: string; startedAt: string; expectedEndAt: string | null } | null;
  exhaustionLevel: number;
  deathSaves: { successes: number; failures: number };
  hitDice: Array<{ die: string; current: number; maximum: number }>;
  currentLocationId: string | null;
  notes: string[];
}

export interface InventoryLoad {
  carriedWeightLb: number;
  wornWeightLb: number;
  storedWeightLb: number;
  droppedWeightLb: number;
  currencyWeightLb: number;
  unknownWeightItemIds: string[];
  carryingCapacityLb: number;
  pushDragLiftLimitLb: number;
  overCapacity: boolean;
  loadRatio: number | null;
}

export function calculateInventoryLoad(sheet: Pick<CharacterSheetV2, "rules" | "inventory" | "currency">): InventoryLoad {
  const multiplier =
    sheet.rules.size === "TINY" ? 0.5 :
    sheet.rules.size === "LARGE" ? 2 :
    sheet.rules.size === "HUGE" ? 4 :
    sheet.rules.size === "GARGANTUAN" ? 8 : 1;

  const totals: Record<InventoryLocation, number> = {
    CARRIED: 0, WORN: 0, STORED: 0, DROPPED: 0, OTHER: 0,
  };
  const unknownWeightItemIds: string[] = [];

  for (const item of sheet.inventory) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      unknownWeightItemIds.push(item.id);
      continue;
    }
    if (item.unitWeightLb === null || !Number.isFinite(item.unitWeightLb) || item.unitWeightLb < 0) {
      if (item.location === "CARRIED" || item.location === "WORN") unknownWeightItemIds.push(item.id);
      continue;
    }
    totals[item.location] += item.unitWeightLb * item.quantity;
  }

  const coinCount = Object.values(sheet.currency).reduce((sum, amount) => sum + amount, 0);
  const currencyWeightLb = coinCount / 50;
  const carryingCapacityLb = sheet.rules.abilityScores.strength * 15 * multiplier;
  const pushDragLiftLimitLb = carryingCapacityLb * 2;
  const carriedWeightLb = totals.CARRIED + totals.WORN + currencyWeightLb;

  return {
    carriedWeightLb,
    wornWeightLb: totals.WORN,
    storedWeightLb: totals.STORED,
    droppedWeightLb: totals.DROPPED,
    currencyWeightLb,
    unknownWeightItemIds,
    carryingCapacityLb,
    pushDragLiftLimitLb,
    overCapacity: carriedWeightLb > carryingCapacityLb,
    loadRatio: carryingCapacityLb > 0 ? carriedWeightLb / carryingCapacityLb : null,
  };
}

export function validateCharacterSheet(sheet: CharacterSheetV2): string[] {
  const errors: string[] = [];
  if (sheet.schemaVersion !== 2) errors.push("Неподдерживаемая версия листа персонажа.");
  if (!sheet.id.trim() || !sheet.name.trim()) errors.push("У персонажа должны быть ID и имя.");
  if (sheet.rules.ruleset !== "DND_2024_SRD_5_2_1") errors.push("Лист должен явно использовать D&D 2024 / SRD 5.2.1.");
  if (!Number.isInteger(sheet.rules.level) || sheet.rules.level < 1 || sheet.rules.level > 20) {
    errors.push("Уровень персонажа по базовым правилам должен быть от 1 до 20; эпические уровни оформляются отдельным домашним правилом.");
  }
  if (sheet.rules.hitPoints < 0 || sheet.rules.hitPointMaximum < 1 || sheet.rules.hitPoints > sheet.rules.hitPointMaximum) {
    errors.push("Текущие HP должны быть в диапазоне от 0 до максимума.");
  }
  if (sheet.rules.temporaryHitPoints < 0) errors.push("Временные HP не могут быть отрицательными.");
  if (sheet.exhaustionLevel < 0 || sheet.exhaustionLevel > 6 || !Number.isInteger(sheet.exhaustionLevel)) {
    errors.push("Exhaustion должен быть целым числом от 0 до 6.");
  }
  if (sheet.deathSaves.successes < 0 || sheet.deathSaves.successes > 3 ||
      sheet.deathSaves.failures < 0 || sheet.deathSaves.failures > 3) {
    errors.push("Счётчики спасбросков от смерти должны быть от 0 до 3.");
  }
  for (const [coin, amount] of Object.entries(sheet.currency)) {
    if (!Number.isInteger(amount) || amount < 0) errors.push(`Некорректное количество монет ${coin}.`);
  }
  for (const item of sheet.inventory) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) errors.push(`Некорректное количество предмета: ${item.id}`);
    if (item.unitWeightLb !== null && (!Number.isFinite(item.unitWeightLb) || item.unitWeightLb < 0)) {
      errors.push(`Некорректный вес предмета: ${item.id}`);
    }
  }
  if (sheet.origin.canonFit === "COMPATIBLE" && sheet.origin.canonFactIds.length === 0) {
    errors.push("Совместимость с каноном нельзя подтвердить без ссылок на проверенные факты.");
  }
  return errors;
}

/** Character origin is never silently written into world canon. */
export function canActivateCharacter(sheet: CharacterSheetV2): { ok: boolean; reasons: string[] } {
  const reasons = validateCharacterSheet(sheet);
  if (sheet.origin.canonFit !== "COMPATIBLE") {
    reasons.push("Происхождение персонажа должно пройти отдельную проверку совместимости с каноном Экдрасиля.");
  }
  if (sheet.origin.unresolvedQuestions.length > 0) {
    reasons.push("В происхождении остались неразрешённые вопросы, влияющие на канон.");
  }
  return { ok: reasons.length === 0, reasons };
}
