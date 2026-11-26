import { describe, expect, it, vi } from "vitest";
import { resolvePlayerAction, selectRulesContext, type GameMasterContext } from "./game-master";
import type { SourceDocument } from "./types";
const source = (type: SourceDocument["type"], content: string): SourceDocument => ({
  id: type, title: type, type, ...(type === "GOVERNING_DOC" ? { serverManaged: true } : {}), targetPartition: type === "GOVERNING_DOC" ? "SYSTEM_RULES" : type === "PLAYER_DOSSIER" ? "PLAYER_CHARACTER_STATE" : "CAMPAIGN_STATE",
  originLabel: "test", contentStatus: "ATTACHED", reviewStatus: "VERIFIED", contextEnabled: true, certainty: "KNOWN", fileName: "source.md", content, checksum: "test", attachedAt: null, notes: "", processing: { status: "PROCESSED", sha256: "a".repeat(64), characterCount: content.length, lineCount: content.split("\\n").length, sectionCount: 1, chunkCount: 1, dateCandidateCount: 0, processedAt: "2026-01-01T00:00:00Z", warnings: [] },
});
const context: GameMasterContext = {
  action: "Осмотреть дверь",
  sources: [source("GOVERNING_DOC", "Полный промт ОБСИДИАН 4.1"), source("WORLD_CANON", "# Регион\nКаменная дверь у старого города."), source("PLAYER_DOSSIER", "Досье игрока")],
  world: { schemaVersion: 1, stateVersion: 1, campaignName: "Тест", ruleset: "D&D 2024", calendarSystem: "UNKNOWN", startInGameDate: "UNKNOWN", currentInGameDate: "UNKNOWN", elapsedMinutes: 0, encumbranceMode: "UNSET", startLocationName: "UNKNOWN", currentLocationId: null, setup: { sourcesConfirmed: false, parametersConfirmed: false, startPointConfirmed: false, characterConfirmed: false, noAutoImportAcknowledged: false, confirmed: false, confirmedAt: null }, routes: [], consequences: [], updatedAt: "2026-01-01T00:00:00Z" },
  character: { schemaVersion: 1, stateVersion: 1, sourceDossierId: "dossier", name: "Тестовый персонаж", nameCertainty: "KNOWN", speciesAndClass: "Человек / Воин", level: 20, hpCurrent: 100, hpMax: 100, hpTemp: 0, armorClass: 18, statsCertainty: "KNOWN", currentLocationLabel: "UNKNOWN", conditions: [], resources: [], inventory: [], notes: "", updatedAt: "2026-01-01T00:00:00Z" },
  canonFacts: [], npcs: [], factions: [], locations: [], timelineEvents: [], journal: [],
};
const validTurn = { narration: "Перед тобой дверь.", campaignMemory: "Нет недавних событий.", sensoryDescription: "Зрение: дверь.", spatialAccounting: "Расстояние UNKNOWN.", mechanics: "Проверка не требуется.", consequences: "Ничего не изменилось.", resourceAccounting: "Без изменений.", nextAction: "Что делаешь?", summary: "Осмотр двери", worldOutcome: "Дверь осмотрена.", timeDeltaMinutes: 1, hpDelta: 0, newInGameDate: "UNKNOWN", newLocationId: null, consequenceText: "", environment: { temperatureC: null, temperatureCertainty: "UNKNOWN", weather: "UNKNOWN", lighting: "UNKNOWN", visibility: "UNKNOWN", wind: "UNKNOWN", precipitation: "UNKNOWN", ambientSounds: "UNKNOWN", ambientSmells: "UNKNOWN", notes: "" }, environmentReason: "Без изменений.", questChanges: [], rolls: [], characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } }, npcChanges: [], needsClarification: false, clarificationQuestion: "", stateNotes: [] };
const testOptions = (fetcher: typeof fetch) => ({ fetcher, supabaseUrl: "https://test.supabase.co", publishableKey: "sb_publishable_test" });

describe("game master resolver", () => {
  it("requires a real authenticated session before sending a request", async () => {
    const fetcher = vi.fn();
    await expect(resolvePlayerAction("", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires the governing source before a model request", async () => {
    await expect(resolvePlayerAction("test-user-jwt", { ...context, sources: [] }, testOptions(vi.fn() as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "GOVERNING_SOURCE_NOT_READY" });
  });
  it("blocks unverified or context-disabled source content before calling the model", async () => {
    const fetcher = vi.fn();
    const unverified = context.sources.map((item) => item.type === "GOVERNING_DOC"
      ? { ...item, serverManaged: false }
      : item);
    await expect(resolvePlayerAction("test-user-jwt", { ...context, sources: unverified }, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "GOVERNING_SOURCE_NOT_READY" });
    const disabledDossier = context.sources.map((item) => item.type === "PLAYER_DOSSIER"
      ? { ...item, contextEnabled: false }
      : item);
    await expect(resolvePlayerAction("test-user-jwt", { ...context, sources: disabledDossier }, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "PLAYER_DOSSIER_NOT_READY" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends source-grounded context and parses a structured turn", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn), usage: { input_tokens: 100, output_tokens: 40 } }), { status: 200 }));
    const result = await resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch));
    expect(result.turn.narration).toContain("дверь"); expect(result.usage?.input_tokens).toBe(100);
    const [endpoint, init] = fetcher.mock.calls[0]!;
    expect(endpoint).toBe("https://test.supabase.co/functions/v1/obsidian-gm");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-user-jwt");
    expect(new Headers(init?.headers).get("apikey")).toBe("sb_publishable_test");
    const request = JSON.parse(init?.body as string);
    expect(request.instructions).toContain("Полный текст ОБСИДИАН 4.1 подключён на сервере");
    expect(request.input).toContain("Тестовый персонаж"); expect(request.input).toContain("Каменная дверь"); expect(request.input).toContain("строки 1–2");
    expect(request.input).toContain("Досье игрока");
  });

  it("rejects a date/time that does not match the declared action duration", async () => {
    const mismatched = { ...validTurn, timeDeltaMinutes: 15, newInGameDate: "2000, месяц 09, день 24; 06:41" };
    const timedContext = { ...context, world: { ...context.world, calendarSystem: "Technical Calendar 1.0", currentInGameDate: "2000, месяц 09, день 24; 06:25" } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(mismatched) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", timedContext, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "CALENDAR_DELTA_MISMATCH" });
  });

  it("keeps discovered quest entries separate and rejects duplicate quest creation", async () => {
    const quest = { id: "quest-1", title: "Найти архив", description: "Узнать, где находится архив.", objectives: ["Найти сведения"], status: "RUMOR" as const, giverName: null, locationName: null, deadline: null, reward: "", sourcePath: "Услышанный разговор", certainty: "KNOWN" as const, lastUpdatedInGameDate: context.world.currentInGameDate, playerVisible: true as const };
    const duplicate = { ...validTurn, questChanges: [{ action: "CREATE", title: quest.title, description: quest.description, objectives: quest.objectives, status: quest.status, giverName: null, locationName: null, deadline: null, reward: "", sourcePath: quest.sourcePath, certainty: "KNOWN", reason: "Повторное создание" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(duplicate) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", { ...context, world: { ...context.world, quests: [quest] } }, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "DUPLICATE_QUEST" });
  });

  it("creates a structured opening scene without a player action or state mutation", async () => {
    const openingTurn = { ...validTurn, timeDeltaMinutes: 0, newInGameDate: context.world.currentInGameDate };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(openingTurn) }), { status: 200 }));
    const result = await resolvePlayerAction("test-user-jwt", { ...context, action: "", mode: "OPENING" }, testOptions(fetcher as unknown as typeof fetch));
    expect(result.turn.timeDeltaMinutes).toBe(0);
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.instructions).toContain("СПЕЦИАЛЬНЫЙ РЕЖИМ OPENING");
    expect(request.input).toContain('"mode":"OPENING"');
    expect(request.input).toContain("Служебный запрос мастеру");
  });
  it("strips attempted state mutations from opening output instead of rejecting the opening scene", async () => {
    const invalidOpening = {
      ...validTurn, timeDeltaMinutes: 1, hpDelta: -4,
      newInGameDate: "invented date",
      consequenceText: "A new consequence",
      characterChanges: { inventory: [{ action: "ADD", name: "Лук", quantity: 1, notes: "Попытка выдать предмет", certainty: "KNOWN" }], resources: [], conditions: [], currencyDelta: { cp: 1, sp: 0, ep: 0, gp: 0, pp: 0 } },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalidOpening) }), { status: 200 }));
    const result = await resolvePlayerAction("test-user-jwt", { ...context, action: "", mode: "OPENING" }, testOptions(fetcher as unknown as typeof fetch));
    expect(result.turn.timeDeltaMinutes).toBe(0);
    expect(result.turn.hpDelta).toBe(0);
    expect(result.turn.newInGameDate).toBe(context.world.currentInGameDate);
    expect(result.turn.newLocationId).toBeNull();
    expect(result.turn.consequenceText).toBe("");
    expect(result.turn.questChanges).toEqual([]);
    expect(result.turn.characterChanges.inventory).toEqual([]);
    expect(result.turn.characterChanges.currencyDelta).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  });
  it("does not send a verified but context-disabled world source to the model", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn) }), { status: 200 }));
    const sources = context.sources.map((item) => item.type === "WORLD_CANON"
      ? { ...item, contextEnabled: false }
      : item);
    await resolvePlayerAction("test-user-jwt", { ...context, sources }, testOptions(fetcher as unknown as typeof fetch));
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.input).not.toContain("Каменная дверь у старого города");
  });
  it("rejects malformed model output without accepting a partial turn", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "{}" }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "INVALID_TURN" });
  });
  it("rejects creation of an NPC that already exists in the campaign registry", async () => {
    const existingNpc = { id: "npc-1", name: "Страж", role: "Страж", locationId: null, factionId: null,
      goals: "UNKNOWN", resources: "UNKNOWN", attitudeToPlayer: "UNKNOWN", certainty: "KNOWN" as const, sourceId: "test",
      locked: false, knowledge: [], version: 1, history: [] };
    const duplicate = { ...validTurn, npcChanges: [{ action: "CREATE", name: "Страж", role: "Страж", goals: "UNKNOWN", resources: "UNKNOWN",
      attitudeToPlayer: "UNKNOWN", playerVisible: false, locationName: null, factionName: null, certainty: "KNOWN", reason: "test", knowledgeAdditions: [], playerKnowledgeAdditions: [] }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(duplicate) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", { ...context, npcs: [existingNpc] }, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "DUPLICATE_NPC" });
  });
  it("rejects a location ID that is not in the known location registry", async () => {
    const unknownLocation = { ...validTurn, newLocationId: "not-registered" };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(unknownLocation) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "UNKNOWN_LOCATION_ID" });
  });
  it("rejects model-invented dice results", async () => {
    const invented = { ...validTurn, rolls: [{ label: "Скрытность", formula: "1d20+5", result: "17" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invented) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "GM_INVENTED_DICE_RESULT" });
  });
  it("rejects NPC or location changes while a player roll is pending", async () => {
    const invalidPending = { ...validTurn, rolls: [{ label: "Атлетика", formula: "1d20+5", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }],
      npcChanges: [{ action: "CREATE", name: "Страж", role: "Страж", goals: "UNKNOWN", resources: "UNKNOWN", attitudeToPlayer: "UNKNOWN", playerVisible: false,
        locationName: null, factionName: null, certainty: "KNOWN", reason: "Пока бросок не разрешён", knowledgeAdditions: [], playerKnowledgeAdditions: [] }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalidPending) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "INVALID_CLARIFICATION_DELTA" });
  });
  it("surfaces API errors without writing campaign state", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "MODEL_API_ERROR" });
  });
});

describe("verified SRD rules context", () => {
  it("selects relevant excerpts from an explicitly verified and enabled SRD source", () => {
    const rules = {
      ...source("SUPPLEMENTAL", "Combat\\nThe Attack action lets you make one attack. A weapon attack uses an attack roll.\\n\\nSpellcasting\\nSpells have components and durations."),
      title: "SRD 5.2.1",
      originLabel: "Official D&D 2024 SRD 5.2.1",
      fileName: "SRD_5.2.1.txt",
    };
    const result = selectRulesContext([...context.sources, rules], "Персонаж атакует мечом");
    expect(result).toContain("The Attack action");
    expect(result).toContain("sourceId=SUPPLEMENTAL");
  });


  it("uses PDF page breaks when extracting relevant SRD passages", () => {
    const rules = {
      ...source("SUPPLEMENTAL", "Unrelated introductory page with no matching rule.\fCombat\nThe Attack action lets you make one attack."),
      title: "SRD 5.2.1",
      originLabel: "Official D&D 2024 SRD 5.2.1",
    };
    const result = selectRulesContext([...context.sources, rules], "Лия атакует мечом");
    expect(result).toContain("The Attack action");
    expect(result).not.toContain("Unrelated introductory page");
  });
  it("does not use an unreviewed SRD source", () => {
    const rules = {
      ...source("SUPPLEMENTAL", "Combat\\nThe Attack action lets you make one attack."),
      title: "SRD 5.2.1",
      reviewStatus: "UNREVIEWED" as const,
    };
    expect(selectRulesContext([...context.sources, rules], "Лия атакует")).toContain("UNKNOWN");
  });

  it("does not treat unrelated supplemental sources as SRD rules", () => {
    const rules = { ...source("SUPPLEMENTAL", "Combat\\nThe Attack action."), title: "Летопись Экдрасиля" };
    expect(selectRulesContext([...context.sources, rules], "Лия атакует")).toContain("UNKNOWN");
  });
});
