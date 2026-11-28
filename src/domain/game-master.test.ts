import { describe, expect, it, vi } from "vitest";
import { resolvePlayerAction, selectRulesContext, selectCanonContext, selectNpcSimulationContext, type GameMasterContext } from "./game-master";
import type { SourceDocument } from "./types";
const source = (type: SourceDocument["type"], content: string): SourceDocument => ({
  id: type, title: type, type, ...(type === "GOVERNING_DOC" ? { serverManaged: true } : {}), targetPartition: type === "GOVERNING_DOC" ? "SYSTEM_RULES" : type === "PLAYER_DOSSIER" ? "PLAYER_CHARACTER_STATE" : "CAMPAIGN_STATE",
  originLabel: "test", contentStatus: "ATTACHED", reviewStatus: "VERIFIED", contextEnabled: true, certainty: "KNOWN", fileName: "source.md", content, checksum: "test", attachedAt: null, notes: "", processing: { status: "PROCESSED", sha256: "a".repeat(64), characterCount: content.length, lineCount: content.split("\\n").length, sectionCount: 1, chunkCount: 1, dateCandidateCount: 0, processedAt: "2026-01-01T00:00:00Z", warnings: [] },
});
const context: GameMasterContext = {
  action: "Осмотреть дверь",
  sources: [source("GOVERNING_DOC", "Полный промт ОБСИДИАН 4.1"), source("WORLD_CANON", "# ЭКДРАСИЛЬ\n\n## Полная каноническая редакция 2.4\n\n## 250. Итоговый принцип живого канона\n\nКаменная дверь у старого города.\n\nКОНЕЦ ПОЛНОЙ КАНОНИЧЕСКОЙ РЕДАКЦИИ 2.4"), source("PLAYER_DOSSIER", "Досье игрока")],
  world: { schemaVersion: 1, stateVersion: 1, campaignName: "Тест", ruleset: "D&D 2024", calendarSystem: "UNKNOWN", startInGameDate: "UNKNOWN", currentInGameDate: "UNKNOWN", elapsedMinutes: 0, encumbranceMode: "UNSET", startLocationName: "UNKNOWN", currentLocationId: null, setup: { sourcesConfirmed: false, parametersConfirmed: false, startPointConfirmed: false, characterConfirmed: false, noAutoImportAcknowledged: false, confirmed: false, confirmedAt: null }, routes: [], consequences: [], updatedAt: "2026-01-01T00:00:00Z" },
  character: { schemaVersion: 1, stateVersion: 1, sourceDossierId: "dossier", name: "Тестовый персонаж", nameCertainty: "KNOWN", speciesAndClass: "Человек / Воин", level: 20, hpCurrent: 100, hpMax: 100, hpTemp: 0, armorClass: 18, statsCertainty: "KNOWN", currentLocationLabel: "UNKNOWN", conditions: [], resources: [], inventory: [], notes: "", updatedAt: "2026-01-01T00:00:00Z" },
  canonFacts: [], npcs: [], factions: [], locations: [], timelineEvents: [], journal: [],
};
const validNpcProfile = {
  biography: "UNKNOWN", appearance: "UNKNOWN", personality: "UNKNOWN", motivation: "UNKNOWN",
  longTermGoal: "UNKNOWN", secrets: "UNKNOWN", relationships: "UNKNOWN", skillsAndAbilities: "UNKNOWN",
  combatProfile: { status: "NOT_REQUIRED", source: "", armorClass: null, hitPointsCurrent: null, hitPointsMax: null, speed: "UNKNOWN",
    attacks: [], resistances: [], vulnerabilities: [], immunities: [] },
};
const validTurn = { narration: "Перед тобой дверь.", campaignMemory: "Нет недавних событий.", sensoryDescription: "Зрение: дверь.", spatialAccounting: "Расстояние UNKNOWN.", mechanics: "Проверка не требуется.", consequences: "Ничего не изменилось.", resourceAccounting: "Без изменений.", nextAction: "Что делаешь?", summary: "Осмотр двери", worldOutcome: "Дверь осмотрена.", timeDeltaMinutes: 1, hpDelta: 0, newInGameDate: "UNKNOWN", newLocationId: null, consequenceText: "", environment: { temperatureC: null, temperatureCertainty: "UNKNOWN", weather: "UNKNOWN", lighting: "UNKNOWN", visibility: "UNKNOWN", wind: "UNKNOWN", precipitation: "UNKNOWN", ambientSounds: "UNKNOWN", ambientSmells: "UNKNOWN", notes: "" }, environmentReason: "Без изменений.", questChanges: [], rolls: [], characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } }, npcChanges: [], needsClarification: false, clarificationQuestion: "", stateNotes: [] };
const testOptions = (fetcher: typeof fetch) => ({ fetcher, supabaseUrl: "https://test.supabase.co", publishableKey: "sb_publishable_test" });


describe("source-grounded context selection", () => {
  it("keeps the full v2.4 authority marker and whole, attributed canon excerpts within budget", () => {
    const longParagraphs = Array.from({ length: 30 }, (_, index) =>
      `## Место ${index + 1}\nФрагмент ${index + 1}: Эйргард — подтверждённый регион. ${"Описание города и северной области. ".repeat(28)}`
    ).join("\n\n");
    const canon = source("WORLD_CANON", [
      "# ЭКДРАСИЛЬ",
      "",
      "## Полная каноническая редакция 2.4",
      "",
      longParagraphs,
      "",
      "## 250. Итоговый принцип живого канона",
      "",
      "Канон развивается только по утверждённому порядку.",
      "",
      "КОНЕЦ ПОЛНОЙ КАНОНИЧЕСКОЙ РЕДАКЦИИ 2.4",
    ].join("\n"));
    const legacy = source("WORLD_CANON", "# ЭКДРАСИЛЬ\n\n## Полная летопись v2\n\nСтарая редакция.");
    const relevantFact = {
      id: "fact-1", title: "Эйргард", statement: "Подтверждённое место начала сцены.",
      rationale: "Тест", layer: "OBJECTIVE_TRUTH", subjectNpcId: null, certainty: "KNOWN",
      sourceId: "campaign", acquisitionPath: "Подтверждённое состояние", inGameDate: "2000",
      scope: "CAMPAIGN", locked: false, createdAt: "2026-01-01", version: 1, history: [],
    } as const;
    const unrelatedFact = {
      ...relevantFact, id: "fact-2", title: "Южный порт", statement: "Нерелевантная запись.",
      createdAt: "2026-01-02",
    } as const;
    const result = selectCanonContext(
      [relevantFact, unrelatedFact] as never,
      [legacy, canon],
      "Сцена в Эйргарде",
    );
    expect(result).toContain("Полная каноническая редакция 2.4");
    expect(result).toContain("sourceId=WORLD_CANON");
    expect(result).toContain("строки");
    expect(result).toContain("Эйргард");
    expect(result).not.toContain("старая редакция");
    expect(result).not.toContain("Нерелевантная запись");
    expect(result.length).toBeLessThanOrEqual(14_500);
  });

  it("caps relevant canon context at twelve whole, attributed sections", () => {
    const sections = Array.from({ length: 30 }, (_, index) => ({
      id: `WORLD_CANON:${index + 1}:section`,
      sourceId: "WORLD_CANON",
      sourceTitle: "Экдрасиль 2.4",
      headingPath: ["Экдрасиль", "Эйргард"],
      heading: `Место ${index + 1}`,
      level: 2,
      startLine: index * 3 + 1,
      endLine: index * 3 + 2,
      text: `Эйргард — подтверждённый регион. Целый фрагмент ${index + 1}.`,
      contentHash: "a".repeat(64),
      chunkIndex: 1,
      chunkCount: 1,
    }));
    const canon = {
      ...source("WORLD_CANON", "# ЭКДРАСИЛЬ\\n\\n## Полная каноническая редакция 2.4\\n\\n## 250. Итоговый принцип живого канона\\n\\nКанон утверждается.\\n\\nКОНЕЦ ПОЛНОЙ КАНОНИЧЕСКОЙ РЕДАКЦИИ 2.4"),
      canonSections: sections,
    };
    const result = selectCanonContext([], [canon], "Эйргард");
    expect((result.match(/\[ИСТОЧНИК:/g) ?? []).length).toBe(12);
    expect(result).toContain("sectionId=WORLD_CANON:12:section");
    expect(result).not.toContain("sectionId=WORLD_CANON:13:section");
  });

  it("uses at most six canon sections when no action terms match", () => {
    const sections = Array.from({ length: 20 }, (_, index) => ({
      id: `WORLD_CANON:${index + 1}:section`,
      sourceId: "WORLD_CANON",
      sourceTitle: "Экдрасиль 2.4",
      headingPath: ["Экдрасиль"],
      heading: `Раздел ${index + 1}`,
      level: 2,
      startLine: index * 2 + 1,
      endLine: index * 2 + 2,
      text: `Уникальный канонический текст фрагмента ${index + 1}.`,
      contentHash: "b".repeat(64),
      chunkIndex: 1,
      chunkCount: 1,
    }));
    const canon = {
      ...source("WORLD_CANON", "# ЭКДРАСИЛЬ\\n\\n## Полная каноническая редакция 2.4\\n\\n## 250. Итоговый принцип живого канона\\n\\nКанон утверждается.\\n\\nКОНЕЦ ПОЛНОЙ КАНОНИЧЕСКОЙ РЕДАКЦИИ 2.4"),
      canonSections: sections,
    };
    const result = selectCanonContext([], [canon], "неизвестный запрос");
    expect((result.match(/\[ИСТОЧНИК:/g) ?? []).length).toBe(6);
  });

  it("passes normative NDP/NPL sections but excludes blank templates, test fixtures and campaign NPC records", () => {
    const reference = [
      "# NPC LEDGER — protocol source",
      "## Назначение и статус",
      "Campaign-specific status must not be sent.",
      "## 1. Правила ведения реестра",
      "Use persistent NPC identifiers and source provenance.",
      "## 2. Проверка идентичности",
      "Detect duplicates without silently merging people.",
      "## 3. Шаблон карточки",
      "EMPTY TEMPLATE ONLY.",
      "## 4. Протокол автономного хода NPC",
      "Run only on meaningful event/time triggers.",
      "## 5. Жизненный цикл",
      "Preserve dead and missing NPC records.",
      "## 6. Реестр NPC",
      "EMPTY REGISTRY.",
      "## 7. Журнал дубликатов",
      "EMPTY DUPLICATE JOURNAL.",
      "## 8. Контроль согласованности",
      "Validate knowledge provenance and causality.",
      "## 9. Связанные файлы",
      "REFERENCE FILE LINKS.",
      "## 10. NDP 0.3 — модель решений NPC",
      "Choose actions from motives, values, risks and uncertainty.",
      "## 11. NPL 0.3 — жизненный цикл планов",
      "Preserve goals, versions, tasks, feasible steps and resources.",
      "## 12. История и закрытие версий",
      "Keep prior versions and their outcomes.",
      "## 13. Проверка согласованности NDP/NPL",
      "Never mark a plan blocked while a feasible task remains.",
      "## 14. Приоритет и применение",
      "This protocol does not override D&D rules or world canon.",
      "## 15. Проверочные сценарии",
      "Test fixture NPC-TEST must not enter a real campaign.",
      "## Реестр NPC кампании",
      "NPC-0001 — пример из другой кампании; не использовать.",
    ].join("\n");
    const npcSource = {
      ...source("SUPPLEMENTAL", reference),
      title: "NPC Simulation Rules — NDP 0.3",
      fileName: "NPC_SIMULATION_RULES_NDP_0_3.md",
      playerVisible: false,
    };
    const result = selectNpcSimulationContext([npcSource]);
    expect(result).toContain("NDP 0.3");
    expect(result).toContain("NPL 0.3");
    expect(result).toContain("feasible task"); // section 13's planning consistency rule
    expect(result).toContain("sourceId=SUPPLEMENTAL");
    expect(result).not.toContain("EMPTY TEMPLATE");
    expect(result).not.toContain("EMPTY REGISTRY");
    expect(result).not.toContain("Test fixture NPC-TEST");
    expect(result).not.toContain("NPC-0001");
    expect(result).not.toContain("Campaign-specific status");
  });

  it("does not send an unverified or player-visible NPC rules source", () => {
    const reference = "## 10. NDP 0.3\\nDo not leak internal NPC decisions.";
    const npcSource = {
      ...source("SUPPLEMENTAL", reference),
      fileName: "NPC_SIMULATION_RULES_NDP_0_3.md",
      playerVisible: true,
    };
    expect(selectNpcSimulationContext([npcSource])).toContain("UNKNOWN");
    expect(selectNpcSimulationContext([{
      ...npcSource, playerVisible: false, reviewStatus: "UNREVIEWED",
    }])).toContain("UNKNOWN");
  });
});

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
  it("compacts long journal prose but preserves structured campaign consequences", async () => {
    const longText = "x".repeat(5000);
    const journalEntry = {
      id: "turn-1", entryType: "GAME_TURN" as const, turnNumber: 1,
      committedAt: "2026-01-01T00:00:00Z", inGameDateBefore: "before", inGameDateAfter: "after",
      timeDeltaMinutes: 1, summary: longText, playerIntent: longText, worldOutcome: longText,
      gmNarration: longText, campaignMemory: longText, locationIdAfter: null, hpDelta: 0,
      rolls: [], affectedCampaignVersion: 1, affectedCharacterVersion: 1, entryChecksum: "checksum",
      questChanges: [{ action: "CREATE" as const, title: "Важная зацепка", description: "Найти ключ.", objectives: ["Найти ключ"], status: "ACTIVE" as const, giverName: null, locationName: null, deadline: null, reward: "", sourcePath: "Разговор", certainty: "KNOWN" as const, reason: "Получена зацепка" }],
      npcChanges: [{ action: "UPDATE" as const, playerVisible: true, name: "Страж", role: "Страж ворот", goals: "Охранять ворота", resources: "UNKNOWN", attitudeToPlayer: "Нейтральное", locationName: null, factionName: null, certainty: "KNOWN" as const, reason: "Поговорили", knowledgeAdditions: [], playerKnowledgeAdditions: [] }],
      characterChanges: { inventory: [{ action: "ADD" as const, name: "Ключ", quantity: 1, notes: "Старый ключ", certainty: "KNOWN" as const }], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn) }), { status: 200 }));
    await resolvePlayerAction("test-user-jwt", { ...context, journal: [journalEntry] }, testOptions(fetcher as unknown as typeof fetch));
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    const sent = JSON.parse(request.input);
    const compacted = sent.recentJournal[0];
    expect(compacted.summary).toHaveLength(100);
    expect(compacted.playerIntent).toHaveLength(120);
    expect(compacted.worldOutcome).toHaveLength(180);
    expect(compacted.gmNarration).toHaveLength(300);
    expect(compacted.campaignMemory).toHaveLength(180);
    expect(compacted.questChanges).toEqual(journalEntry.questChanges);
    expect(compacted.npcChanges).toEqual(journalEntry.npcChanges);
    expect(compacted.characterChanges).toEqual(journalEntry.characterChanges);
  });

  it("sends a bounded rolling chronicle index without deleting stored history", async () => {
    const journal = Array.from({ length: 180 }, (_, index) => ({
      id: `turn-${index + 1}`, entryType: "GAME_TURN" as const, turnNumber: index + 1,
      committedAt: "2026-01-01T00:00:00Z", inGameDateBefore: "before", inGameDateAfter: "after",
      timeDeltaMinutes: 1, summary: "Краткое событие ".repeat(20), playerIntent: "Действие ".repeat(20),
      worldOutcome: "Последствие ".repeat(20), locationIdAfter: null, hpDelta: 0, rolls: [],
      affectedCampaignVersion: index + 1, affectedCharacterVersion: index + 1, entryChecksum: `checksum-${index}`,
    }));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn) }), { status: 200 }));
    await resolvePlayerAction("test-user-jwt", { ...context, journal }, testOptions(fetcher as unknown as typeof fetch));
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    const sent = JSON.parse(request.input);
    expect(sent.fullCampaignChronicle).toHaveLength(150);
    expect(sent.fullCampaignChronicle[0].turnNumber).toBe(31);
    expect(sent.fullCampaignChronicle[149].turnNumber).toBe(180);
    expect(sent.fullCampaignChronicle[0].summary).toHaveLength(22);
    expect(sent.fullCampaignChronicle[0].playerIntent).toHaveLength(18);
    expect(sent.fullCampaignChronicle[0].worldOutcome).toHaveLength(24);
    expect(journal).toHaveLength(180);
  });

  it("bounds NPC and faction history while preserving current state and recent knowledge", async () => {
    const knowledge = (id: string) => ({ id, factSummary: `Факт ${id}`, sourceId: "source", acquisitionPath: "Разговор", inGameDate: "date", certainty: "KNOWN" as const, recordedAt: id });
    const npc = {
      id: "npc-large", name: "Страж", role: "Капитан", locationId: "loc-1", factionId: "fac-1",
      goals: "Охранять город", resources: "Ключи и отряд", attitudeToPlayer: "Осторожное",
      certainty: "KNOWN" as const, sourceId: "source", locked: false, version: 30,
      knowledge: Array.from({ length: 30 }, (_, i) => knowledge(`npc-${i + 1}`)),
      playerKnowledge: Array.from({ length: 25 }, (_, i) => knowledge(`player-${i + 1}`)),
      history: Array.from({ length: 12 }, (_, i) => ({ version: i + 1, changedAt: "now", inGameDate: "date", summary: `revision ${i + 1}`, reason: "change" })),
    };
    const faction = {
      id: "fac-1", name: "Стража", goals: "Защита города", resources: "Гарнизон", standing: "Влияние",
      certainty: "KNOWN" as const, sourceId: "source", locked: false, version: 12,
      history: Array.from({ length: 12 }, (_, i) => ({ version: i + 1, changedAt: "now", inGameDate: "date", summary: `revision ${i + 1}`, reason: "change" })),
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn) }), { status: 200 }));
    await resolvePlayerAction("test-user-jwt", { ...context, npcs: [npc], factions: [faction] }, testOptions(fetcher as unknown as typeof fetch));
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    const sent = JSON.parse(request.input);
    expect(sent.knownNpcs[0].goals).toBe("Охранять город");
    expect(sent.knownNpcs[0].resources).toBe("Ключи и отряд");
    expect(sent.knownNpcs[0].knowledge).toHaveLength(20);
    expect(sent.knownNpcs[0].knowledge[0].id).toBe("npc-11");
    expect(sent.knownNpcs[0].playerKnowledge).toHaveLength(20);
    expect(sent.knownNpcs[0].playerKnowledge[0].id).toBe("player-6");
    expect(sent.knownNpcs[0].history).toHaveLength(5);
    expect(sent.knownNpcs[0].history[0].version).toBe(8);
    expect(sent.knownFactions[0].goals).toBe("Защита города");
    expect(sent.knownFactions[0].history).toHaveLength(5);
    expect(npc.knowledge).toHaveLength(30);
    expect(npc.history).toHaveLength(12);
  });

  it("attaches only the server-signed challenge to a prepared pending roll", async () => {
    const challenge = {
      userId: "test-user",
      formula: "1d20+4",
      dc: 15,
      targetType: "DC" as const,
      roller: "PLAYER" as const,
      label: "Проверка Восприятия",
      issuedAt: 1_798_000_000_000,
      nonce: "challenge-pending-test",
      signature: "Y2hhbGxlbmdl",
    };
    const pendingTurn = {
      ...validTurn,
      timeDeltaMinutes: 0,
      rolls: [{
        roller: "PLAYER" as const,
        label: challenge.label,
        formula: challenge.formula,
        dc: challenge.dc,
        targetType: challenge.targetType,
        result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
      }],
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify(pendingTurn),
      rollChallenge: challenge,
    }), { status: 200 }));
    const result = await resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch));
    expect(result.turn.rolls).toHaveLength(1);
    expect(result.turn.rolls[0]?.challenge).toEqual(challenge);
  });

  it("passes completed dice as structured records separate from free-form action text", async () => {
    const completedRoll = {
      id: "gm-roll-test",
      label: "Проверка Восприятия",
      formula: "1d20+4",
      dc: 15,
      targetType: "DC" as const,
      roller: "PLAYER" as const,
      dice: [{ value: 13, sides: 20, kept: true }],
      modifier: 4,
      total: 17,
      success: true,
      result: "кости=[d20:13]; модификатор=+4; итог=17",
      challenge: {
        userId: "test-user", formula: "1d20+4", dc: 15, targetType: "DC" as const, roller: "PLAYER" as const,
        label: "Проверка Восприятия", issuedAt: 1_798_000_000_000, nonce: "challenge-test", signature: "Y2hhbGxlbmdl",
      },
      proof: {
        userId: "test-user", issuedAt: 1_798_000_000_000, nonce: "nonce-test", signature: "dGVzdA==",
        challenge: {
          userId: "test-user", formula: "1d20+4", dc: 15, targetType: "DC" as const, roller: "PLAYER" as const,
          label: "Проверка Восприятия", issuedAt: 1_798_000_000_000, nonce: "challenge-test", signature: "Y2hhbGxlbmdl",
        },
      },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn) }), { status: 200 }));
    await resolvePlayerAction("test-user-jwt", {
      ...context,
      action: "Осмотреть дверь",
      completedRolls: [completedRoll],
    }, testOptions(fetcher as unknown as typeof fetch));
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    const sent = JSON.parse(request.input);
    expect(sent.action).toBe("Осмотреть дверь");
    expect(sent.completedRolls).toEqual([completedRoll]);
    expect(sent.completedRolls[0].total).toBe(17);
    expect(sent.completedRolls[0].success).toBe(true);
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
    expect(request.operation).toBe("GAME_TURN");
    expect(request.instructions).toContain("Полный текст ОБСИДИАН 4.1 подключён на сервере");
    expect(request.input).toContain("Тестовый персонаж");
    expect(request.input).not.toContain("Каменная дверь");
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
    const openingTurn = {
      ...validTurn, timeDeltaMinutes: 0,
      newInGameDate: "12 Солар, 2000 год · 14:35 · Технический календарь мастера 1.0",
      environment: { temperatureC: 21, temperatureCertainty: "APPROXIMATE" as const, weather: "Переменная облачность", lighting: "Дневной свет", visibility: "Хорошая", wind: "Слабый ветер", precipitation: "Без осадков", ambientSounds: "Голоса прохожих", ambientSmells: "Запах мокрого камня", notes: "Оценка мастера для вступительной сцены." },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(openingTurn) }), { status: 200 }));
    const result = await resolvePlayerAction("test-user-jwt", { ...context, action: "", mode: "OPENING", world: { ...context.world, calendarSystem: "Технический календарь мастера Экдрасиля 1.0" } }, testOptions(fetcher as unknown as typeof fetch));
    expect(result.turn.timeDeltaMinutes).toBe(0);
    expect(result.turn.newInGameDate).toBe(openingTurn.newInGameDate);
    expect(result.turn.environment.temperatureC).toBe(21);
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.instructions).toContain("СПЕЦИАЛЬНЫЙ РЕЖИМ OPENING");
    expect(request.input).toContain('"mode":"OPENING"');
    expect(request.input).toContain("Служебный запрос мастеру");
  });
  it("strips attempted state mutations from opening output instead of rejecting the opening scene", async () => {
    const invalidOpening = {
      ...validTurn, timeDeltaMinutes: 1, hpDelta: -4,
      newInGameDate: "12 Солар, 2000 год · 14:35 · Технический календарь мастера 1.0",
      environment: { temperatureC: 18, temperatureCertainty: "APPROXIMATE" as const, weather: "Ясно", lighting: "День", visibility: "Хорошая", wind: "Тихо", precipitation: "Нет", ambientSounds: "Город", ambientSmells: "Камень", notes: "Оценка." },
      consequenceText: "A new consequence",
      characterChanges: { inventory: [{ action: "ADD", name: "Лук", quantity: 1, notes: "Попытка выдать предмет", certainty: "KNOWN" }], resources: [], conditions: [], currencyDelta: { cp: 1, sp: 0, ep: 0, gp: 0, pp: 0 } },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalidOpening) }), { status: 200 }));
    const result = await resolvePlayerAction("test-user-jwt", { ...context, action: "", mode: "OPENING" }, testOptions(fetcher as unknown as typeof fetch));
    expect(result.turn.timeDeltaMinutes).toBe(0);
    expect(result.turn.hpDelta).toBe(0);
    expect(result.turn.newInGameDate).toBe(invalidOpening.newInGameDate);
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
  it("does not send an outdated browser copy of Ekdrasil to the model", async () => {
    const staleSources = context.sources.map((item) => item.type === "WORLD_CANON"
      ? { ...item, content: "# Хроника Экдрасиля 2.0\\nСТАРЫЙ ФАКТ — устаревшая редакция." }
      : item);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn) }), { status: 200 }));
    await resolvePlayerAction("test-user-jwt", { ...context, sources: staleSources }, testOptions(fetcher as unknown as typeof fetch));
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    const input = JSON.parse(request.input);
    expect(input).not.toHaveProperty("relevantEkdrasilCanon");
    expect(request.instructions).toContain("Полный управляющий документ ОБСИДИАН 4.1 добавляется сервером из закрытого хранилища");
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
      attitudeToPlayer: "UNKNOWN", playerVisible: false, locationName: null, factionName: null, certainty: "KNOWN", reason: "test", gmProfile: validNpcProfile, knowledgeAdditions: [], playerKnowledgeAdditions: [] }] };
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
    const invented = { ...validTurn, rolls: [{ roller: "PLAYER", label: "Скрытность", formula: "1d20+5", dc: 15, targetType: "DC", result: "17" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invented) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "GM_INVENTED_DICE_RESULT" });
  });
  it("rejects unsupported player dice formulas before opening the roll dialog", async () => {
    const invalidFormula = { ...validTurn, rolls: [{ roller: "PLAYER", label: "Восприятие", formula: "1d7+5", dc: 15, targetType: "DC", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalidFormula) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "INVALID_DICE_FORMULA" });
  });
  it("rejects NPC or location changes while a player roll is pending", async () => {
    const invalidPending = { ...validTurn, rolls: [{ roller: "PLAYER", label: "Атлетика", formula: "1d20+5", dc: 15, targetType: "DC", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }],
      npcChanges: [{ action: "CREATE", name: "Страж", role: "Страж", goals: "UNKNOWN", resources: "UNKNOWN", attitudeToPlayer: "UNKNOWN", playerVisible: false,
        locationName: null, factionName: null, certainty: "KNOWN", reason: "Пока бросок не разрешён", gmProfile: validNpcProfile, knowledgeAdditions: [], playerKnowledgeAdditions: [] }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalidPending) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "INVALID_CLARIFICATION_DELTA" });
  });
  it("reports a request timeout separately from a lost network connection", async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "MODEL_REQUEST_TIMEOUT" });
  });
  it("reports a genuine connection failure without claiming the model rejected the request", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "NETWORK_ERROR" });
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
  it("skips an oversized rule paragraph whole and keeps the next complete rule", () => {
    const oversized = `Combat
The Attack action weapon attack initiative attack roll rule begins. ${"Long rule detail ".repeat(1100)} LONG_RULE_TAIL_MARKER.`;
    const complete = "Combat — The Attack roll uses the stated ability modifier and proficiency bonus. COMPLETE_RULE_MARKER.";
    const rules = {
      ...source("SUPPLEMENTAL", [oversized, complete].join("\n\n")),
      title: "SRD 5.2.1",
      originLabel: "Official D&D 2024 SRD 5.2.1",
      fileName: "SRD_5.2.1.txt",
    };
    const result = selectRulesContext([...context.sources, rules], "Лия атакует мечом");
    expect(result).toContain("COMPLETE_RULE_MARKER");
    expect(result).not.toContain("LONG_RULE_TAIL_MARKER");
    expect(result).not.toContain("excerpt truncated");
  });

  it("reports rule uncertainty rather than returning a cut fragment when no whole passage fits", () => {
    const oversized = `Combat
The Attack action weapon attack initiative attack roll begins. ${"Unbroken rule text ".repeat(1200)} END_OF_RULE_MARKER.`;
    const rules = {
      ...source("SUPPLEMENTAL", oversized),
      title: "SRD 5.2.1",
      originLabel: "Official D&D 2024 SRD 5.2.1",
      fileName: "SRD_5.2.1.txt",
    };
    const result = selectRulesContext([...context.sources, rules], "Лия атакует мечом");
    expect(result).toContain("RULE UNCERTAINTY");
    expect(result).not.toContain("END_OF_RULE_MARKER");
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


describe("canonical calendar validation in game master", () => {
  it("requires the model to preserve the current canonical date until the app commits elapsed time", async () => {
    const date = "30 Морн, 2000 год · 23:30 · Календарь Экдрасиля 2.4";
    const calendarContext = {
      ...context,
      world: { ...context.world, calendarSystem: "Календарь Экдрасиля 2.4", currentInGameDate: date },
    };
    const valid = { ...validTurn, timeDeltaMinutes: 15, newInGameDate: date };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(valid) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", calendarContext, testOptions(fetcher as unknown as typeof fetch))).resolves.toBeDefined();

    const invalid = { ...valid, newInGameDate: "Межгодовой день 1, 2000 год · 00:15 · Календарь Экдрасиля 2.4" };
    const invalidFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalid) }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", calendarContext, testOptions(invalidFetcher as unknown as typeof fetch)))
      .rejects.toMatchObject({ code: "CALENDAR_DELTA_MISMATCH" });
  });
  it("accepts completed server-owned GM rolls without treating them as pending player rolls", async () => {
    const serverRoll = {
      ...validTurn,
      rolls: [{
        roller: "GM", label: "Проверка NPC", formula: "1d20+3",
        dc: 15, targetType: "DC", result: "12 + 3 = 15 · УСПЕХ",
      }],
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify(serverRoll),
    }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .resolves.toMatchObject({ turn: { rolls: [{ roller: "GM", result: "12 + 3 = 15 · УСПЕХ" }] } });
  });

  it("allows one pending player roll alongside completed GM rolls and keeps the action paused", async () => {
    const pending = {
      roller: "PLAYER", label: "Мудрость (Восприятие)", formula: "1d20+5",
      dc: 15, targetType: "DC", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
    };
    const serverRoll = {
      roller: "GM", label: "Проверка NPC", formula: "1d20+3",
      dc: 15, targetType: "DC", result: "12 + 3 = 15 · УСПЕХ",
    };
    const turn = { ...validTurn, timeDeltaMinutes: 0, rolls: [pending, serverRoll] };
    const rollChallenge = {
      userId: "test-user", formula: pending.formula, dc: pending.dc,
      targetType: pending.targetType, roller: "PLAYER", label: pending.label,
      issuedAt: Date.now(), nonce: "nonce-test", signature: "signature-test",
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify(turn), rollChallenge,
    }), { status: 200 }));
    await expect(resolvePlayerAction("test-user-jwt", context, testOptions(fetcher as unknown as typeof fetch)))
      .resolves.toMatchObject({
        turn: { rolls: [
          { roller: "PLAYER", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА", challenge: { nonce: "nonce-test" } },
          { roller: "GM", result: "12 + 3 = 15 · УСПЕХ" },
        ] },
      });
  });

});
