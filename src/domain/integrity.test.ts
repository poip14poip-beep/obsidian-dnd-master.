import { describe, expect, it } from "vitest";
import { createEmptyTurnDraft, createInitialCollections } from "./defaults";
import { validateTurnDraft } from "./integrity";
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
    const duplicate = { action: "CREATE" as const, name: "Страж", role: "Стражник", goals: "Охраняет ворота", attitudeToPlayer: "Нейтральное", locationName: null, factionName: null, certainty: "KNOWN" as const, reason: "Встречен у ворот", knowledgeAdditions: [] };
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
  it("rejects healing above the character's maximum HP", () => {
    const state = createInitialCollections();
    state.world_state.setup.confirmed = true;
    state.player_character_state.hpCurrent = 180;
    state.player_character_state.hpMax = 184;
    const draft = { ...createEmptyTurnDraft(), summary: "Лечение", worldOutcome: "Восстановлено здоровье", hpDelta: 5 };
    expect(validateTurnDraft(draft, state.world_state, state.player_character_state))
      .toContain("Итоговые HP не могут превышать максимум персонажа.");
  });
});
