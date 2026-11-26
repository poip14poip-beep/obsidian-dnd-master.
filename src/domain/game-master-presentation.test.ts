import { describe, expect, it } from "vitest";
import { formatCampaignOpening, formatGameMasterAnswer } from "./game-master-presentation";
import type { GameMasterTurn } from "./game-master";

const sensory = [
  "Зрение: видимая улица.",
  "Слух: голоса и шаги.",
  "Осязание: ткань одежды касается кожи.",
  "Обоняние: запахи окружающей улицы.",
  "Вкус: нейтральный.",
  "Терморецепция: ощущение прохладного воздуха.",
  "Вестибулярный аппарат: равновесие устойчивое.",
  "Проприоцепция: положение тела ощущается естественно.",
  "Интероцепция: дыхание ровное.",
].join("\n");

const turn = {
  narration: "Мастерские стоят вдоль улицы.",
  campaignMemory: "До начала кампании Лия жила своей обычной жизнью.",
  sensoryDescription: sensory,
  spatialAccounting: "internal", mechanics: "internal", consequences: "internal", resourceAccounting: "internal",
  nextAction: "internal", summary: "internal", worldOutcome: "internal", timeDeltaMinutes: 0, hpDelta: 0,
  newInGameDate: "UNKNOWN", newLocationId: null, consequenceText: "",
  environment: { temperatureC: null, temperatureCertainty: "UNKNOWN", weather: "UNKNOWN", lighting: "UNKNOWN", visibility: "UNKNOWN", wind: "UNKNOWN", precipitation: "UNKNOWN", ambientSounds: "UNKNOWN", ambientSmells: "UNKNOWN", notes: "" },
  environmentReason: "internal", questChanges: [], rolls: [], npcChanges: [],
  characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } },
  needsClarification: false, clarificationQuestion: "", stateNotes: [],
} satisfies GameMasterTurn;

describe("player-facing game chat formatting", () => {
  it("shows only sensory feed and current scene on regular turns, with real line breaks", () => {
    const answer = formatGameMasterAnswer(turn, undefined, undefined, [], 1);
    expect(answer).toContain("ХОД #0001");
    expect(answer).toContain("СЕНСОРНЫЙ ВОД");
    expect(answer).toContain("Зрение: видимая улица.");
    expect(answer).toContain("Интероцепция: дыхание ровное.");
    expect(answer).toContain("ТЕКУЩАЯ СЦЕНА");
    expect(answer).toContain("Мастерские стоят вдоль улицы.");
    expect(answer).not.toContain("\\n");
    expect(answer).not.toContain("РЕЗУЛЬТАТ ДЕЙСТВИЯ");
    expect(answer).not.toContain("МЕСТО:");
    expect(answer).not.toContain("ПРЕДЫСТОРИЯ");
  });

  it("shows prehistory only in the one-time opening, before sensory feed and scene", () => {
    const opening = formatCampaignOpening(turn);
    expect(opening.indexOf("ПРЕДЫСТОРИЯ")).toBeLessThan(opening.indexOf("СЕНСОРНЫЙ ВОД"));
    expect(opening.indexOf("СЕНСОРНЫЙ ВОД")).toBeLessThan(opening.indexOf("ТЕКУЩАЯ СЦЕНА"));
    expect(opening).toContain("До начала кампании Лия жила своей обычной жизнью.");
    expect(opening).not.toContain("ХОД #");
    expect(opening).not.toContain("МЕСТО:");
  });
});