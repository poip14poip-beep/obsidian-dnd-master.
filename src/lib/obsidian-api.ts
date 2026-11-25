import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAuthClient } from "@/lib/supabase-auth";

export interface ObsidianApiError {
  code: string;
  message: string;
  detail?: string;
}

export type ObsidianApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ObsidianApiError };

export interface ObsidianCampaignRecord {
  id: string;
  title: string;
  status?: string;
  settings?: Record<string, unknown>;
}

export interface ObsidianTurnDraftPayload {
  id?: string;
  proposed_turn?: number | null;
  player_action: string;
  gm_resolution: string;
  pending_changes?: Record<string, unknown>;
  status?: "draft" | "ready_to_commit";
}

export interface ObsidianSavedDraft {
  id: string;
  campaign_id: string;
  proposed_turn: number | null;
  status: string;
}

export interface ObsidianCommitResult {
  turn_number?: number;
  session_log_id?: string;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorFromUnknown(value: unknown, fallback: string): ObsidianApiError {
  if (isRecord(value)) {
    const code = typeof value["error"] === "string" ? value.error : "API_ERROR";
    const detail = typeof value["detail"] === "string" ? value.detail : undefined;
    return {
      code,
      message: detail || code || fallback,
      ...(detail ? { detail } : {}),
    };
  }
  return { code: "API_ERROR", message: fallback };
}

async function invoke<T>(
  client: SupabaseClient,
  body: Record<string, unknown>,
): Promise<ObsidianApiResult<T>> {
  const { data, error } = await client.functions.invoke<unknown>("obsidian-api", { body });

  if (error) {
    let responseBody: unknown;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        responseBody = await context.clone().json();
      } catch {
        responseBody = undefined;
      }
    }
    const apiError = errorFromUnknown(responseBody, error.message);
    return {
      ok: false,
      error: {
        ...apiError,
        message: apiError.detail || error.message || apiError.message,
      },
    };
  }

  if (!isRecord(data) || data["ok"] !== true) {
    return {
      ok: false,
      error: errorFromUnknown(data, "Сервер вернул некорректный ответ obsidian-api."),
    };
  }

  return { ok: true, data: data as T };
}

async function getClient(): Promise<
  | { ok: true; client: SupabaseClient }
  | { ok: false; error: ObsidianApiError }
> {
  const { client, envResult } = getSupabaseAuthClient();
  if (!envResult.ok || !client) {
    return {
      ok: false,
      error: {
        code: "SUPABASE_NOT_CONFIGURED",
        message: envResult.ok ? "Клиент Supabase не готов." : envResult.error,
      },
    };
  }

  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    return {
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Для облачного действия требуется активная сессия пользователя.",
        ...(error ? { detail: error.message } : {}),
      },
    };
  }

  return { ok: true, client };
}

/**
 * Calls the authenticated Supabase Edge Function. The actor/owner is always
 * derived server-side from the verified JWT; callers must never send owner_id.
 */
export async function callObsidianApi<T>(
  body: Record<string, unknown>,
): Promise<ObsidianApiResult<T>> {
  const clientResult = await getClient();
  if (!clientResult.ok) return clientResult;
  return invoke<T>(clientResult.client, body);
}

export async function createCloudCampaign(
  title: string,
  settings: Record<string, unknown> = {},
): Promise<ObsidianApiResult<{ campaign: ObsidianCampaignRecord }>> {
  if (!title.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_TITLE", message: "Название кампании не может быть пустым." },
    };
  }
  return callObsidianApi({ action: "create_campaign", title: title.trim(), settings });
}

export async function loadCloudCampaign(
  campaignId: string,
): Promise<ObsidianApiResult<{ snapshot: Record<string, unknown> }>> {
  if (!campaignId.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_CAMPAIGN_ID", message: "Не указан идентификатор кампании." },
    };
  }
  return callObsidianApi({ action: "bootstrap", campaign_id: campaignId });
}

export async function saveCloudTurnDraft(
  campaignId: string,
  draft: ObsidianTurnDraftPayload,
): Promise<ObsidianApiResult<{ draft: ObsidianSavedDraft }>> {
  if (!campaignId.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_CAMPAIGN_ID", message: "Не указан идентификатор кампании." },
    };
  }
  if (!draft.player_action.trim() || !draft.gm_resolution.trim()) {
    return {
      ok: false,
      error: {
        code: "INVALID_DRAFT",
        message: "Черновик должен содержать действие игрока и разрешение мастера.",
      },
    };
  }
  return callObsidianApi({ action: "save_draft", campaign_id: campaignId, draft });
}

export async function commitCloudTurn(
  draftId: string,
): Promise<ObsidianApiResult<{ result: ObsidianCommitResult }>> {
  if (!draftId.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_DRAFT_ID", message: "Не указан идентификатор черновика." },
    };
  }
  return callObsidianApi({ action: "commit_turn", draft_id: draftId });
}
