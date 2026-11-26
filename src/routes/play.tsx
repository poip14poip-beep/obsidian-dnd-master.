import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, Dice5, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useObsidianStore } from "@/store/obsidian-store";
import { DEFAULT_CAMPAIGN_PREFERENCES } from "@/domain/defaults";
import { generateRandomStart } from "@/domain/random-start";
import { generateRandomCharacter, type RandomCharacterResult } from "@/domain/random-character";
import { extractDossierBasics } from "@/domain/dossier-parser";
import { extractDocxText } from "@/domain/docx-text";
import { processSourceContent } from "@/domain/source-processing";

export const Route = createFileRoute("/play")({ component: PlayPage });

type Mode = "DOSSIER" | "RANDOM" | null;

function secureIndex(length: number): number {
  if (!Number.isInteger(length) || length < 1 || !globalThis.crypto?.getRandomValues) {
    throw new Error("Криптографический генератор случайных чисел недоступен.");
  }
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / length) * length;
  const buffer = new Uint32Array(1);
  let value = 0;
  do { globalThis.crypto.getRandomValues(buffer); value = buffer[0]!; } while (value >= limit);
  return value % length;
}
function PlayPage() {
  const { sources, updatePlayerCharacter, attachSourceContent, verifySource, setSourceContextEnabled, worldState, sessionLog, character, applyGeneratedStart, confirmCampaignSetup, resetForTrialCampaign } = useObsidianStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(null);
  const [candidate, setCandidate] = useState<RandomCharacterResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [resourceCurrentInputs, setResourceCurrentInputs] = useState<Record<string, string>>({});
  const [importError, setImportError] = useState<string | null>(null);
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [dossierUploadBusy, setDossierUploadBusy] = useState(false);
  const dossier = sources.find(s => s.type === "PLAYER_DOSSIER" && s.contentStatus === "ATTACHED");
  const parsed = useMemo(() => dossier?.content ? extractDossierBasics(dossier.content) : null, [dossier?.content]);
  const locked = worldState.setup.confirmed || sessionLog.lastTurnNumber > 0;
  const characterReady = Boolean(
    character.name.trim() && character.name !== "UNKNOWN" &&
    character.hpMax !== null && character.armorClass !== null &&
    character.level !== null && character.proficiencyBonus !== null &&
    character.abilityScores && character.speciesAndClass !== "UNKNOWN" &&
    character.baseSavingThrowBonuses && character.skillBonuses?.length &&
    character.weaponAttacks?.length && character.classFeaturesByLevel?.length
  );
  const requiredSourceTypes = character.sourceDossierId === "GENERATED_RANDOM" ? ["GOVERNING_DOC", "WORLD_CANON"] as const : ["GOVERNING_DOC", "WORLD_CANON", "PLAYER_DOSSIER"] as const;
  const verifiedCoreSourcesReady = requiredSourceTypes.every((type) =>
    sources.some((source) =>
      source.type === type && (type === "GOVERNING_DOC"
        ? source.serverManaged === true
        : source.contentStatus === "ATTACHED" && source.content.trim().length > 0 &&
          source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true)
    )
  );

  function handleResetCampaign() {
    if (!window.confirm("Очистить активную кампанию в приложении? Будут удалены текущий персонаж, старое досье, NPC, задания, сцена и игровые ходы. Источники ОБСИДИАН 4.1 и Хроника Экдрасиля останутся. Это действие нельзя отменить.")) return;
    const result = resetForTrialCampaign();
    if (!result.ok) {
      setStartError(result.error);
      return;
    }
    setMode(null);
    setCandidate(null);
    setConfirmed(false);
    setImportError(null);
    setStartError(null);
    setStartPending(false);
  }

  function handleStartCampaign() {
    setStartError(null);
    if (locked) return;
    if (!verifiedCoreSourcesReady) {
      setStartError("Перед запуском проверь серверную готовность ОБСИДИАН 4.1, Хронику Экдрасиля и, если персонаж загружен, его отдельный лист.");
      return;
    }
    if (!characterReady) {
      setStartError("Лист персонажа ещё не готов. Для случайной заготовки сначала требуется завершить характеристики, классовые особенности, навыки, атаки и снаряжение.");
      return;
    }
    try {
      const generated = generateRandomStart(character.hpMax ?? 0);
      const result = applyGeneratedStart({
        city: generated.city,
        date: generated.date,
        narrative: generated.narrative,
        locationDescription: generated.location.description,
        generationRecord: generated.generationRecord,
        characterPatch: generated.characterPatch,
        inventory: generated.inventory,
      });
      if (!result.ok) {
        setStartError(result.error);
        return;
      }
      setStartPending(true);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Не удалось создать старт кампании.");
    }
  }

  useEffect(() => {
    if (!startPending || !worldState.startGeneration || character.hpCurrent === null) return;
    const result = confirmCampaignSetup({
      campaignName: worldState.campaignName || "Экдрасиль — свободная кампания",
      calendarSystem: worldState.calendarSystem === "UNKNOWN"
        ? "Хронология Экдрасиля; год 2000 подтверждён; месяц, день и время UNKNOWN"
        : worldState.calendarSystem,
      startInGameDate: worldState.startInGameDate,
      startLocationName: worldState.startLocationName,
      startNarrative: worldState.startNarrative ?? "",
      startGeneration: worldState.startGeneration,
      encumbranceMode: "STANDARD",
      campaignPreferences: DEFAULT_CAMPAIGN_PREFERENCES,
      setupPatch: {
        sourcesConfirmed: true,
        parametersConfirmed: true,
        startPointConfirmed: true,
        characterConfirmed: true,
        noAutoImportAcknowledged: true,
      },
    });
    setStartPending(false);
    if (!result.ok) setStartError(result.error);
    else void navigate({ to: "/game" });
  }, [
    startPending, worldState.startGeneration, worldState.startInGameDate,
    worldState.startLocationName, worldState.startNarrative, worldState.campaignName,
    worldState.calendarSystem, character.hpCurrent, confirmCampaignSetup, navigate,
  ]);
  const randomize = () => {
    try {
      const generated = generateRandomCharacter(secureIndex);
      setCandidate(generated);
      setMode("RANDOM");
      setConfirmed(false);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Не удалось создать случайного персонажа.");
    }
  };
  const loadDossier = () => { setMode("DOSSIER"); setCandidate(null); setConfirmed(false); setResourceCurrentInputs({}); setImportError(null); };
  async function handleDossierUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || dossierUploadBusy) return;
    setDossierUploadBusy(true);
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("PDF пока не поддерживается. Загрузи лист персонажа в DOCX, TXT или MD.");
      }
      const content = file.name.toLowerCase().endsWith(".docx") ? await extractDocxText(file) : await file.text();
      if (!content.trim()) throw new Error("Файл пуст или текст не удалось извлечь.");
      const source = sources.find((item) => item.type === "PLAYER_DOSSIER");
      if (!source) throw new Error("Не найден отдельный источник листа персонажа.");
      const processed = await processSourceContent(
        { id: source.id, title: "Лист персонажа текущей кампании", type: "PLAYER_DOSSIER", fileName: file.name },
        content,
      );
      const attached = attachSourceContent(source.id, {
        fileName: file.name,
        content,
        originLabel: "Загружено для текущей кампании: " + file.name,
        notes: "Лист персонажа относится только к этой кампании. Он не является частью канона Экдрасиля или правил мастера.",
        processing: processed.processing,
      });
      if (!attached.ok) throw new Error(attached.error);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Не удалось загрузить лист персонажа.");
    } finally {
      setDossierUploadBusy(false);
      event.target.value = "";
    }
  }
  function verifyDossierSource() {
    if (!dossier) return;
    const result = verifySource(dossier.id);
    if (!result.ok) setImportError(result.error);
  }
  function enableDossierContext() {
    if (!dossier) return;
    const result = setSourceContextEnabled(dossier.id, true);
    if (!result.ok) setImportError(result.error);
  }
  const confirmDossier = () => {
    if (!parsed || !dossier) return;
    if (dossier.reviewStatus !== "VERIFIED" || dossier.contextEnabled !== true) {
      setImportError("Сначала проверь лист персонажа и отдельно разреши мастеру учитывать его в этой кампании.");
      return;
    }
    const invalidResource = parsed.resources.find((resource) => {
      const raw = resourceCurrentInputs[resource.name];
      if (raw === undefined || raw.trim() === "") return false;
      const value = Number(raw);
      return !Number.isInteger(value) || value < 0 || value > resource.max;
    });
    if (invalidResource) {
      setImportError(`Текущее количество ресурса «${invalidResource.name}» должно быть целым числом от 0 до ${invalidResource.max}.`);
      return;
    }
    setImportError(null);
    const result = updatePlayerCharacter({
      sourceDossierId: dossier.id,
      name: parsed.name ?? "UNKNOWN",
      nameCertainty: parsed.name ? "KNOWN" : "UNKNOWN",
      speciesAndClass: parsed.speciesAndClass ?? "UNKNOWN",
      level: parsed.level,
      classLevel: parsed.classLevel,
      epicCampaignLevels: parsed.epicCampaignLevels,
      hpCurrent: null,
      hpMax: parsed.hitPointMaximum,
      armorClass: parsed.armorClass,
      ...(parsed.abilityScores ? { abilityScores: parsed.abilityScores } : {}),
      proficiencyBonus: parsed.proficiencyBonus,
      speedFeet: parsed.speedFeet,
      ...(parsed.hitDice ? { hitDice: parsed.hitDice } : {}),
      ...(parsed.baseSavingThrowBonuses ? { baseSavingThrowBonuses: parsed.baseSavingThrowBonuses } : {}),
      ...(parsed.baseSavingThrowBonuses ? { savingThrowBonuses: parsed.baseSavingThrowBonuses } : {}),
      skillBonuses: parsed.skillBonuses,
      classFeaturesByLevel: parsed.classFeaturesByLevel,
      weaponAttacks: parsed.weaponAttacks,
      statsCertainty: parsed.abilityScores && parsed.hitPointMaximum !== null ? "KNOWN" : "APPROXIMATE",
      inventory: parsed.inventory.map((item, i) => ({ id: "dossier-review-"+i, name: item.name, quantity: item.quantity, notes: item.notes, certainty: item.certainty, location: item.location, startPolicy: item.startPolicy, ...(item.attunement ? { attunement: "UNKNOWN" } : {}) })),
      resources: parsed.resources.map((item,i) => ({ id: "dossier-resource-"+i, name: item.name, current: resourceCurrentInputs[item.name]?.trim() ? Number(resourceCurrentInputs[item.name]) : item.current, max: item.max, recovery: item.recovery, certainty: item.certainty })),
      notes: "Загружено из досье после отдельного просмотра. Текущие HP, деньги и местоположение UNKNOWN. Неуказанные в досье сведения и настройки предметов остаются UNKNOWN.",
    });
    if (result.ok) setConfirmed(true);
  };
  const confirmRandom = () => {
    if (!candidate) return;
    const result = updatePlayerCharacter({
      ...candidate.character,
      sourceDossierId: "GENERATED_RANDOM",
      notes: candidate.character.notes ?? "",
    });
    if (result.ok) setConfirmed(true);
    else setImportError(result.error);
  };
  return <main className="mx-auto max-w-3xl space-y-4 p-4 pb-20">
    <header className="space-y-1"><p className="text-xs uppercase tracking-wider text-primary">ОБСИДИАН 4.1 · подготовка</p><h1 className="text-2xl font-bold">Новая кампания</h1><p className="text-sm text-muted-foreground">Выбери, как создать персонажа.</p></header>
    {locked && <div className="rounded border border-amber-500/40 p-3 text-sm"><Lock className="mr-2 inline h-4 w-4"/>Кампания уже подтверждена или содержит игровые ходы. Изменение стартового персонажа заблокировано. <Button type="button" variant="destructive" size="sm" className="mt-3 w-full" onClick={handleResetCampaign}>Очистить активную кампанию и начать заново</Button></div>}{startError && locked && <p role="alert" className="text-sm text-destructive">{startError}</p>}
    <section className="grid gap-3 sm:grid-cols-2">
      <button disabled={locked} onClick={loadDossier} className="rounded-lg border border-border p-4 text-left hover:bg-accent disabled:opacity-50"><FileText className="mb-2 h-6 w-6"/><h2 className="font-semibold">Загрузить персонажа</h2><p className="mt-1 text-sm text-muted-foreground">Распознать подтверждённые поля, показать неизвестные данные и только затем предложить импорт.</p></button>
      <button disabled={locked} onClick={randomize} className="rounded-lg border border-border p-4 text-left hover:bg-accent disabled:opacity-50"><Dice5 className="mb-2 h-6 w-6"/><h2 className="font-semibold">Создать случайного персонажа</h2><p className="mt-1 text-sm text-muted-foreground">Сгенерировать первичную заготовку с бросками характеристик, видом и классом.</p></button>
    </section>
    {mode === "DOSSIER" && <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Проверка досье перед импортом</h2>
      {!parsed ? <div className="space-y-2"><p className="text-sm text-muted-foreground">Лист персонажа загружается отдельно для этой кампании. Он не входит в канон Экдрасиля и не является частью системных правил мастера.</p><label className="block space-y-1.5 text-sm font-medium"><span>Файл персонажа (.docx, .txt, .md)</span><input type="file" accept=".docx,.txt,.md,.json,.csv" disabled={dossierUploadBusy || locked} onChange={handleDossierUpload} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" /></label>{dossierUploadBusy && <p className="text-xs text-muted-foreground">Читаю и обрабатываю лист персонажа…</p>}</div> : <>
        <p className="text-sm">Файл: <strong>{dossier?.fileName ?? "UNKNOWN"}</strong> · статус: {dossier?.reviewStatus ?? "UNKNOWN"}</p>{dossier?.reviewStatus !== "VERIFIED" && <Button type="button" variant="outline" onClick={verifyDossierSource} disabled={dossier?.processing?.status !== "PROCESSED"}>Подтвердить проверку листа</Button>}{dossier?.reviewStatus === "VERIFIED" && dossier.contextEnabled !== true && <Button type="button" variant="outline" onClick={enableDossierContext}>Разрешить мастеру учитывать этот лист</Button>}{dossier?.contextEnabled === true && <p className="text-xs text-emerald-500">Лист проверен и доступен мастеру в контексте текущей кампании.</p>}
        <dl className="grid grid-cols-2 gap-2 text-sm">{[
          ["Имя",parsed.name],["Вид и класс",parsed.speciesAndClass],["Уровень",parsed.level],["Макс. HP",parsed.hitPointMaximum],["КД без плаща",parsed.armorClass === null ? null : parsed.armorClass - 1],["КД с настроенным плащом",parsed.armorClass],["Бонус мастерства",parsed.proficiencyBonus],["Скорость",parsed.speedFeet],["Навыков",parsed.skillBonuses.length],["Атак",parsed.weaponAttacks.length],["Классовых уровней с особенностями",parsed.classFeaturesByLevel.length],["Предметов",parsed.inventory.length],["Ресурсов",parsed.resources.length]
        ].map(([k,v])=><div className="rounded bg-muted/40 p-2" key={String(k)}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v ?? "UNKNOWN"}</dd></div>)}</dl>
        <div className="rounded bg-muted/30 p-3 text-sm"><AlertTriangle className="mr-2 inline h-4 w-4"/>Текущие HP, деньги, местоположение, активные состояния и фактические остатки ресурсов не выводятся автоматически. После импорта потребуется отдельная подготовка старта.</div>
        <p className="text-xs text-muted-foreground">Подтверждённые характеристики: {parsed.abilityScores ? Object.entries(parsed.abilityScores).map(([k,v])=>k.toUpperCase()+" "+v).join(" · ") : "UNKNOWN"}</p>
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs font-semibold">Фактические остатки классовых ресурсов</p>
          <p className="text-[11px] text-muted-foreground">Оставь поле пустым, если текущее количество неизвестно. Не будет автоматически подставлено максимальное значение.</p>
          {parsed.resources.map((resource) => (
            <div key={resource.name} className="grid grid-cols-[1fr_100px] items-center gap-2">
              <label htmlFor={`resource-${resource.name.replace(/[^a-z0-9]/gi, "-")}`} className="text-xs">{resource.name} · максимум {resource.max}</label>
              <input
                id={`resource-${resource.name.replace(/[^a-z0-9]/gi, "-")}`}
                type="number" min={0} max={resource.max} step={1}
                value={resourceCurrentInputs[resource.name] ?? ""}
                onChange={(event) => setResourceCurrentInputs((current) => ({ ...current, [resource.name]: event.target.value }))}
                placeholder="UNKNOWN"
                className="touch-target w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
        {importError && <p className="text-xs text-destructive">{importError}</p>}
        <Button disabled={locked || !parsed || confirmed} onClick={confirmDossier}>Подтвердить импорт досье</Button>
      </>}
    </section>}
    {mode === "RANDOM" && candidate && <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Случайный персонаж · 1 уровень</h2>
      <div className="rounded bg-muted/30 p-3">
        <p className="text-lg font-semibold">{candidate.summary.name}</p>
        <p className="text-sm text-muted-foreground">{candidate.summary.species} · {candidate.summary.className} · {candidate.summary.background}</p>
        <p className="mt-2 text-sm">HP <strong>{candidate.summary.hitPoints}</strong> · КД <strong>{candidate.summary.armorClass}</strong> · Скорость и владения рассчитаны</p>
      </div>
      <div className="grid grid-cols-3 gap-2">{Object.entries(candidate.summary.abilityScores).map(([key,value])=><div className="rounded bg-muted/40 p-2 text-center" key={key}><p className="text-xs text-muted-foreground">{key.toUpperCase()}</p><p className="text-xl font-bold">{value}</p></div>)}</div>
      <div className="space-y-1 text-sm"><p><strong>Навыки:</strong> {candidate.summary.skills.join(", ")}</p><p><strong>Снаряжение:</strong> {candidate.summary.equipment.join("; ")}</p><p><strong>Особенности:</strong> {candidate.summary.features.join(" ")}</p></div>
      <details className="rounded border p-2"><summary className="cursor-pointer text-xs font-medium">Результаты бросков характеристик</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{candidate.rolls.map((roll)=><li key={roll}>{roll}</li>)}</ul></details>
      <p className="text-xs text-muted-foreground">Генератор сейчас использует поддерживаемые варианты SRD 5.2.1: Боец, Плут, Варвар; Дварф или Эльф; Солдат или Преступник. Персонаж полностью рассчитан в пределах этих вариантов. Другие классы, виды и предыстории пока не включены.</p>
      {importError && <p role="alert" className="text-xs text-destructive">{importError}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={randomize}>Создать другого</Button><Button disabled={locked || confirmed} onClick={confirmRandom}>Подтвердить персонажа</Button></div>
    </section>}
    {confirmed && <div className="rounded border border-emerald-500/40 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Досье персонажа импортировано и сохранено отдельно от канона мира.</div>}
    {characterReady && !locked && <section className="space-y-3 rounded-lg border border-primary/40 p-4">
      <div><h2 className="text-lg font-semibold">Персонаж готов к кампании</h2><p className="text-sm text-muted-foreground">{character.name} · {character.speciesAndClass} · HP будут определены случайной стартовой ситуацией; неизвестные остатки ресурсов останутся UNKNOWN.</p></div>
      <p className="text-xs text-muted-foreground">Применится профиль ОБСИДИАН 4.1 / D&D 2024: SRD 5.2.1, броски через Web Crypto с показом результатов, XP, стандартный учёт нагрузки, базовые правила выживания, региональные встречи без универсальных таблиц, без PvP и без дополнительных правил смерти, кроме отдельно согласованных правил текущей кампании. Профиль можно изменить в настройках до первого игрового хода.</p>
      {startError && <p role="alert" className="text-sm text-destructive">{startError}</p>}
      <Button className="w-full touch-target" disabled={startPending} onClick={handleStartCampaign}>{startPending ? "Подготавливаю Экдрасиль…" : "Начать кампанию"}</Button>
    </section>}
    {!characterReady && mode === "RANDOM" && confirmed && <p className="rounded border border-amber-500/40 p-3 text-xs text-amber-200">Случайный персонаж ещё не подтверждён. Проверь его параметры и нажми «Подтвердить персонажа».</p>}
    {worldState.setup.confirmed && <div className="rounded border border-emerald-500/40 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Кампания подготовлена. <Link className="underline font-semibold" to="/game">Перейти к игре</Link></div>}
    
  </main>;
}
