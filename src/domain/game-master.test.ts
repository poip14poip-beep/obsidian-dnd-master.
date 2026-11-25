import { describe, expect, it, vi } from "vitest";
import { resolvePlayerAction, type GameMasterContext } from "./game-master";
import type { SourceDocument } from "./types";
const source = (type: SourceDocument["type"], content: string): SourceDocument => ({
  id: type, title: type, type, targetPartition: type === "GOVERNING_DOC" ? "SYSTEM_RULES" : type === "PLAYER_DOSSIER" ? "PLAYER_CHARACTER_STATE" : "CAMPAIGN_STATE",
  originLabel: "test", contentStatus: "ATTACHED", reviewStatus: "VERIFIED", contextEnabled: true, certainty: "KNOWN", fileName: "source.md", content, checksum: "test", attachedAt: null, notes: "", processing: { status: "PROCESSED", sha256: "a".repeat(64), characterCount: content.length, lineCount: content.split("\\n").length, sectionCount: 1, chunkCount: 1, dateCandidateCount: 0, processedAt: "2026-01-01T00:00:00Z", warnings: [] },
});
const context: GameMasterContext = {
  action: "Осмотреть дверь",
  sources: [source("GOVERNING_DOC", "Полный промт ОБСИДИАН 4.1"), source("WORLD_CANON", "# Регион\nКаменная дверь у старого города."), source("PLAYER_DOSSIER", "Досье игрока")],
  world: { schemaVersion: 1, stateVersion: 1, campaignName: "Тест", ruleset: "D&D 2024", calendarSystem: "UNKNOWN", startInGameDate: "UNKNOWN", currentInGameDate: "UNKNOWN", elapsedMinutes: 0, encumbranceMode: "UNSET", startLocationName: "UNKNOWN", currentLocationId: null, setup: { sourcesConfirmed: false, parametersConfirmed: false, startPointConfirmed: false, characterConfirmed: false, noAutoImportAcknowledged: false, confirmed: false, confirmedAt: null }, routes: [], consequences: [], updatedAt: "2026-01-01T00:00:00Z" },
  character: { schemaVersion: 1, stateVersion: 1, sourceDossierId: "dossier", name: "Лия", nameCertainty: "KNOWN", speciesAndClass: "Человек / Воин", level: 20, hpCurrent: 100, hpMax: 100, hpTemp: 0, armorClass: 18, statsCertainty: "KNOWN", currentLocationLabel: "UNKNOWN", conditions: [], resources: [], inventory: [], notes: "", updatedAt: "2026-01-01T00:00:00Z" },
  canonFacts: [], npcs: [], factions: [], locations: [], timelineEvents: [], journal: [],
};
const validTurn = { narration: "Перед тобой дверь.", campaignMemory: "Нет недавних событий.", sensoryDescription: "Зрение: дверь.", spatialAccounting: "Расстояние UNKNOWN.", mechanics: "Проверка не требуется.", consequences: "Ничего не изменилось.", resourceAccounting: "Без изменений.", nextAction: "Что делаешь?", summary: "Осмотр двери", worldOutcome: "Дверь осмотрена.", timeDeltaMinutes: 1, hpDelta: 0, newInGameDate: "UNKNOWN", newLocationId: null, consequenceText: "", rolls: [], characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } }, npcChanges: [], needsClarification: false, clarificationQuestion: "", stateNotes: [] };
describe("game master resolver", () => {
  it("requires the governing source before a model request", async () => {
    await expect(resolvePlayerAction("sk-test", { ...context, sources: [] }, { fetcher: vi.fn() as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "GOVERNING_SOURCE_NOT_READY" });
  });
  it("blocks unverified or context-disabled source content before calling the model", async () => {
    const fetcher = vi.fn();
    const unverified = context.sources.map((item) => item.type === "GOVERNING_DOC"
      ? { ...item, reviewStatus: "UNREVIEWED" as const }
      : item);
    await expect(resolvePlayerAction("sk-test", { ...context, sources: unverified }, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "GOVERNING_SOURCE_NOT_READY" });
    const disabledDossier = context.sources.map((item) => item.type === "PLAYER_DOSSIER"
      ? { ...item, contextEnabled: false }
      : item);
    await expect(resolvePlayerAction("sk-test", { ...context, sources: disabledDossier }, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "PLAYER_DOSSIER_NOT_READY" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends source-grounded context and parses a structured turn", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validTurn), usage: { input_tokens: 100, output_tokens: 40 } }), { status: 200 }));
    const result = await resolvePlayerAction("sk-test", context, { fetcher: fetcher as unknown as typeof fetch });
    expect(result.turn.narration).toContain("дверь"); expect(result.usage?.input_tokens).toBe(100);
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.instructions).toContain("Полный промт ОБСИДИАН 4.1"); expect(request.input).toContain("Каменная дверь"); expect(request.input).toContain("строки 1–2");
    expect(request.input).toContain("Досье игрока");
  });
  it("rejects malformed model output without accepting a partial turn", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "{}" }), { status: 200 }));
    await expect(resolvePlayerAction("sk-test", context, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "INVALID_TURN" });
  });
  it("rejects creation of an NPC that already exists in the campaign registry", async () => {
    const existingNpc = { id: "npc-1", name: "Страж", role: "Страж", locationId: null, factionId: null,
      goals: "UNKNOWN", attitudeToPlayer: "UNKNOWN", certainty: "KNOWN" as const, sourceId: "test",
      locked: false, knowledge: [], version: 1, history: [] };
    const duplicate = { ...validTurn, npcChanges: [{ action: "CREATE", name: "Страж", role: "Страж", goals: "UNKNOWN",
      attitudeToPlayer: "UNKNOWN", locationName: null, factionName: null, certainty: "KNOWN", reason: "test", knowledgeAdditions: [] }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(duplicate) }), { status: 200 }));
    await expect(resolvePlayerAction("sk-test", { ...context, npcs: [existingNpc] }, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "DUPLICATE_NPC" });
  });
  it("rejects a location ID that is not in the known location registry", async () => {
    const unknownLocation = { ...validTurn, newLocationId: "not-registered" };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(unknownLocation) }), { status: 200 }));
    await expect(resolvePlayerAction("sk-test", context, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "UNKNOWN_LOCATION_ID" });
  });
  it("rejects model-invented dice results", async () => {
    const invented = { ...validTurn, rolls: [{ label: "Скрытность", formula: "1d20+5", result: "17" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invented) }), { status: 200 }));
    await expect(resolvePlayerAction("sk-test", context, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "GM_INVENTED_DICE_RESULT" });
  });
  it("rejects NPC or location changes while a player roll is pending", async () => {
    const invalidPending = { ...validTurn, rolls: [{ label: "Атлетика", formula: "1d20+5", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }],
      npcChanges: [{ action: "CREATE", name: "Страж", role: "Страж", goals: "UNKNOWN", attitudeToPlayer: "UNKNOWN",
        locationName: null, factionName: null, certainty: "KNOWN", reason: "Пока бросок не разрешён", knowledgeAdditions: [] }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalidPending) }), { status: 200 }));
    await expect(resolvePlayerAction("sk-test", context, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "INVALID_CLARIFICATION_DELTA" });
  });
  it("surfaces API errors without writing campaign state", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }));
    await expect(resolvePlayerAction("sk-test", context, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "MODEL_API_ERROR" });
  });
});
