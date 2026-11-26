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
import type { CharacterBiography } from "@/domain/types";
import { getSupabaseAuthClient, readSupabaseEnv } from "@/lib/supabase-auth";

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
  const [biographyBusy, setBiographyBusy] = useState(false);
  const [biographyConsent, setBiographyConsent] = useState(false);
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
  async function generateBiographyWithMaster() {
    if (!candidate || biographyBusy || !biographyConsent || locked) return;
    setBiographyBusy(true);
    setImportError(null);
    try {
      const env = readSupabaseEnv();
      const { client, envResult } = getSupabaseAuthClient();
      if (!env.ok || !envResult.ok || !client) throw new Error(!env.ok ? env.error : "Клиент Supabase не готов.");
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("Требуется активная сессия. Войди в приложение заново.");
      const response = await fetch(env.config.url + "/functions/v1/obsidian-gm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token, apikey: env.config.publishableKey },
        body: JSON.stringify({
          operation: "GENERATE_CHARACTER_BIOGRAPHY",
          model: "obsidian-free",
          instructions: "Создай полную индивидуальную биографию персонажа Экдрасиля по закрытым источникам. Верни только структурированный JSON по схеме сервера. Не меняй механику персонажа.",
          input: JSON.stringify({
            action: "Создание биографии случайного персонажа Экдрасиля",
            character: candidate.character,
            mechanicalSummary: candidate.summary,
            randomRolls: candidate.rolls,
          }),
        }),
      });
      const payload = await response.json().catch(() => null) as { output_text?: string; error?: { message?: string } } | null;
      if (!response.ok || !payload?.output_text) throw new Error(payload?.error?.message ?? "Мастер не вернул биографию.");
      const biography = JSON.parse(payload.output_text) as CharacterBiography;
      if (!biography || typeof biography.biography !== "string" ||
          biography.birthplace !== candidate.character.biography?.birthplace ||
          biography.birthplaceSource !== candidate.character.biography?.birthplaceSource ||
          JSON.stringify(biography.canonBasis) !== JSON.stringify(candidate.character.biography?.canonBasis) ||
          !Array.isArray(biography.lifeEvents) || biography.lifeEvents.length < 2 ||
          !Array.isArray(biography.personalityTraits) || biography.personalityTraits.length < 2 ||
          !Array.isArray(biography.skillOrigins) || biography.skillOrigins.length !== (candidate.character.skillBonuses?.length ?? 0) ||
          !biography.appearanceDetails || Object.values(biography.appearanceDetails).some((value) => typeof value !== "string" || !value.trim()) ||
           typeof biography.preCampaignDesire !== "string" || biography.preCampaignDesire.trim().length < 20 ||
          typeof biography.weaponBackground !== "string" || biography.weaponBackground.trim().length < 30 ||
          typeof biography.equipmentBackground !== "string" || biography.equipmentBackground.trim().length < 30) {
        throw new Error("Досье мастера не прошло проверку: нужны объяснения всех навыков, оружия и снаряжения. Механика не изменена.");
      }
      setCandidate({ ...candidate, character: { ...candidate.character, biography } });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Не удалось сформировать биографию.");
    } finally {
      setBiographyBusy(false);
    }
  }
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
      <h2 className="text-lg font-semibold">Досье персонажа · 1 уровень</h2>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">1. Имя и основные данные</h3>
        <div className="overflow-hidden rounded-lg border">
          {[
            ["Имя",candidate.summary.name],["Народ",candidate.summary.speciesRu],
            ["Класс и уровень",candidate.summary.classNameRu+" · 1"],["Предыстория",candidate.summary.backgroundRu],
            ["Очки здоровья",String(candidate.summary.hitPoints)],["Класс доспеха",String(candidate.summary.armorClass)],
            ["Скорость",String(candidate.character.speedFeet ?? "UNKNOWN")+" футов"],
            ["Бонус мастерства",String(candidate.character.proficiencyBonus ?? "UNKNOWN")],
          ].map(([label,value])=><div key={label} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 border-b last:border-b-0 px-3 py-2 text-sm"><span className="text-muted-foreground">{label}</span><strong className="break-words text-right">{value}</strong></div>)}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">2. Характеристики</h3>
        <div className="overflow-hidden rounded-lg border">
          {(["strength","dexterity","constitution","intelligence","wisdom","charisma"] as const).map((key)=> {
            const labels={strength:"Сила",dexterity:"Ловкость",constitution:"Телосложение",intelligence:"Интеллект",wisdom:"Мудрость",charisma:"Харизма"};
            const score=candidate.summary.abilityScores[key];
            const modifier=Math.floor((score-10)/2);
            return <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b last:border-b-0 px-3 py-2"><span className="text-sm">{labels[key]}</span><strong className="text-lg tabular-nums">{score}</strong><span className="w-10 text-right text-sm text-muted-foreground tabular-nums">{modifier>=0?"+":""}{modifier}</span></div>;
          })}
        </div>
      </section>
            <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">3. Предыстория и жизнь до кампании</h3>
        <div className="space-y-3 rounded-lg border p-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Место рождения</p><p className="font-medium">{candidate.character.biography?.birthplace ?? "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">Семья и происхождение</p><p>{candidate.character.biography?.family ?? "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">Детство и воспитание</p><p>{candidate.character.biography?.upbringing ?? "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">События до начала кампании</p><p>{candidate.character.biography?.lifeEvents.join(" ") || "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">Чего хотел в Экдрасиле перед началом кампании</p><p className="font-medium">{candidate.character.biography?.preCampaignDesire ?? "Будет сформулировано мастером."}</p></div>
          <div><p className="text-xs text-muted-foreground">Черты характера</p><p>{candidate.character.biography?.personalityTraits.join(", ") || "UNKNOWN"}</p></div>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Внешность персонажа</h3>
        {candidate.character.biography?.appearanceDetails ? (
          <div className="overflow-hidden rounded-lg border">
            {([
              ["Рост", candidate.character.biography.appearanceDetails.height],
              ["Телосложение", candidate.character.biography.appearanceDetails.build],
              ["Кожа", candidate.character.biography.appearanceDetails.skin],
              ["Волосы", candidate.character.biography.appearanceDetails.hair],
              ["Глаза", candidate.character.biography.appearanceDetails.eyes],
              ["Лицо", candidate.character.biography.appearanceDetails.face],
              ["Одежда", candidate.character.biography.appearanceDetails.clothing],
              ["Обувь", candidate.character.biography.appearanceDetails.footwear],
              ["Аксессуары", candidate.character.biography.appearanceDetails.accessories],
              ["Отличительные особенности", candidate.character.biography.appearanceDetails.distinctiveFeatures],
              ["Первое впечатление", candidate.character.biography.appearanceDetails.firstImpression],
            ] as const).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 border-b last:border-b-0 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{label}</span><span className="text-right">{value || "UNKNOWN"}</span>
              </div>
            ))}
          </div>
        ) : <p className="rounded-lg border p-3 text-sm text-muted-foreground">{candidate.character.biography?.appearance ?? "Внешность будет подробно создана мастером вместе с биографией."}</p>}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">4. Инвентарь и снаряжение</h3>
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs text-muted-foreground">Оружие и боеприпасы</p>
          <div className="space-y-2">{candidate.character.inventory?.filter((item)=>/меч|топор|кинжал|лук|арбалет|копь|секир|цеп|стрел|болт/i.test(item.name)).map((item)=><div key={item.id} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-b-0"><span>{item.name}</span><strong className="shrink-0">× {item.quantity}</strong></div>)}</div>
          <p className="mb-2 mt-4 text-xs text-muted-foreground">Остальное снаряжение</p>
          <div className="space-y-2">{candidate.character.inventory?.filter((item)=>!/меч|топор|кинжал|лук|арбалет|копь|секир|цеп|стрел|болт/i.test(item.name)).map((item)=><div key={item.id} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-b-0"><span>{item.name}<span className="block text-xs text-muted-foreground">{item.notes}</span></span><strong className="shrink-0">× {item.quantity}</strong></div>)}</div>
          <div className="mt-3 border-t pt-3 text-sm">Деньги: <strong>{candidate.character.currency?.gp ?? 0} зм</strong></div>
        </div>
        <div className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">Происхождение оружия</p><p>{candidate.character.biography?.weaponBackground || "Будет описано мастером."}</p><p className="mb-1 mt-3 text-xs text-muted-foreground">Происхождение снаряжения</p><p>{candidate.character.biography?.equipmentBackground || "Будет описано мастером."}</p></div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">5. Навыки</h3>
        <div className="rounded-lg border p-3">{candidate.character.skillBonuses?.map((skill)=><div key={skill.name} className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0"><span>{skill.name}</span><strong className="tabular-nums">+{skill.bonus}</strong></div>)}</div>
        {candidate.character.biography?.skillOrigins?.length ? <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Как освоены навыки</p>{candidate.character.biography.skillOrigins.map((entry,index)=><p key={index} className="border-b py-2 text-sm last:border-b-0"><strong>{candidate.character.skillBonuses?.[index]?.name ?? "Навык"}:</strong> {entry}</p>)}</div> : null}
        <p className="text-xs text-muted-foreground">Навыки отражают обучение и практику. Они сами по себе не дают магических способностей или защиты от магии.</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">6. Особенности и атаки</h3>
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          {candidate.character.classFeaturesByLevel?.map((entry)=><div key={entry.level}>{entry.features.split(". ").map((part,index)=><p key={index} className="py-1">{part}{part.endsWith(".")?"":"."}</p>)}</div>)}
          <div className="border-t pt-2"><p className="text-xs text-muted-foreground">Атаки</p>{candidate.character.weaponAttacks?.map((attack)=><p key={attack.weapon} className="py-1">{attack.weapon}: +{attack.attackBonus} к попаданию · {attack.damage} · mastery {attack.mastery}</p>)}</div>
          <div className="border-t pt-2"><p className="text-xs text-muted-foreground">Спасброски</p>{candidate.character.baseSavingThrowBonuses ? Object.entries(candidate.character.baseSavingThrowBonuses).map(([key,value])=><p key={key}>{key}: {value>=0?"+":""}{value}</p>) : "UNKNOWN"}</div>
        </div>
      </section>
      <div className="rounded border border-primary/30 p-3 space-y-2">
        <p className="text-sm font-medium">Биография мастера Экдрасиля</p>
        <p className="text-xs text-muted-foreground">Мастер создаст индивидуальную историю и объяснит происхождение каждого навыка, оружия и предмета снаряжения. Броски и механические параметры останутся неизменными.</p>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={biographyConsent} onChange={(event) => setBiographyConsent(event.target.checked)} className="mt-0.5"/>Я разрешаю отправить параметры этого персонажа в RouterAI. Запрос может расходовать баланс подключённого сервиса.</label>
        <Button type="button" variant="outline" disabled={locked || biographyBusy || !biographyConsent} onClick={() => void generateBiographyWithMaster()}>{biographyBusy ? "Мастер пишет биографию…" : "Сформировать биографию мастером"}</Button>
        {candidate.character.biography && candidate.character.biography.lifeEvents.length > 1 && <div className="space-y-1 rounded bg-muted/30 p-3 text-sm"><p className="font-medium">{candidate.character.biography.ageYears === null ? "Возраст UNKNOWN" : "Возраст: " + candidate.character.biography.ageYears}</p><p>{candidate.character.biography.biography}</p><p className="text-xs text-muted-foreground">События: {candidate.character.biography.lifeEvents.join(" · ")}</p><div className="space-y-1 border-t pt-2"><p className="font-medium">Как освоены навыки</p>{candidate.character.biography.skillOrigins.map((entry,index)=><p className="text-xs text-muted-foreground" key={index}>{candidate.character.skillBonuses?.[index]?.name ?? "Навык"}: {entry}</p>)}</div><div className="space-y-1 border-t pt-2"><p className="font-medium">Оружие</p><p className="text-xs text-muted-foreground">{candidate.character.biography.weaponBackground}</p><p className="font-medium">Снаряжение</p><p className="text-xs text-muted-foreground">{candidate.character.biography.equipmentBackground}</p></div><p className="text-xs text-muted-foreground">Основа канона: {candidate.character.biography.canonBasis.join("; ")}</p><p className="text-xs text-emerald-500">Досье мастера получено и проверено. Механические параметры сохранены без изменений.</p></div>}
      </div>
      <details className="rounded border p-2"><summary className="cursor-pointer text-xs font-medium">Результаты бросков характеристик</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{candidate.rolls.map((roll)=><li key={roll}>{roll}</li>)}</ul></details>
      <p className="text-xs text-muted-foreground">Сейчас доступны 7 народов Экдрасиля: люди, эльфы, тёмные эльфы, гномы, краснолюды, полуэльфы и зверолюди. Классы и предыстории выбираются из реализованных профилей; места рождения — из 16 подтверждённых городов хроники. Механические параметры рассчитываются генератором, а мастер пишет индивидуальное досье и объясняет происхождение навыков, оружия и снаряжения. Мутации и проклятия не добавляются автоматически.</p>
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
