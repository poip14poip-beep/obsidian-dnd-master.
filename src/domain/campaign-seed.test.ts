import { describe, expect, it } from "vitest";
import { applyEkdrasilSeed } from "./campaign-seed";
import { createInitialCollections } from "./defaults";

describe("Ekdrasil seed preparation", () => {
  it("attaches the dossier as a source without importing it into the active character before explicit confirmation", async () => {
    const initial = createInitialCollections();
    const result = await applyEkdrasilSeed(initial, {
      governing: "# ОБСИДИАН 4.1\nПолный управляющий документ.",
      chronicle: "# ЭКДРАСИЛЬ\nХроника мира.",
      dossier: "# ЛИЯ ВЕЙН\nЧеловек. Fighter 20 / Champion.\n184 HP.",
    }, "2026-11-26T00:00:00.000Z");

    expect(result.sources.every(source => source.contentStatus === "ATTACHED")).toBe(true);
    expect(result.player_character_state.name).toBe("UNKNOWN");
    expect(result.player_character_state.inventory).toHaveLength(0);
    expect(result.player_character_state.resources).toHaveLength(0);
    expect(result.audit_log.entries.at(-1)?.details).toContain("Игровой ход не создан");
  });
});
