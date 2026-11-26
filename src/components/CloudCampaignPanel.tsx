import { useEffect, useState } from "react";
import { Cloud, Database, Download, Plus, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { mapCloudCampaignSettings } from "@/domain/cloud-mappers";
import type { BackupEnvelope, WorldState } from "@/domain/types";
import type { PersistVerifyResult } from "@/domain/storage";
import {
  createCloudCampaign,
  getCloudCampaignLink,
  loadLatestCloudCampaignSnapshot,
  saveCloudCampaignSnapshot,
  setCloudCampaignLink,
  type ObsidianCloudSnapshot,
} from "@/lib/obsidian-api";

interface CloudCampaignPanelProps {
  worldState: WorldState;
  exportBackupJson: () => BackupEnvelope;
  importBackupJson: (rawJson: string) => PersistVerifyResult;
}

function downloadLocalBackup(envelope: BackupEnvelope) {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `obsidian-local-before-cloud-restore-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CloudCampaignPanel({
  worldState,
  exportBackupJson,
  importBackupJson,
}: CloudCampaignPanelProps) {
  const [campaignId, setCampaignId] = useState("");
  const [revision, setRevision] = useState(0);
  const [canSave, setCanSave] = useState(false);
  const [latest, setLatest] = useState<ObsidianCloudSnapshot | null>(null);
  const [restoreAcknowledged, setRestoreAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"create" | "load" | "save" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const link = getCloudCampaignLink();
    if (link) {
      setCampaignId(link.campaignId);
      setRevision(link.revision);
      setCanSave(true);
    }
  }, []);

  function updateCampaignId(value: string) {
    setCampaignId(value);
    setRevision(0);
    setCanSave(false);
    setLatest(null);
    setRestoreAcknowledged(false);
    setNotice(null);
    setError(null);
    setCloudCampaignLink(value.trim() ? { campaignId: value.trim(), revision: 0 } : null);
  }

  async function handleCreateCampaign() {
    if (!worldState.campaignName.trim()) {
      setError("Сначала укажи название кампании в мастере подготовки.");
      return;
    }
    setBusy("create");
    setError(null);
    setNotice(null);
    setLatest(null);
    const result = await createCloudCampaign(
      worldState.campaignName,
      mapCloudCampaignSettings(worldState),
    );
    if (!result.ok) {
      setError(result.error.message);
      setBusy(null);
      return;
    }
    const id = result.data.campaign.id;
    setCampaignId(id);
    setRevision(0);
    setCanSave(true);
    setCloudCampaignLink({ campaignId: id, revision: 0 });
    setNotice("Облачная кампания создана. Теперь можно сохранить в неё полный снимок текущего состояния.");
    setBusy(null);
  }

  async function handleLoadLatest() {
    const id = campaignId.trim();
    if (!id) {
      setError("Введи UUID облачной кампании или сначала создай её.");
      return;
    }
    setBusy("load");
    setError(null);
    setNotice(null);
    setRestoreAcknowledged(false);
    const result = await loadLatestCloudCampaignSnapshot(id);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(null);
      return;
    }
    const snapshot = result.data.snapshot;
    setLatest(snapshot);
    setRevision(snapshot.revision);
    setCanSave(!snapshot.found);
    if (!snapshot.found) setCloudCampaignLink({ campaignId: id, revision: 0 });
    if (!snapshot.found || !snapshot.payload) {
      setNotice("В облачной кампании пока нет резервных снимков. Текущую локальную кампанию можно сохранить как первый снимок.");
    } else {
      setNotice(`Найден снимок №${snapshot.revision}, игровой ход ${snapshot.turn_number ?? 0}. Он загружен только для просмотра; локальные данные пока не изменены.`);
    }
    setBusy(null);
  }

  async function handleSaveSnapshot() {
    const id = campaignId.trim();
    if (!id) {
      setError("Сначала создай облачную кампанию или укажи её UUID.");
      return;
    }
    if (!canSave) {
      setError("Сначала восстанови последнее облачное сохранение на этом устройстве. Это защищает от перезаписи состояния другой версии кампании.");
      return;
    }
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      // Never overwrite a newer remote checkpoint that this browser has not loaded.
      const latestResult = await loadLatestCloudCampaignSnapshot(id);
      if (!latestResult.ok) throw new Error(latestResult.error.message);
      const remote = latestResult.data.snapshot;
      if (remote.found && remote.revision !== revision) {
        setLatest(remote);
        setRevision(remote.revision);
        setCanSave(false);
        throw new Error("В облаке есть более новая версия. Сначала загрузи её и восстанови локальное состояние; перезапись без сверки запрещена.");
      }
      if (!remote.found && revision !== 0) {
        throw new Error("Облачная версия не найдена, хотя локальная ссылка ожидает сохранённый снимок. Проверь UUID кампании.");
      }
      const envelope = exportBackupJson();
      const turnNumber = envelope.collections.session_log.lastTurnNumber;
      const saved = await saveCloudCampaignSnapshot(
        id,
        revision,
        turnNumber,
        envelope as unknown as Record<string, unknown>,
      );
      if (!saved.ok) throw new Error(saved.error.message);
      const metadata = saved.data.result;
      setRevision(metadata.revision);
      setCloudCampaignLink({ campaignId: id, revision: metadata.revision });
      setCanSave(true);
      setNotice(`Снимок №${metadata.revision} сохранён и проверен обратным чтением. Игровой ход: ${metadata.turn_number}. SHA-256: ${metadata.payload_sha256 ?? "—"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить облачный снимок.");
    } finally {
      setBusy(null);
    }
  }

  function handleRestoreLatest() {
    if (!latest?.found || !latest.payload || !restoreAcknowledged) return;
    setBusy("restore");
    setError(null);
    setNotice(null);
    try {
      // Protect the current browser state before replacing all local collections.
      downloadLocalBackup(exportBackupJson());
      const result = importBackupJson(JSON.stringify(latest.payload));
      if (!result.ok) throw new Error(result.error);
      setCloudCampaignLink({ campaignId, revision: latest.revision });
      setCanSave(true);
      setNotice(`Снимок №${latest.revision} восстановлен. Локальные коллекции прошли проверку и обратное чтение. Перед восстановлением скачана резервная копия прежнего состояния.`);
      setRestoreAcknowledged(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось восстановить облачный снимок.");
    } finally {
      setBusy(null);
    }
  }

  const hasRestorableSnapshot = Boolean(latest?.found && latest.payload);

  return (
    <section className="panel-surface space-y-4 p-4">
      <div className="flex items-start gap-2.5">
        <Cloud className="mt-0.5 h-5 w-5 text-primary" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Облачные сохранения кампании</h2>
          <p className="text-xs text-muted-foreground">
            Полные снимки всех 11 локальных коллекций. Каждая версия неизменяема, получает SHA-256 и проверяется обратным чтением на сервере.
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
          onChange={(event) => updateCampaignId(event.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="touch-target font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mono-code text-[10px] text-muted-foreground">Текущая облачная ревизия: {revision}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" className="touch-target" onClick={() => void handleCreateCampaign()} disabled={!worldState.campaignName.trim() || busy !== null}>
          <Plus className="mr-1.5 h-4 w-4" /> Создать облачную кампанию
        </Button>
        <Button type="button" variant="secondary" className="touch-target" onClick={() => void handleLoadLatest()} disabled={!campaignId.trim() || busy !== null}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Загрузить последнее сохранение
        </Button>
        <Button type="button" variant="secondary" className="touch-target" onClick={() => void handleSaveSnapshot()} disabled={!campaignId.trim() || !canSave || busy !== null}>
          <Save className="mr-1.5 h-4 w-4" /> Сохранить текущую кампанию
        </Button>
      </div>

      {hasRestorableSnapshot && (
        <div className="space-y-3 rounded-md border border-border bg-background/50 p-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Найденное облачное сохранение</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SnapshotField label="Ревизия" value={String(latest?.revision ?? 0)} />
            <SnapshotField label="Игровой ход" value={String(latest?.turn_number ?? 0)} />
            <SnapshotField label="Создано" value={latest?.created_at ? new Date(latest.created_at).toLocaleString("ru-RU") : "—"} />
          </div>
          <p className="break-all font-mono text-[10px] text-muted-foreground">SHA-256: {latest?.payload_sha256 ?? "—"}</p>
          <label className="flex items-start gap-2 text-xs text-foreground">
            <Checkbox checked={restoreAcknowledged} onCheckedChange={(value) => setRestoreAcknowledged(value === true)} />
            <span>Я понимаю, что восстановление заменит все 11 локальных коллекций данными облачного снимка. Перед заменой будет скачана резервная копия текущего состояния.</span>
          </label>
          <Button type="button" variant="destructive" className="touch-target w-full" onClick={handleRestoreLatest} disabled={!restoreAcknowledged || busy !== null}>
            <Download className="mr-1.5 h-4 w-4" /> Восстановить эту версию на устройстве
          </Button>
        </div>
      )}
    </section>
  );
}

function SnapshotField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <span className="block text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}
