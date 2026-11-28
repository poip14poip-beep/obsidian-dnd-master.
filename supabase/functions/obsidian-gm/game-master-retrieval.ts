import { parseDiceFormula } from "./dice.ts";
/**
 * Bounded, read-only retrieval loop adapted from Open Dungeon Master (MIT).
 * Upstream: https://github.com/Lebbitheplow/open-game-master
 * MIT-licensed implementation inspected via https://github.com/mfarme/lorekeeper
 *
 * The tools expose only source-grounded D&D 2024/SRD 5.2.1 and Ekdrasil 2.4
 * excerpts. They cannot roll dice, mutate campaign state, or write persistence.
 */
import { selectCanonExcerpts, selectRuleExcerpts } from "./model-routing.ts";

type JsonRecord = Record<string, unknown>;

export const EKDRASIL_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_dnd_rules",
      description: "Найти точные выдержки из загруженного D&D 2024 / SRD 5.2.1. Используй, если контекста правил недостаточно. Только чтение.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { query: { type: "string", minLength: 3, maxLength: 180 } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_player_check",
      description: "Подготовить проверку главного героя по его фактическому листу. Сервер сам вычисляет бонус и формулу; игрок затем бросает кубик в интерфейсе. Вызывай до описания исхода. Не используй для атак, урона или бросков NPC.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["ABILITY_CHECK", "SKILL_CHECK", "SAVING_THROW"] },
          ability: { type: "string", enum: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma", "сила", "ловкость", "телосложение", "интеллект", "мудрость", "харизма"] },
          skill: { type: ["string", "null"], maxLength: 80 },
          dc: { type: "integer", minimum: 1, maximum: 40 },
          advantage: { type: "string", enum: ["NONE", "ADVANTAGE", "DISADVANTAGE"] },
          reason: { type: "string", minLength: 3, maxLength: 200 },
        },
        required: ["kind", "ability", "skill", "dc", "advantage", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_player_attack",
      description: "Подготовить атаку главного героя. Бонус атаки берётся только из weaponAttacks листа персонажа. AC цели обязательно должен быть подтверждён выдержкой SRD, ранее полученной через search_dnd_rules. Не выдумывай AC. Не используй для NPC-атак или урона.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          weapon: { type: "string", minLength: 1, maxLength: 80 },
          targetName: { type: "string", minLength: 2, maxLength: 100 },
          targetAC: { type: "integer", minimum: 1, maximum: 40 },
          advantage: { type: "string", enum: ["NONE", "ADVANTAGE", "DISADVANTAGE"] },
          reason: { type: "string", minLength: 3, maxLength: 200 },
        },
        required: ["weapon", "targetName", "targetAC", "advantage", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_player_damage",
      description: "Разрешить уже завершённую сервером атаку героя и, только при попадании, подготовить отдельный бросок урона по формуле выбранного оружия из подтверждённого листа. При промахе урон не бросается.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          weapon: { type: "string", minLength: 1, maxLength: 80 },
          targetName: { type: "string", minLength: 2, maxLength: 100 },
          reason: { type: "string", minLength: 3, maxLength: 200 },
        },
        required: ["weapon", "targetName", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_npc_attack",
      description: "Подготовить атаку существа/NPC по главному герою. Бонус атаки берётся только из найденного статблока SRD 5.2.1, AC героя — из подтверждённого листа. Требуется предварительный search_dnd_rules по существу и атаке. Бросок выполняет сервер.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          creatureName: { type: "string", minLength: 2, maxLength: 100 },
          attackName: { type: "string", minLength: 2, maxLength: 100 },
          advantage: { type: "string", enum: ["NONE", "ADVANTAGE", "DISADVANTAGE"] },
          reason: { type: "string", minLength: 3, maxLength: 200 },
        },
        required: ["creatureName", "attackName", "advantage", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_npc_damage",
      description: "Подготовить бросок урона NPC только после подтверждённого попадания предыдущим серверным броском. Формула берётся из строки Hit статблока SRD 5.2.1. Бросок выполняет сервер.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          creatureName: { type: "string", minLength: 2, maxLength: 100 },
          attackName: { type: "string", minLength: 2, maxLength: 100 },
          reason: { type: "string", minLength: 3, maxLength: 200 },
        },
        required: ["creatureName", "attackName", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_ekdrasil_canon",
      description: "Найти точные выдержки только из Ekdrasil_Master_Canon_v2.4.md. Старые редакции запрещены. Только чтение.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { query: { type: "string", minLength: 3, maxLength: 180 } },
        required: ["query"],
      },
    },
  },
] as const;

export interface RetrievalSource {
  content: string;
  sourceId: string;
  sha256: string;
}

export interface PreparedRoll {
  roller: "PLAYER" | "GM";
  label: string;
  formula: string;
  dc: number | null;
  targetType: "DC" | "AC" | "NONE";
  modifier: number;
  kind: "ABILITY_CHECK" | "SKILL_CHECK" | "SAVING_THROW" | "WEAPON_ATTACK" | "PLAYER_DAMAGE" | "NPC_ATTACK" | "NPC_DAMAGE";
  reason: string;
}

function queryTerms(query: string): string[] {
  return [...new Set(query.normalize("NFKC").toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2))].slice(0, 24);
}

function normalizeAbility(value: string): "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma" | null {
  const aliases: Record<string, "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"> = {
    strength: "strength", str: "strength", "сила": "strength",
    dexterity: "dexterity", dex: "dexterity", "ловкость": "dexterity",
    constitution: "constitution", con: "constitution", "телосложение": "constitution",
    intelligence: "intelligence", int: "intelligence", "интеллект": "intelligence",
    wisdom: "wisdom", wis: "wisdom", "мудрость": "wisdom",
    charisma: "charisma", cha: "charisma", "харизма": "charisma",
  };
  return aliases[value.normalize("NFKC").trim().toLocaleLowerCase()] ?? null;
}

function modifierForScore(score: number): number {
  return Math.floor((score - 10) / 2);
}

function preparePlayerCheck(
  args: JsonRecord,
  playerCharacter: JsonRecord | null,
  alreadyPrepared: boolean,
): { ok: true; preparedRoll: PreparedRoll } | { ok: false; error: string } {
  if (alreadyPrepared) return { ok: false, error: "В одном ходе разрешена только одна ожидающая проверка игрока." };
  if (!playerCharacter || playerCharacter.statsCertainty !== "KNOWN" ||
      !playerCharacter.abilityScores || typeof playerCharacter.abilityScores !== "object") {
    return { ok: false, error: "Лист персонажа не содержит подтверждённых характеристик. Не выдумывай бонус; запроси уточнение." };
  }
  const kind = args.kind;
  const ability = typeof args.ability === "string" ? normalizeAbility(args.ability) : null;
  const skill = typeof args.skill === "string" && args.skill.trim() ? args.skill.trim() : null;
  const dc = args.dc;
  const advantage = args.advantage;
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!ability || !["ABILITY_CHECK", "SKILL_CHECK", "SAVING_THROW"].includes(String(kind)) ||
      !Number.isInteger(dc) || (dc as number) < 1 || (dc as number) > 40 ||
      !["NONE", "ADVANTAGE", "DISADVANTAGE"].includes(String(advantage)) || reason.length < 3 || reason.length > 200) {
    return { ok: false, error: "Некорректные параметры проверки. Нужны тип, характеристика, DC 1–40, преимущество и причина." };
  }
  if ((kind === "SKILL_CHECK") !== Boolean(skill)) {
    return { ok: false, error: "Для SKILL_CHECK укажи точное имя навыка; для остальных видов skill должен быть null." };
  }

  const scores = playerCharacter.abilityScores as JsonRecord;
  const score = scores[ability];
  if (!Number.isInteger(score) || (score as number) < 1 || (score as number) > 30) {
    return { ok: false, error: "В листе отсутствует подтверждённая характеристика " + ability + "." };
  }
  let modifier = modifierForScore(score as number);
  const exhaustion = Array.isArray(playerCharacter.conditions) ? playerCharacter.conditions.map(String).join(" ") : "";
  const exhaustionMatch = /(?:exhaustion(?:\s+level)?|истощение(?:\s+уровень)?)\s*[:(]?\s*([1-6])/i.exec(exhaustion);
  if (exhaustionMatch) modifier -= 2 * Number(exhaustionMatch[1]);

  if (kind === "SAVING_THROW") {
    const saves = playerCharacter.savingThrowBonuses;
    if (!saves || typeof saves !== "object" || !Number.isInteger((saves as JsonRecord)[ability])) {
      return { ok: false, error: "В листе нет подтверждённого бонуса спасброска " + ability + "." };
    }
    modifier = Number((saves as JsonRecord)[ability]);
    if (exhaustionMatch) modifier -= 2 * Number(exhaustionMatch[1]);
  } else if (kind === "SKILL_CHECK") {
    const entries = Array.isArray(playerCharacter.skillBonuses) ? playerCharacter.skillBonuses : [];
    const normalizedSkill = skill!.normalize("NFKC").trim().toLocaleLowerCase();
    const entry = entries.find((item) => item && typeof item === "object" &&
      typeof (item as JsonRecord).name === "string" &&
      ((item as JsonRecord).name as string).normalize("NFKC").trim().toLocaleLowerCase() === normalizedSkill) as JsonRecord | undefined;
    if (entry) {
      const basis = typeof entry.basis === "string" ? entry.basis.toLocaleLowerCase() : "";
      const basisAbility = normalizeAbility(basis.split(/[\s+]+/)[0] ?? "");
      const expertise = /эксперт|expertise/i.test(basis);
      const proficient = /влад|proficien/i.test(basis) || expertise;
      const storedProficiency = Number(playerCharacter.proficiencyBonus);
      const level = Number(playerCharacter.classLevel ?? playerCharacter.level);
      const proficiency = Number.isInteger(storedProficiency) && storedProficiency >= 2 && storedProficiency <= 6
        ? storedProficiency
        : Number.isInteger(level) && level >= 1 && level <= 20
          ? Math.ceil(level / 4) + 1
          : null;
      if (basisAbility === null) {
        return { ok: false, error: "Неизвестна базовая характеристика владения навыком в листе персонажа." };
      }
      if (basisAbility === ability) {
        if (!Number.isInteger(entry.bonus)) return { ok: false, error: "Бонус навыка в листе повреждён или неизвестен." };
        modifier = Number(entry.bonus);
      } else if (proficient && proficiency !== null) {
        modifier += proficiency * (expertise ? 2 : 1);
      } else {
        return { ok: false, error: "Неизвестно владение или бонус мастерства для нестандартной проверки навыка." };
      }
    }
    if (exhaustionMatch) modifier -= 2 * Number(exhaustionMatch[1]);
  }

  const dice = advantage === "ADVANTAGE" ? "2d20kh1" : advantage === "DISADVANTAGE" ? "2d20kl1" : "1d20";
  const formula = modifier === 0 ? dice : dice + (modifier > 0 ? "+" : "") + String(modifier);
  const abilityRu: Record<string, string> = {
    strength: "Сила", dexterity: "Ловкость", constitution: "Телосложение",
    intelligence: "Интеллект", wisdom: "Мудрость", charisma: "Харизма",
  };
  const label = kind === "SKILL_CHECK"
    ? abilityRu[ability] + " (" + skill + ")"
    : kind === "SAVING_THROW" ? "Спасбросок " + abilityRu[ability] : "Проверка " + abilityRu[ability];
  return {
    ok: true,
    preparedRoll: {
      roller: "PLAYER", label, formula, dc: dc as number, targetType: "DC", modifier,
      kind: kind as PreparedRoll["kind"], reason,
    },
  };
}

function preparePlayerAttack(
  args: JsonRecord,
  rules: RetrievalSource,
  playerCharacter: JsonRecord | null,
  retrievedRuleExcerpts: Array<{ text: string; lines: string }>,
  alreadyPrepared: boolean,
): { ok: true; preparedRoll: PreparedRoll; targetACSource: { sourceId: string; sha256: string; lines: string } } | { ok: false; error: string } {
  if (alreadyPrepared) return { ok: false, error: "В одном ходе разрешена только одна ожидающая проверка игрока." };
  if (!playerCharacter || playerCharacter.statsCertainty !== "KNOWN" || !Array.isArray(playerCharacter.weaponAttacks)) {
    return { ok: false, error: "В подтверждённом листе нет списка оружейных атак. Не выдумывай бонус атаки." };
  }
  const weapon = typeof args.weapon === "string" ? args.weapon.trim() : "";
  const targetName = typeof args.targetName === "string" ? args.targetName.trim() : "";
  const targetAC = args.targetAC;
  const advantage = args.advantage;
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!weapon || !targetName || !Number.isInteger(targetAC) || (targetAC as number) < 1 || (targetAC as number) > 40 ||
      !["NONE", "ADVANTAGE", "DISADVANTAGE"].includes(String(advantage)) || reason.length < 3 || reason.length > 200) {
    return { ok: false, error: "Для атаки нужны точное оружие, цель, AC 1–40, преимущество и причина." };
  }
  const weaponEntry = (playerCharacter.weaponAttacks as unknown[]).find((entry) =>
    entry && typeof entry === "object" &&
    typeof (entry as JsonRecord).weapon === "string" &&
    ((entry as JsonRecord).weapon as string).normalize("NFKC").trim().toLocaleLowerCase() === weapon.normalize("NFKC").toLocaleLowerCase(),
  ) as JsonRecord | undefined;
  if (!weaponEntry || !Number.isInteger(weaponEntry.attackBonus)) {
    return { ok: false, error: "Оружие или его подтверждённый бонус атаки отсутствует в листе персонажа." };
  }
  const targetNeedle = targetName.normalize("NFKC").toLocaleLowerCase();
  const acPattern = new RegExp("(?:armor\\s+class|\bAC)\\s*:?\\s*" + String(targetAC) + "\b", "i");
  const sourceExcerpt = retrievedRuleExcerpts.find((excerpt) =>
    excerpt.text.normalize("NFKC").toLocaleLowerCase().includes(targetNeedle) && acPattern.test(excerpt.text),
  );
  if (!sourceExcerpt) {
    return { ok: false, error: "AC цели не подтверждён выдержкой SRD 5.2.1 в этом ходе. Найди статблок через search_dnd_rules; если его нет в SRD, не разрешай атаку без проверенного статблока." };
  }
  const modifier = Number(weaponEntry.attackBonus);
  const dice = advantage === "ADVANTAGE" ? "2d20kh1" : advantage === "DISADVANTAGE" ? "2d20kl1" : "1d20";
  const formula = modifier === 0 ? dice : dice + (modifier > 0 ? "+" : "") + String(modifier);
  return {
    ok: true,
    preparedRoll: {
      roller: "PLAYER",
      label: "Атака " + weapon + " по " + targetName,
      formula,
      dc: targetAC as number,
      targetType: "AC",
      modifier,
      kind: "WEAPON_ATTACK",
      reason,
    },
    targetACSource: { sourceId: rules.sourceId, sha256: rules.sha256, lines: sourceExcerpt.lines },
  };
}

function prepareNpcAttack(
  args: JsonRecord,
  rules: RetrievalSource,
  playerCharacter: JsonRecord | null,
  retrievedRuleExcerpts: Array<{ text: string; lines: string }>,
  alreadyPrepared: boolean,
  npcProfiles: JsonRecord[] = [],
): { ok: true; preparedRoll: PreparedRoll; targetACSource: { sourceId: string; sha256: string; lines: string } } | { ok: false; error: string } {
  if (alreadyPrepared) return { ok: false, error: "В одном ходе разрешён только один ожидающий бросок." };
  const creatureName = typeof args.creatureName === "string" ? args.creatureName.trim() : "";
  const attackName = typeof args.attackName === "string" ? args.attackName.trim() : "";
  const advantage = args.advantage;
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  const armorClass = playerCharacter?.armorClass;
  if (!playerCharacter || playerCharacter.statsCertainty !== "KNOWN" ||
      !Number.isInteger(armorClass) || (armorClass as number) < 1 || (armorClass as number) > 40) {
    return { ok: false, error: "Класс защиты героя не подтверждён листом персонажа. Не выдумывай AC." };
  }
  if (creatureName.length < 2 || attackName.length < 2 ||
      !["NONE", "ADVANTAGE", "DISADVANTAGE"].includes(String(advantage)) ||
      reason.length < 3 || reason.length > 200) {
    return { ok: false, error: "Для атаки нужны имя существа, точное имя атаки, преимущество и причина." };
  }
  const creatureNeedle = creatureName.normalize("NFKC").toLocaleLowerCase();
  const attackNeedle = attackName.normalize("NFKC").toLocaleLowerCase();
  const npc = npcProfiles.find((entry) => typeof entry.name === "string" &&
    entry.name.normalize("NFKC").trim().toLocaleLowerCase() === creatureNeedle);
  const gmProfile = npc && npc.gmProfile && typeof npc.gmProfile === "object" ? npc.gmProfile as JsonRecord : null;
  const combatProfile = gmProfile && gmProfile.combatProfile && typeof gmProfile.combatProfile === "object"
    ? gmProfile.combatProfile as JsonRecord : null;
  const profileAttack = combatProfile && Array.isArray(combatProfile.attacks)
    ? (combatProfile.attacks as unknown[]).find((entry) => entry && typeof entry === "object" &&
      typeof (entry as JsonRecord).name === "string" &&
      ((entry as JsonRecord).name as string).normalize("NFKC").trim().toLocaleLowerCase() === attackNeedle) as JsonRecord | undefined
    : undefined;
  const sourceExcerpt = retrievedRuleExcerpts.find((excerpt) => {
    const text = excerpt.text.normalize("NFKC").toLocaleLowerCase();
    return text.includes(creatureNeedle) && text.includes(attackNeedle) &&
      /(?:attack roll|to hit)/i.test(excerpt.text);
  });
  if (!sourceExcerpt) {
    return { ok: false, error: "Атака существа не подтверждена найденным статблоком SRD 5.2.1. Не придумывай бонус атаки." };
  }
  const bonusMatch = /(?:attack roll|to hit)\s*[:=]?\s*([+-]\d+)|([+-]\d+)\s*to hit/i.exec(sourceExcerpt.text);
  const attackBonus = bonusMatch ? Number(bonusMatch[1] ?? bonusMatch[2]) : NaN;
  if (!Number.isInteger(attackBonus) || attackBonus < -10 || attackBonus > 30) {
    return { ok: false, error: "В выдержке SRD не найден однозначный бонус этой атаки." };
  }
  if (combatProfile?.status === "SRD_VERIFIED" && profileAttack &&
      Number.isInteger(profileAttack.attackBonus) && profileAttack.attackBonus !== attackBonus) {
    return { ok: false, error: "Карточка NPC расходится с подтверждённым статблоком SRD 5.2.1. Атака остановлена до исправления досье." };
  }
  const dice = advantage === "ADVANTAGE" ? "2d20kh1" : advantage === "DISADVANTAGE" ? "2d20kl1" : "1d20";
  const formula = attackBonus === 0 ? dice : dice + (attackBonus > 0 ? "+" : "") + String(attackBonus);
  return {
    ok: true,
    preparedRoll: {
      roller: "GM",
      label: "Атака " + creatureName + " (" + attackName + ")",
      formula,
      dc: armorClass as number,
      targetType: "AC",
      modifier: attackBonus,
      kind: "NPC_ATTACK",
      reason,
    },
    targetACSource: { sourceId: rules.sourceId, sha256: rules.sha256, lines: sourceExcerpt.lines },
  };
}

type AttackResolution = {
  hit: boolean;
  critical: boolean;
  total: number;
  targetAC: number;
  naturalD20: number | null;
};

function resolveCompletedAttack(
  completedRolls: JsonRecord[],
  roller: "PLAYER" | "GM",
  expectedLabel: string,
): AttackResolution | null {
  const roll = [...completedRolls].reverse().find((item) =>
    item.roller === roller && item.targetType === "AC" && item.label === expectedLabel,
  );
  if (!roll || !Number.isInteger(roll.total) || !Number.isInteger(roll.dc) ||
      !Array.isArray(roll.dice) || typeof roll.success !== "boolean") return null;
  const keptD20 = roll.dice.filter((die) =>
    die && typeof die === "object" && (die as JsonRecord).sides === 20 &&
    (die as JsonRecord).kept === true && Number.isInteger((die as JsonRecord).value),
  ).map((die) => (die as JsonRecord).value as number);
  if (keptD20.length !== 1 || keptD20[0]! < 1 || keptD20[0]! > 20) return null;
  const naturalD20 = keptD20[0]!;
  const critical = naturalD20 === 20;
  const hit = critical || (naturalD20 !== 1 && (roll.total as number) >= (roll.dc as number));
  // The signed result's success flag is checked against its signed DC by the
  // endpoint. Attack rules additionally make a natural 1 miss and natural 20 hit.
  return { hit, critical, total: roll.total as number, targetAC: roll.dc as number, naturalD20 };
}

function doubleDamageDice(formula: string): string {
  return formula.replace(/(\d*)d(\d+)/gi, (_match, count: string, sides: string) =>
    String(Number(count || 1) * 2) + "d" + sides,
  );
}

function findCompletedDamageRoll(
  completedRolls: JsonRecord[],
  roller: "PLAYER" | "GM",
  label: string,
  formula: string,
): JsonRecord | null {
  const roll = [...completedRolls].reverse().find((item) =>
    item.roller === roller && item.targetType === "NONE" && item.label === label &&
    item.formula === formula && Number.isInteger(item.total) && Number.isInteger(item.modifier) &&
    Array.isArray(item.dice),
  );
  if (!roll) return null;
  const dice = roll.dice as unknown[];
  if (!dice.length || dice.some((die) => !die || typeof die !== "object" ||
      !Number.isInteger((die as JsonRecord).value) || !Number.isInteger((die as JsonRecord).sides) ||
      typeof (die as JsonRecord).kept !== "boolean")) return null;
  return roll;
}

function preparePlayerDamage(
  args: JsonRecord,
  playerCharacter: JsonRecord | null,
  completedRolls: JsonRecord[],
  alreadyPrepared: boolean,
): JsonRecord {
  if (alreadyPrepared) return { ok: false, error: "В одном ходе уже ожидается другой бросок." };
  if (!playerCharacter || playerCharacter.statsCertainty !== "KNOWN" || !Array.isArray(playerCharacter.weaponAttacks)) {
    return { ok: false, error: "Для расчёта урона нужен подтверждённый лист героя с оружейными атаками." };
  }
  const weapon = typeof args.weapon === "string" ? args.weapon.trim() : "";
  const targetName = typeof args.targetName === "string" ? args.targetName.trim() : "";
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!weapon || targetName.length < 2 || reason.length < 3 || reason.length > 200) {
    return { ok: false, error: "Для урона нужны точное оружие, цель и причина." };
  }
  const entry = (playerCharacter.weaponAttacks as unknown[]).find((item) =>
    item && typeof item === "object" && typeof (item as JsonRecord).weapon === "string" &&
    ((item as JsonRecord).weapon as string).normalize("NFKC").trim().toLocaleLowerCase() === weapon.normalize("NFKC").toLocaleLowerCase(),
  ) as JsonRecord | undefined;
  if (!entry || typeof entry.damage !== "string" || !parseDiceFormula(entry.damage)) {
    return { ok: false, error: "Формула урона выбранного оружия отсутствует или не подтверждена листом героя." };
  }
  const label = "Атака " + weapon + " по " + targetName;
  const resolution = resolveCompletedAttack(completedRolls, "PLAYER", label);
  if (!resolution) {
    return { ok: false, error: "Не найден подтверждённый результат атаки этого героя по этой цели. Нельзя рассчитывать урон." };
  }
  if (!resolution.hit) {
    return { ok: true, hit: false, target: targetName, attackResolution: { ...resolution, outcome: "MISS" }, preparedRoll: null, note: "Атака промахнулась. Бросок урона не требуется." };
  }
  const formula = resolution.critical ? doubleDamageDice(entry.damage) : entry.damage.replace(/\s+/g, "");
  const parsed = parseDiceFormula(formula);
  if (!parsed) return { ok: false, error: "Формула урона не поддерживается серверным генератором." };
  const damageLabel = "Урон " + weapon + " по " + targetName;
  const completedDamage = findCompletedDamageRoll(completedRolls, "PLAYER", damageLabel, formula);
  if (completedDamage) {
    return {
      ok: true, hit: true, target: targetName,
      attackResolution: { ...resolution, outcome: resolution.critical ? "CRITICAL_HIT" : "HIT" },
      damageResolution: { total: completedDamage.total, formula, modifier: completedDamage.modifier, dice: completedDamage.dice },
      preparedRoll: null,
      note: "Урон уже брошен и подтверждён сервером; повторный бросок запрещён.",
    };
  }
  return {
    ok: true,
    hit: true,
    target: targetName,
    attackResolution: { ...resolution, outcome: resolution.critical ? "CRITICAL_HIT" : "HIT" },
    preparedRoll: {
      roller: "PLAYER",
      label: "Урон " + weapon + " по " + targetName,
      formula,
      dc: null,
      targetType: "NONE",
      modifier: parsed.modifier,
      kind: "PLAYER_DAMAGE",
      reason,
    },
  };
}

function prepareNpcDamage(
  args: JsonRecord,
  rules: RetrievalSource,
  completedRolls: JsonRecord[],
  retrievedRuleExcerpts: Array<{ text: string; lines: string }>,
  alreadyPrepared: boolean,
  npcProfiles: JsonRecord[] = [],
): JsonRecord {
  if (alreadyPrepared) return { ok: false, error: "В одном ходе разрешён только один ожидающий бросок." };
  const creatureName = typeof args.creatureName === "string" ? args.creatureName.trim() : "";
  const attackName = typeof args.attackName === "string" ? args.attackName.trim() : "";
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (creatureName.length < 2 || attackName.length < 2 || reason.length < 3 || reason.length > 200) {
    return { ok: false, error: "Для урона нужны имя существа, точное имя атаки и причина." };
  }
  const expectedLabel = "Атака " + creatureName + " (" + attackName + ")";
  const attackResolution = resolveCompletedAttack(completedRolls, "GM", expectedLabel);
  if (!attackResolution) {
    return { ok: false, error: "Нет подтверждённого серверного результата атаки этого существа. Урон пока не разрешён." };
  }
  if (!attackResolution.hit) {
    return { ok: true, hit: false, target: creatureName, attackResolution: { ...attackResolution, outcome: "MISS" }, preparedRoll: null, note: "Атака NPC промахнулась. Бросок урона не требуется." };
  }
  const creatureNeedle = creatureName.normalize("NFKC").toLocaleLowerCase();
  const attackNeedle = attackName.normalize("NFKC").toLocaleLowerCase();
  const sourceExcerpt = retrievedRuleExcerpts.find((excerpt) => {
    const text = excerpt.text.normalize("NFKC").toLocaleLowerCase();
    return text.includes(creatureNeedle) && text.includes(attackNeedle) && /hit\s*:/i.test(excerpt.text);
  });
  if (!sourceExcerpt) {
    return { ok: false, error: "Строка Hit для этой атаки не найдена в статблоке SRD 5.2.1. Не выдумывай урон." };
  }
  const damageMatch = /hit\s*:\s*\d+\s*\(([^)]+)\)/i.exec(sourceExcerpt.text);
  if (!damageMatch) return { ok: false, error: "Не удалось однозначно извлечь формулу урона из строки Hit." };
  let formula = damageMatch[1]!.replace(/\s+/g, "");
  const npc = npcProfiles.find((entry) => typeof entry.name === "string" &&
    entry.name.normalize("NFKC").trim().toLocaleLowerCase() === creatureNeedle);
  const gmProfile = npc && npc.gmProfile && typeof npc.gmProfile === "object" ? npc.gmProfile as JsonRecord : null;
  const combatProfile = gmProfile && gmProfile.combatProfile && typeof gmProfile.combatProfile === "object"
    ? gmProfile.combatProfile as JsonRecord : null;
  const profileAttack = combatProfile && Array.isArray(combatProfile.attacks)
    ? (combatProfile.attacks as unknown[]).find((entry) => entry && typeof entry === "object" &&
      typeof (entry as JsonRecord).name === "string" &&
      ((entry as JsonRecord).name as string).normalize("NFKC").trim().toLocaleLowerCase() === attackNeedle) as JsonRecord | undefined
    : undefined;
  if (combatProfile?.status === "SRD_VERIFIED" && profileAttack &&
      typeof profileAttack.damage === "string" &&
      profileAttack.damage.replace(/\s+/g, "").toLocaleLowerCase() !== formula.toLocaleLowerCase()) {
    return { ok: false, error: "Формула урона в карточке NPC расходится с подтверждённой строкой Hit SRD 5.2.1. Урон не подготовлен." };
  }
  const parsed = parseDiceFormula(formula);
  if (!parsed) return { ok: false, error: "Формула урона из статблока не поддерживается серверным генератором." };
  const critical = attackResolution.critical;
  if (critical) formula = doubleDamageDice(formula);
  const verified = parseDiceFormula(formula);
  if (!verified) return { ok: false, error: "Формула критического урона некорректна." };
  const damageLabel = "Урон " + creatureName + " (" + attackName + ")";
  const completedDamage = findCompletedDamageRoll(completedRolls, "GM", damageLabel, formula);
  if (completedDamage) {
    return {
      ok: true, hit: true, target: creatureName,
      attackResolution: { ...attackResolution, outcome: critical ? "CRITICAL_HIT" : "HIT" },
      damageResolution: { total: completedDamage.total, formula, modifier: completedDamage.modifier, dice: completedDamage.dice },
      preparedRoll: null,
      damageSource: { sourceId: rules.sourceId, sha256: rules.sha256, lines: sourceExcerpt.lines },
      critical,
      note: "Урон уже брошен и подтверждён сервером; повторный бросок запрещён.",
    };
  }
  return {
    ok: true,
    hit: true,
    target: creatureName,
    attackResolution: { ...attackResolution, outcome: critical ? "CRITICAL_HIT" : "HIT" },
    preparedRoll: {
      roller: "GM",
      label: "Урон " + creatureName + " (" + attackName + ")",
      formula,
      dc: null,
      targetType: "NONE",
      modifier: verified.modifier,
      kind: "NPC_DAMAGE",
      reason,
    },
    damageSource: { sourceId: rules.sourceId, sha256: rules.sha256, lines: sourceExcerpt.lines },
    critical,
  };
}

export function executeEkdrasilReadTool(
  name: string,
  rawArguments: string,
  rules: RetrievalSource,
  canon: RetrievalSource,
  playerCharacter: JsonRecord | null = null,
  alreadyPrepared = false,
  retrievedRuleExcerpts: Array<{ text: string; lines: string }> = [],
  completedRolls: JsonRecord[] = [],
  npcProfiles: JsonRecord[] = [],
): JsonRecord {
  let args: unknown;
  try { args = JSON.parse(rawArguments || "{}"); }
  catch { return { ok: false, error: "Аргументы инструмента должны быть корректным JSON." }; }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "Ожидался объект аргументов." };
  }
  if (name === "prepare_player_check") {
    return preparePlayerCheck(args as JsonRecord, playerCharacter, alreadyPrepared);
  }
  if (name === "prepare_player_attack") {
    return preparePlayerAttack(args as JsonRecord, rules, playerCharacter, retrievedRuleExcerpts, alreadyPrepared);
  }
  if (name === "prepare_player_damage") {
    return preparePlayerDamage(args as JsonRecord, playerCharacter, completedRolls, alreadyPrepared);
  }
  if (name === "prepare_npc_attack") {
    return prepareNpcAttack(args as JsonRecord, rules, playerCharacter, retrievedRuleExcerpts, alreadyPrepared, npcProfiles);
  }
  if (name === "prepare_npc_damage") {
    return prepareNpcDamage(args as JsonRecord, rules, completedRolls, retrievedRuleExcerpts, alreadyPrepared, npcProfiles);
  }

  const query = (args as JsonRecord).query;
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 180) {
    return { ok: false, error: "Поле query должно содержать от 3 до 180 символов." };
  }
  const terms = queryTerms(query.trim());
  if (!terms.length) return { ok: false, error: "Запрос не содержит поисковых терминов." };

  if (name === "search_dnd_rules") {
    const excerpts = selectRuleExcerpts(rules.content, terms, 9_000, 3);
    return {
      ok: true,
      source: "D&D 2024 / SRD 5.2.1",
      sourceId: rules.sourceId,
      sha256: rules.sha256,
      excerpts: excerpts.map((item) => ({
        text: item.text,
        lines: `${item.startLine}–${item.endLine}`,
        relevance: item.score,
      })),
      note: excerpts.length
        ? "Только полные выдержки из проверенного источника SRD 5.2.1."
        : "Совпадений в проверенном источнике не найдено. Не выдумывай правило; обозначь UNKNOWN.",
    };
  }

  if (name === "search_ekdrasil_canon") {
    const excerpts = selectCanonExcerpts(canon.content, terms, 9_000, 3);
    return {
      ok: true,
      source: "Ekdrasil_Master_Canon_v2.4.md",
      edition: "2.4",
      sourceId: canon.sourceId,
      sha256: canon.sha256,
      excerpts: excerpts.map((item) => ({
        text: item.text,
        sectionId: item.sectionId,
        headingPath: item.headingPath,
        lines: `${item.startLine}–${item.endLine}`,
        relevance: item.score,
      })),
      note: excerpts.length
        ? "Только полные выдержки из канона 2.4 с происхождением."
        : "Совпадений в каноне 2.4 не найдено. Считай сведения UNKNOWN; старые редакции запрещены.",
    };
  }

  return { ok: false, error: "Инструмент не разрешён. Доступны только поиск правил и канона." };
}

export interface ServerCompletedRoll extends JsonRecord {
  roller: "GM";
  label: string;
  formula: string;
  dc: number | null;
  targetType: "DC" | "AC" | "NONE";
  modifier: number;
  dice: Array<{ value: number; sides: number; kept: boolean }>;
  total: number;
  success: boolean | null;
  result: string;
  kind: PreparedRoll["kind"];
}

/** Resolve a GM-owned roll immediately on the server; never expose a pending GM roll to the player UI. */
export function executePreparedServerRoll(
  prepared: PreparedRoll,
  random?: (sides: number) => number,
): ServerCompletedRoll {
  if (prepared.roller !== "GM") throw new Error("Игроком управляемый бросок нельзя выполнять на сервере.");
  const rolled = rollDiceFormula(prepared.formula, random);
  if (rolled.modifier !== prepared.modifier) {
    throw new Error("Модификатор формулы не совпадает с подтверждённым бонусом существа.");
  }
  const keptD20 = rolled.dice.filter((die) => die.sides === 20 && die.kept);
  const naturalD20 = keptD20.length === 1 ? keptD20[0]!.value : null;
  if (prepared.kind === "NPC_ATTACK" && naturalD20 === null) {
    throw new Error("Атака NPC должна содержать ровно один учитываемый результат d20.");
  }
  let success: boolean | null = null;
  if (prepared.targetType !== "NONE") {
    if (prepared.dc === null || !Number.isInteger(prepared.dc)) {
      throw new Error("Для серверной проверки отсутствует подтверждённая DC/AC.");
    }
    success = prepared.kind === "NPC_ATTACK" && naturalD20 !== null
      ? naturalD20 === 20 || (naturalD20 !== 1 && rolled.total >= prepared.dc)
      : rolled.total >= prepared.dc;
  }
  const diceText = rolled.dice.map((die) =>
    die.kept ? String(die.value) : `(${die.value})`
  ).join(" + ");
  const arithmetic = `${diceText}${rolled.modifier === 0 ? "" : rolled.modifier > 0 ? ` + ${rolled.modifier}` : ` - ${Math.abs(rolled.modifier)}`} = ${rolled.total}`;
  const outcome = prepared.kind === "NPC_ATTACK"
    ? naturalD20 === 20 ? " · КРИТИЧЕСКОЕ ПОПАДАНИЕ"
      : success ? " · ПОПАДАНИЕ" : " · ПРОМАХ"
    : success === null ? "" : success ? " · УСПЕХ" : " · ПРОВАЛ";
  return {
    roller: "GM",
    label: prepared.label,
    formula: prepared.formula,
    dc: prepared.dc,
    targetType: prepared.targetType,
    modifier: rolled.modifier,
    dice: rolled.dice,
    total: rolled.total,
    success,
    result: arithmetic + outcome,
    kind: prepared.kind,
  };
}

export interface RetrievalLoopResult {
  response: Response;
  payload: unknown;
  toolCalls: number;
  exhausted: boolean;
  /** Only a player-owned pending roll; it must receive a signed challenge. */
  preparedRoll: PreparedRoll | null;
  /** NPC and other GM-owned rolls completed by server RNG during this request. */
  serverRolls: ServerCompletedRoll[];
  /** Read-only and deterministic tool conversation retained for the engine boundary. */
  conversation: JsonRecord[];
}

export async function callWithEkdrasilReadTools(options: {
  fetcher: typeof fetch;
  url: string;
  headers: HeadersInit;
  requestBody: JsonRecord;
  enabled: boolean;
  rules: RetrievalSource;
  canon: RetrievalSource;
  playerCharacter?: JsonRecord | null;
  completedRolls?: JsonRecord[];
  npcProfiles?: JsonRecord[];
  /** Deterministic test seam; production defaults to cryptographic server RNG. */
  rollRandom?: (sides: number) => number;
  maxToolRounds?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
}): Promise<RetrievalLoopResult> {
  const messages = Array.isArray(options.requestBody.messages)
    ? [...options.requestBody.messages] as JsonRecord[]
    : [];
  const maxRounds = Math.max(0, Math.min(options.maxToolRounds ?? 8, 8));
  const maxCalls = Math.max(1, Math.min(options.maxToolCalls ?? 16, 16));
  const deadline = Date.now() + (options.timeoutMs ?? 40_000);
  let preparedRoll: PreparedRoll | null = null;
  const serverRolls: ServerCompletedRoll[] = [];
  const completedRolls = [...(options.completedRolls ?? [])];
  const retrievedRuleExcerpts: Array<{ text: string; lines: string }> = [];

  const send = async (body: JsonRecord): Promise<{ response: Response; payload: unknown }> => {
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) {
      return {
        response: new Response(JSON.stringify({ error: { message: "Game-master tool-loop time budget exhausted." } }), { status: 504 }),
        payload: null,
      };
    }
    const response = await options.fetcher(options.url, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(remaining, 50_000)),
    });
    const payload = await response.clone().json().catch(() => null) as unknown;
    return { response, payload };
  };

  if (!options.enabled) {
    const result = await send(options.requestBody);
    return { ...result, toolCalls: 0, exhausted: false, preparedRoll: null, serverRolls, conversation: messages };
  }

  let toolCalls = 0;
  let pendingRollRecoveryAttempts = 0;
  let requireToolCall = false;
  for (let round = 0; ; round += 1) {
    const toolBody: JsonRecord = {
      ...options.requestBody,
      messages,
      tools: EKDRASIL_READ_TOOLS,
      tool_choice: requireToolCall ? "required" : "auto",
    };
    // Tool-capable requests omit structured-output constraints for compatibility
    // with providers that cannot combine strict JSON schema and function calls.
    delete toolBody.response_format;
    delete toolBody.structured_outputs;
    const result = await send(toolBody);
    if (!result.response.ok) return { ...result, toolCalls, exhausted: false, preparedRoll, serverRolls, conversation: messages };
    if (!result.payload || typeof result.payload !== "object" || Array.isArray(result.payload)) {
      return { ...result, toolCalls, exhausted: false, preparedRoll, serverRolls, conversation: messages };
    }
    const root = result.payload as JsonRecord;
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as JsonRecord : {};
    const message = choice.message && typeof choice.message === "object" ? choice.message as JsonRecord : {};
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (!calls.length) {
      // Some providers return a pending roll in their structured answer without
      // invoking the deterministic preparation tool. Never trust that roll:
      // bind it to a server-prepared check/attack before issuing a challenge.
      const finalBody: JsonRecord = { ...options.requestBody, messages };
      delete finalBody.tools;
      delete finalBody.tool_choice;
      let finalResult = await send(finalBody);
      if (!finalResult.response.ok) {
        return { ...finalResult, toolCalls, exhausted: false, preparedRoll, serverRolls, conversation: messages };
      }

      const finalRoot = finalResult.payload && typeof finalResult.payload === "object"
        ? finalResult.payload as JsonRecord : {};
      const finalChoices = Array.isArray(finalRoot.choices) ? finalRoot.choices : [];
      const finalChoice = finalChoices[0] && typeof finalChoices[0] === "object"
        ? finalChoices[0] as JsonRecord : {};
      const finalMessage = finalChoice.message && typeof finalChoice.message === "object"
        ? finalChoice.message as JsonRecord : {};
      const finalContent = typeof finalMessage.content === "string" ? finalMessage.content : "";
      let pendingRoll: JsonRecord | null = null;
      let parsedFinal: JsonRecord | null = null;
      try {
        const parsed = JSON.parse(finalContent);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedFinal = parsed as JsonRecord;
          const rolls = Array.isArray(parsedFinal.rolls)
            ? parsedFinal.rolls as unknown[] : [];
          pendingRoll = rolls.find((roll) => roll && typeof roll === "object" &&
            (roll as JsonRecord).roller === "PLAYER" &&
            (roll as JsonRecord).result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА") as JsonRecord | undefined ?? null;
        }
      } catch { /* malformed output is handled by the normal schema validator */ }

      if (pendingRoll && finalMessage.role === "assistant") {
        if (preparedRoll) {
          // The server-prepared roll is authoritative. Synchronize the model's
          // structured turn with the verified formula/DC before returning it.
          const rolls = Array.isArray(parsedFinal?.rolls) ? parsedFinal!.rolls as unknown[] : [];
          const pendingIndex = rolls.findIndex((roll) => roll && typeof roll === "object" &&
            (roll as JsonRecord).roller === "PLAYER" &&
            (roll as JsonRecord).result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
          if (pendingIndex >= 0) {
            const current = rolls[pendingIndex] as JsonRecord;
            rolls[pendingIndex] = {
              ...current,
              roller: "PLAYER",
              label: preparedRoll.label,
              formula: preparedRoll.formula,
              dc: preparedRoll.dc,
              targetType: preparedRoll.targetType,
              result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
            };
            finalMessage.content = JSON.stringify(parsedFinal);
            finalResult = {
              ...finalResult,
              payload: finalRoot,
            };
            if (finalRoot.choices && Array.isArray(finalRoot.choices) &&
                finalRoot.choices[0] && typeof finalRoot.choices[0] === "object") {
              const firstChoice = finalRoot.choices[0] as JsonRecord;
              if (firstChoice.message && typeof firstChoice.message === "object") {
                (firstChoice.message as JsonRecord).content = finalMessage.content;
              }
            }
          }
        } else if (pendingRollRecoveryAttempts < 1) {
          // A model may narrate the need for a roll but omit the preparation
          // tool call. Never infer a mechanic from the roll label. Ask the
          // D&D engine to re-evaluate the whole action and force a real tool
          // selection from the complete preparation tool set.
          pendingRollRecoveryAttempts += 1;
          messages.push(finalMessage);
          messages.push({
            role: "system",
            content: [
              "ОБЯЗАТЕЛЬНАЯ ПРОВЕРКА ДВИЖКА: ты вернул ожидающий бросок игрока, но не вызвал серверный инструмент подготовки. Не возвращай сейчас JSON и не угадывай формулу по подписи броска.",
              "Повторно оцени исходное намерение игрока по правилам D&D 2024 / SRD 5.2.1, подтверждённому листу персонажа, текущему состоянию и уже завершённым броскам.",
              "Выбери подходящий инструмент по фактической механике: prepare_player_check для проверки характеристики/навыка/спасброска; prepare_player_attack для атаки персонажа; prepare_player_damage только после подтверждённого попадания; prepare_npc_attack и prepare_npc_damage для бросков существ, которые выполняет сервер.",
              "Если для выбора AC/правила не хватает подтверждения, сначала вызови search_dnd_rules. Не придумывай DC, AC, модификатор, владение, оружие или урон. Инструмент сам проверит данные листа и правила.",
              "Если по правилам бросок не нужен, откажись от ожидающего броска и верни обычное разрешение действия. Если нужен бросок игрока, обязательно вызови подходящий инструмент до финального ответа.",
            ].join("\n"),
          });
          requireToolCall = true;
          continue;
        }
      }
      return { ...finalResult, toolCalls, exhausted: false, preparedRoll, serverRolls, conversation: messages };
    }
    if (round >= maxRounds || toolCalls + calls.length > maxCalls) {
      return { ...result, toolCalls, exhausted: true, preparedRoll, serverRolls, conversation: messages };
    }

    messages.push(message);
    for (const rawCall of calls) {
      const call = rawCall && typeof rawCall === "object" ? rawCall as JsonRecord : {};
      const fn = call.function && typeof call.function === "object" ? call.function as JsonRecord : {};
      const id = typeof call.id === "string" ? call.id : "";
      const name = typeof fn.name === "string" ? fn.name : "";
      const rawArgs = typeof fn.arguments === "string" ? fn.arguments : "{}";
      let toolResult: JsonRecord = id
        ? executeEkdrasilReadTool(name, rawArgs, options.rules, options.canon, options.playerCharacter ?? null, preparedRoll !== null, retrievedRuleExcerpts, completedRolls, options.npcProfiles ?? [])
        : { ok: false, error: "У вызова инструмента отсутствует идентификатор." };
      if (name === "search_dnd_rules" && toolResult && typeof toolResult === "object" &&
          (toolResult as JsonRecord).ok === true && Array.isArray((toolResult as JsonRecord).excerpts)) {
        for (const rawExcerpt of (toolResult as JsonRecord).excerpts as unknown[]) {
          if (rawExcerpt && typeof rawExcerpt === "object") {
            const excerpt = rawExcerpt as JsonRecord;
            if (typeof excerpt.text === "string" && typeof excerpt.lines === "string") {
              retrievedRuleExcerpts.push({ text: excerpt.text, lines: excerpt.lines });
            }
          }
        }
      }
      if ("preparedRoll" in toolResult) {
        const rawPrepared = toolResult.preparedRoll;
        if (rawPrepared && typeof rawPrepared === "object") {
          const prepared = rawPrepared as PreparedRoll;
          if (prepared.roller === "PLAYER") {
            if (serverRolls.length >= 4) {
              toolResult = { ok: false, error: "Достигнут предел серверных бросков для одного действия.", preparedRoll: null };
            } else {
              preparedRoll = prepared;
              requireToolCall = false;
            }
          } else if (prepared.roller === "GM") {
            try {
              const serverRollLimit = preparedRoll ? 3 : 4;
              if (serverRolls.length >= serverRollLimit) {
                throw new Error("Достигнут предел серверных бросков для одного действия.");
              }
              const completed = executePreparedServerRoll(prepared, options.rollRandom);
              serverRolls.push(completed);
              completedRolls.push(completed);
              toolResult = { ...toolResult, preparedRoll: null, serverRoll: completed };
            } catch (error) {
              toolResult = {
                ok: false,
                error: error instanceof Error ? error.message : "Серверный бросок NPC не выполнен.",
                preparedRoll: null,
              };
            }
          }
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: id || "invalid-tool-call",
        content: JSON.stringify(toolResult),
      });
      toolCalls += 1;
    }
  }
}
