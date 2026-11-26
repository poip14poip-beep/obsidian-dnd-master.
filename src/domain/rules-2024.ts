/**
 * D&D 2024 / SRD 5.2.1 mechanical reference.
 * This module contains only verified baseline formulas and a coverage ledger.
 * Rule text is not reproduced; consult the cited SRD source for full wording.
 */
export const DND_2024_RULESET = {
  id: "DND_2024_SRD_5_2_1",
  edition: "D&D 5e (2024 revision)",
  source: "https://www.dndbeyond.com/srd",
  license: "CC-BY-4.0",
  attribution: "This work includes material from the System Reference Document 5.2.1 (\"SRD 5.2.1\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
} as const;

export type RuleDomain =
  | "CORE_D20" | "ABILITIES" | "PROFICIENCY" | "SKILLS" | "SAVING_THROWS"
  | "COMBAT" | "ACTIONS" | "CONDITIONS" | "DAMAGE" | "HEALING"
  | "DEATH" | "REST" | "EXHAUSTION" | "MOVEMENT" | "VISION"
  | "COVER" | "HIDING" | "EQUIPMENT" | "ENCUMBRANCE" | "WEAPONS"
  | "WEAPON_MASTERY" | "ARMOR" | "SPELLCASTING" | "SPELLS"
  | "CONCENTRATION" | "CHARACTER_CREATION" | "BACKGROUNDS" | "SPECIES"
  | "CLASSES" | "FEATS" | "TOOLS" | "TRAVEL" | "ENVIRONMENT"
  | "SOCIAL" | "TREASURE" | "MAGIC_ITEMS" | "MONSTERS" | "DM_TOOLBOX";

export type RuleCoverage = "BASELINE_FORMULA" | "REFERENCE_REQUIRED" | "NOT_IN_SRD" | "CAMPAIGN_OPTION";

export interface RuleDomainEntry {
  domain: RuleDomain;
  coverage: RuleCoverage;
  note: string;
  source: string;
}

/**
 * This is an honest coverage map, not a claim that every mechanic is encoded.
 * REFERENCE_REQUIRED means the exact feature/stat block must be read from SRD
 * or a separately approved source before adjudication.
 */
export const DND_2024_RULE_COVERAGE: readonly RuleDomainEntry[] = [
  { domain: "CORE_D20", coverage: "BASELINE_FORMULA", note: "D20 Tests, advantage/disadvantage and fixed DC must be applied before rolling.", source: "SRD 5.2.1: Playing the Game; Rules Glossary" },
  { domain: "ABILITIES", coverage: "BASELINE_FORMULA", note: "Ability modifier formula is encoded; ability-specific checks still require context.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "PROFICIENCY", coverage: "BASELINE_FORMULA", note: "Level-based proficiency bonus formula is encoded.", source: "SRD 5.2.1: Character Creation; Rules Glossary" },
  { domain: "SKILLS", coverage: "REFERENCE_REQUIRED", note: "Skill-to-ability mapping and proficiency must be read from the applicable rule/feature.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "SAVING_THROWS", coverage: "REFERENCE_REQUIRED", note: "Use character save proficiency and the effect's stated save.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "COMBAT", coverage: "REFERENCE_REQUIRED", note: "Initiative, turns, attacks, damage, tactical states and encounter rules require full rule lookup.", source: "SRD 5.2.1: Combat; Rules Glossary" },
  { domain: "ACTIONS", coverage: "REFERENCE_REQUIRED", note: "Use 2024 action names and each feature's exact action economy.", source: "SRD 5.2.1: Actions; Rules Glossary" },
  { domain: "CONDITIONS", coverage: "REFERENCE_REQUIRED", note: "Apply exact 2024 condition definitions; do not use legacy 2014 wording.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "DAMAGE", coverage: "REFERENCE_REQUIRED", note: "Apply damage types, resistance, vulnerability, immunity and critical-hit rules.", source: "SRD 5.2.1: Combat; Rules Glossary" },
  { domain: "HEALING", coverage: "REFERENCE_REQUIRED", note: "Resolve healing and temporary HP by the specific effect.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "DEATH", coverage: "REFERENCE_REQUIRED", note: "Death saves, dying, stabilization and resurrection require exact rules/effects.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "REST", coverage: "REFERENCE_REQUIRED", note: "Short/Long Rest eligibility, interruptions and recovery are rule-specific.", source: "SRD 5.2.1: Rules Glossary; class features" },
  { domain: "EXHAUSTION", coverage: "BASELINE_FORMULA", note: "2024 exhaustion: each level gives -2 to D20 Tests and -5 ft Speed; level 6 causes death; Long Rest reduces by 1.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "MOVEMENT", coverage: "REFERENCE_REQUIRED", note: "Speed, difficult terrain, special movement and forced movement require context.", source: "SRD 5.2.1: Combat; Rules Glossary" },
  { domain: "VISION", coverage: "REFERENCE_REQUIRED", note: "Light, obscurement, darkvision and visibility require scene-specific application.", source: "SRD 5.2.1: Rules Glossary" },
  { domain: "COVER", coverage: "REFERENCE_REQUIRED", note: "Cover modifies applicable AC and Dexterity saves according to cover type.", source: "SRD 5.2.1: Combat; Rules Glossary" },
  { domain: "HIDING", coverage: "REFERENCE_REQUIRED", note: "Hide action and Invisible condition are not interchangeable; verify prerequisites and outcomes.", source: "SRD 5.2.1: Actions; Rules Glossary" },
  { domain: "EQUIPMENT", coverage: "REFERENCE_REQUIRED", note: "Use exact item properties, quantities, weights and access rules.", source: "SRD 5.2.1: Equipment" },
  { domain: "ENCUMBRANCE", coverage: "BASELINE_FORMULA", note: "Standard carrying capacity is Strength × 15 lb; Push/Drag/Lift limit is × 30 lb, with size adjustments. Variant encumbrance is not automatic.", source: "SRD 5.2.1: Rules Glossary; Equipment" },
  { domain: "WEAPONS", coverage: "REFERENCE_REQUIRED", note: "Weapon properties, range, ammunition, mastery and damage die must come from item data.", source: "SRD 5.2.1: Equipment" },
  { domain: "WEAPON_MASTERY", coverage: "REFERENCE_REQUIRED", note: "Mastery property is granted only by a feature and applies to listed weapons.", source: "SRD 5.2.1: Character Classes; Equipment" },
  { domain: "ARMOR", coverage: "REFERENCE_REQUIRED", note: "Armor category, don/doff, Strength and stealth restrictions require item data.", source: "SRD 5.2.1: Equipment" },
  { domain: "SPELLCASTING", coverage: "REFERENCE_REQUIRED", note: "Spellcasting ability, DC, attack bonus, slots, components and action cost require class/spell data.", source: "SRD 5.2.1: Spellcasting; Classes" },
  { domain: "SPELLS", coverage: "REFERENCE_REQUIRED", note: "Resolve exact spell text, targets, range, components, duration, save/attack and upcasting.", source: "SRD 5.2.1: Spells" },
  { domain: "CONCENTRATION", coverage: "REFERENCE_REQUIRED", note: "Track one concentration effect and apply all interruption triggers from rules/effects.", source: "SRD 5.2.1: Spellcasting; Rules Glossary" },
  { domain: "CHARACTER_CREATION", coverage: "REFERENCE_REQUIRED", note: "Character creation must be a complete, validated 2024 process, not a partial random draft.", source: "SRD 5.2.1: Character Creation" },
  { domain: "BACKGROUNDS", coverage: "REFERENCE_REQUIRED", note: "Background supplies its listed ability score options, Origin feat, proficiencies and equipment.", source: "SRD 5.2.1: Backgrounds" },
  { domain: "SPECIES", coverage: "REFERENCE_REQUIRED", note: "Species provides listed traits, size and speed; do not import legacy racial ability increases.", source: "SRD 5.2.1: Species" },
  { domain: "CLASSES", coverage: "REFERENCE_REQUIRED", note: "Class progression, subclass, features, resources and spellcasting must match exact level tables.", source: "SRD 5.2.1: Classes" },
  { domain: "FEATS", coverage: "REFERENCE_REQUIRED", note: "Prerequisites, level, category and effects must be checked per feat.", source: "SRD 5.2.1: Feats" },
  { domain: "TOOLS", coverage: "REFERENCE_REQUIRED", note: "Tool proficiency and use are contextual; do not invent automatic bonuses.", source: "SRD 5.2.1: Equipment; Rules Glossary" },
  { domain: "TRAVEL", coverage: "REFERENCE_REQUIRED", note: "Travel pace and exploration procedures must account for terrain and conditions.", source: "SRD 5.2.1: Gameplay Toolbox" },
  { domain: "ENVIRONMENT", coverage: "REFERENCE_REQUIRED", note: "Hazards, weather and environmental effects need their actual rule or campaign source.", source: "SRD 5.2.1: Gameplay Toolbox" },
  { domain: "SOCIAL", coverage: "REFERENCE_REQUIRED", note: "Influence and attitude procedures do not replace NPC motives or guaranteed outcomes.", source: "SRD 5.2.1: Actions; Rules Glossary" },
  { domain: "TREASURE", coverage: "REFERENCE_REQUIRED", note: "Treasure, valuables and currency changes require an actual source/event.", source: "SRD 5.2.1: Equipment; Gameplay Toolbox" },
  { domain: "MAGIC_ITEMS", coverage: "REFERENCE_REQUIRED", note: "Use exact item rarity, attunement, charges and effect text.", source: "SRD 5.2.1: Magic Items" },
  { domain: "MONSTERS", coverage: "REFERENCE_REQUIRED", note: "Use actual stat block, senses, traits, actions, reactions, legendary/lair rules where present.", source: "SRD 5.2.1: Monsters" },
  { domain: "DM_TOOLBOX", coverage: "REFERENCE_REQUIRED", note: "Encounter building, DC guidance and adjudication tools require lookup; don't fabricate tables.", source: "SRD 5.2.1: Gameplay Toolbox" },
];

export function abilityModifier(score: number): number {
  if (!Number.isInteger(score) || score < 1 || score > 30) throw new RangeError("Ability score must be an integer from 1 to 30.");
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new RangeError("Character level must be from 1 to 20.");
  return Math.ceil(level / 4) + 1;
}

export function spellSaveDC(abilityScore: number, proficiency: number): number {
  if (!Number.isInteger(proficiency) || proficiency < 2 || proficiency > 6) throw new RangeError("Invalid proficiency bonus.");
  return 8 + proficiency + abilityModifier(abilityScore);
}

export function spellAttackBonus(abilityScore: number, proficiency: number): number {
  if (!Number.isInteger(proficiency) || proficiency < 2 || proficiency > 6) throw new RangeError("Invalid proficiency bonus.");
  return proficiency + abilityModifier(abilityScore);
}

export function carryingLimits(strength: number, size: "TINY" | "SMALL" | "MEDIUM" | "LARGE" | "HUGE" | "GARGANTUAN") {
  const sizeMultiplier = size === "TINY" ? 0.5 : size === "LARGE" ? 2 : size === "HUGE" ? 4 : size === "GARGANTUAN" ? 8 : 1;
  if (!Number.isInteger(strength) || strength < 1 || strength > 30) throw new RangeError("Strength must be an integer from 1 to 30.");
  const carryingCapacityLb = strength * 15 * sizeMultiplier;
  return { carryingCapacityLb, pushDragLiftLimitLb: strength * 30 * sizeMultiplier };
}

export function exhaustionEffects(level: number): { d20Penalty: number; speedPenaltyFeet: number; dies: boolean } {
  if (!Number.isInteger(level) || level < 0 || level > 6) throw new RangeError("Exhaustion level must be from 0 to 6.");
  return { d20Penalty: -2 * level, speedPenaltyFeet: -5 * level, dies: level === 6 };
}

export function currencyWeightLb(coins: { cp: number; sp: number; ep: number; gp: number; pp: number }): number {
  const amounts = Object.values(coins);
  if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) throw new RangeError("Coin counts must be non-negative integers.");
  return amounts.reduce((sum, amount) => sum + amount, 0) / 50;
}

export function d20TestTotal(d20: number, abilityScore: number, proficiency: number, proficient: boolean, exhaustionLevel = 0): number {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) throw new RangeError("D20 result must be from 1 to 20.");
  if (!Number.isInteger(proficiency) || proficiency < 0 || proficiency > 6) throw new RangeError("Invalid proficiency bonus.");
  return d20 + abilityModifier(abilityScore) + (proficient ? proficiency : 0) + exhaustionEffects(exhaustionLevel).d20Penalty;
}
