import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Backpack, BookOpen, CheckCircle2, ClipboardList, Cloud, Dices, Lock, RefreshCw, Send, ShieldCheck, Sparkles, Swords, UserRound } from "lucide-react";
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
import { resolvePlayerAction, rollDiceAtServer, type GameMasterTurn } from "@/domain/game-master";
import type { GameTurnEntry, TechnicalMessageEntry } from "@/domain/types";
import { parseDiceFormula, type RolledDie } from "@/domain/dice";
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
  const [originalPlayerIntent, setOriginalPlayerIntent] = useState("");
  const [gmBusy, setGmBusy] = useState(false);
  const [gmError, setGmError] = useState<string | null>(null);
  const [gmTurn, setGmTurn] = useState<GameMasterTurn | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [rollDisplay, setRollDisplay] = useState<{ label: string; dice: RolledDie[]; modifier: number; total: number } | null>(null);
  const [rollAnimating, setRollAnimating] = useState(false);
  const [completedPlayerRolls, setCompletedPlayerRolls] = useState<Array<{ id: string; label: string; formula: string; result: string }>>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [turnCommitStage, setTurnCommitStage] = useState<"CHECK" | "COMMIT" | null>(null);
  const [openingCommitStage, setOpeningCommitStage] = useState<"CHECK" | "COMMIT" | null>(null);
  const [activePanel, setActivePanel] = useState<"chat" | "inventory" | "quests" | "knowledge" | "skills">("chat");

  const nextTurnNumber = sessionLog.lastTurnNumber + 1;
  const requiredSourceTypes = character.sourceDossierId === "GENERATED_RANDOM" ? ["GOVERNING_DOC", "WORLD_CANON"] as const : ["GOVERNING_DOC", "WORLD_CANON", "PLAYER_DOSSIER"] as const;
  const verifiedCoreSourcesReady = requiredSourceTypes.every((type) =>
    sources.some((source) =>
      source.type === type && ((type === "GOVERNING_DOC" || type === "WORLD_CANON")
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
  const dateParts = (worldState.currentInGameDate || "").split(" · ");
  const datePart = dateParts[0] ?? "";
  const regularDateMatch = datePart.match(/^(\d{1,2})\s+(.+),\s*(\d+)\s+год$/);
  const canonicalIntercalaryDateMatch = datePart.match(/^Межгодовой день (\d+),\s*(\d+)\s+год$/i);
  const legacyIntercalaryDateMatch = datePart.match(/^(.+),\s*(\d+)\s+год$/);
  const intercalaryDateMatch = canonicalIntercalaryDateMatch ?? legacyIntercalaryDateMatch;
  const clockMatch = dateParts.slice(1).join(" ").match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  const displayYear = regularDateMatch?.[3] ?? intercalaryDateMatch?.[2] ?? "не установлен";
  const displayMonth = regularDateMatch?.[2] ?? (intercalaryDateMatch ? "межгодовой день" : "не установлен");
  const displayDay = regularDateMatch?.[1] ?? (canonicalIntercalaryDateMatch ? canonicalIntercalaryDateMatch[1] : legacyIntercalaryDateMatch?.[1]) ?? "не установлен";
  const displayTemperature = worldState.environment?.temperatureC == null ? "не установлена" : String(worldState.environment.temperatureC) + " °C" + (worldState.environment.temperatureCertainty === "APPROXIMATE" ? " · примерно" : "");
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
        toast.success("Кампания началась. Вступление записано как игровой ход №0001.");
      }
    }
  }, [openingCommitStage, turnDraft.checkedAt, checkTurnDraft, commitTurnDraft]);

  useEffect(() => {
    if (turnDraft.playerIntent.trim() || turnDraft.summary.trim() || turnDraft.gmNarration?.trim()) {
      setDraftReady(true);
    }
  }, [turnDraft.id, turnDraft.playerIntent, turnDraft.summary, turnDraft.gmNarration, turnDraft.checkedAt]);

  useEffect(() => {
    if (turnCommitStage === "CHECK") {
      const checked = checkTurnDraft();
      if (checked.ok) setTurnCommitStage("COMMIT");
      else {
        setTurnCommitStage(null);
        setGmError(`Не удалось автоматически проверить ход: ${checked.errors.join(" ")}`);
      }
    } else if (turnCommitStage === "COMMIT" && turnDraft.checkedAt) {
      const committed = commitTurnDraft(true);
      setTurnCommitStage(null);
      if (!committed.ok) {
        setGmError(`Не удалось автоматически сохранить ход: ${committed.error}`);
      } else {
        setPlayerAction("");
        setPendingAction("");
        setOriginalPlayerIntent("");
        setGmTurn(null);
        setDraftReady(false);
        setCompletedPlayerRolls([]);
        setRollDisplay(null);
        toast.success(`Ход №${nextTurnNumber} автоматически записан в журнал.`);
      }
    }
  }, [turnCommitStage, turnDraft.checkedAt, checkTurnDraft, commitTurnDraft, nextTurnNumber]);

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
        newLocationId: null,
        consequenceText: "",
        questChanges: [],
        rolls: [],
        npcChanges: [],
        characterChanges: {
          inventory: [], resources: [], conditions: [],
          currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        },
        environment: result.turn.environment,
      };
      const openingText = formatCampaignOpening(openingTurn, worldState, character, locations);
      const saved = saveOpeningScene(openingText, {
        date: openingTurn.newInGameDate,
        environment: openingTurn.environment,
      });
      if (!saved.ok) throw new Error(saved.error ?? "Не удалось сохранить вступительную сцену.");
      setOpening(openingText);
      setGmTurn(null);
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

  async function handleResolveAction(actionOverride?: string, preserveRolls = false, rollsOverride?: Array<{ id: string; label: string; formula: string; result: string }>, playerIntentOverride?: string) {
    const actionToResolve = actionOverride ?? playerAction;
    if (!actionToResolve.trim() || !session?.access_token || !setupReady || draftReady) return;
    setGmError(null);
    setGmTurn(null);
    if (!preserveRolls) {
      setRollDisplay(null);
      setCompletedPlayerRolls([]);
    }
    if (!preserveRolls) setOriginalPlayerIntent(actionToResolve.trim());
    setPendingAction(actionToResolve);
    setGmBusy(true);
    try {
      const result = await resolvePlayerAction(session.access_token, makeContext(actionToResolve, "ACTION"), { model: gmModel });
      setGmTurn(result.turn);
      const waitingForRoll = result.turn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
      if (!result.turn.needsClarification && !waitingForRoll) {
        updateTurnDraft({
          summary: result.turn.summary,
          playerIntent: playerIntentOverride ?? actionToResolve.trim(),
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
          rolls: [
            ...(rollsOverride ?? completedPlayerRolls),
            ...result.turn.rolls.map((roll, index) => ({
              id: `chat-roll-${Date.now().toString(36)}-${index}`,
              label: roll.label,
              formula: roll.formula,
              result: roll.result,
            })),
          ],
        });
        setDraftReady(true);
        setTurnCommitStage("CHECK");
      }
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось получить ответ мастера.");
    } finally {
      setGmBusy(false);
    }
  }

  async function handleRollPendingCheck() {
    if (!gmTurn || gmBusy || rollAnimating) return;
    const pending = gmTurn.rolls.find((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
    if (!pending) return;
    setRollAnimating(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
    let rolled: Awaited<ReturnType<typeof rollDiceAtServer>>;
    try {
      rolled = await rollDiceAtServer(session?.access_token ?? "", pending.formula);
    } catch (error) {
      setRollAnimating(false);
      setGmError(error instanceof Error ? error.message : "Не удалось выполнить серверный бросок. Ход не продолжен.");
      return;
    }
    setRollAnimating(false);

    const formula = pending.formula;
    setRollDisplay({ label: pending.label, dice: rolled.dice, modifier: rolled.modifier, total: rolled.total });
    const rollRecord = {
      id: `gm-roll-${Date.now().toString(36)}`,
      label: pending.label,
      formula,
      result: `кости=[${rolled.dice.map((die) => `d${die.sides}:${die.value}${die.kept ? "" : " (не учитывается)"}`).join(", ")}]; модификатор=${rolled.modifier >= 0 ? "+" : ""}${rolled.modifier}; итог=${rolled.total}`,
    };
    const allRolls = [...completedPlayerRolls, rollRecord];
    setCompletedPlayerRolls(allRolls);

    // Carry the original check decision back to the GM. In particular, DC and
    // the exact mechanics must remain the same after the player has rolled.
    const checkContext = {
      label: pending.label,
      formula,
      mechanics: gmTurn.mechanics,
      consequences: gmTurn.consequences,
      spatialAccounting: gmTurn.spatialAccounting,
      nextAction: gmTurn.nextAction,
    };
    const continuedAction = `${pendingAction}\n\nПЕРВОНАЧАЛЬНОЕ РЕШЕНИЕ МАСТЕРА О ПРОВЕРКЕ (НЕ ПЕРЕСМАТРИВАТЬ И НЕ МЕНЯТЬ DC): ${JSON.stringify(checkContext)}\nФАКТИЧЕСКИЙ БРОСОК МАСТЕРА (серверная случайность): ${pending.label}; формула ${formula}; результаты костей [${rolled.dice.map((die) => `d${die.sides}:${die.value}${die.kept ? "" : " (не учитывается)"}`).join(", ")}]; модификатор ${rolled.modifier >= 0 ? "+" : ""}${rolled.modifier}; итог ${rolled.total}. Это единственный результат броска. Примени именно первоначальное решение и правила D&D 2024; не меняй DC, не пересчитывай бонус, не проси повторить бросок и продолжи исходное действие.`;
    setPendingAction(continuedAction);
    setGmTurn(null);
    void handleResolveAction(continuedAction, true, allRolls, originalPlayerIntent || pendingAction);
  }

  function handleApplyClarification() {
    if (!gmTurn || !clarificationAnswer.trim()) return;
    const clarifiedAction = `${pendingAction.trim()}\n\nОтвет игрока на уточнение мастера: ${clarificationAnswer.trim()}`;
    setPlayerAction(clarifiedAction);
    setClarificationAnswer("");
    setGmTurn(null);
    void handleResolveAction(clarifiedAction);
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
    const dateText = entry.inGameDateAfter || "НЕ УСТАНОВЛЕНО";
    const clockMatch = dateText.match(/([01]\d|2[0-3]):([0-5]\d)/);
    const hour = clockMatch ? Number(clockMatch[1]) : null;
    const timeOfDay = hour === null ? "время суток не установлено" : hour < 5 ? "ночь" : hour < 12 ? "утро" : hour < 17 ? "день" : hour < 22 ? "вечер" : "ночь";
    const place = locations.find((location) => location.id === entry.locationIdAfter)?.name ?? "место не установлено";
    const temperature = entry.environment?.temperatureC === null || entry.environment?.temperatureC === undefined
      ? "температура не установлена"
      : `${entry.environment.temperatureC} °C${entry.environment.temperatureCertainty === "APPROXIMATE" ? " · приблизительно" : ""}`;
    return (
      <article key={entry.id} className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="mono-code text-xs font-semibold text-primary">ХОД #{String(entry.turnNumber).padStart(4, "0")}</span>
          <span className="mono-code text-[10px] text-muted-foreground">{dateText}</span>
        </div>
        <div className="ml-auto max-w-[94%] rounded-xl rounded-br-sm bg-primary/10 p-3 text-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Ты</p>
          <p className="whitespace-pre-wrap">{entry.playerIntent}</p>
        </div>
        <div className="max-w-[98%] rounded-xl rounded-bl-sm bg-secondary/70 p-3 text-sm leading-relaxed">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Мастер</p>
          <p className="whitespace-pre-wrap">{entry.gmNarration || entry.worldOutcome}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-border bg-background/60 p-2 text-[10px] text-muted-foreground sm:grid-cols-3">
          <span>Дата: {dateText}</span>
          <span>Время: {clockMatch ? `${clockMatch[1]}:${clockMatch[2]}` : "не установлено"}</span>
          <span>Время суток: {timeOfDay}</span>
          <span className="col-span-2 sm:col-span-1">Место: {place}</span>
          <span>Температура: {temperature}</span>
          <span>Время мира: +{entry.timeDeltaMinutes} мин</span>
        </div>
        {entry.rolls.length > 0 && (
          <div className="rounded-lg border border-primary/25 bg-background/60 p-2 text-xs">
            <p className="mb-1 flex items-center gap-1 font-semibold"><Dices className="h-3.5 w-3.5" />Броски</p>
            {entry.rolls.map((roll) => <p key={roll.id}>{roll.label}: {roll.formula} → {roll.result}</p>)}
          </div>
        )}
        <p className="text-right text-[10px] text-muted-foreground">HP: {entry.hpDelta > 0 ? "+" : ""}{entry.hpDelta}</p>
      </article>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-40">
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

      <section className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <div className="min-w-0 space-y-0.5 text-[10px] leading-tight text-muted-foreground">
          <p><span className="text-foreground/60">Регион:</span> {currentLocation?.region || "не установлен"}</p>
          <p><span className="text-foreground/60">Город:</span> {currentLocation?.cityName || currentLocation?.name || worldState.startLocationName || "не установлен"}</p>
          <p><span className="text-foreground/60">Место:</span> {currentLocation?.placeName || "точка не уточнена"}</p>
          <p><span className="text-foreground/60">Год:</span> {displayYear}</p>
          <p><span className="text-foreground/60">Месяц:</span> {displayMonth}</p>
          <p><span className="text-foreground/60">День:</span> {displayDay}</p>
          <p><span className="text-foreground/60">Время:</span> {clockMatch ? clockMatch[1] + ":" + clockMatch[2] : "не установлено"}</p>
          <p><span className="text-foreground/60">Температура:</span> {displayTemperature}</p>
          <p className="pt-1 text-[9px]">Ход #{String(nextTurnNumber).padStart(4, "0")}</p>
        </div>
        <Link to="/character" aria-label="Состояние персонажа" title="Состояние персонажа" className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-border bg-background/70 px-3 py-2 text-muted-foreground hover:text-foreground"><UserRound className="h-6 w-6"/><span className="text-[10px] font-semibold">Персонаж</span></Link>
      </section>

      {activePanel === "chat" && (
      <div className="space-y-4">
      {!setupReady && (
        <section className="panel-surface space-y-3 border-status-approx/40 p-4">
          <div className="flex items-center gap-2"><Lock className="h-5 w-5 text-status-approx" /><h2 className="font-semibold text-foreground">Кампания не готова к игре</h2></div>
          <p className="text-sm text-muted-foreground">Нужны подтверждённая подготовка, обработанные и проверенные источники ОБСИДИАН 4.1 / Хроника / досье, а также полный лист персонажа. Никакая сцена не создаётся на основании неподтверждённых или пустых источников.</p>
          <ul className="space-y-1 text-xs">
            {requiredSourceTypes.map((type) => {
              const ready = sources.some((source) => source.type === type && (
                (type === "GOVERNING_DOC" || type === "WORLD_CANON")
                  ? source.serverManaged === true
                  : source.contentStatus === "ATTACHED" && source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true
              ));
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

      {sessionLog.lastTurnNumber === 0 && character.recentPreCampaignHistory?.trim() && (
        <article className="rounded-xl border border-border bg-card/60 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-primary">Последний месяц перед прибытием</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{character.recentPreCampaignHistory}</div>
        </article>
      )}

      {opening && (
        <article className="rounded-xl rounded-bl-sm bg-secondary/70 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-primary">Предыстория · появление персонажа</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{opening}</div>
          <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">Вступление сохранено отдельно. Игровые действия ещё не совершались; следующий ответ мастера будет ходом #0001.</p>
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
            {gmTurn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА") && (() => {
              const pending = gmTurn.rolls.find((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА")!;
              const parsed = parseDiceFormula(pending.formula);
              const sides = parsed?.terms[0]?.sides ?? 20;
              const diePoints: Record<number, string> = {
                4: "50,8 91,82 9,82",
                6: "18,18 82,18 82,82 18,82",
                8: "50,6 94,50 50,94 6,50",
                10: "50,5 91,32 75,84 25,84 9,32",
                12: "50,5 89,27 89,73 50,95 11,73 11,27",
                20: "50,5 88,25 95,68 50,95 5,68 12,25",
                100: "50,5 91,32 75,84 25,84 9,32",
              };
              return (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pending-roll-title">
                  <div className="w-full max-w-sm space-y-5 rounded-2xl border border-primary/40 bg-card p-5 shadow-2xl">
                    <div className="flex items-center justify-center gap-2 text-base font-bold" id="pending-roll-title">
                      <Dices className="h-5 w-5 text-primary" />Мастер назначил проверку
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-lg font-semibold">{pending.label}</p>
                      <p className="text-sm text-muted-foreground">Формула броска: <span className="mono-code font-semibold">{pending.formula}</span></p>
                      <p className="text-xs text-muted-foreground">Исход действия будет определён после случайного броска мастера.</p>
                    </div>
                    <button
                      type="button"
                      disabled={gmBusy || rollAnimating || !parsed}
                      onClick={handleRollPendingCheck}
                      className="group mx-auto flex w-full flex-col items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 transition hover:border-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Бросить кость d${sides}`}
                    >
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {parsed?.terms.map((term, index) => (
                          <div key={index} className="flex flex-col items-center gap-0.5">
                            <svg viewBox="0 0 100 100" className={`h-20 w-20 drop-shadow-lg transition-transform duration-200 group-hover:scale-105 group-active:rotate-12 ${rollAnimating ? "animate-spin" : ""}`} role="img" aria-label={`Кость d${term.sides}`}>
                              <polygon points={diePoints[term.sides] ?? diePoints[20]!} fill="currentColor" className="text-primary/20" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                              <path d="M50 5 L50 50 L12 25 M50 50 L88 25 M50 50 L95 68 M50 50 L50 95 M50 50 L5 68" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/60" />
                              <text x="50" y="58" textAnchor="middle" fontSize={term.sides === 100 ? 16 : 25} fontWeight="800" fill="currentColor">{term.sides === 100 ? "100" : term.sides}</text>
                            </svg>
                            <span className="text-[10px] text-muted-foreground">{term.count > 1 ? `×${term.count}` : `d${term.sides}`}</span>
                          </div>
                        ))}
                      </div>
                      <span className="text-sm font-semibold">{rollAnimating ? "Кубик бросается…" : "Нажми на кубик, чтобы мастер бросил"}</span>
                      <span className="text-xs text-muted-foreground">{parsed ? `${parsed.totalDice} кость(и) · модификатор ${parsed.modifier >= 0 ? "+" : ""}${parsed.modifier}` : "Формула не поддерживается — ход остановлен"}</span>
                    </button>
                    <p className="text-center text-[11px] text-muted-foreground">Результат генерируется защищённым сервером и передаётся мастеру без изменений.</p>
                  </div>
                </div>
              );
            })()}
          </article>
        )}
      </section>

      {rollDisplay && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-card p-3 text-sm" role="status" aria-live="polite">
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {rollDisplay.dice.map((die, index) => (
              <div key={index} className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border ${die.kept ? "border-primary/50 bg-primary/10" : "border-border bg-muted opacity-50"}`}>
                <span className="text-[9px] text-muted-foreground">d{die.sides}</span>
                <span className="mono-code text-base font-bold">{die.value}</span>
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{rollDisplay.label}</p>
            <p className="text-xs text-muted-foreground">Модификатор: {rollDisplay.modifier >= 0 ? "+" : ""}{rollDisplay.modifier}</p>
            <p className="mono-code text-base font-bold">Итого: {rollDisplay.total}</p>
            <p className="text-xs text-muted-foreground">Серверный результат передан мастеру без изменений.</p>
          </div>
        </div>
      )}

      {gmError && <div role="alert" className="panel-surface flex items-start gap-2 border-status-danger/50 bg-status-danger-bg/40 p-3 text-sm text-status-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{gmError}</span></div>}
      {lastStorageError && <div role="alert" className="panel-surface text-sm text-status-danger">{lastStorageError}</div>}
      {gmBusy && <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" />Мастер обрабатывает запрос…</div>}

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
            <div className="text-right"><p className="text-xs text-muted-foreground">Известный вес</p><p className="text-xl font-semibold">{character.inventory.every((item) => item.unitWeightLb !== null && item.unitWeightLb !== undefined) ? (character.inventory.reduce((sum, item) => sum + (item.unitWeightLb ?? 0) * item.quantity, 0) + (character.currency ? Object.values(character.currency).reduce((sum, count) => sum + count, 0) / 50 : 0)).toFixed(1) + " lb" : "Частично известен"}</p></div>
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

      {activePanel === "skills" && (
        <section className="space-y-3">
          <div className="panel-surface space-y-1 p-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4"/>Навыки и способности</h2><p className="text-xs text-muted-foreground">{character.name} · {character.speciesAndClass} · уровень {character.level ?? "не установлен"}</p><p className="text-[10px] text-muted-foreground">Показываются только значения из листа персонажа. Неустановленные бонусы не рассчитываются автоматически.</p></div>
          <div className="panel-surface space-y-2 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Основные характеристики</h3>{character.abilityScores ? <div className="grid grid-cols-3 gap-2">{([["СИЛ", character.abilityScores.strength], ["ЛОВ", character.abilityScores.dexterity], ["ТЕЛ", character.abilityScores.constitution], ["ИНТ", character.abilityScores.intelligence], ["МДР", character.abilityScores.wisdom], ["ХАР", character.abilityScores.charisma]] as const).map(([label, score]) => <div key={label} className="rounded-lg border border-border bg-background/60 p-2 text-center"><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-lg font-semibold tabular-nums">{score}</p><p className="text-[10px] text-muted-foreground">{score >= 10 ? "+" : ""}{Math.floor((score - 10) / 2)}</p></div>)}</div> : <p className="text-xs text-muted-foreground">Характеристики не загружены.</p>}</div>
          <div className="panel-surface space-y-2 p-3"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Навыки</h3><span className="text-[10px] text-muted-foreground">Бонус мастерства: {character.proficiencyBonus == null ? "не установлен" : `+${character.proficiencyBonus}`}</span></div>{!character.skillBonuses?.length ? <p className="text-xs text-muted-foreground">Навыки и бонусы не загружены.</p> : character.skillBonuses.map((skill, index) => <div key={`${skill.name}-${index}`} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0"><div className="min-w-0"><p className="text-sm font-medium">{skill.name}</p><p className="text-[10px] text-muted-foreground">{skill.basis}</p></div><span className="mono-code shrink-0 text-sm font-semibold">{skill.bonus >= 0 ? "+" : ""}{skill.bonus}</span></div>)}</div>
          <div className="panel-surface space-y-2 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Спасброски</h3>{character.savingThrowBonuses ? <div className="grid grid-cols-2 gap-2 text-xs">{(["strength","dexterity","constitution","intelligence","wisdom","charisma"] as const).map((key) => { const labels = { strength: "Сила", dexterity: "Ловкость", constitution: "Телосложение", intelligence: "Интеллект", wisdom: "Мудрость", charisma: "Харизма" }; const value = character.savingThrowBonuses![key]; return <div key={key} className="flex justify-between rounded-md bg-background/60 px-2 py-2"><span>{labels[key]}</span><strong className="mono-code">{value >= 0 ? "+" : ""}{value}</strong></div>; })}</div> : <p className="text-xs text-muted-foreground">Бонусы спасбросков не установлены.</p>}</div>
          <div className="panel-surface space-y-2 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Особенности класса</h3>{!character.classFeaturesByLevel?.length ? <p className="text-xs text-muted-foreground">Особенности класса не загружены.</p> : character.classFeaturesByLevel.map((entry) => <div key={entry.level} className="border-b border-border py-2 last:border-0"><p className="text-xs font-semibold">Уровень {entry.level}</p><p className="whitespace-pre-wrap text-xs">{entry.features}</p></div>)}</div>
          <div className="panel-surface space-y-2 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Боевые параметры</h3><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-md bg-background/60 p-2">Класс брони <strong className="float-right">{character.armorClass ?? "—"}</strong></div><div className="rounded-md bg-background/60 p-2">Скорость <strong className="float-right">{character.speedFeet == null ? "—" : `${character.speedFeet} фт.`}</strong></div><div className="rounded-md bg-background/60 p-2">Кость хитов <strong className="float-right">{character.hitDice || "—"}</strong></div><div className="rounded-md bg-background/60 p-2">HP <strong className="float-right">{character.hpCurrent ?? "—"}/{character.hpMax ?? "—"}</strong></div></div>{character.weaponAttacks?.length ? character.weaponAttacks.map((attack, index) => <div key={`${attack.weapon}-${index}`} className="border-t border-border pt-2 text-xs"><p className="font-semibold">{attack.weapon}</p><p className="text-muted-foreground">Атака {attack.attackBonus >= 0 ? "+" : ""}{attack.attackBonus} · урон {attack.damage} · мастерство {attack.mastery || "не указано"}</p></div>) : <p className="text-xs text-muted-foreground">Атаки оружием не загружены.</p>}</div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.24)] backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="player-action" className="sr-only">Действие персонажа</Label>
            <Textarea
              id="player-action"
              rows={1}
              value={playerAction}
              onChange={(event) => setPlayerAction(event.target.value)}
              onFocus={() => setActivePanel("chat")}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (playerAction.trim() && setupReady && !draftReady && !gmTurn && !gmBusy && session?.access_token) { setActivePanel("chat"); void handleResolveAction(); } } }}
              disabled={!setupReady || draftReady || Boolean(gmTurn) || gmBusy}
              placeholder={!setupReady ? "Сначала подготовь кампанию…" : draftReady ? "Мастер автоматически записывает ход…" : gmBusy ? "Мастер обрабатывает действие…" : "Что делает персонаж?…"}
              className="min-h-11 max-h-24 resize-none text-sm"
            />
          </div>
          <Button
            type="button"
            size="icon"
            aria-label="Отправить действие мастеру"
            title="Отправить действие мастеру"
            className="h-11 w-11 shrink-0"
            disabled={!playerAction.trim() || !session?.access_token || !setupReady || draftReady || Boolean(gmTurn) || gmBusy}
            onClick={() => { setActivePanel("chat"); void handleResolveAction(); }}
          >
            <Send className="h-4 w-4" />
          </Button>
          <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1">
            <Button type="button" size="icon" variant={activePanel === "inventory" ? "default" : "ghost"} aria-label="Инвентарь" title="Инвентарь" className="h-10 w-9" onClick={() => setActivePanel("inventory")}><Backpack className="h-4 w-4"/></Button>
            <Button type="button" size="icon" variant={activePanel === "quests" ? "default" : "ghost"} aria-label="Журнал квестов" title="Журнал квестов" className="h-10 w-9" onClick={() => setActivePanel("quests")}><ClipboardList className="h-4 w-4"/></Button>
            <Button type="button" size="icon" variant={activePanel === "knowledge" ? "default" : "ghost"} aria-label="Журнал знаний" title="Журнал знаний" className="h-10 w-9" onClick={() => setActivePanel("knowledge")}><BookOpen className="h-4 w-4"/></Button>
            <Button type="button" size="icon" variant={activePanel === "skills" ? "default" : "ghost"} aria-label="Навыки персонажа" title="Навыки персонажа" className="h-10 w-9" onClick={() => setActivePanel("skills")}><UserRound className="h-4 w-4"/></Button>
          </div>
        </div>
        {draftReady && <p className="mx-auto max-w-3xl px-4 pb-1 text-[10px] text-status-approx">Ответ мастера — черновик. Проверь и подтверди его в чате, чтобы записать ход.</p>}
      </div>

    </main>
  );
}
