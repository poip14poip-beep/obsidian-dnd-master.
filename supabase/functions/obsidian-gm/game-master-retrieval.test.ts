import { describe, expect, it, vi } from "vitest";
import { callWithEkdrasilReadTools, executeEkdrasilReadTool } from "./game-master-retrieval";

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
      preparedPlayerRoll: {
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
      preparedPlayerRoll: { formula: "1d20-1", modifier: -1, dc: 10 },
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
      preparedPlayerRoll: { label: "Спасбросок Мудрость", formula: "2d20kl1+4", modifier: 4 },
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
    expect(result.preparedPlayerRoll).toMatchObject({
      roller: "PLAYER", label: "Мудрость (Perception)", formula: "1d20+5", dc: 15, targetType: "DC", modifier: 5,
    });
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
      preparedPlayerRoll: { formula: "1d20+3", modifier: 3, dc: 15 },
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
      preparedPlayerRoll: {
        roller: "PLAYER", label: "Атака Longsword по Goblin",
        formula: "1d20+5", dc: 15, targetType: "AC", modifier: 5, kind: "WEAPON_ATTACK",
      },
      targetACSource: { sourceId: "SRD_5_2_1", sha256: "rules-hash", lines: "120–122" },
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
    expect(result.preparedPlayerRoll).toMatchObject({
      roller: "PLAYER", label: "Атака Longsword по Goblin", formula: "1d20+5",
      dc: 15, targetType: "AC", kind: "WEAPON_ATTACK",
    });
  });

});
