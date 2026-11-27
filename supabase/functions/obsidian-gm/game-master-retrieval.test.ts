import { describe, expect, it, vi } from "vitest";
import { callWithEkdrasilReadTools, executeEkdrasilReadTool } from "./game-master-retrieval";

const rules = {
  sourceId: "SRD_5_2_1",
  sha256: "rules-hash",
  content: [
    "# Combat",
    "",
    "An attack roll is a d20 test against the target's Armor Class.",
    "",
    "# Ability Checks",
    "",
    "An ability check uses a d20 roll plus the relevant ability modifier.",
  ].join("\n"),
};
const canon = {
  sourceId: "EKDRASIL_WORLD_BIBLE",
  sha256: "canon-hash",
  content: [
    "# ЭКДРАСИЛЬ",
    "",
    "## 12. Вальдгард",
    "",
    "Вальдгард — подтверждённое королевство северных земель Экдрасиля.",
    "",
    "## 13. Благодать",
    "",
    "Благодать ангелов связана с их силой и владениями.",
  ].join("\n"),
};

describe("Open Dungeon Master retrieval adapted to Ekdrasil", () => {
  it("retrieves source-attributed D&D 2024 excerpts", () => {
    const result = executeEkdrasilReadTool("search_dnd_rules", JSON.stringify({ query: "attack roll armor class" }), rules, canon);
    expect(result.source).toBe("D&D 2024 / SRD 5.2.1");
    expect(result.sourceId).toBe("SRD_5_2_1");
    expect(result.sha256).toBe("rules-hash");
    expect(result.excerpts).toEqual([expect.objectContaining({ lines: "3–3" })]);
  });

  it("retrieves only canon 2.4 with section and line provenance", () => {
    const result = executeEkdrasilReadTool("search_ekdrasil_canon", JSON.stringify({ query: "Вальдгард королевство северных земель" }), rules, canon);
    expect(result.source).toBe("Ekdrasil_Master_Canon_v2.4.md");
    expect(result.edition).toBe("2.4");
    expect(result.sha256).toBe("canon-hash");
    expect(result.excerpts).toEqual(expect.arrayContaining([expect.objectContaining({
      sectionId: "EKDRASIL_WORLD_BIBLE:3:12-вальдгард",
      text: expect.stringContaining("Вальдгард — подтверждённое королевство"),
    })]));
  });

  it("refuses unknown tools and malformed arguments", () => {
    expect(executeEkdrasilReadTool("write_campaign_state", "{}", rules, canon).ok).toBe(false);
    expect(executeEkdrasilReadTool("search_ekdrasil_canon", "{", rules, canon).ok).toBe(false);
  });

  it("feeds read-only tool results back and restores the strict final schema", async () => {
    const first = {
      choices: [{ message: { role: "assistant", tool_calls: [{
        id: "call-1", type: "function",
        function: { name: "search_ekdrasil_canon", arguments: JSON.stringify({ query: "Вальдгард" }) },
      }] } }],
    };
    const second = { choices: [{ message: { role: "assistant", content: "Источника достаточно." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ narration: "Город виден вдали." }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(second), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const schema = { type: "json_schema", json_schema: { name: "game_turn", strict: true, schema: { type: "object" } } };
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: {
        model: "test",
        messages: [{ role: "user", content: "Найди Вальдгард" }],
        response_format: schema,
        structured_outputs: true,
      },
      enabled: true,
      rules,
      canon,
    });
    expect(result.toolCalls).toBe(1);
    expect(result.exhausted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const toolRequest = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body ?? "{}"));
    expect(toolRequest.messages.some((item: { role: string; tool_call_id?: string }) => item.role === "tool" && item.tool_call_id === "call-1")).toBe(true);
    expect(toolRequest.response_format).toBeUndefined();
    const finalRequest = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(finalRequest.tools).toBeUndefined();
    expect(finalRequest.tool_choice).toBeUndefined();
    expect(finalRequest.response_format).toEqual(schema);
    expect(finalRequest.structured_outputs).toBe(true);
    expect(result.payload).toEqual(final);
  });

  it("still requests strict JSON when the model does not need retrieval", async () => {
    const first = { choices: [{ message: { role: "assistant", content: "Не требуется поиск." } }] };
    const final = { choices: [{ message: { role: "assistant", content: JSON.stringify({ ok: true }) } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const schema = { type: "json_schema", json_schema: { name: "game_turn", strict: true, schema: { type: "object" } } };
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [], response_format: schema, structured_outputs: true },
      enabled: true,
      rules,
      canon,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body ?? "{}")).response_format).toEqual(schema);
    expect(result.payload).toEqual(final);
  });

  it("enforces the maximum number of tool calls", async () => {
    const call = {
      choices: [{ message: { role: "assistant", tool_calls: Array.from({ length: 7 }, (_, index) => ({
        id: `call-${index}`, type: "function",
        function: { name: "search_ekdrasil_canon", arguments: JSON.stringify({ query: "Вальдгард" }) },
      })) } }],
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(call), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [] },
      enabled: true,
      rules,
      canon,
    });
    expect(result.exhausted).toBe(true);
    expect(result.toolCalls).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
