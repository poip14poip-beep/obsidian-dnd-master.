import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  ScrollText,
  ShieldCheck,
  Swords,
  SlidersHorizontal,
  User,
  Users,
} from "lucide-react";

import { CertaintyBadge, SetupGateBanner } from "@/components/StatusPill";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Обзор — Obsidian Control" },
      {
        name: "description",
        content: "Сводка состояния симуляции кампании D&D 5e (2024) по ОБСИДИАН 4.1.",
      },
      { property: "og:title", content: "Обзор — Obsidian Control" },
      {
        property: "og:description",
        content: "Сводка состояния симуляции кампании D&D 5e (2024) по ОБСИДИАН 4.1.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const {
    sources,
    canonFacts,
    worldState,
    character,
    npcs,
    factions,
    locations,
    timelineEvents,
    sessionLog,
    lastIntegrityReport,
    lastStorageError,
  } = useObsidianStore();

  const attachedSources = sources.filter((s) => s.contentStatus === "ATTACHED").length;
  const currentLocation = locations.find((l) => l.id === worldState.currentLocationId);
  const activeDelayed = timelineEvents.filter((e) => e.status === "SCHEDULED").length;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="mono-code text-xs uppercase tracking-wider text-primary">
          ОБСИДИАН 4.1 · D&D 5e (2024)
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {worldState.campaignName.trim() || "Кампания не названа (UNKNOWN)"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Строгая симуляция живого мира: 11 раздельных локальных коллекций без облачной
          синхронизации и без выдуманного стартового состояния.
        </p>
      </header>

      <Link to="/play" className="panel-surface flex items-center justify-between gap-3 border-primary/40 p-4 hover:bg-accent">
        <span><strong className="block text-sm text-foreground">Играть в Экдрасиль</strong><span className="text-xs text-muted-foreground">Выбрать досье или создать случайного персонажа · предварительная проверка</span></span>
        <span className="text-sm font-semibold text-primary">Начать →</span>
      </Link>

      {lastStorageError && (
        <div
          role="alert"
          className="panel-surface flex items-start gap-3 border-status-danger/60 bg-status-danger-bg/50 p-3.5 text-sm text-status-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{lastStorageError}</span>
        </div>
      )}

      <SetupGateBanner confirmed={worldState.setup.confirmed} />

      <div className="panel-surface border-border/80 bg-surface-elevated/60 px-3.5 py-2.5 text-xs text-muted-foreground">
        <strong className="text-foreground">Локальное хранилище браузера:</strong> данные
        сохраняются только на этом устройстве (localStorage) с read-back сверкой. Это не облачное
        сохранение — для защиты от очистки браузера экспортируйте JSON в «Настройках кампании».
      </div>

      {/* Separated partition cards */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="panel-surface space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="mono-code text-xs font-semibold text-primary">world_state</span>
            <span className="mono-code text-xs text-muted-foreground">
              v{worldState.stateVersion}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Текущая дата мира</dt>
              <dd className="mono-code mt-0.5 font-medium text-foreground">
                {worldState.currentInGameDate}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Текущая локация</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {currentLocation?.name ?? worldState.startLocationName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Игровых ходов</dt>
              <dd className="mono-code mt-0.5 font-medium text-foreground">
                {sessionLog.lastTurnNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Отложенных событий</dt>
              <dd className="mono-code mt-0.5 font-medium text-foreground">{activeDelayed}</dd>
            </div>
          </dl>
        </div>

        <div className="panel-surface space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="mono-code text-xs font-semibold text-layer-player">
              player_character_state
            </span>
            <span className="mono-code text-xs text-muted-foreground">
              изолирован · v{character.stateVersion}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">{character.name}</p>
              <p className="text-xs text-muted-foreground">{character.speciesAndClass}</p>
            </div>
            <CertaintyBadge status={character.statsCertainty} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded bg-secondary/70 p-2">
              <dt className="text-muted-foreground">HP</dt>
              <dd className="mono-code mt-0.5 text-sm font-semibold text-foreground">
                {character.hpCurrent !== null
                  ? `${character.hpCurrent}/${character.hpMax ?? "?"}`
                  : "UNKNOWN"}
              </dd>
            </div>
            <div className="rounded bg-secondary/70 p-2">
              <dt className="text-muted-foreground">КД (AC)</dt>
              <dd className="mono-code mt-0.5 text-sm font-semibold text-foreground">
                {character.armorClass ?? "UNKNOWN"}
              </dd>
            </div>
            <div className="rounded bg-secondary/70 p-2">
              <dt className="text-muted-foreground">Предметов</dt>
              <dd className="mono-code mt-0.5 text-sm font-semibold text-foreground">
                {character.inventory.length}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Integrity strip */}
      <section className="panel-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {lastIntegrityReport?.ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-status-verified" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-status-danger" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {lastIntegrityReport?.ok
                ? "Целостность контуров подтверждена (локальное хранилище)"
                : "Требуется проверка целостности"}
            </p>
            <p className="text-xs text-muted-foreground">
              Источников загружено: {attachedSources}/{sources.length} · Фактов: {canonFacts.length}{" "}
              · NPC: {npcs.length} · Фракций: {factions.length}
            </p>
          </div>
        </div>
        <Link
          to="/audit"
          className="touch-target inline-flex items-center justify-center rounded-md border border-border bg-secondary px-3.5 py-2 text-xs font-medium text-secondary-foreground hover:bg-accent"
        >
          Открыть аудит
        </Link>
      </section>

      {/* Fast mobile jump grid */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <QuickTile
          to="/sources"
          icon={FileText}
          label="Источники"
          count={`${attachedSources}/${sources.length}`}
        />
        <QuickTile
          to="/canon"
          icon={BookOpen}
          label="Канон и факты"
          count={`${canonFacts.length}`}
        />
        <QuickTile
          to="/character"
          icon={User}
          label="Лист персонажа"
          count={character.statsCertainty}
        />
        <QuickTile to="/npcs" icon={Users} label="Реестр NPC" count={`${npcs.length}`} />
        <QuickTile
          to="/time-map"
          icon={Clock}
          label="Время и карта"
          count={`${locations.length} лок.`}
        />
        <QuickTile
          to="/game"
          icon={Swords}
          label={worldState.setup.confirmed ? "Продолжить игру" : "Подготовить игру"}
          count={worldState.setup.confirmed ? `Ход #${sessionLog.lastTurnNumber + 1}` : "СТАРТ ЗАБЛОКИРОВАН"}
        />
        <QuickTile
          to="/turns"
          icon={ScrollText}
          label="Ходы и журнал"
          count={`#${sessionLog.lastTurnNumber}`}
        />
        <QuickTile
          to="/audit"
          icon={ShieldCheck}
          label="Проверка/аудит"
          count={lastIntegrityReport?.ok ? "OK" : "CHECK"}
        />
        <QuickTile
          to="/settings"
          icon={SlidersHorizontal}
          label="Мастер и JSON"
          count={worldState.setup.confirmed ? "ГОТОВ" : "БЛОК"}
        />
      </section>
    </div>
  );
}

function QuickTile({
  to,
  icon: Icon,
  label,
  count,
}: {
  to:
    | "/sources"
    | "/canon"
    | "/character"
    | "/npcs"
    | "/time-map"
    | "/turns"
    | "/game"
    | "/audit"
    | "/settings";
  icon: typeof FileText;
  label: string;
  count: string;
}) {
  return (
    <Link
      to={to}
      className="panel-surface touch-target flex flex-col justify-between gap-2 p-3.5 transition-colors hover:border-primary/50 hover:bg-surface-elevated"
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="mono-code text-[11px] text-primary">{count}</span>
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </Link>
  );
}