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
