import { describe, expect, it } from "vitest";
import { formatCampaignOpening, formatGameMasterAnswer } from "./game-master-presentation";
import type { GameMasterTurn } from "./game-master";
import { createInitialCollections } from "./defaults";

const turn = {
  narration: "Ветер шевелит траву.", campaignMemory: "Недавно персонаж прибыл сюда.",
  sensoryDescription: "Зрение: трава колышется. Слух: ветер.", spatialAccounting: "Положение точное неизвестно.",
  mechanics: "Проверка не требуется: персонаж просто осматривается.",
  consequences: "Ничего не изменилось.", resourceAccounting: "HP и инвентарь без изменений.",
  nextAction: "Что ты делаешь?", summary: "Осмотр", worldOutcome: "Осмотр завершён.",
  timeDeltaMinutes: 1, hpDelta: 0, newInGameDate: "UNKNOWN", newLocationId: null, consequenceText: "",
  environment: { temperatureC: null, temperatureCertainty: "UNKNOWN", weather: "UNKNOWN", lighting: "UNKNOWN", visibility: "UNKNOWN", wind: "UNKNOWN", precipitation: "UNKNOWN", ambientSounds: "UNKNOWN", ambientSmells: "UNKNOWN", notes: "" }, environmentReason: "Без изменений.", questChanges: [],
  rolls: [], npcChanges: [], characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } },
  needsClarification: false, clarificationQuestion: "", stateNotes: [],
} satisfies GameMasterTurn;

describe("player-facing game chat formatting", () => {
  it("shows numbered turn, location, date, time, temperature, sensory detail and scene as a chat message", () => {
    const state = createInitialCollections();
    state.world_state.currentInGameDate = "2000 год, месяц 09, день 24; 06:25";
    state.world_state.calendarSystem = "Technical Calendar 1.0";
    const answer = formatGameMasterAnswer(turn, state.world_state, state.player_character_state, [], 1);
    expect(answer).toContain("ХОД #0001");
    expect(answer).toContain("МЕСТО:");
    expect(answer).toContain("ДАТА:");
    expect(answer).toContain("ВРЕМЯ: 06:25 · УТРО");
    expect(answer).toContain("ТЕМПЕРАТУРА:");
    expect(answer).toContain("СЕНСОРНОЕ ВОСПРИЯТИЕ");
    expect(answer).toContain("ОПИСАНИЕ СЦЕНЫ");
    expect(answer).toContain("Ветер шевелит траву.");
    expect(answer).not.toContain("RAW / МЕХАНИКА");
    expect(answer).not.toContain("ПРЕДВАРИТЕЛЬНЫЙ ОТВЕТ МАСТЕРА");
  });

  it("shows one-time prehistory before the first action without assigning it a turn number", () => {
    const state = createInitialCollections();
    state.world_state.currentInGameDate = "2000 год (APPROXIMATE; точные день и время UNKNOWN)";
    const opening = formatCampaignOpening(turn, state.world_state, state.player_character_state, []);
    expect(opening).toContain("ПРЕДЫСТОРИЯ · КАК ТЫ ОКАЗАЛСЯ ЗДЕСЬ");
    expect(opening).toContain("Недавно персонаж прибыл сюда.");
    expect(opening).toContain("МЕСТО:");
    expect(opening).toContain("СЕНСОРНОЕ ВОСПРИЯТИЕ");
    expect(opening).toContain("ТЕКУЩАЯ СЦЕНА");
    expect(opening).not.toContain("ХОД #");
  });
});
