import { describe, expect, it } from "vitest";
import { createEmptyTurnDraft, createInitialCollections } from "./defaults";
import { applyHitPointDelta, applyNpcHitPointDamage, runIntegrityAudit, validateTurnDraft } from "./integrity";
describe("turn HP validation", () => {
  it("does not silently discard an HP change when current HP is unknown", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    const draft = { ...createEmptyTurnDraft(), summary: "Получен урон", worldOutcome: "Персонаж ранен", hpDelta: -5 };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state))
      .toContain("Нельзя изменить HP: текущее значение UNKNOWN. Уточните текущие HP в листе персонажа.");
  });
  it("rejects NPC creation duplicates and updates to unknown NPCs", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    const base = { ...createEmptyTurnDraft(), summary: "Встреча", worldOutcome: "Разговор завершён" };
    const duplicate = { action: "CREATE" as const, name: "Страж", role: "Стражник", goals: "Охраняет ворота", resources: "UNKNOWN", attitudeToPlayer: "Нейтральное", playerVisible: true, playerKnowledgeAdditions: [], locationName: null, factionName: null, certainty: "KNOWN" as const, reason: "Встречен у ворот", knowledgeAdditions: [] };
    state.npcs = [{ id: "npc-1", name: "Страж", role: "Стражник", locationId: null, factionId: null, goals: "Охрана", attitudeToPlayer: "UNKNOWN", certainty: "KNOWN", sourceId: "MANUAL_GM_ENTRY", locked: false, knowledge: [], version: 1, history: [] }];
    const createDraft = { ...base, npcChanges: [duplicate] };
    expect(validateTurnDraft(createDraft, state.world_state, state.player_character_state, state.npcs))
      .toContain("NPC «Страж» уже существует; нельзя создать дубликат.");
    const updateDraft = { ...base, npcChanges: [{ ...duplicate, action: "UPDATE" as const, name: "Неизвестный" }] };
    expect(validateTurnDraft(updateDraft, state.world_state, state.player_character_state, state.npcs))
      .toContain("Нельзя обновить NPC «Неизвестный»: он отсутствует в реестре.");
  });
  it("rejects inventory removal beyond the recorded quantity", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    state.player_character_state.inventory = [{ id: "potion", name: "Зелье лечения", quantity: 1, notes: "", certainty: "KNOWN" }];
    const draft = { ...createEmptyTurnDraft(), summary: "Передача зелий", worldOutcome: "Передана одна вещь",
      characterChanges: { inventory: [{ action: "REMOVE" as const, name: "Зелье лечения", quantity: 2, notes: "", certainty: "KNOWN" as const }],
        resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } } };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state))
      .toContain("Нельзя списать 2 ед. «Зелье лечения»: в инвентаре недостаточное количество.");
  });
  it("rejects currency changes that create a negative balance", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    const draft = { ...createEmptyTurnDraft(), summary: "Покупка", worldOutcome: "Оплачено",
      characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: -1, pp: 0 } } };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state))
      .toContain("Изменение валюты GP приводит к отрицательному остатку.");
  });

  it("does not let a turn invent current uses for an unknown class resource", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    state.player_character_state.resources = [{ id: "second-wind", name: "Second Wind", current: null, max: 4, recovery: "Short/Long Rest", certainty: "KNOWN" }];
    const draft = { ...createEmptyTurnDraft(), summary: "Использование Second Wind", worldOutcome: "Здоровье восстановлено",
      characterChanges: { inventory: [], resources: [{ name: "Second Wind", current: 3, max: 4, recovery: "Short/Long Rest", certainty: "KNOWN" as const }],
        conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } } };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state))
      .toContain("Нельзя подставить текущее значение ресурса «Second Wind»: оно UNKNOWN. Сначала игрок должен указать фактический остаток.");
  });

  it("does not let a turn alter a resource maximum without a confirmed character-sheet change", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    state.player_character_state.resources = [{ id: "second-wind", name: "Second Wind", current: 4, max: 4, recovery: "Short/Long Rest", certainty: "KNOWN" }];
    const draft = { ...createEmptyTurnDraft(), summary: "Использование Second Wind", worldOutcome: "Ресурс изменён",
      characterChanges: { inventory: [], resources: [{ name: "Second Wind", current: 3, max: 5, recovery: "Short/Long Rest", certainty: "KNOWN" as const }],
        conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } } };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state))
      .toContain("Нельзя менять максимум ресурса «Second Wind» без подтверждённого изменения листа персонажа.");
  });
  it("allows healing above maximum HP because the commit resolver caps it", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    state.player_character_state.hpCurrent = 180;
    state.player_character_state.hpMax = 184;
    const draft = { ...createEmptyTurnDraft(), summary: "Лечение", worldOutcome: "Восстановлено здоровье", hpDelta: 5 };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state)).toEqual([]);
    expect(applyHitPointDelta(180, 184, 0, 5).hpCurrent).toBe(184);
  });
});


describe("verified NPC combat HP", () => {
  it("applies resistance, vulnerability, immunity and zero-HP floor", () => {
    expect(applyNpcHitPointDamage(12, 20, 7, "fire", ["fire"], [], []))
      .toMatchObject({ hpCurrent: 9, appliedDamage: 3, error: null });
    expect(applyNpcHitPointDamage(12, 20, 7, "fire", [], ["fire"], []))
      .toMatchObject({ hpCurrent: 0, appliedDamage: 14, error: null });
    expect(applyNpcHitPointDamage(12, 20, 7, "fire", [], [], ["fire"]))
      .toMatchObject({ hpCurrent: 12, appliedDamage: 0, error: null });
  });

  it("does not allow the model to overwrite a previously verified NPC combat profile", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    const profile = {
      status: "SRD_VERIFIED" as const, source: "SRD 5.2.1 lines 10-20",
      armorClass: 13, hitPointsCurrent: 11, hitPointsMax: 11, speed: "30 ft",
      attacks: [], resistances: [], vulnerabilities: [], immunities: [],
    };
    const npc = {
      id: "npc-guard", name: "Страж", role: "Стражник", locationId: null, factionId: null,
      goals: "Охраняет ворота", gmProfile: {
        biography: "", appearance: "", personality: "", motivation: "", longTermGoal: "",
        secrets: "", relationships: "", skillsAndAbilities: "", combatProfile: profile,
      },
      attitudeToPlayer: "Нейтральное", certainty: "KNOWN" as const, sourceId: "MANUAL_GM_ENTRY",
      locked: false, knowledge: [], version: 1, history: [],
    };
    const changedProfile = { ...profile, hitPointsCurrent: 1 };
    const change = {
      action: "UPDATE" as const, playerVisible: true, name: "Страж", role: "Стражник",
      goals: "Охраняет ворота", resources: "UNKNOWN", attitudeToPlayer: "Нейтральное",
      locationName: null, factionName: null, certainty: "KNOWN" as const, reason: "Обновление карточки",
      gmProfile: { ...npc.gmProfile, combatProfile: changedProfile },
      knowledgeAdditions: [], playerKnowledgeAdditions: [],
    };
    const draft = { ...createEmptyTurnDraft(), summary: "Обновление", worldOutcome: "Карточка изменена", npcChanges: [change] };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state, [npc]))
      .toContain("Подтверждённый боевой профиль NPC «Страж» нельзя переписывать ответом мастера. HP и параметры боя меняются только через проверенные боевые события.");
  });

  it("fails closed when damage type is unknown but the NPC has defenses", () => {
    expect(applyNpcHitPointDamage(12, 20, 7, null, ["fire"], [], []))
      .toMatchObject({ hpCurrent: 12, error: expect.stringContaining("Тип урона неизвестен") });
  });

  it("validates NPC damage events only against a verified SRD combat profile", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    const combatProfile = {
      status: "SRD_VERIFIED" as const, source: "SRD 5.2.1 lines 10-20",
      armorClass: 13, hitPointsCurrent: 11, hitPointsMax: 11, speed: "30 ft",
      attacks: [], resistances: [], vulnerabilities: [], immunities: [],
    };
    const npc = {
      id: "npc-guard", name: "Страж", role: "Стражник", locationId: null, factionId: null,
      goals: "Охраняет ворота", gmProfile: {
        biography: "", appearance: "", personality: "", motivation: "", longTermGoal: "",
        secrets: "", relationships: "", skillsAndAbilities: "", combatProfile,
      },
      attitudeToPlayer: "Нейтральное", certainty: "KNOWN" as const, sourceId: "MANUAL_GM_ENTRY",
      locked: false, knowledge: [], version: 1, history: [],
    };
    const event = {
      targetType: "NPC" as const, targetName: "Страж", damage: 5, damageType: "piercing",
      critical: false, source: "PLAYER" as const, formula: "1d8+2", rollLabel: "Урон мечом по Страж",
    };
    const draft = { ...createEmptyTurnDraft(), summary: "Атака", worldOutcome: "Страж ранен", combatEvents: [event] };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state, [npc])).toEqual([]);
    expect(applyNpcHitPointDamage(11, 11, 5, "piercing", [], [], []).hpCurrent).toBe(6);
    const unverified = { ...npc, gmProfile: { ...npc.gmProfile, combatProfile: { ...combatProfile, status: "UNKNOWN" as const } } };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state, [unverified]))
      .toContain("Нельзя применить урон к NPC «Страж»: отсутствует подтверждённый боевой профиль SRD.");
  });
});

describe("source context review audit", () => {
  it("rejects a source enabled for AI context before explicit review", () => {
    const state = createInitialCollections();
    state.sources[0] = {
      ...state.sources[0]!,
      contentStatus: "ATTACHED",
      contextEnabled: true,
      reviewStatus: "UNREVIEWED",
      processing: {
        status: "PROCESSED", sha256: "a".repeat(64), characterCount: 10,
        lineCount: 2, sectionCount: 1, chunkCount: 1, dateCandidateCount: 0,
        processedAt: "2026-11-25T12:00:00.000Z", warnings: [],
      },
    };
    const report = runIntegrityAudit(state);
    const check = report.checks.find((item) => item.id === "source-context-review");
    expect(check?.passed).toBe(false);
    expect(check?.details).toContain("ОБСИДИАН 4.1");
  });

  it("accepts a verified source explicitly enabled for AI context", () => {
    const state = createInitialCollections();
    state.sources[0] = {
      ...state.sources[0]!,
      contentStatus: "ATTACHED",
      contextEnabled: true,
      reviewStatus: "VERIFIED",
      processing: {
        status: "PROCESSED", sha256: "a".repeat(64), characterCount: 10,
        lineCount: 2, sectionCount: 1, chunkCount: 1, dateCandidateCount: 0,
        processedAt: "2026-11-25T12:00:00.000Z", warnings: [],
      },
    };
    const report = runIntegrityAudit(state);
    expect(report.checks.find((item) => item.id === "source-context-review")?.passed).toBe(true);
  });

describe("D&D 2024 hit point resolution", () => {
  it("absorbs damage with temporary HP before reducing current HP", () => {
    expect(applyHitPointDelta(12, 20, 5, -3)).toEqual({ hpCurrent: 12, hpTemp: 2, error: null });
    expect(applyHitPointDelta(12, 20, 5, -8)).toEqual({ hpCurrent: 9, hpTemp: 0, error: null });
  });

  it("does not allow temporary HP to make an otherwise lethal damage event invalid", () => {
    expect(applyHitPointDelta(4, 20, 6, -10)).toEqual({ hpCurrent: 0, hpTemp: 0, error: null });
  });

  it("caps healing at maximum HP and never restores temporary HP", () => {
    expect(applyHitPointDelta(18, 20, 4, 9)).toEqual({ hpCurrent: 20, hpTemp: 4, error: null });
  });

  it("rejects damage beyond available current and temporary HP", () => {
    expect(applyHitPointDelta(3, 20, 2, -6).error)
      .toBe("Итоговые HP персонажа не могут быть меньше 0 (проверьте дельту HP).");
  });

  it("rejects HP changes when current HP is unknown", () => {
    expect(applyHitPointDelta(null, 20, 5, -2).error)
      .toBe("Нельзя изменить HP: текущее значение UNKNOWN. Уточните текущие HP в листе персонажа.");
  });

  it("turn validation accounts for temporary HP when checking incoming damage", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    state.player_character_state.hpCurrent = 4;
    state.player_character_state.hpMax = 20;
    state.player_character_state.hpTemp = 6;
    const draft = { ...createEmptyTurnDraft(), summary: "Получен удар", worldOutcome: "Урон поглощён временными HP", hpDelta: -10 };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state)).toEqual([]);
  });
});

});
