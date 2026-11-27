import { describe, expect, it } from "vitest";
import { checkNarration, collectExchanges, resolveOutcomes } from "./engine-boundary";

function toolConversation(name: string, result: Record<string, unknown>, args: Record<string, unknown> = {}) {
  return [
    {
      role: "assistant",
      tool_calls: [{ id: "tool-1", type: "function", function: { name, arguments: JSON.stringify(args) } }],
    },
    { role: "tool", tool_call_id: "tool-1", content: JSON.stringify(result) },
  ];
}

describe("engine boundary narration guard", () => {
  it("pairs assistant tool calls with their exact tool results", () => {
    const exchanges = collectExchanges(toolConversation("pc_attack", { hit: false, target: "Goblin" }));
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]).toMatchObject({ name: "pc_attack", result: { hit: false, target: "Goblin" } });
  });

  it("rejects narration that turns a server-reported miss into a hit", () => {
    const conversation = toolConversation("pc_attack", { hit: false, target: "Goblin" });
    const contradictions = checkNarration({ conversation, narration: "Твой клинок поражает гоблина." });
    expect(contradictions).toEqual([expect.objectContaining({ kind: "hit" })]);
  });

  it("rejects a claimed death while the resolved creature still has hit points", () => {
    const conversation = toolConversation("get_creature_state", { name: "Goblin", hp: "7/7", dead: false });
    const contradictions = checkNarration({ conversation, narration: "Гоблин падает замертво." });
    expect(contradictions).toEqual([expect.objectContaining({ kind: "death" })]);
  });

  it("rejects damage figures that no tool result produced", () => {
    const conversation = toolConversation("apply_damage", { target: "Goblin", damage: 5, hp: "2/7" });
    const contradictions = checkNarration({ conversation, narration: "Ты наносишь 8 урона гоблину." });
    expect(contradictions).toEqual([expect.objectContaining({ kind: "number" })]);
  });

  it("does not treat quoted NPC dialogue as authoritative narration", () => {
    const conversation = toolConversation("pc_attack", { hit: false, target: "Goblin" });
    const contradictions = checkNarration({ conversation, narration: "«Ты поразил гоблина!» — кричит торговец." });
    expect(contradictions).toHaveLength(0);
  });

  it("does not infer outcomes when the current turn has no resolved tool facts", () => {
    const outcomes = resolveOutcomes([]);
    expect(outcomes.toolResultCount).toBe(0);
    expect(checkNarration({ conversation: [], narration: "Гоблин отступает в тень." })).toHaveLength(0);
  });
});
