import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Lock, Send, ShieldCheck, Sparkles, Swords } from "lucide-react";
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
    sessionLog, turnDraft, updateTurnDraft, checkTurnDraft, commitTurnDraft, lastStorageError,
  } = useObsidianStore();

  const { session } = useAuth();
  const gmModel = "obsidian-free";
  const [opening, setOpening] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
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

  const nextTurnNumber = sessionLog.lastTurnNumber + 1;
  const requiredSourceTypes = ["GOVERNING_DOC", "WORLD_CANON", "PLAYER_DOSSIER"] as const;
  const verifiedCoreSourcesReady = requiredSourceTypes.every((type) =>
    sources.some((source) =>
      source.type === type && source.contentStatus === "ATTACHED" &&
      source.content.trim().length > 0 && source.processing?.status === "PROCESSED" &&
      source.reviewStatus === "VERIFIED" && source.contextEnabled === true
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

  async function handleOpenCampaign() {
    setGmError(null);
    if (!setupReady) {
      setGmError("Подготовка не пройдена. Проверь три обработанных и подтверждённых источника, лист персонажа и подтверждение старта.");
      return;
    }
    if (!session?.access_token) {
      setGmError("Для работы мастера войди в аккаунт. Локальный гостевой режим не может обращаться к защищённому API.");
      return;
    }
    setOpeningBusy(true);
    try {
      const result = await resolvePlayerAction(session.access_token, makeContext("", "OPENING"), { model: gmModel });
      setOpening(formatCampaignOpening(result.turn, worldState, character, locations));
      setGmTurn(null);
      toast.success("Вступление готово. Ход не создан, время и состояние не изменены.");
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось подготовить вступительную сцену.");
    } finally {
      setOpeningBusy(false);
    }
  }

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
          <span className="mono-code rounded border border-primary/30 px-2 py-1 text-xs text-primary">ХОД #{String(nextTurnNumber).padStart(4, "0")}</span>
        </div>
        <p className="text-xs text-muted-foreground">Живой мастер · ОБСИДИАН 4.1 · D&D 5e (2024) · SRD 5.2.1</p>
      </header>

      <section className="panel-surface space-y-3 p-3">
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div><p className="text-muted-foreground">Кампания</p><p className="mt-0.5 font-semibold text-foreground">{worldState.campaignName || "UNKNOWN"}</p></div>
          <div><p className="text-muted-foreground">Игровая дата</p><p className="mt-0.5 font-semibold text-foreground">{worldState.currentInGameDate || "НЕ УСТАНОВЛЕНО"}</p></div>
          <div><p className="text-muted-foreground">Место</p><p className="mt-0.5 font-semibold text-foreground">{currentLocation?.name ?? worldState.startLocationName ?? "UNKNOWN"}</p></div>
          <div><p className="text-muted-foreground">Персонаж</p><p className="mt-0.5 font-semibold text-foreground">{character.name}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          <span>Календарь: {worldState.calendarSystem || "НЕ УСТАНОВЛЕН"}</span>
          <span>Сохранено ходов: {sessionLog.lastTurnNumber}</span>
          <span>HP: {character.hpCurrent ?? "UNKNOWN"}/{character.hpMax ?? "UNKNOWN"}</span>
        </div>
      </section>

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

      <section className="panel-surface space-y-3 p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Подключение мастера</h2></div>
        <div className="space-y-1.5 rounded-lg border border-border bg-background/50 p-3">
          <p className="text-sm font-medium text-foreground">Защищённое подключение к мастеру</p>
          <p className="text-[11px] text-muted-foreground">Ключ OpenRouter хранится только в секретах серверной функции. Браузер не получает и не отправляет сам ключ.</p>
          <p className={session?.access_token ? "text-[11px] text-status-verified" : "text-[11px] text-status-approx"}>{session?.access_token ? "Аккаунт подключён · серверная авторизация активна" : "Для вызова мастера необходимо войти в аккаунт"}</p>
          <p className="text-[11px] text-muted-foreground">Бесплатный стек: ERNIE Flash → Ling 3.2 → Gemma 4 → OpenRouter Free</p>
        </div>
        {sessionLog.lastTurnNumber === 0 && !opening && (
          <Button type="button" className="touch-target w-full" disabled={!setupReady || !session?.access_token || openingBusy} onClick={() => void handleOpenCampaign()}>
            <Sparkles className="mr-2 h-4 w-4" />{openingBusy ? "Мастер готовит вступление…" : "Начать кампанию · открыть сцену"}
          </Button>
        )}
      </section>

      {opening && (
        <section className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Вступительная сцена</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{opening}</div>
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">Вступление не является действием Лии и не продвигает игровое время. Первое действие игрока будет записано как ход #0001.</p>
        </section>
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
                <Textarea rows={2} value={clarificationAnswer} onChange={(event) => setClarificationAnswer(event.target.value)} placeholder="Уточни действие Лии…" />
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
        <Link to="/turns" className="underline underline-offset-2">Журнал и ручная проверка</Link>
        <Link to="/character" className="underline underline-offset-2">Лист персонажа</Link>
      </div>
    </main>
  );
}
