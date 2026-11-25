import { useState } from "react";
import { Cloud, Database, Download, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCloudCampaign, loadCloudCampaign } from "@/lib/obsidian-api";
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

export function CloudCampaignPanel({ worldState }: CloudCampaignPanelProps) {
  const [campaignId, setCampaignId] = useState("");
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<"create" | "bootstrap" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setCampaignId(result.data.campaign.id);
    setNotice("Облачная кампания создана. Её UUID заполнен ниже; локальные данные и игровые ходы не импортировались.");
    setBusy(null);
  }

  async function handleLoadSnapshot() {
    const selectedId = campaignId.trim();
    if (!selectedId) {
      setError("Введи UUID облачной кампании или сначала создай её.");
      return;
    }
    setBusy("bootstrap");
    setError(null);
    setNotice(null);
    const result = await loadCloudCampaign(selectedId);
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
      <div className="flex items-start gap-2.5">
        <Cloud className="mt-0.5 h-5 w-5 text-primary" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Облачная кампания</h2>
          <p className="text-xs text-muted-foreground">
            Введи UUID существующей кампании или создай новую. Загрузка снимка работает только на чтение.
          </p>
        </div>
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

      <div className="space-y-1.5">
        <label htmlFor="cloud-campaign-id" className="text-xs font-medium text-foreground">
          UUID облачной кампании
        </label>
        <Input
          id="cloud-campaign-id"
          value={campaignId}
          onChange={(event) => {
            setCampaignId(event.target.value);
            setSnapshot(null);
            setNotice(null);
          }}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="touch-target font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="touch-target"
          onClick={() => void handleLoadSnapshot()}
          disabled={!campaignId.trim() || busy !== null}
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
