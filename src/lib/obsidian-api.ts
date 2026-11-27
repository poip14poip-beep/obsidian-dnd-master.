import type { BackupEnvelope } from "@/domain/types";
import type { CloudCampaignStateMapping } from "@/domain/cloud-mappers";
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
  campaign_date?: string | null;
  current_location_id?: string | null;
  last_confirmed_turn?: number | null;
  updated_at?: string;
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorFromUnknown(value: unknown, fallback: string): ObsidianApiError {
  if (isRecord(value)) {
    const code = typeof value["error"] === "string" ? value["error"] : "API_ERROR";
    const detail = typeof value["detail"] === "string" ? value["detail"] : undefined;
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

export async function importCloudCampaignState(
  campaignId: string,
  state: CloudCampaignStateMapping,
): Promise<ObsidianApiResult<{ result: Record<string, unknown> }>> {
  if (!isUuid(campaignId.trim())) {
    return {
      ok: false,
      error: { code: "INVALID_CAMPAIGN_ID", message: "Укажи корректный UUID облачной кампании." },
    };
  }
  if (JSON.stringify(state).length > 8_000_000) {
    return {
      ok: false,
      error: { code: "CAMPAIGN_IMPORT_TOO_LARGE", message: "Полное состояние кампании превышает допустимый размер импорта." },
    };
  }
  return callObsidianApi({
    action: "import_campaign_state",
    campaign_id: campaignId.trim(),
    state: state as unknown as Record<string, unknown>,
  });
}

export async function loadCloudCampaign(
  campaignId: string,
): Promise<ObsidianApiResult<{ snapshot: Record<string, unknown> }>> {
  if (!isUuid(campaignId.trim())) {
    return {
      ok: false,
      error: { code: "INVALID_CAMPAIGN_ID", message: "Укажи корректный UUID облачной кампании." },
    };
  }
  return callObsidianApi({ action: "bootstrap", campaign_id: campaignId.trim() });
}

export async function saveCloudTurnDraft(
  campaignId: string,
  draft: ObsidianTurnDraftPayload,
): Promise<ObsidianApiResult<{ draft: ObsidianSavedDraft }>> {
  if (!isUuid(campaignId.trim())) {
    return {
      ok: false,
      error: { code: "INVALID_CAMPAIGN_ID", message: "Укажи корректный UUID облачной кампании." },
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
  if (!isUuid(draftId.trim())) {
    return {
      ok: false,
      error: { code: "INVALID_DRAFT_ID", message: "Укажи корректный UUID черновика." },
    };
  }
  return callObsidianApi({ action: "commit_turn", draft_id: draftId.trim() });
}


export interface ObsidianCloudSnapshotMetadata {
  success?: boolean;
  verified?: boolean;
  idempotent?: boolean;
  snapshot_id?: string;
  revision: number;
  parent_revision: number | null;
  turn_number: number;
  payload_sha256?: string;
  created_at?: string;
}

export interface ObsidianCloudSnapshot {
  found: boolean;
  revision: number;
  snapshot_id?: string;
  parent_revision?: number | null;
  turn_number?: number;
  payload_sha256?: string;
  created_at?: string;
  payload?: Record<string, unknown>;
}

/** Save a complete, checksummed backup envelope as a new append-only cloud revision. */
export async function saveCloudCampaignSnapshot(
  campaignId: string,
  parentRevision: number,
  turnNumber: number,
  payload: Record<string, unknown>,
): Promise<ObsidianApiResult<{ result: ObsidianCloudSnapshotMetadata }>> {
  if (!isUuid(campaignId.trim())) {
    return { ok: false, error: { code: "INVALID_CAMPAIGN_ID", message: "Укажи корректный UUID облачной кампании." } };
  }
  if (!Number.isSafeInteger(parentRevision) || parentRevision < 0 ||
      !Number.isSafeInteger(turnNumber) || turnNumber < 0) {
    return { ok: false, error: { code: "INVALID_SNAPSHOT_REVISION", message: "Некорректная версия или номер игрового хода." } };
  }
  return callObsidianApi({
    action: "save_snapshot",
    campaign_id: campaignId.trim(),
    parent_revision: parentRevision,
    turn_number: turnNumber,
    payload,
  });
}

/** Read the newest append-only cloud backup; no local state is modified. */
export async function loadLatestCloudCampaignSnapshot(
  campaignId: string,
): Promise<ObsidianApiResult<{ snapshot: ObsidianCloudSnapshot }>> {
  if (!isUuid(campaignId.trim())) {
    return { ok: false, error: { code: "INVALID_CAMPAIGN_ID", message: "Укажи корректный UUID облачной кампании." } };
  }
  return callObsidianApi({ action: "latest_snapshot", campaign_id: campaignId.trim() });
}


const CLOUD_CAMPAIGN_LINK_KEY = "obsidian_control::cloud_campaign_link_v1";

export interface CloudCampaignLink {
  campaignId: string;
  revision: number;
}

/** Local pointer only; it contains no campaign data or secrets. */
export function getCloudCampaignLink(): CloudCampaignLink | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLOUD_CAMPAIGN_LINK_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value["campaignId"] !== "string" ||
        !isUuid(value["campaignId"]) || !Number.isSafeInteger(value["revision"]) ||
        Number(value["revision"]) < 0) return null;
    return { campaignId: value["campaignId"], revision: Number(value["revision"]) };
  } catch {
    return null;
  }
}

export function setCloudCampaignLink(link: CloudCampaignLink | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!link) window.localStorage.removeItem(CLOUD_CAMPAIGN_LINK_KEY);
    else window.localStorage.setItem(CLOUD_CAMPAIGN_LINK_KEY, JSON.stringify(link));
  } catch {
    // The campaign still works locally; the UI reports cloud-link persistence failures separately.
  }
}


export type LinkedCloudSnapshotResult =
  | { ok: true; skipped: true }
  | { ok: true; skipped: false; revision: number; turnNumber: number; payloadSha256: string }
  | { ok: false; error: ObsidianApiError };

/**
 * Append a complete backup after a locally committed game turn.
 * Optimistic revision checks prevent one device from silently overwriting a
 * newer save made by another device. No linked campaign means local-only mode.
 */
export async function saveLinkedCloudSnapshot(
  payload: BackupEnvelope,
): Promise<LinkedCloudSnapshotResult> {
  const link = getCloudCampaignLink();
  if (!link) return { ok: true, skipped: true };

  const latest = await loadLatestCloudCampaignSnapshot(link.campaignId);
  if (!latest.ok) return { ok: false, error: latest.error };
  const remote = latest.data.snapshot;
  const remoteRevision = remote.found ? remote.revision : 0;
  if (remoteRevision !== link.revision) {
    const remoteChecksums = remote.payload?.["checksums"];
    const sameChecksums = typeof remoteChecksums === "object" && remoteChecksums !== null &&
      !Array.isArray(remoteChecksums) &&
      Object.keys(remoteChecksums).length === Object.keys(payload.checksums).length &&
      Object.entries(payload.checksums).every(([key, value]) =>
        (remoteChecksums as Record<string, unknown>)[key] === value
      );
    const sameCommittedState = remote.found &&
      remote.turn_number === payload.collections.session_log.lastTurnNumber &&
      sameChecksums;
    if (sameCommittedState) {
      // The previous request may have reached the server even if its response was lost.
      // Adopt that already-verified revision instead of creating a duplicate checkpoint.
      const currentLink = getCloudCampaignLink();
      if (currentLink?.campaignId !== link.campaignId || currentLink.revision !== link.revision) {
        return { ok: true, skipped: true };
      }
      setCloudCampaignLink({ campaignId: link.campaignId, revision: remoteRevision });
      return {
        ok: true,
        skipped: false,
        revision: remoteRevision,
        turnNumber: remote.turn_number ?? payload.collections.session_log.lastTurnNumber,
        payloadSha256: remote.payload_sha256 ?? "",
      };
    }
    return {
      ok: false,
      error: {
        code: "CLOUD_REVISION_CONFLICT",
        message: "В облаке уже есть другая версия кампании. Синхронизация остановлена, чтобы не затереть сохранение с другого устройства. Открой настройки, загрузи последнее сохранение и восстанови его перед продолжением.",
      },
    };
  }

  const turnNumber = payload.collections.session_log.lastTurnNumber;
  const saved = await saveCloudCampaignSnapshot(
    link.campaignId,
    link.revision,
    turnNumber,
    payload as unknown as Record<string, unknown>,
  );
  if (!saved.ok) return { ok: false, error: saved.error };
  const metadata = saved.data.result;
  const currentLink = getCloudCampaignLink();
  if (currentLink?.campaignId !== link.campaignId || currentLink.revision !== link.revision) {
    return { ok: true, skipped: true };
  }
  setCloudCampaignLink({ campaignId: link.campaignId, revision: metadata.revision });
  return {
    ok: true,
    skipped: false,
    revision: metadata.revision,
    turnNumber: metadata.turn_number,
    payloadSha256: metadata.payload_sha256 ?? "",
  };
}
