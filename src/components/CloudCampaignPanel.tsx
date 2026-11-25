import { useCallback, useEffect, useState } from "react";
import { Cloud, Database, Download, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createCloudCampaign,
  listCloudCampaigns,
  loadCloudCampaign,
  type ObsidianCampaignRecord,
} from "@/lib/obsidian-api";
import { mapCloudCampaignSettings } from "@/domain/cloud-mappers";
import type { WorldState } from "@/domain/types";

interface CloudCampaignPanelProps {
  worldState: WorldState;
}

const SNAPSHOT_COLLECTIONS = [
  ["sources", "Источники"],
  ["canon_facts", "Факты канона"],
  ["world_state", "Состояние мира"],
  ["player_character_state", "Персонаж"],
  ["npcs", "NPC"],
  ["npc_knowledge", "Знания NPC"],
  ["factions", "Фракции"],
  ["locations", "Локации"],
  ["timeline_events", "События"],
  ["turn_drafts", "Черновики ходов"],
  ["session_log", "Журнал ходов"],
  ["audit_log", "Аудит"],
] as const;

function formatUpdatedAt(value?: string): string {
  if (!value) return "Дата обновления неизвестна";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата обновления неизвестна" : date.toLocaleString();
}

export function CloudCampaignPanel({ worldState }: CloudCampaignPanelProps) {
  const [campaigns, setCampaigns] = useState<ObsidianCampaignRecord[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<"list" | "create" | "bootstrap" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshCampaigns = useCallback(async () => {
    setBusy("list");
    setError(null);
    const result = await listCloudCampaigns();
    if (!result.ok) {
      setError(result.error.message);
      setBusy(null);
      return;
    }
    setCampaigns(result.data.campaigns);
    setSelectedCampaignId((current) =>
      current && result.data.campaigns.some((campaign) => campaign.id === current)
        ? current
        : result.data.campaigns[0]?.id ?? "",
    );
    setBusy(null);
  }, []);

  useEffect(() => {
    void refreshCampaigns();
  }, [refreshCampaigns]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);

  async function handleCreateCampaign() {
    if (!worldState.campaignName.trim()) {
      setError("Сначала укажи название кампании в мастере подготовки.");
      return;
    }
    setBusy("create");
    setError(null);
    setNotice(null);
    setSnapshot(null);
    const result = await createCloudCampaign(
      worldState.campaignName,
      mapCloudCampaignSettings(worldState),
    );
    if (!result.ok) {
      setError(result.error.message);
      setBusy(null);
      return;
    }
    setSelectedCampaignId(result.data.campaign.id);
    setNotice("Облачная кампания создана. Локальные данные и игровые ходы не импортировались.");
    const refreshed = await listCloudCampaigns();
    if (refreshed.ok) setCampaigns(refreshed.data.campaigns);
    setBusy(null);
  }

  async function handleLoadSnapshot() {
    if (!selectedCampaignId) return;
    setBusy("bootstrap");
    setError(null);
    setNotice(null);
    const result = await loadCloudCampaign(selectedCampaignId);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(null);
      return;
    }
    setSnapshot(result.data.snapshot);
    setNotice("Снимок загружен только для просмотра. Локальное состояние не изменено.");
    setBusy(null);
  }

  function collectionCount(key: string): number {
    const value = snapshot?.[key];
    return Array.isArray(value) ? value.length : 0;
  }

  return (
    <section className="panel-surface space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Cloud className="mt-0.5 h-5 w-5 text-primary" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Облачные кампании</h2>
            <p className="text-xs text-muted-foreground">
              Выбор существующей кампании и безопасная загрузка снимка. Синхронизация локальных данных пока отключена.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="touch-target"
          onClick={() => void refreshCampaigns()}
          disabled={busy !== null}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Обновить
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-status-danger/60 bg-status-danger-bg/40 p-3 text-xs text-status-danger">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-md border border-status-verified/40 bg-background/60 p-3 text-xs text-foreground">
          {notice}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Мои облачные кампании</h3>
        {campaigns.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Кампаний не найдено. Создание облачной кампании не импортирует в неё локальные данные.
          </p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => {
                  setSelectedCampaignId(campaign.id);
                  setSnapshot(null);
                  setNotice(null);
                }}
                className={`touch-target w-full rounded-md border p-3 text-left transition-colors ${
                  selectedCampaignId === campaign.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background/50 hover:bg-accent/40"
                }`}
                aria-pressed={selectedCampaignId === campaign.id}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{campaign.title}</span>
                  <span className="mono-code text-[10px] text-muted-foreground">{campaign.status ?? "UNKNOWN"}</span>
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Ход №{campaign.last_confirmed_turn ?? 0} · {formatUpdatedAt(campaign.updated_at)}
                </span>
                <span className="mt-1 block break-all font-mono text-[10px] text-muted-foreground">{campaign.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="touch-target"
          onClick={() => void handleLoadSnapshot()}
          disabled={!selectedCampaignId || busy !== null}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Загрузить снимок (только чтение)
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="touch-target"
          onClick={() => void handleCreateCampaign()}
          disabled={!worldState.campaignName.trim() || busy !== null}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Создать облачную кампанию
        </Button>
      </div>

      {selectedCampaign && (
        <p className="text-[11px] text-muted-foreground">
          Выбрана: <strong className="text-foreground">{selectedCampaign.title}</strong>. Создание новой кампании не меняет эту локальную кампанию.
        </p>
      )}

      {snapshot && (
        <div className="space-y-3 rounded-md border border-border bg-background/50 p-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Содержимое облачного снимка</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SNAPSHOT_COLLECTIONS.map(([key, label]) => (
              <div key={key} className="rounded-md border border-border p-2">
                <span className="block text-[10px] text-muted-foreground">{label}</span>
                <span className="mono-code text-sm font-semibold text-foreground">
                  {collectionCount(key)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Это серверные данные выбранной кампании. Они не объединяются с локальным хранилищем и не перезаписывают его.
          </p>
        </div>
      )}
    </section>
  );
}
