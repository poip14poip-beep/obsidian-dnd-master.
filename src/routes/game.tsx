import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Backpack, BookOpen, CheckCircle2, ClipboardList, Cloud, Lock, RefreshCw, Send, ShieldCheck, Sparkles, Swords, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatArchivedGameMasterAnswer,
  formatCampaignOpening,
  formatGameMasterAnswer,
} from "@/domain/game-master-presentation";
import { resolvePlayerAction, type GameMasterTurn } from "@/domain/game-master";
import type { GameTurnEntry, TechnicalMessageEntry } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: "Игровой чат — Obsidian Control" },
      { name: "description", content: "Игровой чат мастера ОБСИДИАН 4.1 для кампании D&D 5e (2024)." },
    ],
  }),
  component: GamePage,
});

function GamePage() {
  const {
    sources, worldState, character, canonFacts, npcs, factions, locations, timelineEvents,
    sessionLog, turnDraft, updateTurnDraft, checkTurnDraft, commitTurnDraft, saveOpeningScene, lastStorageError,
    cloudSyncStatus, cloudSyncMessage, retryCloudSnapshot,
  } = useObsidianStore();

  const { session } = useAuth();
  const gmModel = "obsidian-free";
  const [opening, setOpening] = useState(worldState.openingScene ?? "");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openingAttempted, setOpeningAttempted] = useState(false);
  const [playerAction, setPlayerAction] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [gmBusy, setGmBusy] = useState(false);
  const [gmError, setGmError] = useState<string | null>(null);
  const [gmTurn, setGmTurn] = useState<GameMasterTurn | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [pendingRollResult, setPendingRollResult] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const [explicitConfirm, setExplicitConfirm] = useState(false);
  const [openingCommitStage, setOpeningCommitStage] = useState<"CHECK" | "COMMIT" | null>(null);
  const [activePanel, setActivePanel] = useState<"chat" | "inventory" | "quests" | "knowledge">("chat");

  const nextTurnNumber = sessionLog.lastTurnNumber + 1;
  const requiredSourceTypes = character.sourceDossierId === "GENERATED_RANDOM" ? ["GOVERNING_DOC", "WORLD_CANON"] as const : ["GOVERNING_DOC", "WORLD_CANON", "PLAYER_DOSSIER"] as const;
  const verifiedCoreSourcesReady = requiredSourceTypes.every((type) =>
    sources.some((source) =>
      source.type === type && (type === "GOVERNING_DOC"
        ? source.serverManaged === true
        : source.contentStatus === "ATTACHED" && source.content.trim().length > 0 &&
          source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true)
    )
  );
  const characterReady = Boolean(
    character.name.trim() && character.name !== "UNKNOWN" &&
    character.hpMax !== null && character.armorClass !== null &&
    character.level !== null && character.proficiencyBonus !== null &&
    character.abilityScores && character.speciesAndClass !== "UNKNOWN" &&
    character.baseSavingThrowBonuses && character.skillBonuses?.length &&
    character.weaponAttacks?.length && character.classFeaturesByLevel?.length
  );
  const setupReady = worldState.setup.confirmed && verifiedCoreSourcesReady && characterReady;
  const currentLocation = locations.find((location) => location.id === worldState.currentLocationId);
  const formattedGmAnswer = gmTurn
    ? formatGameMasterAnswer(gmTurn, worldState, character, locations, nextTurnNumber)
    : "";

  useEffect(() => {
    if (worldState.openingScene?.trim()) setOpening(worldState.openingScene);
  }, [worldState.openingScene]);

  useEffect(() => {
    if (openingCommitStage === "CHECK") {
      const checked = checkTurnDraft();
      if (checked.ok) setOpeningCommitStage("COMMIT");
      else {
        setOpeningCommitStage(null);
        setGmError(`Не удалось проверить вступительный ход: ${checked.errors.join(" ")}`);
      }
    } else if (openingCommitStage === "COMMIT" && turnDraft.checkedAt) {
      const committed = commitTurnDraft(true);
      setOpeningCommitStage(null);
      if (!committed.ok) setGmError(committed.error);
      else {
        setDraftReady(false);
        setDraftChecked(false);
        setExplicitConfirm(false);
        toast.success("Кампания началась. Вступление записано как игровой ход №0001.");
      }
    }
  }, [openingCommitStage, turnDraft.checkedAt, checkTurnDraft, commitTurnDraft]);

  useEffect(() => {
    if (turnDraft.playerIntent.trim() || turnDraft.summary.trim() || turnDraft.gmNarration?.trim()) {
      setDraftReady(true);
      setDraftChecked(Boolean(turnDraft.checkedAt));
    }
  }, [turnDraft.id, turnDraft.playerIntent, turnDraft.summary, turnDraft.gmNarration, turnDraft.checkedAt]);

  function makeContext(action: string, mode: "ACTION" | "OPENING") {
    return {
      action,
      mode,
      sources,
      world: worldState,
      character,
      canonFacts,
      npcs,
      factions,
      locations,
      timelineEvents,
      journal: sessionLog.entries,
    };
  }

  function stageOpeningTurn(openingText: string, turn?: GameMasterTurn) {
    if (sessionLog.lastTurnNumber > 0 || openingCommitStage) return;
    updateTurnDraft({
      summary: "Начало кампании — вступительная сцена",
      playerIntent: "Начало кампании (служебное открытие; действие персонажа не совершено)",
      worldOutcome: "Вступительная сцена представлена игроку; действие персонажа ещё не совершено.",
      gmNarration: openingText,
      campaignMemory: turn?.campaignMemory ?? "Начальная сцена кампании. Игровые действия ещё не совершались.",
      ...((turn?.environment ?? worldState.environment) ? { environment: turn?.environment ?? worldState.environment! } : {}),
      environmentReason: turn?.environmentReason ?? "Начальное состояние среды зафиксировано при открытии кампании.",
      questChanges: [],
      timeDeltaMinutes: 0,
      newInGameDate: turn?.newInGameDate ?? worldState.currentInGameDate,
      newLocationId: turn?.newLocationId ?? worldState.currentLocationId ?? "",
      hpDelta: 0,
      consequenceText: "",
      newFactTitle: "",
      newFactStatement: "",
      newFactRationale: "",
      rolls: [],
      characterChanges: {
        inventory: [], resources: [], conditions: [],
        currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      npcChanges: [],
    });
    setOpeningCommitStage("CHECK");
  }

  async function handleOpenCampaign() {
    setOpeningAttempted(true);
    setGmError(null);
    if (!setupReady) {
      setGmError("Подготовка не пройдена. Проверь ОБСИДИАН 4.1 и хронику Экдрасиля; для загруженного персонажа также проверь его отдельный лист и подтверждение старта.");
      return;
    }
    if (worldState.openingScene?.trim()) {
      setOpening(worldState.openingScene);
      if (sessionLog.lastTurnNumber === 0) stageOpeningTurn(worldState.openingScene);
      return;
    }
    if (!session?.access_token) {
      setGmError("Для работы мастера войди в аккаунт. Локальный гостевой режим не может обращаться к защищённому API.");
      return;
    }
    setOpeningBusy(true);
    try {
      const result = await resolvePlayerAction(session.access_token, makeContext("", "OPENING"), { model: gmModel });
      const openingTurn: GameMasterTurn = {
        ...result.turn,
        timeDeltaMinutes: 0,
        hpDelta: 0,
        newInGameDate: worldState.currentInGameDate,
        newLocationId: null,
        consequenceText: "",
        questChanges: [],
        rolls: [],
        npcChanges: [],
        characterChanges: {
          inventory: [], resources: [], conditions: [],
          currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        },
        environment: worldState.environment ?? result.turn.environment,
      };
      const openingText = formatCampaignOpening(openingTurn, worldState, character, locations);
      const saved = saveOpeningScene(openingText);
      if (!saved.ok) throw new Error(saved.error ?? "Не удалось сохранить вступительную сцену.");
      setOpening(openingText);
      setGmTurn(null);
      stageOpeningTurn(openingText, openingTurn);
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось подготовить вступительную сцену.");
    } finally {
      setOpeningBusy(false);
    }
  }

  useEffect(() => {
    if (!setupReady || sessionLog.lastTurnNumber > 0 || openingBusy || openingAttempted || openingCommitStage) return;
    if (!session?.access_token) return;
    void handleOpenCampaign();
  }, [setupReady, sessionLog.lastTurnNumber, openingBusy, openingAttempted, openingCommitStage, session?.access_token]);

  async function handleResolveAction(actionOverride?: string) {
    const actionToResolve = actionOverride ?? playerAction;
    if (!actionToResolve.trim() || !session?.access_token || !setupReady || draftReady) return;
    setGmError(null);
    setGmTurn(null);
    setPendingAction(actionToResolve);
    setGmBusy(true);
    try {
      const result = await resolvePlayerAction(session.access_token, makeContext(actionToResolve, "ACTION"), { model: gmModel });
      setGmTurn(result.turn);
      const waitingForRoll = result.turn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
      if (!result.turn.needsClarification && !waitingForRoll) {
        updateTurnDraft({
          summary: result.turn.summary,
          playerIntent: actionToResolve.trim(),
          worldOutcome: result.turn.worldOutcome,
          gmNarration: formatArchivedGameMasterAnswer(result.turn, worldState, character, locations, nextTurnNumber),
          campaignMemory: result.turn.campaignMemory,
          environment: result.turn.environment,
          questChanges: result.turn.questChanges,
          timeDeltaMinutes: result.turn.timeDeltaMinutes,
          newInGameDate: result.turn.newInGameDate,
          newLocationId: result.turn.newLocationId ?? "",
          hpDelta: result.turn.hpDelta,
          consequenceText: result.turn.consequenceText,
          characterChanges: result.turn.characterChanges,
          npcChanges: result.turn.npcChanges,
          rolls: result.turn.rolls.map((roll, index) => ({
            id: `chat-roll-${Date.now().toString(36)}-${index}`,
            label: roll.label,
            formula: roll.formula,
            result: roll.result,
          })),
        });
        setDraftReady(true);
        setDraftChecked(false);
        setExplicitConfirm(false);
      }
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось получить ответ мастера.");
    } finally {
      setGmBusy(false);
    }
  }

  function handleSubmitPendingRoll() {
    if (!gmTurn || !pendingRollResult.trim()) return;
    if (!Number.isInteger(Number(pendingRollResult.trim()))) {
      setGmError("Результат броска должен быть целым числом. Введи фактический итог с модификатором, если он применим.");
      return;
    }
    const pending = gmTurn.rolls.find((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
    if (!pending) return;
    const continuedAction = `${pendingAction}\n\nФАКТИЧЕСКИЙ РЕЗУЛЬТАТ БРОСКА ИГРОКА: ${pending.label} (${pending.formula}) = ${pendingRollResult.trim()}. Используй именно этот результат и продолжи разрешение исходного действия; не начинай новый игровой ход и не проси повторить уже выполненный бросок.`;
    setPlayerAction(continuedAction);
    setPendingAction(continuedAction);
    setPendingRollResult("");
    setGmTurn(null);
    void handleResolveAction(continuedAction);
  }

  function handleApplyClarification() {
    if (!gmTurn || !clarificationAnswer.trim()) return;
    const clarifiedAction = `${pendingAction.trim()}\n\nОтвет игрока на уточнение мастера: ${clarificationAnswer.trim()}`;
    setPlayerAction(clarifiedAction);
    setClarificationAnswer("");
    setGmTurn(null);
  }

  function handleCheckDraft() {
    setGmError(null);
    const result = checkTurnDraft();
    if (result.ok) {
      setDraftChecked(true);
      toast.success("Проверка хода пройдена. Теперь подтверди запись.");
    } else {
      setDraftChecked(false);
      toast.error(result.errors.join(" "));
    }
  }

  function handleCommit() {
    if (!explicitConfirm || !draftChecked) return;
    const result = commitTurnDraft(explicitConfirm);
    if (result.ok) {
      setPlayerAction("");
      setPendingAction("");
      setGmTurn(null);
      setDraftReady(false);
      setDraftChecked(false);
      setExplicitConfirm(false);
      toast.success(`Ход №${nextTurnNumber} записан в журнал; проверка целостности и read-back пройдены.`);
    } else {
      toast.error(result.error);
    }
  }

  function renderJournalEntry(entry: GameTurnEntry | TechnicalMessageEntry) {
    if (entry.entryType === "TECHNICAL_NOTE") {
      return (
        <div key={entry.id} className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold">OOC · техническая заметка · не игровой ход</p>
          <p className="whitespace-pre-wrap">{entry.text}</p>
          <p className="mt-1 mono-code">Игровое время не изменено</p>
        </div>
      );
    }
    return (
      <article key={entry.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="mono-code text-xs font-semibold text-primary">ХОД #{String(entry.turnNumber).padStart(4, "0")}</span>
          <span className="mono-code text-[10px] text-muted-foreground">{entry.inGameDateAfter}</span>
        </div>
        <div className="ml-auto max-w-[94%] rounded-xl rounded-br-sm bg-primary/10 p-3 text-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Ты</p>
          <p className="whitespace-pre-wrap">{entry.playerIntent}</p>
        </div>
        <div className="max-w-[98%] rounded-xl rounded-bl-sm bg-secondary/70 p-3 text-sm leading-relaxed">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Мастер</p>
          <p className="whitespace-pre-wrap">{entry.gmNarration || entry.worldOutcome}</p>
        </div>
        <p className="text-right text-[10px] text-muted-foreground">Время мира: +{entry.timeDeltaMinutes} мин · HP: {entry.hpDelta > 0 ? "+" : ""}{entry.hpDelta}</p>
      </article>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Игровой чат</h1>
          </div>
          <details className="relative">
            <summary aria-label="Состояние персонажа" title="Состояние персонажа" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-card text-foreground">
              <UserRound className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-card p-3 text-left shadow-xl">
              <p className="text-sm font-semibold">{character.name}</p>
              <p className="mt-2 text-sm">HP: <strong>{character.hpCurrent ?? "UNKNOWN"}/{character.hpMax ?? "UNKNOWN"}</strong>{character.hpTemp ? ` · Временные ${character.hpTemp}` : ""}</p>
              <p className="mt-1 text-xs text-muted-foreground">Состояния: {character.conditions.length ? character.conditions.join(", ") : "нет подтверждённых состояний"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Уровень: {character.level ?? "UNKNOWN"} · {character.speciesAndClass}</p>
            </div>
          </details>
        </div>
        <p className="text-xs text-muted-foreground">Живой мастер · ОБСИДИАН 4.1 · D&D 5e (2024) · SRD 5.2.1</p>
      </header>

      {cloudSyncStatus !== "IDLE" && (
        <section role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs ${cloudSyncStatus === "ERROR" ? "border-status-danger/50 bg-status-danger-bg/30" : "border-border bg-background/50"}`}>
          <div className="flex items-start gap-2">
            <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-foreground">{cloudSyncStatus === "SAVING" ? "Сохранение облачной копии" : cloudSyncStatus === "SAVED" ? "Облачная копия подтверждена" : "Облачное сохранение не выполнено"}</p>
              <p className="text-muted-foreground">{cloudSyncMessage}</p>
              {cloudSyncStatus === "ERROR" && <p className="mt-1 text-muted-foreground">Игровой ход уже сохранён локально. Облачная копия не подтверждена.</p>}
            </div>
          </div>
          {cloudSyncStatus === "ERROR" && (cloudSyncMessage?.includes("В облаке уже есть другая версия") ? (
            <Button asChild type="button" variant="secondary" size="sm" className="touch-target">
              <Link to="/settings">Загрузить актуальную версию</Link>
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" className="touch-target" onClick={() => void retryCloudSnapshot()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Повторить сохранение
            </Button>
          ))}
        </section>
      )}

      <section className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <div className="min-w-0"><p className="truncate font-semibold text-foreground">{worldState.startLocationName || "Место не установлено"}</p><p className="truncate text-muted-foreground">{worldState.currentInGameDate || "Дата не установлена"}</p></div>
        <span className="shrink-0 text-muted-foreground">Ход #{String(nextTurnNumber).padStart(4, "0")}</span>
      </section>

      <nav aria-label="Игровые вкладки" className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-3xl grid-cols-4 gap-1 border-t border-border bg-background/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
        {([["chat", "Чат", Swords], ["inventory", "Инвентарь", Backpack], ["quests", "Задания", ClipboardList], ["knowledge", "Знания", BookOpen]] as const).map(([key, label, Icon]) => (
          <Button key={key} type="button" size="icon" aria-label={label} title={label} variant={activePanel === key ? "default" : "ghost"} className="mx-auto h-11 w-12" onClick={() => setActivePanel(key)}><Icon className="h-5 w-5" /></Button>
        ))}
      </nav>

      {activePanel === "chat" && (
      <div className="space-y-4">
      {!setupReady && (
        <section className="panel-surface space-y-3 border-status-approx/40 p-4">
          <div className="flex items-center gap-2"><Lock className="h-5 w-5 text-status-approx" /><h2 className="font-semibold text-foreground">Кампания не готова к игре</h2></div>
          <p className="text-sm text-muted-foreground">Нужны подтверждённая подготовка, обработанные и проверенные источники ОБСИДИАН 4.1 / Хроника / досье, а также полный лист персонажа. Никакая сцена не создаётся на основании неподтверждённых или пустых источников.</p>
          <ul className="space-y-1 text-xs">
            {requiredSourceTypes.map((type) => {
              const ready = sources.some((source) => source.type === type && source.contentStatus === "ATTACHED" && source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true);
              const label = type === "GOVERNING_DOC" ? "ОБСИДИАН 4.1" : type === "WORLD_CANON" ? "Хроника Экдрасиля" : "Досье персонажа";
              return <li key={type} className={ready ? "text-status-verified" : "text-status-approx"}>{ready ? "✓" : "○"} {label}</li>;
            })}
            <li className={worldState.setup.confirmed ? "text-status-verified" : "text-status-approx"}>{worldState.setup.confirmed ? "✓" : "○"} Подготовка кампании подтверждена</li>
            <li className={characterReady ? "text-status-verified" : "text-status-approx"}>{characterReady ? "✓" : "○"} Лист персонажа заполнен</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary"><Link to="/sources">Источники</Link></Button>
            <Button asChild><Link to="/play">Подготовка персонажа и старта</Link></Button>
            <Button asChild variant="outline"><Link to="/settings">Настройки</Link></Button>
          </div>
        </section>
      )}

      {sessionLog.lastTurnNumber === 0 && !opening && !openingBusy && (gmError || !session?.access_token) && (
        <section className="panel-surface space-y-2 p-3">
          <p className="text-sm text-muted-foreground">{gmError ?? "Войди в аккаунт, чтобы мастер смог открыть кампанию."}</p>
          <Button type="button" className="w-full" disabled={!setupReady || !session?.access_token} onClick={() => void handleOpenCampaign()}>
            <Sparkles className="mr-2 h-4 w-4" />Повторить открытие кампании
          </Button>
        </section>
      )}

      {opening && (
        <article className="rounded-xl rounded-bl-sm bg-secondary/70 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Мастер · вступление</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{opening}</div>
          <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">Вступительная сцена записана в журнал как ход #0001. Игровое время не продвинуто. Следующее действие персонажа будет ходом #0002.</p>
        </article>
      )}

      <section className="space-y-3" aria-live="polite">
        {sessionLog.entries.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-foreground">История диалога</h2>
            {sessionLog.entries.map((entry) => renderJournalEntry(entry))}
          </>
        )}
        {gmTurn && (
          <article className="space-y-3 rounded-xl border border-primary/30 bg-card p-3">
            <div className="ml-auto max-w-[94%] rounded-xl rounded-br-sm bg-primary/10 p-3 text-sm">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Ты</p>
              <p className="whitespace-pre-wrap">{pendingAction}</p>
            </div>
            <div className="rounded-xl rounded-bl-sm bg-secondary/70 p-3 text-sm leading-relaxed">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Мастер</p>
              <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">{formattedGmAnswer}</div>
            </div>
            {gmTurn.needsClarification && (
              <div className="space-y-2 rounded-lg border border-status-approx/40 p-3">
                <p className="text-xs font-semibold text-status-approx">Нужно уточнение · время не продвигается</p>
                <p className="text-sm">{gmTurn.clarificationQuestion}</p>
                <Textarea rows={2} value={clarificationAnswer} onChange={(event) => setClarificationAnswer(event.target.value)} placeholder="Уточни действие персонажа…" />
                <Button type="button" variant="outline" disabled={!clarificationAnswer.trim()} onClick={handleApplyClarification}>Передать уточнение</Button>
              </div>
            )}
            {gmTurn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА") && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold">Требуется бросок игрока</p>
                <p className="text-sm">{gmTurn.rolls.find((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА")?.label} · {gmTurn.rolls.find((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА")?.formula}</p>
                <Input inputMode="numeric" value={pendingRollResult} onChange={(event) => setPendingRollResult(event.target.value)} placeholder="Введи фактический результат броска" className="touch-target mono-code" />
                <Button type="button" variant="outline" className="w-full" disabled={!pendingRollResult.trim()} onClick={handleSubmitPendingRoll}>Передать результат мастеру</Button>
              </div>
            )}
          </article>
        )}
      </section>

      {draftReady && (
        <section className="panel-surface space-y-3 border-status-verified/40 p-4">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-status-verified" /><h2 className="text-sm font-semibold text-foreground">Ход #{nextTurnNumber} готов к проверке</h2></div>
          <p className="text-xs text-muted-foreground">{turnDraft.summary || "Черновик хода"} · время: +{turnDraft.timeDeltaMinutes} мин · дата после хода: {turnDraft.newInGameDate || worldState.currentInGameDate}</p>
          {turnDraft.playerIntent && <p className="text-sm text-foreground">Действие: {turnDraft.playerIntent}</p>}
          {turnDraft.gmNarration && !gmTurn && <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background/60 p-3 text-xs leading-relaxed">{turnDraft.gmNarration}</div>}
          {!draftChecked ? (
            <Button type="button" variant="secondary" className="w-full" onClick={handleCheckDraft}><ShieldCheck className="mr-2 h-4 w-4" />Проверить ход</Button>
          ) : (
            <div className="space-y-3 rounded-lg border border-status-verified/40 p-3">
              <p className="text-xs text-status-verified">Проверка пройдена. Изменения ещё не записаны.</p>
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input type="checkbox" checked={explicitConfirm} onChange={(event) => setExplicitConfirm(event.target.checked)} className="mt-0.5" />
                Я подтверждаю запись хода и обновление состояния кампании.
              </label>
              <Button type="button" className="w-full" disabled={!explicitConfirm} onClick={handleCommit}>Подтвердить и сохранить ход #{nextTurnNumber}</Button>
            </div>
          )}
        </section>
      )}

      {gmError && <div role="alert" className="panel-surface flex items-start gap-2 border-status-danger/50 bg-status-danger-bg/40 p-3 text-sm text-status-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{gmError}</span></div>}
      {lastStorageError && <div role="alert" className="panel-surface text-sm text-status-danger">{lastStorageError}</div>}
      {gmBusy && <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" />Мастер обрабатывает запрос…</div>}

      {setupReady && (sessionLog.lastTurnNumber > 0 || opening) && !draftReady && !gmTurn && (
        <section className="panel-surface space-y-2 p-3">
          <Label htmlFor="player-action">Что делает {character.name}?</Label>
          <Textarea id="player-action" rows={3} value={playerAction} onChange={(event) => setPlayerAction(event.target.value)} placeholder="Опиши действие своими словами. Можешь попытаться сделать что угодно — мастер проверит возможность, механику и последствия." />
          <Button type="button" className="touch-target w-full" disabled={!playerAction.trim() || !session?.access_token || gmBusy} onClick={() => void handleResolveAction()}>
            <Send className="mr-2 h-4 w-4" />{gmBusy ? "Мастер отвечает…" : "Отправить мастеру"}
          </Button>
        </section>
      )}

      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <Link to="/turns" className="underline underline-offset-2">Полный журнал ходов</Link>
        <Link to="/character" className="underline underline-offset-2">Лист персонажа</Link>
      </div>
      </div>
      )}

      {activePanel === "inventory" && (
        <section className="space-y-3">
          <div className="panel-surface flex items-center justify-between gap-3 p-3">
            <div><p className="text-xs text-muted-foreground">Предметов и стеков</p><p className="text-xl font-semibold">{character.inventory.filter((item) => item.quantity > 0).length}</p></div>
            <div className="text-right"><p className="text-xs text-muted-foreground">Известный вес</p><p className="text-xl font-semibold">{character.inventory.every((item) => item.unitWeightLb !== null && item.unitWeightLb !== undefined) ? character.inventory.reduce((sum, item) => sum + (item.unitWeightLb ?? 0) * item.quantity, 0).toFixed(1) + " lb" : "Частично известен"}</p></div>
          </div>
          <div className="panel-surface space-y-2 p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Backpack className="h-4 w-4"/>Снаряжение и предметы</h2>
            {character.inventory.length === 0 ? <p className="text-sm text-muted-foreground">Инвентарь пуст или ещё не загружен.</p> : character.inventory.filter((item) => item.quantity > 0).map((item) => (
              <article key={item.id} className="rounded-lg border border-border bg-background/50 p-3">
                <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.name}</p><span className="mono-code text-xs">×{item.quantity}</span></div>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.location === "WORN" ? "Надето" : item.location === "CARRIED" ? "При себе" : item.location === "STORED" ? "На хранении" : item.location === "DROPPED" ? "Оставлено" : item.location === "UNKNOWN" ? "Место неизвестно" : "Место хранения не уточнено"} · {item.unitWeightLb == null ? "вес UNKNOWN" : item.unitWeightLb + " lb / шт."} · {item.certainty}</p>
                {item.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.notes}</p>}
              </article>
            ))}
          </div>
          <div className="panel-surface space-y-2 p-3">
            <h2 className="text-sm font-semibold">Деньги</h2>
            {character.currency ? <div className="grid grid-cols-5 gap-1 text-center text-xs">{(["pp","gp","ep","sp","cp"] as const).map((coin) => <div key={coin} className="rounded-md bg-background/60 p-2"><p className="text-muted-foreground">{coin.toUpperCase()}</p><p className="mt-1 font-semibold">{character.currency?.[coin] ?? 0}</p></div>)}</div> : <p className="text-sm text-muted-foreground">Денежный остаток не установлен.</p>}
          </div>
          <div className="panel-surface space-y-2 p-3">
            <h2 className="text-sm font-semibold">Ресурсы персонажа</h2>
            {character.resources.length === 0 ? <p className="text-sm text-muted-foreground">Нет отдельных ресурсов в реестре.</p> : character.resources.map((resource) => <div key={resource.id} className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0"><span className="text-sm">{resource.name}</span><span className="mono-code text-xs">{resource.current ?? "?"}/{resource.max ?? "?"}</span></div>)}
          </div>
        </section>
      )}

      {activePanel === "quests" && (
        <section className="panel-surface space-y-3 p-3">
          <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4"/>Журнал заданий</h2><span className="mono-code text-xs">{(worldState.quests ?? []).length}</span></div>
          <p className="text-xs text-muted-foreground">Здесь появляются только поручения, слухи и цели, о которых персонаж действительно узнала. Скрытые задачи мира и NPC не отображаются.</p>
          {(worldState.quests ?? []).length === 0 ? <div className="rounded-lg border border-dashed border-border p-5 text-center"><p className="text-sm font-medium">Пока нет известных заданий</p><p className="mt-1 text-xs text-muted-foreground">Когда персонаж узнает о задании, слухе или обязательстве через реальный внутриигровой источник, мастер добавит его сюда.</p></div> : (worldState.quests ?? []).map((quest) => {
            const statusLabel = quest.status === "RUMOR" ? "Слух / зацепка" : quest.status === "ACTIVE" ? "Активно" : quest.status === "ON_HOLD" ? "Отложено" : quest.status === "COMPLETED" ? "Выполнено" : "Провалено";
            return <article key={quest.id} className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{quest.title}</h3><span className="rounded-md bg-secondary px-2 py-1 text-[10px]">{statusLabel}</span></div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{quest.description}</p>
              {quest.objectives.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs">{quest.objectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul>}
              <div className="space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <p>Источник: {quest.sourcePath}</p>
                {quest.giverName && <p>Кто сообщил: {quest.giverName}</p>}
                {quest.locationName && <p>Место: {quest.locationName}</p>}
                {quest.deadline && <p>Срок: {quest.deadline}</p>}
                {quest.reward && <p>Награда: {quest.reward}</p>}
                <p>Достоверность: {quest.certainty} · Обновлено: {quest.lastUpdatedInGameDate}</p>
              </div>
            </article>;
          })}
        </section>
      )}

      {activePanel === "knowledge" && (
        <section className="space-y-3">
          <div className="panel-surface space-y-1 p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4"/>Журнал знаний</h2>
            <p className="text-xs text-muted-foreground">Только сведения, известные персонажу. Личные цели, тайны и знания самих NPC остаются скрытыми.</p>
          </div>
          {npcs.filter((npc) => npc.playerVisible === true || (npc.playerKnowledge?.length ?? 0) > 0).length === 0 ? <div className="panel-surface rounded-lg border border-dashed p-5 text-center"><p className="text-sm font-medium">Пока нет известных NPC</p><p className="mt-1 text-xs text-muted-foreground">Когда персонаж увидит человека, познакомится с ним или узнает о нём из разговора/документа, мастер создаст запись и будет дополнять её.</p></div> : npcs.filter((npc) => npc.playerVisible === true || (npc.playerKnowledge?.length ?? 0) > 0).map((npc) => (
            <article key={npc.id} className="panel-surface space-y-2 p-3">
              <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{npc.name}</h3><span className="text-[10px] text-muted-foreground">{npc.certainty}</span></div>
              <p className="text-xs text-muted-foreground">{npc.role}</p>
              <p className="text-xs">Последнее известное место: {locations.find((location) => location.id === npc.locationId)?.name ?? "НЕ УСТАНОВЛЕНО"}</p>
              <div className="border-t border-border pt-2"><p className="mb-2 text-[11px] font-semibold text-muted-foreground">Что известно персонажу</p>{(npc.playerKnowledge ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Пока известно только существование/наблюдение этого NPC; личность и подробности неизвестны.</p> : <ul className="space-y-2">{npc.playerKnowledge!.map((fact) => <li key={fact.id} className="rounded-md bg-background/60 p-2"><p className="text-xs">{fact.factSummary}</p><p className="mt-1 text-[10px] text-muted-foreground">{fact.certainty} · {fact.inGameDate} · Источник: {fact.acquisitionPath}</p></li>)}</ul>}</div>
            </article>
          ))}
          {canonFacts.filter((fact) => fact.layer === "PLAYER_KNOWLEDGE").length > 0 && <div className="panel-surface space-y-2 p-3"><h3 className="text-sm font-semibold">Другие известные факты</h3>{canonFacts.filter((fact) => fact.layer === "PLAYER_KNOWLEDGE").map((fact) => <div key={fact.id} className="border-b border-border py-2 last:border-0"><p className="text-xs font-medium">{fact.title}</p><p className="text-xs">{fact.statement}</p><p className="mt-1 text-[10px] text-muted-foreground">{fact.certainty} · {fact.inGameDate} · {fact.acquisitionPath}</p></div>)}</div>}
        </section>
      )}

    </main>
  );
}
