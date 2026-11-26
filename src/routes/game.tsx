import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Lock, Send, ShieldCheck, Sparkles, Swords } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildDiceContinuationAction } from "@/domain/dice-continuation";
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
    sources, worldState, character, canonFacts, npcs, factions, locations, sessionLog,
    turnDraft, updateTurnDraft, checkTurnDraft, commitTurnDraft, lastStorageError,
  } = useObsidianStore();

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [opening, setOpening] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [playerAction, setPlayerAction] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [gmBusy, setGmBusy] = useState(false);
  const [gmError, setGmError] = useState<string | null>(null);
  const [gmTurn, setGmTurn] = useState<GameMasterTurn | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [rollAnswers, setRollAnswers] = useState<Record<number, string>>({});
  const [draftReady, setDraftReady] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const [explicitConfirm, setExplicitConfirm] = useState(false);

  const nextTurnNumber = sessionLog.lastTurnNumber + 1;
  const governingReady = sources.some((source) => source.type === "GOVERNING_DOC" && source.contentStatus === "ATTACHED" && source.content.trim().length > 0);
  const canonReady = sources.some((source) => source.type === "WORLD_CANON" && source.contentStatus === "ATTACHED" && source.content.trim().length > 0);
  const dossierReady = sources.some((source) => source.type === "PLAYER_DOSSIER" && source.contentStatus === "ATTACHED" && source.content.trim().length > 0);
  const dossierRequired = character.name === "Лия Вейн";
  const setupReady = worldState.setup.confirmed && governingReady && canonReady && character.name.trim() !== "" && character.name !== "UNKNOWN" && (!dossierRequired || dossierReady);
  const currentLocation = locations.find((location) => location.id === worldState.currentLocationId);
  const journalEntries = sessionLog.entries;

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
      journal: journalEntries,
    };
  }

  async function handleOpenCampaign() {
    setGmError(null);
    if (!setupReady) {
      setGmError("Подготовка кампании не подтверждена. Проверь источники, дату, стартовую локацию и отдельный лист персонажа.");
      return;
    }
    if (!apiKey.trim()) {
      setGmError("Введи OpenAI API-ключ. Он останется только в памяти этой страницы.");
      return;
    }
    setOpeningBusy(true);
    try {
      const result = await resolvePlayerAction(apiKey, makeContext("", "OPENING"), { model });
      setOpening(result.turn.narration);
      setGmTurn(null);
      toast.success("Вступительная сцена готова. Игровое время и состояние не изменены.");
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось подготовить вступительную сцену.");
    } finally {
      setOpeningBusy(false);
    }
  }

  async function handleResolveAction(actionOverride?: string) {
    const submittedAction = actionOverride ?? playerAction;
    if (!submittedAction.trim() || !apiKey.trim() || !setupReady || draftReady) return;
    setGmError(null);
    setGmBusy(true);
    setPendingAction(submittedAction);
    setGmTurn(null);
    try {
      const result = await resolvePlayerAction(apiKey, makeContext(submittedAction, "ACTION"), { model });
      setGmTurn(result.turn);
      const waitingForRoll = result.turn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
      if (!result.turn.needsClarification && !waitingForRoll) {
        updateTurnDraft({
          summary: result.turn.summary,
          playerIntent: submittedAction.trim(),
          worldOutcome: result.turn.worldOutcome,
          gmNarration: result.turn.narration,
          timeDeltaMinutes: result.turn.timeDeltaMinutes,
          newInGameDate: result.turn.newInGameDate,
          hpDelta: result.turn.hpDelta,
          consequenceText: result.turn.consequenceText,
          characterChanges: result.turn.characterChanges,
          worldChanges: result.turn.worldChanges,
          newLocationId: result.turn.newLocationId ?? "",
          newLocationKey: result.turn.newLocationKey ?? null,
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

  function handleSubmitRolls() {
    if (!gmTurn) return;
    const pending = gmTurn.rolls.filter((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
    if (pending.length === 0 || pending.some((_, index) => !rollAnswers[index]?.trim())) return;
    try {
      const continuedAction = buildDiceContinuationAction(pendingAction, pending, rollAnswers);
      setRollAnswers({});
      void handleResolveAction(continuedAction);
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось передать результаты бросков.");
    }
  }

  function handleApplyClarification() {
    if (!gmTurn || !clarificationAnswer.trim()) return;
    setPlayerAction(`${pendingAction}\n\nОтвет игрока на уточнение мастера: ${clarificationAnswer.trim()}`);
    setClarificationAnswer("");
    setGmTurn(null);
  }

  function handleCheckDraft() {
    const result = checkTurnDraft();
    if (result.ok) {
      setDraftChecked(true);
      toast.success("Проверка хода пройдена. Подтверди запись в журнал.");
    } else {
      setDraftChecked(false);
      toast.error(result.errors.join(" "));
    }
  }

  function handleCommit() {
    if (!explicitConfirm || !draftChecked) return;
    const result = commitTurnDraft(true);
    if (result.ok) {
      setPlayerAction("");
      setPendingAction("");
      setGmTurn(null);
      setDraftReady(false);
      setDraftChecked(false);
      setExplicitConfirm(false);
      toast.success(`Ход №${nextTurnNumber} сохранён; обратное чтение и аудит пройдены.`);
    } else {
      toast.error(result.error);
    }
  }

  function renderJournalEntry(entry: GameTurnEntry | TechnicalMessageEntry) {
    if (entry.entryType === "TECHNICAL_NOTE") {
      return (
        <div key={entry.id} className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold">OOC · техническая заметка</p>
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
    <div className="space-y-4 pb-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Игровой чат</h1>
          </div>
          <span className="mono-code rounded border border-primary/30 px-2 py-1 text-xs text-primary">ХОД #{String(nextTurnNumber).padStart(4, "0")}</span>
        </div>
        <p className="text-xs text-muted-foreground">Живой мастер ОБСИДИАН 4.1 · D&D 5e (2024) · SRD 5.2.1</p>
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
          <span>Ходов сохранено: {sessionLog.lastTurnNumber}</span>
          <span>HP: {character.hpCurrent ?? "UNKNOWN"}/{character.hpMax ?? "UNKNOWN"}</span>
        </div>
      </section>

      {!setupReady && (
        <section className="panel-surface space-y-3 border-status-approx/40 p-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-status-approx" />
            <h2 className="font-semibold text-foreground">Кампания пока не готова к запуску</h2>
          </div>
          <p className="text-sm text-muted-foreground">Сначала прикрепи оригиналы ОБСИДИАН 4.1 и Хроники Экдрасиля, проверь отдельный лист персонажа и подтверди стартовые параметры. Никакая сцена не будет создана на основании пустых источников.</p>
          <ul className="space-y-1 text-xs">
            <li className={governingReady ? "text-status-verified" : "text-status-approx"}>{governingReady ? "✓" : "○"} ОБСИДИАН 4.1</li>
            <li className={canonReady ? "text-status-verified" : "text-status-approx"}>{canonReady ? "✓" : "○"} Хроника Экдрасиля</li>
            <li className={dossierReady ? "text-status-verified" : "text-status-approx"}>{dossierReady ? "✓" : "○"} Досье персонажа {dossierReady ? "прикреплено" : dossierRequired ? "(обязательно для Лии Вейн)" : "(необязательно, если лист заполнен вручную)"}</li>
            <li className={worldState.setup.confirmed ? "text-status-verified" : "text-status-approx"}>{worldState.setup.confirmed ? "✓" : "○"} Мастер подготовки подтверждён</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary"><Link to="/sources">Источники</Link></Button>
            <Button asChild><Link to="/settings">Настройки кампании</Link></Button>
            <Button asChild variant="outline"><Link to="/character">Лист персонажа</Link></Button>
          </div>
        </section>
      )}

      <section className="panel-surface space-y-3 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Подключение мастера</h2>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="game-api-key">OpenAI API-ключ</Label>
          <Input id="game-api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" className="touch-target" />
          <p className="text-[11px] text-muted-foreground">Ключ хранится только в памяти открытой страницы и не записывается в кампанию, localStorage или журнал. Запросы к API оплачиваются отдельно от подписки ChatGPT.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="game-model">Модель</Label>
          <Input id="game-model" value={model} onChange={(event) => setModel(event.target.value)} className="touch-target" />
        </div>
        {sessionLog.lastTurnNumber === 0 && !opening && (
          <Button type="button" className="touch-target w-full" disabled={!setupReady || !apiKey.trim() || openingBusy} onClick={() => void handleOpenCampaign()}>
            <Sparkles className="mr-2 h-4 w-4" />
            {openingBusy ? "Мастер готовит вступление…" : "Начать кампанию · открыть сцену"}
          </Button>
        )}
      </section>

      {opening && (
        <section className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Вступительная сцена</p>
            <span className="mono-code text-[10px] text-muted-foreground">перед ходом #0001</span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{opening}</div>
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">Вступление не является действием Лии и не продвигает игровое время. Первое действие игрока будет записано как ход #0001.</p>
        </section>
      )}

      <section className="space-y-3" aria-live="polite">
        {journalEntries.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-foreground">История диалога</h2>
            {journalEntries.map((entry) => renderJournalEntry(entry))}
          </>
        )}
        {gmTurn && pendingAction && (
          <article className="space-y-2 rounded-xl border border-primary/30 bg-card p-3">
            <div className="ml-auto max-w-[94%] rounded-xl rounded-br-sm bg-primary/10 p-3 text-sm">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Ты</p>
              <p className="whitespace-pre-wrap">{pendingAction}</p>
            </div>
            <div className="rounded-xl rounded-bl-sm bg-secondary/70 p-3 text-sm leading-relaxed">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Мастер</p>
              <p className="whitespace-pre-wrap">{gmTurn.narration}</p>
            </div>
            {gmTurn.needsClarification && (
              <div className="space-y-2 rounded-lg border border-status-approx/40 p-3">
                <p className="text-xs font-semibold text-status-approx">Мастеру нужно уточнение · время не продвигается</p>
                <p className="text-sm">{gmTurn.clarificationQuestion}</p>
                <Textarea rows={2} value={clarificationAnswer} onChange={(event) => setClarificationAnswer(event.target.value)} placeholder="Уточни, что именно делает Лия…" />
                <Button type="button" variant="outline" disabled={!clarificationAnswer.trim()} onClick={handleApplyClarification}>Передать уточнение</Button>
              </div>
            )}
            {gmTurn.rolls.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold">Проверки и броски</p>
                {gmTurn.rolls.map((roll, index) => {
                  const pendingIndex = gmTurn.rolls.filter((item) => item.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА").findIndex((item) => item === roll);
                  return (
                    <div key={index} className="space-y-1 rounded border border-border/60 p-2">
                      <p className="text-xs">{roll.label} · {roll.formula} · {roll.result}</p>
                      {roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА" && (
                        <Input inputMode="numeric" value={rollAnswers[pendingIndex] ?? ""} onChange={(event) => setRollAnswers((current) => ({ ...current, [pendingIndex]: event.target.value }))} placeholder="Результат твоего броска" className="touch-target mono-code" />
                      )}
                    </div>
                  );
                })}
                {gmTurn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА") && (
                  <Button type="button" variant="outline" className="w-full" disabled={gmTurn.rolls.filter((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА").some((_, index) => !rollAnswers[index]?.trim())} onClick={handleSubmitRolls}>Передать броски мастеру</Button>
                )}
              </div>
            )}
          </article>
        )}
      </section>

      {draftReady && (
        <section className="panel-surface space-y-3 border-status-verified/40 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-verified" />
            <h2 className="text-sm font-semibold text-foreground">Ход #{nextTurnNumber} готов к проверке</h2>
          </div>
          <p className="text-xs text-muted-foreground">{turnDraft.summary} · изменение времени: {turnDraft.timeDeltaMinutes} мин · дата после хода: {turnDraft.newInGameDate}</p>
          {!draftChecked ? (
            <Button type="button" variant="secondary" className="w-full" onClick={handleCheckDraft}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Проверить и подготовить сохранение
            </Button>
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

      {gmError && (
        <div role="alert" className="panel-surface flex items-start gap-2 border-status-danger/50 bg-status-danger-bg/40 p-3 text-sm text-status-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{gmError}</span>
        </div>
      )}
      {lastStorageError && (
        <div role="alert" className="panel-surface text-sm text-status-danger">{lastStorageError}</div>
      )}

      {setupReady && (sessionLog.lastTurnNumber > 0 || opening) && !draftReady && !gmTurn && (
        <section className="panel-surface space-y-2 p-3">
          <Label htmlFor="player-action">Что делает {character.name}?</Label>
          <Textarea id="player-action" rows={3} value={playerAction} onChange={(event) => setPlayerAction(event.target.value)} placeholder="Опиши действие своими словами. Можно попытаться сделать что угодно — мастер оценит возможность, риски и механику." />
          <Button type="button" className="touch-target w-full" disabled={!playerAction.trim() || !apiKey.trim() || gmBusy} onClick={() => void handleResolveAction()}>
            <Send className="mr-2 h-4 w-4" /> {gmBusy ? "Мастер отвечает…" : "Отправить мастеру"}
          </Button>
        </section>
      )}

      {gmBusy && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Мастер обрабатывает запрос…
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <Link to="/turns" className="underline underline-offset-2">Открыть журнал и ручную проверку ходов</Link>
        <Link to="/character" className="underline underline-offset-2">Лист персонажа</Link>
      </div>
    </div>
  );
}
