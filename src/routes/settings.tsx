import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Download, Lock, Upload } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки кампании — Obsidian Control" },
      {
        name: "description",
        content: "Мастер подготовки кампании, блокировка старта и резервное копирование JSON.",
      },
      { property: "og:title", content: "Настройки кампании — Obsidian Control" },
      {
        property: "og:description",
        content: "Мастер подготовки кампании, блокировка старта и резервное копирование JSON.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const {
    sources,
    worldState,
    character,
    updateCampaignParameters,
    confirmCampaignSetup,
    exportBackupJson,
    importBackupJson,
  } = useObsidianStore();

  const [campaignName, setCampaignName] = useState(worldState.campaignName);
  const [calendarSystem, setCalendarSystem] = useState(worldState.calendarSystem);
  const [startInGameDate, setStartInGameDate] = useState(worldState.startInGameDate);
  const [startLocationName, setStartLocationName] = useState(worldState.startLocationName);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setCampaignName(worldState.campaignName);
    setCalendarSystem(worldState.calendarSystem);
    setStartInGameDate(worldState.startInGameDate);
    setStartLocationName(worldState.startLocationName);
  }, [worldState]);

  function handleSaveParams() {
    const res = updateCampaignParameters({
      campaignName: campaignName.trim(),
      calendarSystem: calendarSystem.trim() || "UNKNOWN",
      startInGameDate: startInGameDate.trim() || "UNKNOWN",
      startLocationName: startLocationName.trim() || "UNKNOWN",
    });
    if (res.ok) {
      toast.success("Параметры подготовки сохранены.");
    } else {
      toast.error(res.error);
    }
  }

  function toggleStep(
    key:
      | "sourcesConfirmed"
      | "parametersConfirmed"
      | "startPointConfirmed"
      | "characterConfirmed"
      | "noAutoImportAcknowledged",
    checked: boolean,
  ) {
    updateCampaignParameters({
      campaignName: campaignName.trim() || worldState.campaignName,
      calendarSystem: calendarSystem.trim() || worldState.calendarSystem,
      startInGameDate: startInGameDate.trim() || worldState.startInGameDate,
      startLocationName: startLocationName.trim() || worldState.startLocationName,
      setupPatch: { [key]: checked },
    });
  }

  function handleConfirmSetup() {
    // Save current input values first, then confirm
    updateCampaignParameters({
      campaignName: campaignName.trim() || worldState.campaignName,
      calendarSystem: calendarSystem.trim() || worldState.calendarSystem,
      startInGameDate: startInGameDate.trim() || worldState.startInGameDate,
      startLocationName: startLocationName.trim() || worldState.startLocationName,
    });
    const res = confirmCampaignSetup();
    if (res.ok) {
      toast.success("Подготовка кампании подтверждена! Раздел «Ходы и журнал» разблокирован.");
    } else {
      toast.error(res.error);
    }
  }

  function handleExportBackup() {
    const envelope = exportBackupJson();
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `obsidian-control-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Резервная копия JSON сформирована и выгружена.");
  }

  async function handleImportBackup(e: ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = importBackupJson(text);
    if (res.ok) {
      toast.success("Резервная копия проверена, импортирована и подтверждена обратным чтением.");
    } else {
      setImportError(res.error);
      toast.error(res.error);
    }
    e.target.value = "";
  }

  const s = worldState.setup;
  const checkedSteps = [
    s.sourcesConfirmed,
    s.parametersConfirmed,
    s.startPointConfirmed,
    s.noAutoImportAcknowledged,
    s.characterConfirmed,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-foreground">Настройки кампании</h1>
        <p className="text-xs text-muted-foreground">
          Мастер подготовки кампании (обязателен до начала игры) и резервное копирование JSON.
        </p>
      </header>

      {/* Setup Wizard */}
      <section className="panel-surface space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {s.confirmed ? (
              <CheckCircle2 className="h-5 w-5 text-status-verified" />
            ) : (
              <Lock className="h-5 w-5 text-status-approx" />
            )}
            <h2 className="text-base font-semibold text-foreground">Мастер подготовки кампании</h2>
          </div>
          <span className="mono-code text-xs text-muted-foreground">
            {s.confirmed ? "ПОДТВЕРЖДЁН" : `Чек-лист: ${checkedSteps}/5 · СТАРТ ЗАБЛОКИРОВАН`}
          </span>
        </div>

        {/* Step 1: Sources */}
        <div className="space-y-2 rounded-md border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Шаг 1. Подтверждение раздельных источников
            </h3>
            <Link to="/sources" className="text-xs text-primary underline">
              Открыть источники
            </Link>
          </div>
          <p className="text-[11px] text-muted-foreground">Для фактического запуска ОБСИДИАН 4.1 и Хроника Экдрасиля должны быть прикреплены. Досье Лии или другого персонажа остаётся отдельным источником и не переносится в канон мира.</p>\n          <ul className="space-y-1 text-xs text-muted-foreground">
            {sources.slice(0, 3).map((src) => (
              <li key={src.id}>
                • <strong className="text-foreground">{src.title}</strong> ({src.targetPartition}) —{" "}
                {src.contentStatus === "ATTACHED" ? "файл загружен" : "не прикреплён"}
              </li>
            ))}
          </ul>
          <label className="touch-target flex cursor-pointer items-center gap-2.5 text-xs text-foreground">
            <Checkbox
              checked={s.sourcesConfirmed}
              disabled={s.confirmed}
              onCheckedChange={(v) => toggleStep("sourcesConfirmed", v === true)}
            />
            <span>Подтверждаю роли и разделение источников (ОБСИДИАН 4.1 / Хроника / Досье)</span>
          </label>
        </div>

        {/* Step 2: Parameters */}
        <div className="space-y-2.5 rounded-md border border-border bg-background/50 p-3">
          <h3 className="text-sm font-semibold text-foreground">Шаг 2. Параметры кампании</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cfg-name">Название кампании</Label>
              <Input
                id="cfg-name"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cfg-cal">Календарная система</Label>
              <Input
                id="cfg-cal"
                value={calendarSystem}
                onChange={(e) => setCalendarSystem(e.target.value)}
                placeholder="Например: Календарь Экдрасиля"
                className="touch-target"
              />
            </div>
          </div>
          <label className="touch-target flex cursor-pointer items-center gap-2.5 text-xs text-foreground">
            <Checkbox
              checked={s.parametersConfirmed}
              disabled={s.confirmed}
              onCheckedChange={(v) => toggleStep("parametersConfirmed", v === true)}
            />
            <span>Подтверждаю параметры кампании и правила D&D 5e (2024) · ОБСИДИАН 4.1</span>
          </label>
        </div>

        {/* Step 3: Start point & date */}
        <div className="space-y-2.5 rounded-md border border-border bg-background/50 p-3">
          <h3 className="text-sm font-semibold text-foreground">
            Шаг 3. Явная стартовая точка и дата
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cfg-date">Стартовая внутриигровая дата (не UNKNOWN)</Label>
              <Input
                id="cfg-date"
                value={startInGameDate}
                onChange={(e) => setStartInGameDate(e.target.value)}
                placeholder="Например: День 1, 08:00"
                disabled={s.confirmed}
                className="touch-target mono-code"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cfg-loc">Стартовая локация (не UNKNOWN)</Label>
              <Input
                id="cfg-loc"
                value={startLocationName}
                onChange={(e) => setStartLocationName(e.target.value)}
                placeholder="Укажите стартовую локацию вручную"
                disabled={s.confirmed}
                className="touch-target"
              />
            </div>
          </div>
          <label className="touch-target flex cursor-pointer items-center gap-2.5 text-xs text-foreground">
            <Checkbox
              checked={s.startPointConfirmed}
              disabled={s.confirmed}
              onCheckedChange={(v) => toggleStep("startPointConfirmed", v === true)}
            />
            <span>Подтверждаю стартовую дату и локацию начала кампании</span>
          </label>
          <label className="touch-target flex cursor-pointer items-center gap-2.5 text-xs text-foreground">
            <Checkbox
              checked={s.noAutoImportAcknowledged}
              disabled={s.confirmed}
              onCheckedChange={(v) => toggleStep("noAutoImportAcknowledged", v === true)}
            />
            <span>
              Подтверждаю: старые ходы, стартовая точка и локация НЕ импортировались автоматически
            </span>
          </label>
        </div>

        {/* Step 4: Isolated Player Character */}
        <div className="space-y-2 rounded-md border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Шаг 4. Отдельный лист персонажа (PLAYER_CHARACTER_STATE)
            </h3>
            <Link to="/character" className="text-xs text-primary underline">
              Открыть лист
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Персонаж: <strong className="text-foreground">{character.name}</strong> · Класс/вид:{" "}
            {character.speciesAndClass} · Статус параметров: {character.statsCertainty}. Контур
            player_character_state изолирован от world_state. Перед стартом имя должно быть
            заполнено (не UNKNOWN).
          </p>
          <label className="touch-target flex cursor-pointer items-center gap-2.5 text-xs text-foreground">
            <Checkbox
              checked={s.characterConfirmed}
              disabled={s.confirmed}
              onCheckedChange={(v) => toggleStep("characterConfirmed", v === true)}
            />
            <span>Подтверждаю отдельный лист персонажа PLAYER_CHARACTER_STATE</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="touch-target"
            onClick={handleSaveParams}
          >
            Сохранить поля
          </Button>
          {!s.confirmed && (
            <Button type="button" className="touch-target" onClick={handleConfirmSetup}>
              Подтвердить подготовку и разблокировать игру
            </Button>
          )}
        </div>
      </section>

      {/* JSON Backup / Restore */}
      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-base font-semibold text-foreground">Резервная копия JSON</h2>
        <p className="text-xs text-muted-foreground">
          Экспорт и импорт всех 11 раздельных коллекций с контрольными суммами. Локальное хранилище
          браузера не является надёжным облачным сохранением — делайте резервные копии вручную.
        </p>
        {importError && (
          <div
            role="alert"
            className="rounded border border-status-danger/60 bg-status-danger-bg/50 p-3 text-xs text-status-danger"
          >
            {importError}
          </div>
        )}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="secondary"
            className="touch-target"
            onClick={handleExportBackup}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Экспортировать JSON
          </Button>
          <label className="touch-target inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
            <Upload className="mr-1.5 h-4 w-4" />
            Импортировать JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              className="sr-only"
            />
          </label>
        </div>
      </section>
    </div>
  );
}