import { describe, expect, it } from "vitest";
import { formatGameMasterAnswer } from "./game-master-presentation";
import type { GameMasterTurn } from "./game-master";
import { createInitialCollections } from "./defaults";

const turn = {
  narration: "Ветер шевелит траву.", campaignMemory: "Недавно персонаж прибыл сюда.",
  sensoryDescription: "Зрение: трава колышется. Слух: ветер.", spatialAccounting: "Положение точное неизвестно.",
  mechanics: "Проверка не требуется: персонаж просто осматривается.",
  consequences: "Ничего не изменилось.", resourceAccounting: "HP и инвентарь без изменений.",
  nextAction: "Что ты делаешь?", summary: "Осмотр", worldOutcome: "Осмотр завершён.",
  timeDeltaMinutes: 1, hpDelta: 0, newInGameDate: "UNKNOWN", newLocationId: null, consequenceText: "",
  rolls: [], npcChanges: [], characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } },
  needsClarification: false, clarificationQuestion: "", stateNotes: [],
} satisfies GameMasterTurn;

describe("OBSIDIAN 4.1 GM answer formatting", () => {
  it("renders the mandatory header and all answer blocks without inventing missing data", () => {
    const state = createInitialCollections();
    state.world_state.campaignName = "Пробная кампания";
    state.world_state.currentInGameDate = "День 1, 08:00";
    state.player_character_state.currentLocationLabel = "UNKNOWN";
    const answer = formatGameMasterAnswer(turn, state.world_state, state.player_character_state, [], 7);
    expect(answer).toContain("ХОД #0007");
    expect(answer).toContain("\nКАМПАНИЯ:");
    expect(answer).toContain("ВРЕМЯ: 08:00");
    expect(answer).not.toContain("\\n");
    expect(answer).toContain("ИГРОВОЙ ГОД: НЕ УСТАНОВЛЕНО");
    expect(answer).toContain("ПОГОДА: НЕ УСТАНОВЛЕНО");
    expect(answer).toContain("СЕНСОРНОЕ ВОСПРИЯТИЕ");
    expect(answer).toContain("RAW / МЕХАНИКА");
    expect(answer).toContain("СЛЕДУЮЩЕЕ ДЕЙСТВИЕ");
    expect(answer).toContain("ПРЕДВАРИТЕЛЬНЫЙ ОТВЕТ МАСТЕРА");
  });
});
