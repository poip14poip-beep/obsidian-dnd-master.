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
