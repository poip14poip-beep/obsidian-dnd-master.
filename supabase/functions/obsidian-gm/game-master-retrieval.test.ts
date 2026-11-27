import { describe, expect, it, vi } from "vitest";
import { callWithEkdrasilReadTools, executeEkdrasilReadTool } from "./game-master-retrieval";

const rules = ["Attack rolls use a d20 plus the ability modifier and proficiency bonus."];
const canon = [{ paragraph: "## 12. The northern kingdom of Vahlgard.", haystack: "## 12. the northern kingdom of vahlgard." }];

describe("Ekdrasil read-only game-master tools", () => {
  it("retrieves only bounded D&D 2024 rule excerpts", () => {
    const result = executeEkdrasilReadTool("search_dnd_rules", JSON.stringify({ query: "attack rolls proficiency" }), rules, canon);
    expect(result.source).toBe("D&D 2024 / SRD 5.2.1");
    expect(result.excerpts).toEqual(rules);
  });

  it("retrieves canon 2.4 and identifies its exact authority", () => {
    const result = executeEkdrasilReadTool("search_ekdrasil_canon", JSON.stringify({ query: "Vahlgard northern kingdom" }), rules, canon);
    expect(result.source).toBe("Ekdrasil_Master_Canon_v2.4.md");
    expect(result.edition).toBe("2.4");
    expect(result.excerpts).toEqual([canon[0].paragraph]);
  });

  it("refuses unknown tools and malformed arguments", () => {
    expect(executeEkdrasilReadTool("write_campaign_state", "{}", rules, canon).ok).toBe(false);
    expect(executeEkdrasilReadTool("search_ekdrasil_canon", "{", rules, canon).ok).toBe(false);
  });

  it("runs a bounded model tool loop and feeds the result back to the model", async () => {
    const first = {
      choices: [{ message: { role: "assistant", tool_calls: [{ id: "call-1", type: "function", function: { name: "search_ekdrasil_canon", arguments: JSON.stringify({ query: "Vahlgard" }) } }] } }],
    };
    const second = { choices: [{ message: { role: "assistant", content: "I have enough source material." } }] };
    const third = { choices: [{ message: { role: "assistant", content: "{\\"narration\\":\\"final narration\\"}" } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(second), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(third), { status: 200 }));
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [{ role: "user", content: "Find Vahlgard" }], response_format: { type: "json_schema", json_schema: { name: "turn", strict: true, schema: { type: "object" } } }, structured_outputs: true },
      enabled: true,
      ruleParagraphs: rules,
      canonParagraphs: canon,
    });
    expect(result.toolCalls).toBe(1);
    expect(result.exhausted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const secondCall = fetcher.mock.calls[1];
    expect(secondCall).toBeDefined();
    const secondBody = JSON.parse(String(secondCall?.[1]?.body ?? "{}"));
    expect(secondBody.messages.some((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === "call-1")).toBe(true);
    expect(secondBody.response_format).toBeUndefined();
    const finalCall = fetcher.mock.calls[2];
    expect(finalCall).toBeDefined();
    const finalBody = JSON.parse(String(finalCall?.[1]?.body ?? "{}"));
    expect(finalBody.tools).toBeUndefined();
    expect(finalBody.tool_choice).toBeUndefined();
    expect(finalBody.response_format).toEqual({ type: "json_schema", json_schema: { name: "turn", strict: true, schema: { type: "object" } } });
    expect(finalBody.structured_outputs).toBe(true);
  });
  it("always makes a final schema-constrained call even when no retrieval is needed", async () => {
    const first = { choices: [{ message: { role: "assistant", content: "No lookup needed." } }] };
    const final = { choices: [{ message: { role: "assistant", content: "{\\"ok\\":true}" } }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    const schema = { type: "json_schema", json_schema: { name: "turn", strict: true, schema: { type: "object" } } };
    const result = await callWithEkdrasilReadTools({
      fetcher: fetcher as unknown as typeof fetch,
      url: "https://example.test",
      headers: {},
      requestBody: { model: "test", messages: [{ role: "user", content: "Simple action" }], response_format: schema, structured_outputs: true },
      enabled: true,
      ruleParagraphs: rules,
      canonParagraphs: canon,
    });
    expect(result.toolCalls).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const finalBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body ?? "{}"));
    expect(finalBody.response_format).toEqual(schema);
    expect(finalBody.tools).toBeUndefined();
    expect(result.payload).toEqual(final);
  });

});
