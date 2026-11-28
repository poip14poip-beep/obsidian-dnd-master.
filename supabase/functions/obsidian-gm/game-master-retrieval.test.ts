import { describe, expect, it, vi } from "vitest";
import { callWithEkdrasilReadTools, executeEkdrasilReadTool, executePreparedServerRoll, resolveSocialCheckOutcome } from "./game-master-retrieval";

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

  it("resolves passive notice without asking the player to roll", () => {
    const character = {
      statsCertainty: "KNOWN",
      skillBonuses: [
        { name: "Perception", bonus: 5, basis: "WISDOM + владение" },
        { name: "Insight", bonus: 3, basis: "WISDOM" },
        { name: "Investigation", bonus: 2, basis: "INTELLIGENCE" },
      ],
      conditions: ["Exhaustion 1"],
    };
    const result = executeEkdrasilReadTool("check_notice", JSON.stringify({
      sense: "perception", difficulty: "moderate", advantage: "none",
      reason: "Скрытый наблюдатель следит за героем из окна",
    }), rules, canon, character);
    expect(result).toMatchObject({
      ok: true,
      notice: {
        sense: "perception", skill: "Восприятие", dc: 15,
        passiveScore: 13, noticed: false, margin: -2, result: "НЕ ОБНАРУЖЕНО",
      },
    });
    expect(result.preparedRoll).toBeUndefined();
    const advantage = executeEkdrasilReadTool("check_notice", JSON.stringify({
      sense: "insight", dc: 18, advantage: "advantage",
      reason: "Проверить, искренен ли собеседник",
    }), rules, canon, character);
    expect(advantage).toMatchObject({
      ok: true,
      notice: { passiveScore: 16, noticed: false },
    });
    const investigation = executeEkdrasilReadTool("check_notice", JSON.stringify({
      sense: "investigation", dc: 10, reason: "Замеченный скрытый механизм",
    }), rules, canon, character);
    expect(investigation).toMatchObject({
      ok: true,
      notice: { passiveScore: 10, noticed: true, result: "ОБНАРУЖЕНО" },
    });
  });

  it("refuses passive notice when the selected skill bonus is unknown", () => {
    const result = executeEkdrasilReadTool("check_notice", JSON.stringify({
      sense: "perception", dc: 12, reason: "Проверить скрытую ловушку",
    }), rules, canon, {
      statsCertainty: "KNOWN",
      skillBonuses: [{ name: "Stealth", bonus: 4, basis: "DEXTERITY + владение" }],
      conditions: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Подтверждённый бонус навыка");
  });

  it("rolls a new NPC's first reaction on the server and derives attitude", () => {
    const prepared = executeEkdrasilReadTool("npc_reaction", JSON.stringify({
      name: "Странник", reason: "Герой впервые встречает незнакомца на дороге",
    }), rules, canon);
    expect(prepared).toMatchObject({
      ok: true,
      npcContext: { name: "Странник" },
      preparedRoll: {
        roller: "GM", label: "Первая реакция NPC — Странник",
        formula: "2d6", dc: null, targetType: "NONE", modifier: 0, kind: "NPC_REACTION", npcName: "Странник",
      },
    });
    const hostile = executePreparedServerRoll(prepared.preparedRoll as never, (() => {
      const values = [2, 3];
      return (_sides: number) => values.shift() ?? 1;
    })());
    expect(hostile).toMatchObject({ total: 5, npcAttitude: "hostile", npcName: "Странник", success: null });

    const friendlyPrepared = executeEkdrasilReadTool("npc_reaction", JSON.stringify({
      name: "Путница", modifier: 1, reason: "Незнакомая путница встречает героя в безопасном трактире",
    }), rules, canon);
    expect(friendlyPrepared).toMatchObject({ ok: true, preparedRoll: { formula: "2d6+1", modifier: 1 } });
    const friendly = executePreparedServerRoll(friendlyPrepared.preparedRoll as never, (() => {
      const values = [4, 4];
      return (_sides: number) => values.shift() ?? 1;
    })());
    expect(friendly).toMatchObject({ total: 9, npcAttitude: "friendly", npcName: "Путница" });
  });

  it("does not reroll a tracked NPC or repeat a reaction already completed this turn", () => {
    const existing = executeEkdrasilReadTool("npc_reaction", JSON.stringify({
      name: "Марта", reason: "Уточнить первое впечатление",
    }), rules, canon, null, false, [], [], [{ name: "Марта", attitudeToPlayer: "дружелюбная" }]);
    expect(existing).toMatchObject({
      ok: true, npcContext: { name: "Марта", attitude: "friendly", rolled: false },
    });
    expect(existing.preparedRoll).toBeUndefined();

    const completed = executeEkdrasilReadTool("npc_reaction", JSON.stringify({
      name: "Странник", reason: "Повторный запрос в том же ходе",
    }), rules, canon, null, false, [], [{
      kind: "NPC_REACTION", label: "Первая реакция NPC — Странник", npcAttitude: "indifferent",
    }], []);
    expect(completed).toMatchObject({
      ok: true, npcContext: { name: "Странник", attitude: "indifferent", rolled: true },
    });
    expect(completed.preparedRoll).toBeUndefined();
  });

  it("refuses to guess the attitude of a tracked NPC", () => {
    const result = executeEkdrasilReadTool("npc_reaction", JSON.stringify({
      name: "Смотритель", reason: "Первая встреча",
    }), rules, canon, null, false, [], [], [{ name: "Смотритель", attitudeToPlayer: "неизвестно" }]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("не подтверждено");
  });

  it("resolves social outcomes and attitude shifts at the five-point margin", () => {
    expect(resolveSocialCheckOutcome("hostile", 25, 20)).toEqual({
      success: true, attitude: "indifferent", shifted: true, direction: "up",
    });
    expect(resolveSocialCheckOutcome("indifferent", 10, 15)).toEqual({
      success: false, attitude: "hostile", shifted: true, direction: "down",
    });
    expect(resolveSocialCheckOutcome("indifferent", 14, 15)).toEqual({
      success: false, attitude: "indifferent", shifted: false, direction: null,
    });
    expect(resolveSocialCheckOutcome("friendly", 15, 10)).toEqual({
      success: true, attitude: "friendly", shifted: false, direction: null,
    });
  });

  it("resolves social outcomes and moves NPC attitude only at five-point margins", () => {
    expect(resolveSocialCheckOutcome("indifferent", 14, 15)).toEqual({
      success: false, attitude: "indifferent", shifted: false, direction: null,
    });
    expect(resolveSocialCheckOutcome("indifferent", 20, 15)).toEqual({
      success: true, attitude: "friendly", shifted: true, direction: "up",
    });
    expect(resolveSocialCheckOutcome("indifferent", 10, 15)).toEqual({
      success: false, attitude: "hostile", shifted: true, direction: "down",
    });
    expect(resolveSocialCheckOutcome("friendly", 25, 15)).toEqual({
      success: true, attitude: "friendly", shifted: false, direction: null,
    });
    expect(resolveSocialCheckOutcome("hostile", 5, 15)).toEqual({
      success: false, attitude: "hostile", shifted: false, direction: null,
    });
  });

  it("prepares social checks from a tracked NPC attitude, not a model-invented DC", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 14 },
      proficiencyBonus: 2,
      skillBonuses: [
        { name: "Persuasion", bonus: 4, basis: "CHARISMA + владение" },
        { name: "Intimidation", bonus: 4, basis: "CHARISMA + владение" },
      ],
      conditions: [],
    };
    const npcs = [
      { name: "Марта", attitudeToPlayer: "дружелюбный" },
      { name: "Капитан стражи", attitudeToPlayer: "враждебный" },
      { name: "Торговец", attitudeToPlayer: "нейтральный" },
    ];
    const friendly = executeEkdrasilReadTool("social_check", JSON.stringify({
      npc: "Марта", approach: "persuade", reason: "Убедить её рассказать о пропавшем обозе",
    }), rules, canon, character, false, [], [], npcs);
    expect(friendly).toMatchObject({
      ok: true,
      socialContext: { npc: "Марта", approach: "persuade", attitude: "friendly", dc: 10 },
      preparedRoll: {
        roller: "PLAYER", label: "Социальная проверка — Марта: Харизма (Убеждение)",
        formula: "1d20+4", dc: 10, targetType: "DC", kind: "SKILL_CHECK",
      },
    });
    const hostile = executeEkdrasilReadTool("social_check", JSON.stringify({
      npc: "Капитан стражи", approach: "intimidate", reason: "Заставить капитана отступить",
    }), rules, canon, character, false, [], [], npcs);
    expect(hostile).toMatchObject({
      ok: true,
      socialContext: { attitude: "hostile", dc: 20 },
      preparedRoll: { label: "Социальная проверка — Капитан стражи: Харизма (Запугивание)", dc: 20 },
    });
    const neutral = executeEkdrasilReadTool("social_check", JSON.stringify({
      npc: "Торговец", approach: "deceive", reason: "Скрыть настоящую цель визита",
    }), rules, canon, character, false, [], [], npcs);
    expect(neutral).toMatchObject({ ok: true, socialContext: { attitude: "indifferent", dc: 15 }, preparedRoll: { dc: 15 } });
  });

  it("refuses social checks when the NPC or their attitude is not confirmed", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 14 },
      conditions: [],
    };
    const missingNpc = executeEkdrasilReadTool("social_check", JSON.stringify({
      npc: "Незнакомец", approach: "persuade", reason: "Попросить о помощи",
    }), rules, canon, character, false, [], [], []);
    expect(missingNpc.error).toContain("не найден");
    const unknownAttitude = executeEkdrasilReadTool("social_check", JSON.stringify({
      npc: "Незнакомец", approach: "persuade", reason: "Попросить о помощи",
    }), rules, canon, character, false, [], [], [{ name: "Незнакомец", attitudeToPlayer: "UNKNOWN" }]);
    expect(unknownAttitude.error).toContain("не подтверждено");
  });

  it("uses the upstream request_roll contract for Russian and English skill names", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      proficiencyBonus: 2,
      skillBonuses: [{ name: "Восприятие", bonus: 5, basis: "WISDOM + владение" }],
      savingThrowBonuses: { strength: 1, dexterity: 2, constitution: 2, intelligence: 0, wisdom: 3, charisma: -1 },
      conditions: [],
    };
    const english = executeEkdrasilReadTool("request_roll", JSON.stringify({
      kind: "skill_check", skill: "perception", difficulty: "moderate",
      advantage: "none", reason: "Прислушаться к шуму за дверью",
    }), rules, canon, character);
    expect(english).toMatchObject({
      ok: true,
      preparedRoll: {
        roller: "PLAYER", label: "Мудрость (Восприятие)",
        formula: "1d20+5", dc: 15, targetType: "DC", modifier: 5, kind: "SKILL_CHECK",
      },
    });
    const russian = executeEkdrasilReadTool("request_roll", JSON.stringify({
      kind: "skill_check", skill: "Восприятие", dc: 12,
      advantage: "none", reason: "Осмотреть подозрительный переулок",
    }), rules, canon, character);
    expect(russian).toMatchObject({ ok: true, preparedRoll: { label: "Мудрость (Восприятие)", dc: 12 } });
  });

  it("prepares ability checks and saving throws through request_roll", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      savingThrowBonuses: { strength: 1, dexterity: 2, constitution: 2, intelligence: 0, wisdom: 3, charisma: -1 },
      conditions: [],
    };
    const ability = executeEkdrasilReadTool("request_roll", JSON.stringify({
      kind: "ability_check", ability: "dex", difficulty: "hard",
      advantage: "advantage", reason: "Удержать равновесие на мокрой крыше",
    }), rules, canon, character);
    expect(ability).toMatchObject({
      ok: true,
      preparedRoll: { label: "Проверка Ловкость", formula: "2d20kh1+2", dc: 20, kind: "ABILITY_CHECK" },
    });
    const save = executeEkdrasilReadTool("request_roll", JSON.stringify({
      kind: "saving_throw", ability: "constitution", dc: 12,
      advantage: "none", reason: "Перенести воздействие яда",
    }), rules, canon, character);
    expect(save).toMatchObject({
      ok: true,
      preparedRoll: { label: "Спасбросок Телосложение", formula: "1d20+2", dc: 12, kind: "SAVING_THROW" },
    });
  });

  it("refuses unsupported request_roll kinds and checks without a DC", () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      conditions: [],
    };
    expect(executeEkdrasilReadTool("request_roll", JSON.stringify({
      kind: "attack", reason: "Ударить противника",
    }), rules, canon, character).error).toContain("Для атаки");
    expect(executeEkdrasilReadTool("request_roll", JSON.stringify({
      kind: "ability_check", ability: "dexterity", reason: "Прыгнуть через пропасть",
    }), rules, canon, character).error).toContain("difficulty или точную dc");
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

  it("recovers a pending non-combat check through an engine-selected tool, without parsing its label", async () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      proficiencyBonus: 2,
      skillBonuses: [{ name: "Perception", bonus: 5, basis: "WISDOM + владение" }],
      conditions: [],
    };
    const pendingTurn = {
      narration: "Ты прислушиваешься к шуму за дверью.",
      rolls: [{
        roller: "PLAYER", label: "Проверка Мудрости (Восприятие)",
        formula: "1d20+5", dc: 13, targetType: "DC",
        result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
      }],
    };
    const noTool = { choices: [{ message: { role: "assistant", content: "Нужна проверка." } }] };
    const finalPending = { choices: [{ message: { role: "assistant", content: JSON.stringify(pendingTurn) } }] };
    const prepare = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "prepare-check", type: "function",
        function: { name: "request_roll", arguments: JSON.stringify({
          kind: "skill_check", skill: "perception", dc: 13,
          advantage: "none", reason: "Прислушаться к шуму за дверью",
        }) },
      }] } }],
    };
    const preparedFinal = { choices: [{ message: { role: "assistant", content: JSON.stringify(pendingTurn) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(noTool), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(finalPending), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(prepare), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(noTool), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(preparedFinal), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: { type: "json_schema" } },
      enabled: true, rules, canon, playerCharacter: character,
    });
    expect(result.preparedRoll).toMatchObject({
      roller: "PLAYER", label: "Мудрость (Восприятие)", formula: "1d20+5",
      dc: 13, targetType: "DC", modifier: 5, kind: "SKILL_CHECK",
    });
    const retryRequest = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(retryRequest.tool_choice).toBe("required");
    const recoveryToolNames = retryRequest.tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(recoveryToolNames.length).toBe(7);
    expect(recoveryToolNames.every((name: string) => name === "request_roll" || name === "social_check" || name.startsWith("prepare_"))).toBe(true);
    expect(recoveryToolNames).toContain("request_roll");
    expect(recoveryToolNames).toContain("social_check");
    expect(recoveryToolNames).toContain("prepare_player_check");
    expect(recoveryToolNames).toContain("prepare_player_attack");
    expect(recoveryToolNames).not.toContain("search_dnd_rules");
    expect(recoveryToolNames).not.toContain("search_ekdrasil_canon");
    const finalPayload = result.payload as { choices: Array<{ message: { content: string } }> };
    const synchronized = JSON.parse(finalPayload.choices[0]!.message.content);
    expect(synchronized.rolls[0]).toMatchObject({
      roller: "PLAYER", label: "Мудрость (Восприятие)", formula: "1d20+5",
      dc: 13, targetType: "DC", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
    });
  });

  it("releases the forced tool choice after a preparation refusal", async () => {
    const pendingTurn = {
      narration: "Ты прислушиваешься к шуму за дверью.",
      rolls: [{
        roller: "PLAYER", label: "Проверка Мудрости (Восприятие)",
        formula: "1d20+5", dc: 13, targetType: "DC",
        result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
      }],
    };
    const ordinaryTurn = { narration: "Ты прислушиваешься, но ничего необычного не слышишь.", rolls: [] };
    const noTool = { choices: [{ message: { role: "assistant", content: "Нужна проверка." } }] };
    const finalPending = { choices: [{ message: { role: "assistant", content: JSON.stringify(pendingTurn) } }] };
    const refusedPreparation = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "prepare-refused", type: "function",
        function: { name: "prepare_player_check", arguments: JSON.stringify({
          kind: "SKILL_CHECK", ability: "wisdom", skill: "Perception", dc: 13,
          advantage: "NONE", reason: "Прислушаться к шуму за дверью",
        }) },
      }] } }],
    };
    const ordinaryFinal = { choices: [{ message: { role: "assistant", content: JSON.stringify(ordinaryTurn) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(noTool), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(finalPending), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(refusedPreparation), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(noTool), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ordinaryFinal), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: { type: "json_schema" } },
      enabled: true, rules, canon,
      playerCharacter: { statsCertainty: "UNKNOWN" },
    });
    expect(result.preparedRoll).toBeNull();
    expect(result.exhausted).toBe(false);
    const retryAfterRefusal = JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body ?? "{}"));
    expect(retryAfterRefusal.tool_choice).toBe("auto");
    expect(retryAfterRefusal.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ function: expect.objectContaining({ name: "search_dnd_rules" }) }),
    ]));
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
    });
    expect(result.preparedRoll).toMatchObject({
      roller: "GM", label: "Урон Goblin (Bite)", formula: "1d6+2", kind: "NPC_DAMAGE",
    });
    const toolRequest = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body ?? "{}"));
    const toolMessage = toolRequest.messages.find((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === "damage-1");
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      ok: true,
      attackResolution: { hit: true, outcome: "HIT" },
    });
  });


  it("emits an NPC-to-player combat event only after verified server damage is complete", async () => {
    const completedRolls = [
      { roller: "GM", label: "Атака Goblin (Bite)", formula: "1d20+4", targetType: "AC",
        dc: 15, total: 20, success: true, dice: [{ sides: 20, value: 16, kept: true }] },
      { roller: "GM", label: "Урон Goblin (Bite)", formula: "1d6+2", targetType: "NONE",
        total: 5, modifier: 2, dice: [{ sides: 6, value: 3, kept: true }] },
    ];
    const search = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "search-combat", type: "function",
        function: { name: "search_dnd_rules", arguments: JSON.stringify({ query: "Goblin Bite" }) },
      }] } }],
    };
    const damage = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "resolve-damage", type: "function",
        function: { name: "prepare_npc_damage", arguments: JSON.stringify({
          creatureName: "Goblin", attackName: "Bite", reason: "Разрешить урон по герою",
        }) },
      }] } }],
    };
    const continueLoop = { choices: [{ message: { role: "assistant", content: "Урон разрешён." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ ok: true }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(search), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(damage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(continueLoop), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test", headers: {},
      requestBody: { model: "test", messages: [], response_format: { type: "json_schema" } },
      enabled: true,
      rules: { ...rules, content: "Goblin Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage." },
      canon, completedRolls,
    });
    expect(result.combatEvents).toEqual([{
      targetType: "PLAYER", targetName: "PLAYER", damage: 5, damageType: "Piercing",
      critical: false, source: "NPC", formula: "1d6+2", rollLabel: "Урон Goblin (Bite)",
    }]);
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

  it("caps repeated rule searches and still reaches deterministic player-check preparation", async () => {
    const character = {
      statsCertainty: "KNOWN",
      abilityScores: { strength: 12, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 16, charisma: 8 },
      skillBonuses: [{ name: "Восприятие", bonus: 5, basis: "Мудрость + владение" }],
      savingThrowBonuses: { strength: 1, dexterity: 2, constitution: 1, intelligence: 0, wisdom: 5, charisma: -1 },
      conditions: [],
    };
    const search = (id: string) => ({
      choices: [{ message: { role: "assistant", tool_calls: [{
        id, type: "function",
        function: { name: "search_dnd_rules", arguments: JSON.stringify({ query: "ability check d20" }) },
      }] } }],
    });
    const prepare = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "prepare-check", type: "function",
        function: { name: "prepare_player_check", arguments: JSON.stringify({
          kind: "SKILL_CHECK", ability: "wisdom", skill: "Восприятие", dc: 15,
          advantage: "NONE", reason: "Осмотреть улицу на подозрительных людей",
        }) },
      }] } }],
    };
    const continueLoop = { choices: [{ message: { role: "assistant", content: "Проверка подготовлена." } }] };
    const finalTurn = {
      narration: "Ты внимательно осматриваешь улицу.",
      rolls: [{ roller: "PLAYER", label: "Мудрость (Восприятие)", formula: "1d20+5",
        dc: 15, targetType: "DC", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }],
    };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify(finalTurn) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(search("search-1")), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(search("search-2")), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(prepare), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(continueLoop), { status: 200 }))
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
      maxToolRounds: 8,
      maxToolCalls: 16,
    });
    const thirdRequest = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body ?? "{}"));
    const availableNames = thirdRequest.tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(availableNames).not.toContain("search_dnd_rules");
    expect(availableNames).toContain("prepare_player_check");
    expect(result.preparedRoll).toMatchObject({
      roller: "PLAYER", label: "Мудрость (Восприятие)", formula: "1d20+5", dc: 15,
    });
    expect(result.exhausted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });


});
