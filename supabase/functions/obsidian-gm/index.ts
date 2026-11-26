import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const ALLOWED_MODELS = new Set(["gpt-4.1-mini"]);
const ALLOWED_ORIGINS = new Set([
  "https://poip14poip-beep.github.io",
  "https://id-preview--f1a28b3c-1045-4cea-a6be-745d1ef02a64.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported." } }, 405, cors);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This app origin is not allowed." } }, 403, cors);

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > 1_000_000) return json({ error: { code: "REQUEST_TOO_LARGE", message: "Request is too large." } }, 413, cors);

  const authorization = req.headers.get("authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\\s+(.+)$/i);
  if (!tokenMatch) return json({ error: { code: "AUTH_REQUIRED", message: "Sign in to use the game master." } }, 401, cors);

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: { code: "SERVER_CONFIGURATION_INCOMPLETE", message: "Supabase server configuration is incomplete." } }, 503, cors);
  }
  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) {
    return json({ error: { code: "INVALID_SESSION", message: "Your session is invalid or expired. Sign in again." } }, 401, cors);
  }
  if (!OPENAI_API_KEY) {
    return json({ error: { code: "OPENAI_SECRET_MISSING", message: "The server is not configured with an OpenAI API key yet." } }, 503, cors);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ error: { code: "INVALID_BODY", message: "Could not read request body." } }, 400, cors);
  }
  if (rawBody.length > 1_000_000) return json({ error: { code: "REQUEST_TOO_LARGE", message: "Request is too large." } }, 413, cors);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400, cors);
  }
  if (!isRecord(body) ||
      typeof body.model !== "string" || !ALLOWED_MODELS.has(body.model) ||
      typeof body.instructions !== "string" || body.instructions.length < 1 || body.instructions.length > 250_000 ||
      typeof body.input !== "string" || body.input.length < 1 || body.input.length > 700_000 ||
      !isRecord(body.text) || !isRecord(body.text.format) ||
      body.text.format.type !== "json_schema" ||
      body.text.format.name !== "obsidian_game_turn" ||
      body.text.format.strict !== true ||
      !isRecord(body.text.format.schema)) {
    return json({ error: { code: "INVALID_REQUEST", message: "The game-master request has an invalid shape or unsupported model." } }, 400, cors);
  }

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: body.model,
        instructions: body.instructions,
        input: body.input,
        text: body.text,
        max_output_tokens: 8192,
      }),
      signal: AbortSignal.timeout(110_000),
    });
    const responseText = await openaiResponse.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      return json({ error: { code: "INVALID_OPENAI_RESPONSE", message: "OpenAI returned an unreadable response." } }, 502, cors);
    }
    if (!openaiResponse.ok) {
      const apiError = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      const message = typeof apiError.message === "string" ? apiError.message.slice(0, 500) : "OpenAI rejected the request.";
      return json({ error: { code: "MODEL_API_ERROR", message } }, openaiResponse.status, cors);
    }
    return json(payload, 200, cors);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return json({
      error: {
        code: timedOut ? "OPENAI_TIMEOUT" : "OPENAI_NETWORK_ERROR",
        message: timedOut ? "The model request timed out. Try again." : "Could not reach OpenAI. Check the connection and try again.",
      },
    }, 502, cors);
  }
});
