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

/**
 * Verified compact adjudication reference extracted from the user-provided SRD 5.2.1 PDF.
 * This is a concise rules summary, not a replacement for the full SRD text.
 * Relevant source pages: 6–18 (core play/combat), 47–49 (Fighter/Champion).
 */
export const DND_2024_CORE_RULES_REFERENCE = String.raw`
SRD 5.2.1 — CORE PLAY AND FIGHTER REFERENCE
Source: System Reference Document 5.2.1, pages 6–18 and 47–49.
The full source is licensed CC-BY-4.0; attribution:
This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

D20 TESTS
A D20 Test is an ability check, saving throw, or attack roll. Roll 1d20; with Advantage or Disadvantage roll two d20s and use the higher or lower result respectively. Add the relevant ability modifier, Proficiency Bonus when the character is proficient in the relevant skill/tool/save/weapon, and only those situational modifiers supported by a rule. Compare the total against the fixed DC or AC. The DC must be established before the roll and cannot be adjusted to force an outcome. Ability checks are appropriate when an action has a meaningful chance of failure and the outcome is uncertain. Typical ability-check DCs: Very Easy 5, Easy 10, Medium 15, Hard 20, Very Hard 25, Nearly Impossible 30. A saving throw is called for by an effect; its result is determined by that effect. A creature can choose to fail a save. Melee weapon attacks and Unarmed Strikes normally use Strength; ranged weapon attacks normally use Dexterity; spell attacks use the ability specified by the spellcasting feature. A proficient weapon attack adds Proficiency Bonus. A D20 Test succeeds when the total equals or exceeds its target. Natural 1 and natural 20 are not universal automatic failure/success for every ability check or save; apply special natural-roll rules only where they are stated.

COMBAT ACTION ECONOMY
Combat is organized in rounds and turns. Initiative determines turn order. On its turn, a creature can move up to its Speed and take one action. A Bonus Action is available only when a feature, spell, or other rule grants one; a creature can take only one Bonus Action on its turn. A Reaction is an instant response to a trigger; after taking one, the creature cannot take another until the start of its next turn. The common actions are Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, and Utilize. A creature normally takes one action at a time. Do not invent an action cost for a feature: use the feature's exact wording. An Opportunity Attack is a Reaction and follows its specific trigger and restrictions.

FIGHTER 2024 — LEVEL 20
A Fighter has a d10 Hit Point Die, Strength and Constitution saving-throw proficiencies, and chooses two skill proficiencies from the Fighter list. Fighter 20 has Proficiency Bonus +6, four attacks whenever it takes the Attack action (Three Extra Attacks), four uses of Second Wind, two uses of Action Surge, three uses of Indomitable, and six Weapon Mastery choices according to the Fighter Features table. The standard Fighter class progression ends at level 20. Any campaign level beyond 20 is a separate campaign rule and does not grant extra class features unless that rule explicitly says so.

SECOND WIND
As a Bonus Action, expend a use to regain Hit Points equal to 1d10 + Fighter level. At Fighter 20, the healing formula is 1d10 + 20. The feature has four uses at Fighter 20. Regain one expended use when finishing a Short Rest and all expended uses when finishing a Long Rest. The Fighter's Tactical Shift can allow movement up to half Speed without provoking Opportunity Attacks immediately after activating Second Wind with a Bonus Action; Tactical Mind can spend a use on a failed ability check, roll 1d10 and add it to the check, and does not expend the use if the check still fails.

ACTION SURGE
On the Fighter's turn, gain one additional action, except the Magic action. The feature has two uses at Fighter 17 and higher; it can be used twice before a rest, but only once on a turn. The feature recharges when the Fighter finishes a Short or Long Rest.

INDOMITABLE
When the Fighter fails a saving throw, it can reroll and add a bonus equal to its Fighter level; it must use the new roll. It has three uses at Fighter 17 and higher. It recharges when the Fighter finishes a Long Rest.

WEAPON MASTERY AND ATTACKS
Weapon Mastery is granted by the Fighter feature and applies only to selected weapons. The Fighter 20 table allows six weapon mastery choices. Use the weapon's actual mastery property and only when the character has selected that weapon. Longsword mastery is Sap; Dagger mastery is Nick. A weapon's damage die, properties, mastery, range, and other statistics must come from its verified item entry. Do not infer that a custom weapon inherits all properties of a standard weapon unless the character source explicitly maps it.

CHAMPION SUBCLASS
Level 3 — Improved Critical: weapon and Unarmed Strike attack rolls score a Critical Hit on a natural 19 or 20.
Level 3 — Remarkable Athlete: Advantage on Initiative rolls and Strength (Athletics) checks. Immediately after scoring a Critical Hit, the Champion can move up to half Speed without provoking Opportunity Attacks.
Level 7 — Additional Fighting Style: gain another Fighting Style feat.
Level 10 — Heroic Warrior: during combat, gain Heroic Inspiration whenever starting the turn without it.
Level 15 — Superior Critical: weapon and Unarmed Strike attacks score a Critical Hit on a natural 18–20.
Level 18 — Survivor: Advantage on Death Saving Throws; rolling 18–20 on a Death Saving Throw grants the benefit of rolling a 20. At the start of each turn, regain 5 + Constitution modifier Hit Points if Bloodied and at least 1 Hit Point.

RULE BOUNDARIES
This compact reference does not contain every spell, item, monster stat block, condition, environmental rule, travel procedure, or optional rule. If the exact text needed for an action is not included here or in another attached, verified source, return RULE UNCERTAINTY and do not invent DC, damage, range, duration, action cost, or effect.
`;
