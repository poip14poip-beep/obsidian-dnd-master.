import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
function getServerSecret(): string {
  const direct =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    "";
  if (direct) return direct;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      const first = Object.values(parsed).find((value) => typeof value === "string" && value.length > 0);
      if (first) return first;
    } catch {
      // Invalid secret map is handled by the missing-secret guard below.
    }
  }
  return "";
}
const SERVER_SECRET = getServerSecret();

const ALLOWED_ORIGINS = new Set([
  "https://poip14poip-beep.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, cors);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, cors);
  if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SERVER_SECRET) {
    return json({ error: "SERVER_CONFIGURATION_INCOMPLETE" }, 500, cors);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "AUTH_REQUIRED" }, 401, cors);
  const userJwt = match[1];

  const authClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(userJwt);
  if (authError || !authData.user) return json({ error: "INVALID_OR_EXPIRED_SESSION" }, 401, cors);
  const actor = authData.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400, cors);
  }
  if (!isObject(body) || typeof body.action !== "string") {
    return json({ error: "INVALID_REQUEST" }, 400, cors);
  }

  const admin = createClient(SUPABASE_URL, SERVER_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (body.action) {
      case "create_campaign": {
        if (!hasOnlyKeys(body, ["action", "title", "settings"]) ||
            typeof body.title !== "string" ||
            (body.settings !== undefined && !isObject(body.settings))) {
          return json({ error: "INVALID_CREATE_CAMPAIGN_PAYLOAD" }, 400, cors);
        }
        const { data, error } = await admin.rpc("obsidian_api_create_campaign", {
          p_actor: actor,
          p_title: body.title,
          p_settings: body.settings ?? {},
        });
        if (error) return json({ error: "CAMPAIGN_CREATE_FAILED", detail: error.message }, 400, cors);
        return json({ ok: true, campaign: data }, 200, cors);
      }

      case "bootstrap": {
        if (!hasOnlyKeys(body, ["action", "campaign_id"]) ||
            typeof body.campaign_id !== "string") {
          return json({ error: "INVALID_BOOTSTRAP_PAYLOAD" }, 400, cors);
        }
        const { data, error } = await admin.rpc("obsidian_api_get_campaign_snapshot", {
          p_actor: actor,
          p_campaign_id: body.campaign_id,
        });
        if (error) return json({ error: "CAMPAIGN_LOAD_FAILED", detail: error.message }, 404, cors);
        return json({ ok: true, snapshot: data }, 200, cors);
      }

      case "save_draft": {
        if (!hasOnlyKeys(body, ["action", "campaign_id", "draft"]) ||
            typeof body.campaign_id !== "string" || !isObject(body.draft) ||
            !hasOnlyKeys(body.draft, ["id", "proposed_turn", "player_action", "gm_resolution", "pending_changes", "status"])) {
          return json({ error: "INVALID_SAVE_DRAFT_PAYLOAD" }, 400, cors);
        }
        const { data, error } = await admin.rpc("obsidian_api_save_draft", {
          p_actor: actor,
          p_campaign_id: body.campaign_id,
          p_draft: body.draft,
        });
        if (error) return json({ error: "DRAFT_SAVE_FAILED", detail: error.message }, 400, cors);
        return json({ ok: true, draft: data }, 200, cors);
      }

      case "commit_turn": {
        if (!hasOnlyKeys(body, ["action", "draft_id"]) || typeof body.draft_id !== "string") {
          return json({ error: "INVALID_COMMIT_PAYLOAD" }, 400, cors);
        }
        const { data, error } = await admin.rpc("obsidian_api_commit_turn", {
          p_actor: actor,
          p_draft_id: body.draft_id,
        });
        if (error) return json({ error: "TURN_COMMIT_FAILED", detail: error.message }, 409, cors);
        return json({ ok: true, result: data }, 200, cors);
      }

      case "save_snapshot": {
        if (!hasOnlyKeys(body, ["action", "campaign_id", "parent_revision", "turn_number", "payload"]) ||
            typeof body.campaign_id !== "string" ||
            typeof body.parent_revision !== "number" || !Number.isSafeInteger(body.parent_revision) || body.parent_revision < 0 ||
            typeof body.turn_number !== "number" || !Number.isSafeInteger(body.turn_number) || body.turn_number < 0 ||
            !isObject(body.payload)) {
          return json({ error: "INVALID_SAVE_SNAPSHOT_PAYLOAD" }, 400, cors);
        }
        if (JSON.stringify(body.payload).length > 8_000_000) {
          return json({ error: "CAMPAIGN_SNAPSHOT_TOO_LARGE" }, 413, cors);
        }
        const { data, error } = await admin.rpc("obsidian_api_save_campaign_snapshot", {
          p_actor: actor,
          p_campaign_id: body.campaign_id,
          p_parent_revision: body.parent_revision,
          p_turn_number: body.turn_number,
          p_payload: body.payload,
        });
        if (error) return json({ error: "CAMPAIGN_SNAPSHOT_SAVE_FAILED", detail: error.message }, 409, cors);
        return json({ ok: true, result: data }, 200, cors);
      }

      case "latest_snapshot": {
        if (!hasOnlyKeys(body, ["action", "campaign_id"]) || typeof body.campaign_id !== "string") {
          return json({ error: "INVALID_LATEST_SNAPSHOT_PAYLOAD" }, 400, cors);
        }
        const { data, error } = await admin.rpc("obsidian_api_get_latest_campaign_snapshot", {
          p_actor: actor,
          p_campaign_id: body.campaign_id,
        });
        if (error) return json({ error: "CAMPAIGN_SNAPSHOT_LOAD_FAILED", detail: error.message }, 404, cors);
        return json({ ok: true, snapshot: data }, 200, cors);
      }

      default:
        return json({ error: "UNKNOWN_ACTION" }, 400, cors);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "INTERNAL_ERROR", detail: message }, 500, cors);
  }
});
