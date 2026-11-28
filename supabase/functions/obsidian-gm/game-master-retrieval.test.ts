import { describe, expect, it, vi } from "vitest";
import { callWithEkdrasilReadTools, executeEkdrasilReadTool, executePreparedServerRoll } from "./game-master-retrieval";

const rules = {
  sourceId: "SRD_5_2_1",
  sha256: "rules-hash",
  content: [
    "# Combat",
    "",
    "An attack roll is a d20 test against the target's Armor Class.",
    "",
    "# Ability Checks",
    "",
    "An ability check uses a d20 roll plus the relevant ability modifier.",
  ].join("\n"),
};
const canon = {
  sourceId: "EKDRASIL_WORLD_BIBLE",
  sha256: "canon-hash",
  content: [
    "# ЭКДРАСИЛЬ",
    "",
    "## 12. Вальдгард",
    "",
    "Вальдгард — подтверждённое королевство северных земель Экдрасиля.",
    "",
    "## 13. Благодать",
    "",
    "Благодать ангелов связана с их силой и владениями.",
  ].join("\n"),
};

describe("Open Dungeon Master retrieval adapted to Ekdrasil", () => {
  it("retrieves source-attributed D&D 2024 excerpts", () => {
    const result = executeEkdrasilReadTool("search_dnd_rules", JSON.stringify({ query: "attack roll armor class" }), rules, canon);
    expect(result.source).toBe("D&D 2024 / SRD 5.2.1");
    expect(result.sourceId).toBe("SRD_5_2_1");
    expect(result.sha256).toBe("rules-hash");
    expect(result.excerpts).toEqual([expect.objectContaining({ lines: "3–3" })]);
  });

  it("retrieves only canon 2.4 with section and line provenance", () => {
    const result = executeEkdrasilReadTool("search_ekdrasil_canon", JSON.stringify({ query: "Вальдгард королевство северных земель" }), rules, canon);
    expect(result.source).toBe("Ekdrasil_Master_Canon_v2.4.md");
    expect(result.edition).toBe("2.4");
    expect(result.sha256).toBe("canon-hash");
    expect(result.excerpts).toEqual(expect.arrayContaining([expect.objectContaining({
      sectionId: "EKDRASIL_WORLD_BIBLE:3:12-вальдгард",
      text: expect.stringContaining("Вальдгард — подтверждённое королевство"),
    })]));
  });

  it("refuses unknown tools and malformed arguments", () => {
    expect(executeEkdrasilReadTool("write_campaign_state", "{}", rules, canon).ok).toBe(false);
    expect(executeEkdrasilReadTool("search_ekdrasil_canon", "{", rules, canon).ok).toBe(false);
  });

  it("feeds read-only tool results back and restores the strict final schema", async () => {
    const first = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "call-1", type: "function",
        function: { name: "search_ekdrasil_canon", arguments: JSON.stringify({ query: "Вальдгард" }) },
      }] } }],
    };
    const second = { choices: [{ message: { role: "assistant", content: "Источника достаточно." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ narration: "Город виден вдали." }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(second), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const schema = { type: "json_schema", json_schema: { name: "game_turn", strict: true, schema: { type: "object" } } };
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: {
        model: "test",
        messages: [{ role: "user", content: "Найди Вальдгард" }],
        response_format: schema,
        structured_outputs: true,
      },
      enabled: true,
      rules,
      canon,
    });
    expect(result.toolCalls).toBe(1);
    expect(result.exhausted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const toolRequest = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body ?? "{}"));
    expect(toolRequest.messages.some((item: { role: string; tool_call_id?: string }) => item.role === "tool" && item.tool_call_id === "call-1")).toBe(true);
    expect(toolRequest.response_format).toBeUndefined();
    const finalRequest = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(finalRequest.tools).toBeUndefined();
    expect(finalRequest.tool_choice).toBeUndefined();
    expect(finalRequest.response_format).toEqual(schema);
    expect(finalRequest.structured_outputs).toBe(true);
    expect(result.payload).toEqual(final);
  });

  it("still requests strict JSON when the model does not need retrieval", async () => {
    const first = { choices: [{ message: { role: "assistant", content: "Не требуется поиск." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ ok: true }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const schema = { type: "json_schema", json_schema: { name: "game_turn", strict: true, schema: { type: "object" } } };
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: schema, structured_outputs: true },
      enabled: true,
      rules,
      canon,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body ?? "{}")).response_format).toEqual(schema);
    expect(result.payload).toEqual(final);
  });

  it("enforces the maximum number of tool calls", async () => {
    const call = {
      choices: [{ message: { role: "assistant", tool_calls: Array.from({ length: 7 }, (_, index) => ({
        id: `call-${index}`, type: "function",
        function: { name: "search_ekdrasil_canon", arguments: JSON.stringify({ query: "Вальдгард" }) },
      })) } }],
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(call), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [] },
      enabled: true,
      rules,
      canon,
    });
    expect(result.exhausted).toBe(true);
    expect(result.toolCalls).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cross-checks NPC attack bonuses against the persisted GM-only dossier", () => {
    const monsterRules = {
      ...rules,
      content: "# Creatures\n\nGoblin\nScimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.",
    };
    const found = executeEkdrasilReadTool("search_dnd_rules", JSON.stringify({ query: "Goblin Scimitar attack roll" }), monsterRules, canon);
    const excerpts = (found.excerpts ?? []) as Array<{ text: string; lines: string }>;
    const npcProfiles = [{
      name: "Goblin",
      gmProfile: { combatProfile: {
        status: "SRD_VERIFIED", source: "D&D 2024 SRD 5.2.1",
        attacks: [{ name: "Scimitar", attackBonus: 4, damage: "1d6+2", damageType: "slashing" }],
      } },
    }];
    const character = { statsCertainty: "KNOWN", armorClass: 15 };
    const valid = executeEkdrasilReadTool("prepare_npc_attack", JSON.stringify({
      creatureName: "Goblin", attackName: "Scimitar", advantage: "NONE", reason: "Гоблин атакует героя",
    }), monsterRules, canon, character, false, excerpts, [], npcProfiles);
    expect(valid).toMatchObject({ ok: true, preparedRoll: { formula: "1d20+4", dc: 15, roller: "GM" } });

    npcProfiles[0]!.gmProfile.combatProfile.attacks[0]!.attackBonus = 7;
    const mismatch = executeEkdrasilReadTool("prepare_npc_attack", JSON.stringify({
      creatureName: "Goblin", attackName: "Scimitar", advantage: "NONE", reason: "Гоблин атакует героя",
    }), monsterRules, canon, character, false, excerpts, [], npcProfiles);
    expect(mismatch).toMatchObject({ ok: false });
    expect(mismatch.error).toContain("расходится");
  });

  it("prepares a player skill check from the confirmed character sheet", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      proficiencyBonus: 2,
      skillBonuses: [{ name: "Perception", bonus: 5, basis: "WISDOM + владение" }],
      savingThrowBonuses: { strength: 1, dexterity: 2, constitution: 1, intelligence: 0, wisdom: 5, charisma: -1 },
      conditions: [],
    };
    const result = executeEkdrasilReadTool("prepare_player_check", JSON.stringify({
      kind: "SKILL_CHECK", ability: "wisdom", skill: "Perception", dc: 15,
      advantage: "ADVANTAGE", reason: "Заметить движение в темноте",
    }), rules, canon, character);
    expect(result).toMatchObject({
      ok: true,
      preparedRoll: {
        roller: "PLAYER",
        label: "Мудрость (Perception)",
        formula: "2d20kh1+5",
        dc: 15,
        targetType: "DC",
        modifier: 5,
        kind: "SKILL_CHECK",
      },
    });
  });

  it("uses ability modifier for an untrained check and applies the 2024 exhaustion penalty", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      skillBonuses: [],
      conditions: ["Истощение 1"],
    };
    const result = executeEkdrasilReadTool("prepare_player_check", JSON.stringify({
      kind: "ABILITY_CHECK", ability: "strength", skill: null, dc: 10,
      advantage: "NONE", reason: "Сдвинуть тяжёлый предмет",
    }), rules, canon, character);
    expect(result).toMatchObject({
      ok: true,
      preparedRoll: { formula: "1d20-1", modifier: -1, dc: 10 },
    });
  });

  it("uses the confirmed saving-throw bonus and disadvantage", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 14, charisma: 10 },
      savingThrowBonuses: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 4, charisma: 0 },
      conditions: [],
    };
    const result = executeEkdrasilReadTool("prepare_player_check", JSON.stringify({
      kind: "SAVING_THROW", ability: "Мудрость", skill: null, dc: 13,
      advantage: "DISADVANTAGE", reason: "Сопротивление воздействию",
    }), rules, canon, character);
    expect(result).toMatchObject({
      ok: true,
      preparedRoll: { label: "Спасбросок Мудрость", formula: "2d20kl1+4", modifier: 4 },
    });
  });

  it("does not invent a check modifier when character statistics are unknown", () => {
    const result = executeEkdrasilReadTool("prepare_player_check", JSON.stringify({
      kind: "ABILITY_CHECK", ability: "strength", skill: null, dc: 10,
      advantage: "NONE", reason: "Проверка силы",
    }), rules, canon, { statsCertainty: "UNKNOWN" });
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("подтверждённых характеристик");
  });

  it("returns the server-prepared player roll from the bounded tool loop", async () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      proficiencyBonus: 2,
      skillBonuses: [{ name: "Perception", bonus: 5, basis: "WISDOM + владение" }],
      conditions: [],
    };
    const first = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "check-1", type: "function",
        function: { name: "prepare_player_check", arguments: JSON.stringify({
          kind: "SKILL_CHECK", ability: "wisdom", skill: "Perception", dc: 15,
          advantage: "NONE", reason: "Заметить движение",
        }) },
      }] } }],
    };
    const second = { choices: [{ message: { role: "assistant", content: "Проверка подготовлена." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ ok: true }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(second), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: { type: "json_schema" } },
      enabled: true,
      rules,
      canon,
      playerCharacter: character,
    });
    expect(result.preparedRoll).toMatchObject({
      roller: "PLAYER", label: "Мудрость (Perception)", formula: "1d20+5", dc: 15, targetType: "DC", modifier: 5,
    });
    expect(result.conversation.some((message) => message.role === "assistant" && Array.isArray(message.tool_calls))).toBe(true);
    expect(result.conversation.some((message) => message.role === "tool")).toBe(true);
  });

  it("recalculates a proficient skill with a different ability without reusing the old ability modifier", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 16, charisma: 10 },
      proficiencyBonus: 3,
      skillBonuses: [{ name: "Perception", bonus: 6, basis: "WISDOM + владение" }],
      conditions: [],
    };
    const result = executeEkdrasilReadTool("prepare_player_check", JSON.stringify({
      kind: "SKILL_CHECK", ability: "intelligence", skill: "Perception", dc: 15,
      advantage: "NONE", reason: "Вспомнить деталь из прочитанного",
    }), rules, canon, character);
    expect(result).toMatchObject({
      ok: true,
      preparedRoll: { formula: "1d20+3", modifier: 3, dc: 15 },
    });
  });

  it("rejects a skill check when its proficiency basis is ambiguous", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 16, charisma: 10 },
      skillBonuses: [{ name: "Perception", bonus: 6, basis: "UNKNOWN" }],
      conditions: [],
    };
    const result = executeEkdrasilReadTool("prepare_player_check", JSON.stringify({
      kind: "SKILL_CHECK", ability: "intelligence", skill: "Perception", dc: 15,
      advantage: "NONE", reason: "Вспомнить деталь",
    }), rules, canon, character);
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("базовая характеристика");
  });

  it("prepares a player weapon attack only when the weapon and target AC are source-grounded", () => {
    const character = {
      statsCertainty: "KNOWN",
      weaponAttacks: [{ weapon: "Longsword", attackBonus: 5, damage: "1d8+3", mastery: "Sap" }],
    };
    const excerpts = [{ text: "Goblin\nArmor Class 15 (leather armor, shield)\nHit Points 7", lines: "120–122" }];
    const result = executeEkdrasilReadTool("prepare_player_attack", JSON.stringify({
      weapon: "Longsword", targetName: "Goblin", targetAC: 15,
      advantage: "NONE", reason: "Ударить гоблина мечом",
    }), rules, canon, character, false, excerpts);
    expect(result).toMatchObject({
      ok: true,
      preparedRoll: {
        roller: "PLAYER", label: "Атака Longsword по Goblin",
        formula: "1d20+5", dc: 15, targetType: "AC", modifier: 5, kind: "WEAPON_ATTACK",
      },
      targetACSource: { sourceId: "SRD_5_2_1", sha256: "rules-hash", lines: "120–122" },
    });
  });

  it("prepares a pending shortbow attack against a generic passerby from the verified SRD Commoner stat block", async () => {
    const character = {
      statsCertainty: "KNOWN",
      weaponAttacks: [{ weapon: "короткий лук", attackBonus: 4, damage: "1d6+2" }],
    };
    const finalTurn = {
      narration: "Ты поднимаешь лук и целишься в прохожего.",
      rolls: [{
        roller: "PLAYER",
        label: "Атака коротким луком — случайный прохожий",
        formula: "1d20+4",
        dc: 10,
        targetType: "AC",
        result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
      }],
    };
    const first = { choices: [{ message: { role: "assistant", content: "Готовлю действие." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify(finalTurn) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [] },
      enabled: true,
      rules: {
        ...rules,
        content: "# Commoner\\n\\nCommoner\\nArmor Class 10 (leather armor)\\nHit Points 4 (1d8)\\n",
      },
      canon,
      playerCharacter: character,
    });
    expect(result.preparedRoll).toMatchObject({
      roller: "PLAYER",
      label: "Атака коротким луком — случайный прохожий",
      formula: "1d20+4",
      dc: 10,
      targetType: "AC",
      modifier: 4,
      kind: "WEAPON_ATTACK",
    });
    const response = result.payload as { choices: Array<{ message: { content: string } }> };
    const synchronized = JSON.parse(response.choices[0]!.message.content);
    expect(synchronized.rolls[0]).toMatchObject({
      label: "Атака коротким луком — случайный прохожий",
      formula: "1d20+4",
      dc: 10,
      targetType: "AC",
    });
  });

  it("refuses to prepare an attack against an unverified AC", () => {
    const character = {
      statsCertainty: "KNOWN",
      weaponAttacks: [{ weapon: "Longsword", attackBonus: 5, damage: "1d8+3", mastery: "Sap" }],
    };
    const result = executeEkdrasilReadTool("prepare_player_attack", JSON.stringify({
      weapon: "Longsword", targetName: "Unknown Horror", targetAC: 18,
      advantage: "NONE", reason: "Атаковать неизвестное существо",
    }), rules, canon, character, false, []);
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("AC цели не подтверждён");
  });

  it("requires a prior SRD statblock lookup before preparing an attack against AC", async () => {
    const rulesWithMonster = {
      ...rules,
      content: "# Goblin\n\nGoblin\nArmor Class 15 (leather armor, shield)\nHit Points 7 (2d6)\n",
    };
    const character = {
      statsCertainty: "KNOWN",
      weaponAttacks: [{ weapon: "Longsword", attackBonus: 5, damage: "1d8+3", mastery: "Sap" }],
    };
    const search = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "search-1", type: "function",
        function: { name: "search_dnd_rules", arguments: JSON.stringify({ query: "Goblin Armor Class" }) },
      }] } }],
    };
    const attack = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "attack-1", type: "function",
        function: { name: "prepare_player_attack", arguments: JSON.stringify({
          weapon: "Longsword", targetName: "Goblin", targetAC: 15,
          advantage: "NONE", reason: "Атаковать гоблина",
        }) },
      }] } }],
    };
    const enough = { choices: [{ message: { role: "assistant", content: "Атака подготовлена." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ ok: true }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(search), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(attack), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(enough), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: { type: "json_schema" } },
      enabled: true,
      rules: rulesWithMonster,
      canon,
      playerCharacter: character,
    });
    expect(result.preparedRoll).toMatchObject({
      roller: "PLAYER", label: "Атака Longsword по Goblin", formula: "1d20+5",
      dc: 15, targetType: "AC", kind: "WEAPON_ATTACK",
    });
  });

  it("resolves a natural 20 as a critical hit and prepares doubled player damage dice", () => {
    const character = {
      statsCertainty: "KNOWN",
      weaponAttacks: [{ weapon: "Longsword", attackBonus: 5, damage: "1d8+3", mastery: "Sap" }],
    };
    const completedRolls = [{
      roller: "PLAYER", label: "Атака Longsword по Goblin", formula: "1d20+5",
      targetType: "AC", dc: 18, total: 25, success: true,
      dice: [{ sides: 20, value: 20, kept: true }],
    }];
    const result = executeEkdrasilReadTool("prepare_player_damage", JSON.stringify({
      weapon: "Longsword", targetName: "Goblin", reason: "Разрешить попадание мечом",
    }), rules, canon, character, false, [], completedRolls);
    expect(result).toMatchObject({
      ok: true,
      attackResolution: { hit: true, critical: true, outcome: "CRITICAL_HIT", targetAC: 18 },
      preparedRoll: { roller: "PLAYER", label: "Урон Longsword по Goblin", formula: "2d8+3", targetType: "NONE", dc: null },
    });
  });

  it("returns an already verified player damage roll instead of preparing it again", () => {
    const character = {
      statsCertainty: "KNOWN",
      weaponAttacks: [{ weapon: "Longsword", attackBonus: 5, damage: "1d8+3", mastery: "Sap" }],
    };
    const completedRolls = [
      { roller: "PLAYER", label: "Атака Longsword по Goblin", formula: "1d20+5", targetType: "AC", dc: 18,
        total: 25, success: true, dice: [{ sides: 20, value: 16, kept: true }] },
      { roller: "PLAYER", label: "Урон Longsword по Goblin", formula: "1d8+3", targetType: "NONE",
        total: 8, modifier: 3, dice: [{ sides: 8, value: 5, kept: true }] },
    ];
    const result = executeEkdrasilReadTool("prepare_player_damage", JSON.stringify({
      weapon: "Longsword", targetName: "Goblin", reason: "Подтвердить уже совершённый урон",
    }), rules, canon, character, false, [], completedRolls);
    expect(result).toMatchObject({
      ok: true, hit: true,
      damageResolution: { total: 8, formula: "1d8+3", modifier: 3 },
      preparedRoll: null,
    });
  });

  it("does not prepare player damage after a natural 1 even when the total meets AC", () => {
    const character = {
      statsCertainty: "KNOWN",
      weaponAttacks: [{ weapon: "Longsword", attackBonus: 20, damage: "1d8+3", mastery: "Sap" }],
    };
    const completedRolls = [{
      roller: "PLAYER", label: "Атака Longsword по Goblin", formula: "1d20+20",
      targetType: "AC", dc: 15, total: 21, success: true,
      dice: [{ sides: 20, value: 1, kept: true }],
    }];
    const result = executeEkdrasilReadTool("prepare_player_damage", JSON.stringify({
      weapon: "Longsword", targetName: "Goblin", reason: "Разрешить атаку",
    }), rules, canon, character, false, [], completedRolls);
    expect(result).toMatchObject({
      ok: true,
      attackResolution: { hit: false, critical: false, outcome: "MISS" },
      preparedRoll: null,
    });
  });

  it("executes GM-owned attacks on the server and applies natural 1/20 attack rules", () => {
    const prepared = {
      roller: "GM" as const, label: "Атака Goblin (Bite)", formula: "1d20+4",
      dc: 15, targetType: "AC" as const, modifier: 4, kind: "NPC_ATTACK" as const,
      reason: "Гоблин атакует героя",
    };
    const hit = executePreparedServerRoll(prepared, () => 16);
    expect(hit).toMatchObject({
      roller: "GM", total: 20, success: true, result: "16 + 4 = 20 · ПОПАДАНИЕ",
      dice: [{ value: 16, sides: 20, kept: true }],
    });
    const critical = executePreparedServerRoll(prepared, () => 20);
    expect(critical).toMatchObject({ total: 24, success: true, result: expect.stringContaining("КРИТИЧЕСКОЕ ПОПАДАНИЕ") });
    const miss = executePreparedServerRoll({ ...prepared, formula: "1d20+20", modifier: 20 }, () => 1);
    expect(miss).toMatchObject({ total: 21, success: false, result: expect.stringContaining("ПРОМАХ") });
  });

  it("executes GM-owned damage rolls on the server without returning a pending challenge", () => {
    const result = executePreparedServerRoll({
      roller: "GM", label: "Урон Goblin (Bite)", formula: "1d6+2",
      dc: null, targetType: "NONE", modifier: 2, kind: "NPC_DAMAGE",
      reason: "Урон после попадания",
    }, () => 3);
    expect(result).toMatchObject({
      roller: "GM", total: 5, success: null, result: "3 + 2 = 5",
      dice: [{ value: 3, sides: 6, kept: true }],
    });
  });

  it("returns an already verified NPC damage roll instead of preparing it again", () => {
    const statblock = "Goblin Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage.";
    const completedRolls = [
      { roller: "GM", label: "Атака Goblin (Bite)", formula: "1d20+4", targetType: "AC", dc: 15,
        total: 20, success: true, dice: [{ sides: 20, value: 16, kept: true }] },
      { roller: "GM", label: "Урон Goblin (Bite)", formula: "1d6+2", targetType: "NONE",
        total: 5, modifier: 2, dice: [{ sides: 6, value: 3, kept: true }] },
    ];
    const result = executeEkdrasilReadTool("prepare_npc_damage", JSON.stringify({
      creatureName: "Goblin", attackName: "Bite", reason: "Подтвердить уже совершённый урон",
    }), { ...rules, content: statblock }, canon, null, false, [{ text: statblock, lines: "1–1" }], completedRolls);
    expect(result).toMatchObject({
      ok: true, hit: true,
      damageResolution: { total: 5, formula: "1d6+2", modifier: 2 },
      preparedRoll: null,
    });
  });

  it("passes verified completed rolls through the tool loop so NPC damage is unlocked only after a hit", async () => {
    const completedRolls = [{
      roller: "GM", label: "Атака Goblin (Bite)", formula: "1d20+4",
      targetType: "AC", dc: 15, total: 20, success: true,
      dice: [{ sides: 20, value: 16, kept: true }],
    }];
    const search = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "search-1", type: "function",
        function: { name: "search_dnd_rules", arguments: JSON.stringify({ query: "Goblin Bite" }) },
      }] } }],
    };
    const damage = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "damage-1", type: "function",
        function: { name: "prepare_npc_damage", arguments: JSON.stringify({
          creatureName: "Goblin", attackName: "Bite", reason: "Разрешить урон укуса",
        }) },
      }] } }],
    };
    const third = { choices: [{ message: { role: "assistant", content: "Урон подготовлен." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ ok: true }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(search), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(damage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(third), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: { type: "json_schema" } },
      enabled: true,
      rules: {
        ...rules,
        content: "Goblin Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage.",
      },
      canon,
      completedRolls,
      rollRandom: () => 3,
    });
    expect(result.preparedRoll).toBeNull();
    expect(result.serverRolls).toMatchObject([{
      roller: "GM", label: "Урон Goblin (Bite)", formula: "1d6+2", total: 5,
      result: "3 + 2 = 5",
    }]);
    const toolRequest = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body ?? "{}"));
    const toolMessage = toolRequest.messages.find((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === "damage-1");
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      ok: true,
      attackResolution: { hit: true, outcome: "HIT" },
    });
  });


  it("doubles only damage dice for an NPC natural-20 critical hit", () => {
    const completedRolls = [{
      roller: "GM", label: "Атака Goblin (Bite)", formula: "1d20+4",
      targetType: "AC", dc: 15, total: 24, success: true,
      dice: [{ sides: 20, value: 20, kept: true }],
    }];
    const result = executeEkdrasilReadTool("prepare_npc_damage", JSON.stringify({
      creatureName: "Goblin", attackName: "Bite", reason: "Разрешить критический урон",
    }), {
      ...rules,
      content: "Goblin Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage.",
    }, canon, null, false, [{
      text: "Goblin Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage.",
      lines: "1–1",
    }], completedRolls);
    expect(result).toMatchObject({
      ok: true,
      hit: true,
      attackResolution: { critical: true, outcome: "CRITICAL_HIT" },
      preparedRoll: { roller: "GM", formula: "2d6+2", kind: "NPC_DAMAGE" },
    });
  });

  it("does not prepare NPC damage after a natural 1 even when its total meets AC", () => {
    const completedRolls = [{
      roller: "GM", label: "Атака Goblin (Bite)", formula: "1d20+20",
      targetType: "AC", dc: 15, total: 21, success: true,
      dice: [{ sides: 20, value: 1, kept: true }],
    }];
    const result = executeEkdrasilReadTool("prepare_npc_damage", JSON.stringify({
      creatureName: "Goblin", attackName: "Bite", reason: "Разрешить урон укуса",
    }), rules, canon, null, false, [], completedRolls);
    expect(result).toMatchObject({
      ok: true,
      hit: false,
      attackResolution: { critical: false, outcome: "MISS" },
      preparedRoll: null,
    });
  });

  it("rolls an NPC attack and its damage sequentially inside one bounded tool loop", async () => {
    const statblock = "Goblin Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage.";
    const character = { statsCertainty: "KNOWN", armorClass: 15 };
    const search = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "npc-search", type: "function",
        function: { name: "search_dnd_rules", arguments: JSON.stringify({ query: "Goblin Bite attack roll" }) },
      }] } }],
    };
    const attack = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "npc-attack", type: "function",
        function: { name: "prepare_npc_attack", arguments: JSON.stringify({
          creatureName: "Goblin", attackName: "Bite", advantage: "NONE", reason: "Гоблин кусает героя",
        }) },
      }] } }],
    };
    const damage = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "npc-damage", type: "function",
        function: { name: "prepare_npc_damage", arguments: JSON.stringify({
          creatureName: "Goblin", attackName: "Bite", reason: "Гоблин попал и наносит урон",
        }) },
      }] } }],
    };
    const ready = { choices: [{ message: { role: "assistant", content: "Атака и урон разрешены." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ ok: true }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(search), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(attack), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(damage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ready), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const values = [16, 3];
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: { type: "json_schema" } },
      enabled: true,
      rules: { ...rules, content: statblock },
      canon,
      playerCharacter: character,
      rollRandom: () => values.shift() ?? 1,
    });
    expect(result.preparedRoll).toBeNull();
    expect(result.serverRolls).toHaveLength(2);
    expect(result.serverRolls[0]).toMatchObject({ label: "Атака Goblin (Bite)", total: 20, success: true });
    expect(result.serverRolls[1]).toMatchObject({ label: "Урон Goblin (Bite)", total: 5, success: null });
    const damageRequest = JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body ?? "{}"));
    const attackToolMessage = damageRequest.messages.find((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === "npc-attack");
    expect(JSON.parse(attackToolMessage.content)).toMatchObject({
      ok: true, preparedRoll: null, serverRoll: { roller: "GM", total: 20, success: true },
    });
    const damageToolMessage = damageRequest.messages.find((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === "npc-damage");
    expect(JSON.parse(damageToolMessage.content)).toMatchObject({
      ok: true, preparedRoll: null, serverRoll: { roller: "GM", total: 5, success: null },
    });
  });

});
