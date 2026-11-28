import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Dices,
  Lock,
  MessageSquareCode,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { SetupGateBanner } from "@/components/StatusPill";
import { isCampaignActive } from "@/domain/campaign-state";
import { resolvePlayerAction, type GameMasterTurn } from "@/domain/game-master";
import { buildDiceContinuationAction } from "@/domain/dice-continuation";
import { rollDiceExpression } from "@/domain/dice-roll";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CertaintyStatus, EpistemicLayer } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/turns")({
  head: () => ({
    meta: [
      { title: "Ходы и журнал — Obsidian Control" },
      {
        name: "description",
        content: "Append-only журнал ходов с черновиком, проверкой и подтверждением commit.",
      },
      { property: "og:title", content: "Ходы и журнал — Obsidian Control" },
      {
        property: "og:description",
        content: "Append-only журнал ходов с черновиком, проверкой и подтверждением commit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TurnsPage,
});

function TurnsPage() {
  const {
    sources,
    worldState,
    character,
    canonFacts,
    npcs,
    factions,
    locations,
    sessionLog,
    turnDraft,
    lastStorageError,
    updateTurnDraft,
    saveTurnDraftExplicit,
    checkTurnDraft,
    commitTurnDraft,
    addTechnicalMessage,
  } = useObsidianStore();

  const [explicitConfirm, setExplicitConfirm] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccessMsg, setCommitSuccessMsg] = useState<string | null>(null);
  const [techText, setTechText] = useState("");
  const [playerAction, setPlayerAction] = useState("");
  const [gmBusy, setGmBusy] = useState(false);
  const [gmError, setGmError] = useState<string | null>(null);
  const [gmTurn, setGmTurn] = useState<GameMasterTurn | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [rollAnswers, setRollAnswers] = useState<Record<number, string>>({});

  const [rollLabel, setRollLabel] = useState("");
  const [rollFormula, setRollFormula] = useState("1d20");
  const [rollResult, setRollResult] = useState("");

  const campaignActive = isCampaignActive(worldState.setup.confirmed, sessionLog.lastTurnNumber);
  const nextTurnNumber = sessionLog.lastTurnNumber + 1;

  async function handleResolveAction(actionOverride?: string) {
    const submittedAction = actionOverride ?? playerAction;
    setGmError(null);
    setGmTurn(null);
    if (!submittedAction.trim()) return;
    if (!campaignActive) {
      setGmError("Сначала завершите обязательную подготовку кампании.");
      return;
    }
    setGmBusy(true);
    try {
      const result = await resolvePlayerAction({
        action: submittedAction,
        sources,
        world: worldState,
        character,
        canonFacts,
        npcs,
        factions,
        locations,
        journal: sessionLog.entries,
      });
      setGmTurn(result.turn);
      if (!result.turn.needsClarification && !result.turn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА")) {
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
            id: `gm-roll-${Date.now().toString(36)}-${index}`,
            label: roll.label, formula: roll.formula, result: roll.result,
          })),
        });
        setExplicitConfirm(false);
      }
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось получить ответ мастера.");
    } finally {
      setGmBusy(false);
    }
  }

  function handleRollForPlayer(pendingIndex: number, formula: string) {
    try {
      const result = rollDiceExpression(formula);
      setRollAnswers((current) => ({ ...current, [pendingIndex]: result.display }));
      setGmError(null);
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось выполнить бросок.");
    }
  }

  function handleSubmitRolls() {
    if (!gmTurn) return;
    const pending = gmTurn.rolls.filter((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА");
    if (pending.length === 0 || pending.some((_, index) => !rollAnswers[index]?.trim())) return;
    let continuedAction: string;
    try {
      continuedAction = buildDiceContinuationAction(playerAction, pending, rollAnswers);
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Не удалось передать результаты бросков.");
      return;
    }
    setPlayerAction(continuedAction);
    setRollAnswers({});
    void handleResolveAction(continuedAction);
  }

  function handleApplyClarification() {
    if (!gmTurn || !playerAction.trim() || !clarificationAnswer.trim()) return;
    setPlayerAction(`${playerAction.trim()}\n\nОтвет игрока на уточнение мастера: ${clarificationAnswer.trim()}`);
    setClarificationAnswer("");
    setGmTurn(null);
  }

  function handleAddRoll() {
    if (!rollLabel.trim() || !rollResult.trim()) {
      toast.error("Укажите название броска и зафиксированный результат.");
      return;
    }
    updateTurnDraft({
      rolls: [
        ...turnDraft.rolls,
        {
          id: `roll-${Date.now().toString(36)}`,
          label: rollLabel.trim(),
          formula: rollFormula.trim() || "—",
          result: rollResult.trim(),
        },
      ],
    });
    setRollLabel("");
    setRollResult("");
    setExplicitConfirm(false);
  }

  function handleRemoveRoll(id: string) {
    updateTurnDraft({ rolls: turnDraft.rolls.filter((r) => r.id !== id) });
    setExplicitConfirm(false);
  }

  function handleCheckDraft() {
    setCommitError(null);
    setCommitSuccessMsg(null);
    const res = checkTurnDraft();
    if (res.ok) {
      toast.success("Черновик прошёл проверку. Теперь требуется явное подтверждение игрока.");
    } else {
      toast.error("В черновике обнаружены ошибки проверки.");
    }
  }

  function handleCommit() {
    setCommitError(null);
    setCommitSuccessMsg(null);
    const res = commitTurnDraft(explicitConfirm);
    if (res.ok) {
      setExplicitConfirm(false);
      setPlayerAction("");
      setGmTurn(null);
      setClarificationAnswer("");
      const msg = `Ход №${nextTurnNumber} зафиксирован в session_log; read-back сравнение payload и контрольных сумм пройдено.`;
      setCommitSuccessMsg(msg);
      toast.success(msg);
    } else {
      setCommitError(res.error);
      toast.error(res.error);
    }
  }

  function handleAddTechNote(e: FormEvent) {
    e.preventDefault();
    const res = addTechnicalMessage(techText);
    if (res.ok) {
      toast.success("Техническое сообщение записано (номер хода и время не изменены).");
      setTechText("");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">Ходы и журнал</h1>
          <span className="mono-code text-xs text-primary">
            Игровых ходов: {sessionLog.lastTurnNumber}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Append-only журнал session_log без автоматического коммита. Ход проходит этапы «Черновик
          (turn_drafts) → Проверка → Явное подтверждение → Commit + read-back сравнение payload».
        </p>
      </header>

      <SetupGateBanner confirmed={campaignActive} />\n\n      <section className="panel-surface space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Игровой мастер · живой ход</h2>
            <p className="text-xs text-muted-foreground">Серверный мастер получает ОБСИДИАН 4.1, D&D 2024 / SRD 5.2.1, канон Экдрасиля 2.4 и актуальное состояние кампании.</p>
          </div>
          <span className="mono-code rounded border border-primary/30 px-2 py-1 text-[10px] text-primary">AI GM</span>
        </div>
        <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
          Запрос проходит через защищённый серверный шлюз Obsidian GM. API-ключ модели не вводится в приложении и не передаётся браузеру. Маршрут модели и резервный провайдер выбираются сервером. Для работы требуется активная учётная запись приложения.
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gm-action">Что делает персонаж?</Label>
          <Textarea id="gm-action" rows={4} value={playerAction} onChange={(e) => setPlayerAction(e.target.value)} placeholder="Опиши действие от лица персонажа. Не нужно выбирать готовый вариант — можно попытаться сделать что угодно." />
        </div>
        <Button type="button" className="touch-target w-full" disabled={gmBusy || !playerAction.trim() || !campaignActive} onClick={handleResolveAction}>
          {gmBusy ? "Мастер обрабатывает действие…" : "Отправить действие мастеру"}
        </Button>
        {!campaignActive && <p className="text-xs text-status-approx">Игровой процесс заблокирован до завершения подготовки кампании.</p>}
        {gmError && <div role="alert" className="rounded border border-status-danger/50 bg-status-danger-bg/40 p-3 text-sm text-status-danger">{gmError}</div>}
        {gmTurn && (
          <div className="space-y-3 rounded-md border border-primary/30 bg-background/60 p-3">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{gmTurn.narration}</div>
            {gmTurn.needsClarification && (
              <div className="space-y-2 rounded border border-status-approx/40 p-3">
                <p className="text-xs font-semibold text-status-approx">Нужно уточнение · ход и время не зафиксированы</p>
                <p className="text-sm">{gmTurn.clarificationQuestion}</p>
                <Textarea rows={2} value={clarificationAnswer} onChange={(e) => setClarificationAnswer(e.target.value)} placeholder="Твой ответ мастеру…" />
                <Button type="button" variant="outline" className="touch-target" disabled={!clarificationAnswer.trim()} onClick={handleApplyClarification}>Ответить и продолжить</Button>
              </div>
            )}
            {gmTurn.rolls.length > 0 && (
              <div className="space-y-1 rounded border border-border p-3">
                <p className="text-xs font-semibold">Проверки и броски</p>
                {gmTurn.rolls.map((roll, index) => (
                  <div key={index} className="space-y-1 rounded border border-border/60 p-2">
                    <p className="text-xs">{roll.label}: {roll.formula} · {roll.result}</p>
                    {roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА" && (
                      {(() => {
                        const pendingIndex = gmTurn.rolls.filter((item) => item.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА").findIndex((item) => item === roll);
                        const answer = rollAnswers[pendingIndex];
                        return (
                          <div className="space-y-2">
                            {answer && <p className="mono-code text-sm text-status-verified">Результат: {answer}</p>}
                            <Button type="button" variant="outline" className="touch-target w-full"
                              disabled={Boolean(answer)}
                              onClick={() => handleRollForPlayer(pendingIndex, roll.formula)}>
                              <Dices className="mr-2 h-4 w-4" /> {answer ? "Бросок выполнен" : "Бросить кубик"}
                            </Button>
                          </div>
                        );
                      })()}
                    )}
                  </div>
                ))}
                {gmTurn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА") && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs text-status-approx">Бросок выполняешь ты. Мастер не подставляет случайный результат и не двигает время до ответа.</p>
                    <Button type="button" variant="outline" className="touch-target w-full"
                      disabled={gmTurn.rolls.filter((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА").some((_, index) => !rollAnswers[index]?.trim())}
                      onClick={handleSubmitRolls}>Передать результаты мастеру и продолжить</Button>
                  </div>
                )}
              </div>
            )}
            {!gmTurn.needsClarification && !gmTurn.rolls.some((roll) => roll.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА") && (
              <div className="space-y-1 rounded border border-status-verified/40 p-3 text-xs">
                <p className="font-semibold text-status-verified">Черновик следующего хода подготовлен, но ещё не сохранён.</p>
                <p>Проверь его ниже, выполни проверку и только затем подтверди commit. Мастер не записывает ход без твоего подтверждения.</p>
                {gmTurn.characterChanges.inventory.map((change, index) => <p key={`inv-${index}`}>Инвентарь · {change.action}: {change.name} ×{change.quantity}</p>)}
                {gmTurn.characterChanges.resources.map((change, index) => <p key={`res-${index}`}>Ресурс · {change.name}: {change.current ?? "?"}/{change.max ?? "?"}</p>)}
                {gmTurn.characterChanges.conditions.map((change, index) => <p key={`cond-${index}`}>Состояние · {change.action}: {change.name}</p>)}
                {Object.entries(gmTurn.characterChanges.currencyDelta).filter(([, delta]) => delta !== 0).map(([coin, delta]) => <p key={coin}>Валюта · {coin.toUpperCase()}: {delta > 0 ? "+" : ""}{delta}</p>)}
                {gmTurn.newLocationId && <p>Переход в зарегистрированную локацию: {locations.find((location) => location.id === gmTurn.newLocationId)?.name ?? gmTurn.newLocationId}</p>}
                {gmTurn.newLocationKey && <p>Новая локация: {gmTurn.worldChanges.newLocations.find((location) => location.tempId === gmTurn.newLocationKey)?.name ?? gmTurn.newLocationKey}</p>}
                {gmTurn.worldChanges.facts.map((fact, index) => <p key={`fact-${index}`}>Факт · {fact.layer}/{fact.certainty}: {fact.title} — {fact.statement}</p>)}
                {gmTurn.worldChanges.npcUpdates.map((update, index) => <p key={`npc-update-${index}`}>NPC · изменение {update.npcId}: {update.reason}</p>)}
                {gmTurn.worldChanges.npcKnowledgeAdditions.map((entry, index) => <p key={`npc-knowledge-${index}`}>Знание NPC · {entry.npcId}: {entry.factSummary} (путь: {entry.acquisitionPath})</p>)}
                {gmTurn.worldChanges.newNpcs.map((npc) => <p key={npc.tempId}>Новый NPC · {npc.name} — {npc.role}</p>)}
                {gmTurn.worldChanges.factionUpdates.map((update, index) => <p key={`faction-update-${index}`}>Фракция · изменение {update.factionId}: {update.reason}</p>)}
                {gmTurn.worldChanges.newFactions.map((faction) => <p key={faction.tempId}>Новая фракция · {faction.name}</p>)}
                {gmTurn.worldChanges.newLocations.map((location) => <p key={location.tempId}>Новая локация · {location.name} ({location.region}); расстояние: {location.distanceFromCurrent}, время: {location.travelTimeHours ?? "UNKNOWN"} ч.</p>)}
                {gmTurn.worldChanges.delayedEvents.map((event, index) => <p key={`event-${index}`}>Отложенное событие · {event.title}: {event.triggerInGameDate} — {event.consequence}</p>)}
                {gmTurn.stateNotes.map((note, index) => <p key={`note-${index}`}>· {note}</p>)}
              </div>
            )}
          </div>
        )}
      </section>

      {(commitError || lastStorageError) && (
        <div
          role="alert"
          className="panel-surface flex items-start gap-2.5 border-status-danger/60 bg-status-danger-bg/60 p-3.5 text-sm text-status-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Ошибка фиксации / проверки целостности</p>
            <p className="text-xs">{commitError ?? lastStorageError}</p>
          </div>
        </div>
      )}

      {commitSuccessMsg && (
        <div className="panel-surface flex items-start gap-2.5 border-status-verified/50 bg-status-verified-bg/50 p-3.5 text-sm text-status-verified">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{commitSuccessMsg}</span>
        </div>
      )}

      {/* Turn draft form (locked until setup confirmed) */}
      <section className="panel-surface space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Черновик игрового хода №{nextTurnNumber}
          </h2>
          <span className="mono-code text-xs text-muted-foreground">
            Текущая дата: {worldState.currentInGameDate}
          </span>
        </div>

        {!campaignActive ? (
          <div className="flex items-center gap-2 rounded border border-border bg-background/60 p-3 text-xs text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0 text-status-approx" />
            Создание и commit игровых ходов заблокированы до завершения Мастера подготовки кампании.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="turn-summary">1. Краткое содержание хода *</Label>
              <Input
                id="turn-summary"
                value={turnDraft.summary}
                onChange={(e) => {
                  updateTurnDraft({ summary: e.target.value });
                  setExplicitConfirm(false);
                }}
                placeholder="Что произошло в этом ходе"
                className="touch-target"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="turn-intent">Действие / намерение персонажа</Label>
              <Textarea
                id="turn-intent"
                rows={2}
                value={turnDraft.playerIntent}
                onChange={(e) => {
                  updateTurnDraft({ playerIntent: e.target.value });
                  setExplicitConfirm(false);
                }}
                placeholder="Заявленное действие игрока..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="turn-outcome">Зафиксированный исход в мире *</Label>
              <Textarea
                id="turn-outcome"
                rows={2}
                value={turnDraft.worldOutcome}
                onChange={(e) => {
                  updateTurnDraft({ worldOutcome: e.target.value });
                  setExplicitConfirm(false);
                }}
                placeholder="Объективный результат симуляции (не меняется задним числом после commit)"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="turn-delta">Сдвиг времени (мин)</Label>
                <Input
                  id="turn-delta"
                  type="number"
                  min={0}
                  value={turnDraft.timeDeltaMinutes}
                  onChange={(e) => {
                    updateTurnDraft({ timeDeltaMinutes: Number(e.target.value) || 0 });
                    setExplicitConfirm(false);
                  }}
                  className="touch-target mono-code"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="turn-date">Новая внутриигровая дата</Label>
                <Input
                  id="turn-date"
                  value={turnDraft.newInGameDate}
                  onChange={(e) => {
                    updateTurnDraft({ newInGameDate: e.target.value });
                    setExplicitConfirm(false);
                  }}
                  placeholder={worldState.currentInGameDate}
                  className="touch-target mono-code"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="turn-hp">Изменение HP (±)</Label>
                <Input
                  id="turn-hp"
                  type="number"
                  value={turnDraft.hpDelta}
                  onChange={(e) => {
                    updateTurnDraft({ hpDelta: Number(e.target.value) || 0 });
                    setExplicitConfirm(false);
                  }}
                  className="touch-target mono-code"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="turn-loc">Локация после хода</Label>
                <select
                  id="turn-loc"
                  value={turnDraft.newLocationId}
                  onChange={(e) => {
                    updateTurnDraft({ newLocationId: e.target.value });
                    setExplicitConfirm(false);
                  }}
                  className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Без смены локации</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="turn-csq">Последствие для мира (опц.)</Label>
                <Input
                  id="turn-csq"
                  value={turnDraft.consequenceText}
                  onChange={(e) => {
                    updateTurnDraft({ consequenceText: e.target.value });
                    setExplicitConfirm(false);
                  }}
                  placeholder="Запишется в CAMPAIGN_STATE"
                  className="touch-target"
                />
              </div>
            </div>

            {/* Immutable Rolls */}
            <div className="space-y-2 rounded-md border border-border bg-background/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Dices className="h-4 w-4 text-primary" />
                Броски костей (фиксируются навсегда при commit)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input
                  value={rollLabel}
                  onChange={(e) => setRollLabel(e.target.value)}
                  placeholder="Проверка (напр. Скрытность)"
                  className="touch-target sm:col-span-2"
                />
                <Input
                  value={rollFormula}
                  onChange={(e) => setRollFormula(e.target.value)}
                  placeholder="1d20+4"
                  className="touch-target mono-code"
                />
                <div className="flex gap-1.5">
                  <Input
                    value={rollResult}
                    onChange={(e) => setRollResult(e.target.value)}
                    placeholder="Итог"
                    className="touch-target mono-code"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="touch-target"
                    aria-label="Добавить бросок"
                    onClick={handleAddRoll}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {turnDraft.rolls.length > 0 && (
                <ul className="space-y-1">
                  {turnDraft.rolls.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded bg-card px-2.5 py-1.5 text-xs"
                    >
                      <span>
                        {r.label} (<span className="mono-code">{r.formula}</span>) →{" "}
                        <strong className="mono-code text-primary">{r.result}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRoll(r.id)}
                        aria-label="Удалить бросок"
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Optional new fact in turn */}
            <details className="rounded-md border border-border bg-background/50 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">
                + Добавить новый факт в Канон в рамках этого хода (опционально)
              </summary>
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  value={turnDraft.newFactTitle}
                  onChange={(e) => updateTurnDraft({ newFactTitle: e.target.value })}
                  placeholder="Заголовок факта"
                  className="touch-target"
                />
                <select
                  value={turnDraft.newFactLayer}
                  onChange={(e) =>
                    updateTurnDraft({ newFactLayer: e.target.value as EpistemicLayer })
                  }
                  className="touch-target rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="OBJECTIVE_TRUTH">Объективная истина</option>
                  <option value="PLAYER_KNOWLEDGE">Знание персонажа</option>
                  <option value="NPC_KNOWLEDGE">Знание NPC</option>
                  <option value="OUT_OF_GAME">Внеигровая (OOC)</option>
                </select>
                <Input
                  value={turnDraft.newFactStatement}
                  onChange={(e) => updateTurnDraft({ newFactStatement: e.target.value })}
                  placeholder="Формулировка факта"
                  className="touch-target sm:col-span-2"
                />
                <Input
                  value={turnDraft.newFactRationale}
                  onChange={(e) => updateTurnDraft({ newFactRationale: e.target.value })}
                  placeholder="Обоснование факта"
                  className="touch-target sm:col-span-2"
                />
                <select
                  value={turnDraft.newFactCertainty}
                  onChange={(e) =>
                    updateTurnDraft({ newFactCertainty: e.target.value as CertaintyStatus })
                  }
                  className="touch-target rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="KNOWN">KNOWN</option>
                  <option value="APPROXIMATE">APPROXIMATE</option>
                  <option value="UNKNOWN">UNKNOWN</option>
                </select>
                <select
                  value={turnDraft.newFactSourceId}
                  onChange={(e) => updateTurnDraft({ newFactSourceId: e.target.value })}
                  className="touch-target rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                  <option value="MANUAL_GM_ENTRY">Ручная запись</option>
                </select>
              </div>
            </details>

            {/* Step 2: Check */}
            {turnDraft.validationErrors.length > 0 && (
              <ul className="space-y-1 rounded border border-status-danger/50 bg-status-danger-bg/40 p-3 text-xs text-status-danger">
                {turnDraft.validationErrors.map((err, idx) => (
                  <li key={idx}>• {err}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="touch-target"
                  onClick={() => {
                    const res = saveTurnDraftExplicit();
                    if (res.ok) {
                      toast.success("Черновик сохранён в turn_drafts (без коммита).");
                    } else {
                      toast.error(res.error);
                    }
                  }}
                >
                  Сохранить черновик (без коммита)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="touch-target"
                  onClick={handleCheckDraft}
                >
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  2. Проверить черновик хода
                </Button>
              </div>

              {turnDraft.checkedAt && (
                <div className="space-y-3 rounded-md border border-status-verified/40 bg-status-verified-bg/30 p-3">
                  <p className="text-xs font-medium text-status-verified">
                    Проверка пройдена ({new Date(turnDraft.checkedAt).toLocaleTimeString("ru-RU")}).
                    Для commit требуется явное подтверждение игрока.
                  </p>
                  <label className="touch-target flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                    <Checkbox
                      checked={explicitConfirm}
                      onCheckedChange={(v) => setExplicitConfirm(v === true)}
                    />
                    <span>
                      Я подтверждаю commit хода №{nextTurnNumber} в append-only журнал и обновление
                      состояния
                    </span>
                  </label>
                  <Button
                    type="button"
                    disabled={!explicitConfirm}
                    className="touch-target w-full sm:w-auto"
                    onClick={handleCommit}
                  >
                    3. Подтвердить и выполнить Commit хода №{nextTurnNumber}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Technical message (NOT a game turn) */}
      <section className="panel-surface space-y-3 p-4">
        <div className="flex items-center gap-2">
          <MessageSquareCode className="h-4 w-4 text-layer-ooc" />
          <h2 className="text-sm font-semibold text-foreground">
            Техническое сообщение (не игровой ход)
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Не получает номер хода и не сдвигает игровое время. Используется для мета-заметок,
          уточнений правил и технических комментариев.
        </p>
        <form onSubmit={handleAddTechNote} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={techText}
            onChange={(e) => setTechText(e.target.value)}
            placeholder="Техническая заметка..."
            className="touch-target flex-1"
          />
          <Button type="submit" variant="secondary" className="touch-target">
            Записать тех. сообщение
          </Button>
        </form>
      </section>

      {/* Append-only Journal */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold text-foreground">
          Журнал записей · session_log (append-only · всего {sessionLog.entries.length})
        </h2>
        {sessionLog.entries.length === 0 ? (
          <div className="panel-surface p-6 text-center text-sm text-muted-foreground">
            Журнал пуст. Старые ходы не импортируются автоматически.
          </div>
        ) : (
          <div className="space-y-2.5">
            {[...sessionLog.entries].reverse().map((entry) =>
              entry.entryType === "GAME_TURN" ? (
                <article key={entry.id} className="panel-surface space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="mono-code rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                        ХОД #{entry.turnNumber}
                      </span>
                      <span className="mono-code text-xs text-muted-foreground">
                        {entry.inGameDateBefore} → {entry.inGameDateAfter} (+
                        {entry.timeDeltaMinutes} мин)
                      </span>
                    </div>
                    <span className="mono-code text-[11px] text-muted-foreground">
                      CHK:{entry.entryChecksum}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{entry.summary}</h3>
                  {entry.playerIntent && (
                    <p className="text-xs text-muted-foreground">Намерение: {entry.playerIntent}</p>
                  )}
                  <p className="text-sm text-foreground">{entry.worldOutcome}</p>
                  {entry.rolls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.rolls.map((r) => (
                        <span
                          key={r.id}
                          className="mono-code rounded border border-border bg-background/70 px-2 py-0.5 text-[11px]"
                        >
                          {r.label} ({r.formula}): {r.result}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mono-code text-[11px] text-muted-foreground">
                    CAMPAIGN v{entry.affectedCampaignVersion} · PC v{entry.affectedCharacterVersion}
                    {entry.hpDelta !== 0
                      ? ` · ΔHP ${entry.hpDelta > 0 ? "+" : ""}${entry.hpDelta}`
                      : ""}
                  </p>
                </article>
              ) : (
                <article
                  key={entry.id}
                  className="panel-surface border-layer-ooc/40 bg-layer-ooc/5 space-y-1 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="mono-code text-[11px] font-semibold text-layer-ooc">
                      ТЕХ. СООБЩЕНИЕ · НЕ ХОД · ВРЕМЯ НЕ СДВИНУТО
                    </span>
                    <span className="mono-code text-[11px] text-muted-foreground">
                      Срез даты: {entry.inGameDateSnapshot}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{entry.text}</p>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}