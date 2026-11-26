import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, Dice5, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useObsidianStore } from "@/store/obsidian-store";
import { DEFAULT_CAMPAIGN_PREFERENCES } from "@/domain/defaults";
import { generateRandomStart } from "@/domain/random-start";
import { generateRandomCharacter, type RandomCharacterProfile, type RandomCharacterResult } from "@/domain/random-character";
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
  const { sources, updatePlayerCharacter, attachSourceContent, worldState, sessionLog, character, applyGeneratedStart, confirmCampaignSetup, resetForTrialCampaign } = useObsidianStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(null);
  const [candidate, setCandidate] = useState<RandomCharacterResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [serverReadiness, setServerReadiness] = useState<"CHECKING" | "READY" | "FAILED">("CHECKING");
  const [serverReadinessError, setServerReadinessError] = useState<string | null>(null);
  const [dossierUploadBusy, setDossierUploadBusy] = useState(false);
  const [biographyBusy, setBiographyBusy] = useState(false);
  const [biographyReady, setBiographyReady] = useState(false);
  const [generationSeed, setGenerationSeed] = useState<string | null>(null);
  const dossier = sources.find(s => s.type === "PLAYER_DOSSIER" && s.contentStatus === "ATTACHED");
  const parsed = useMemo(() => dossier?.content ? extractDossierBasics(dossier.content) : null, [dossier?.content]);
  const locked = worldState.setup.confirmed || sessionLog.lastTurnNumber > 0;
  useEffect(() => {
    let cancelled = false;
    async function checkServerReadiness() {
      setServerReadiness("CHECKING");
      setServerReadinessError(null);
      try {
        const env = readSupabaseEnv();
        const { client, envResult } = getSupabaseAuthClient();
        if (!env.ok || !envResult.ok || !client) throw new Error(!env.ok ? env.error : "Клиент Supabase не готов.");
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError || !sessionData.session?.access_token) throw new Error("Войдите в приложение, чтобы проверить серверные документы.");
        const { data, error } = await client.functions.invoke("obsidian-gm", { body: { operation: "CHECK_SERVER_READINESS" } });
        if (error) {
          let detail = error.message || "Не удалось проверить серверные документы.";
          if ("context" in error && error.context instanceof Response) {
            const payload = await error.context.clone().json().catch(() => null) as { error?: string } | null;
            detail = payload?.error ?? detail;
          }
          throw new Error(detail);
        }
        if (!data?.ready) throw new Error("На сервере отсутствует один или несколько обязательных документов ОБСИДИАН / SRD / Экдрасиль.");
        if (!cancelled) setServerReadiness("READY");
      } catch (error) {
        if (!cancelled) {
          setServerReadiness("FAILED");
          setServerReadinessError(error instanceof Error ? error.message : "Проверка серверных документов не выполнена.");
        }
      }
    }
    void checkServerReadiness();
    return () => { cancelled = true; };
  }, []);

  const characterReady = Boolean(
    character.name.trim() && character.name !== "UNKNOWN" &&
    character.hpMax !== null && character.armorClass !== null &&
    character.level !== null && character.proficiencyBonus !== null &&
    character.abilityScores && character.speciesAndClass !== "UNKNOWN" &&
    character.baseSavingThrowBonuses && character.skillBonuses?.length &&
    character.weaponAttacks?.length && character.classFeaturesByLevel?.length
  );
  const requiredSourceTypes = character.sourceDossierId === "GENERATED_RANDOM" ? ["GOVERNING_DOC", "WORLD_CANON"] as const : ["GOVERNING_DOC", "WORLD_CANON", "PLAYER_DOSSIER"] as const;
  const verifiedCoreSourcesReady = serverReadiness === "READY" && requiredSourceTypes.every((type) =>
    sources.some((source) =>
      source.type === type && ((type === "GOVERNING_DOC" || type === "WORLD_CANON")
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
      setStartError(serverReadiness === "CHECKING" ? "Автоматическая проверка сервера ещё выполняется. Подожди несколько секунд." : serverReadinessError ?? "Автоматическая проверка серверных источников не пройдена. Обнови страницу или войди заново.");
      return;
    }
    if (!characterReady) {
      setStartError("Лист персонажа ещё не готов. Для случайной заготовки сначала требуется завершить характеристики, классовые особенности, навыки, атаки и снаряжение.");
      return;
    }
    try {
      const generated = generateRandomStart(character.hpMax ?? 0, undefined, {
        ...(character.background ? { background: character.background } : {}),
        retainedInventory: character.inventory,
        generateBackgroundKit: character.sourceDossierId !== "GENERATED_RANDOM",
      });
      const result = applyGeneratedStart({
        city: generated.city,
        date: generated.date,
        narrative: generated.narrative,
        locationDescription: generated.location.description,
        generationRecord: generated.generationRecord,
        characterPatch: generated.characterPatch,
        inventory: generated.inventory,
        replaceInventory: generated.replaceInventory,
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
  async function validateCharacterCompatibility(characterData: unknown) {
    const env = readSupabaseEnv();
    const { client, envResult } = getSupabaseAuthClient();
    if (!env.ok || !envResult.ok || !client) throw new Error(!env.ok ? env.error : "Клиент Supabase не готов.");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error("Для автоматической проверки персонажа войдите в приложение.");
    const requestBody = {
      operation: "VALIDATE_CHARACTER_COMPATIBILITY",
      model: "obsidian-free",
      instructions: "Проведи независимую проверку персонажа на совместимость с каноном Экдрасиля и D&D 2024 / SRD 5.2.1. Используй закрытую хронику, ОБСИДИАН 4.1, SRD и руководство создания персонажей. Проверяй народ, место рождения, социальную среду, биографию, организационные/исторические ссылки, классовые особенности, навыки, оружие, броню, предметы и магические утверждения. Не считай неизвестное несовместимым: помести в unknowns. Не выдумывай подтверждение. INCOMPATIBLE только при прямом конфликте с источниками или запрещённой механике; COMPATIBLE_WITH_NOTES при устранимых/неподтверждённых деталях; INSUFFICIENT_DATA если не хватает ключевых сведений. Не исправляй персонажа сам. Для каждого конфликта укажи основание и нужное изменение. Ответ строго по схеме.",
      input: JSON.stringify({ action: "Автоматическая проверка совместимости персонажа с миром Экдрасиль", character: characterData }),
    };
    let response: Response;
    try {
      response = await fetch((env.config.url.endsWith("/") ? env.config.url.slice(0, -1) : env.config.url) + "/functions/v1/obsidian-gm", {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          apikey: env.config.publishableKey,
          Authorization: "Bearer " + sessionData.session.access_token,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error("Сетевая ошибка при вызове obsidian-gm: " + reason + ". Проверь подключение и повтори попытку.");
    }
    const responseText = await response.text();
    let data: { output_text?: string; error?: { code?: string; message?: string } } = {};
    try { data = JSON.parse(responseText) as typeof data; }
    catch { throw new Error("Edge Function вернула не JSON (HTTP " + response.status + "). " + responseText.slice(0, 300)); }
    if (!response.ok) {
      throw new Error([data.error?.code, data.error?.message].filter(Boolean).join(": ") || "Edge Function HTTP " + response.status);
    }
    if (!data.output_text) throw new Error("Мастер не вернул результат проверки совместимости.");
    const report = JSON.parse(data.output_text) as { status: string; summary: string; conflicts: string[]; unknowns: string[]; requiredChanges: string[]; supportedFacts: string[] };
    if (!["COMPATIBLE", "COMPATIBLE_WITH_NOTES", "INCOMPATIBLE", "INSUFFICIENT_DATA"].includes(report.status)) throw new Error("Некорректный статус проверки персонажа.");
    if (report.status === "INCOMPATIBLE" || report.status === "INSUFFICIENT_DATA") {
      throw new Error("Проверка совместимости: " + report.summary + (report.conflicts?.length ? " Конфликты: " + report.conflicts.join("; ") : "") + (report.unknowns?.length ? " Неизвестно: " + report.unknowns.join("; ") : ""));
    }
    return report;
  }
  const randomize = () => {
    if (biographyBusy || locked) return;
    try {
      const seed = Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4))).join("-");
      setGenerationSeed(seed);
      setCandidate(null);
      setMode("RANDOM");
      setConfirmed(false);
      setBiographyReady(false);
      setImportError(null);
      void generateRandomCharacterWithMaster(seed);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Не удалось создать случайного персонажа.");
    }
  };
  async function generateRandomCharacterWithMaster(seed: string) {
    if (biographyBusy || locked) return;
    setBiographyBusy(true);
    setBiographyReady(false);
    setImportError(null);
    try {
      const env = readSupabaseEnv();
      const { client, envResult } = getSupabaseAuthClient();
      if (!env.ok || !envResult.ok || !client) throw new Error(!env.ok ? env.error : "Клиент Supabase не готов.");
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error("Требуется активная сессия. Войди в приложение заново.");
      const { data: identityData, error: identityError } = await client.functions.invoke("obsidian-gm", {
        body: {
          operation: "GENERATE_RANDOM_CHARACTER_IDENTITY",
          model: "obsidian-free",
          instructions: "Выбери только основу личности нового персонажа Экдрасиля: имя, народ, класс, предысторию, возраст, подтверждённый город рождения, гендерное представление, семью, воспитание, два-три события жизни, черты, идеал, привязанность, слабость, мотивацию и конкретное личное желание перед началом кампании. Используй только варианты строгой схемы и факты закрытой хроники. Не создавай внешность и длинную биографию на этом этапе. Не придумывай канонические факты, города, организации, NPC и исторические события. Возраст 18–80. Избегай клише. Все поля на русском, кратко и конкретно.",
          input: JSON.stringify({ action: "Выбор личности случайного персонажа Экдрасиля", generationSeed: seed }),
        },
      });
      if (identityError) {
        let detail = identityError.message || "Не удалось вызвать мастера.";
        if ("context" in identityError && identityError.context instanceof Response) {
          const payload = await identityError.context.clone().json().catch(() => null) as { error?: { message?: string } } | null;
          detail = payload?.error?.message ?? detail;
        }
        throw new Error(detail);
      }
      if (!identityData?.output_text) throw new Error("Мастер не вернул личность персонажа.");
      const identity = JSON.parse(identityData.output_text) as RandomCharacterProfile & Partial<CharacterBiography>;
      const supportedSpecies = ["Human","Elf","Dark Elf","Gnome","Red Dwarf","Half-Elf","Beastfolk"];
      const supportedClasses = ["Fighter","Rogue","Barbarian"];
      const supportedBackgrounds = ["Acolyte","Criminal","Sage","Soldier"];
      const supportedBirthplaces = ["Вальдгард","Элион","Аэлиндор","Кхар-Дорн","Крейнхольм","Тар-Нер","Равенск","Морвейн","Греймарк","Азра-Кал","Рахимар","Ша-Мер","Вальдрум","Скайнхейм","Эйргард","Морнхольд"];
      if (!identity || typeof identity.name !== "string" || identity.name.trim().length < 2 ||
          !supportedSpecies.includes(identity.species) || !supportedClasses.includes(identity.className) ||
          !supportedBackgrounds.includes(identity.background) || !supportedBirthplaces.includes(identity.birthplace) ||
          !Number.isInteger(identity.ageYears) || identity.ageYears! < 18 || identity.ageYears! > 80 ||
          typeof identity.family !== "string" || identity.family.length < 20 ||
          typeof identity.upbringing !== "string" || identity.upbringing.length < 20 ||
          !Array.isArray(identity.lifeEvents) || identity.lifeEvents.length < 2 ||
          !Array.isArray(identity.personalityTraits) || identity.personalityTraits.length < 2 ||
          typeof identity.ideal !== "string" || identity.ideal.length < 8 ||
          typeof identity.bond !== "string" || identity.bond.length < 8 ||
          typeof identity.flaw !== "string" || identity.flaw.length < 8 ||
          typeof identity.motivation !== "string" || identity.motivation.length < 15 ||
          typeof identity.preCampaignDesire !== "string" || identity.preCampaignDesire.length < 15) {
        throw new Error("Личность персонажа не прошла проверку. Мастер должен выбрать имя, народ, класс, предысторию и заполнить личную историю.");
      }
      const generated = { ...generateRandomCharacter(secureIndex, identity), generationSeed: seed };
      const invokeDossierPart = async (operation: string, action: string, extraInstructions: string) => {
        const { data, error } = await client.functions.invoke("obsidian-gm", {
          body: {
            operation,
            model: "obsidian-free",
            instructions: extraInstructions,
            input: JSON.stringify({
              action,
              generationSeed: seed,
              character: generated.character,
              mechanicalSummary: generated.summary,
              randomRolls: generated.rolls,
            }),
          },
        });
        if (error) {
          let detail = error.message || "Не удалось вызвать мастера.";
          if ("context" in error && error.context instanceof Response) {
            const payload = await error.context.clone().json().catch(() => null) as { error?: { message?: string } } | null;
            detail = payload?.error?.message ?? detail;
          }
          throw new Error(detail);
        }
        if (!data?.output_text) throw new Error("Мастер не вернул часть досье: " + action);
        return JSON.parse(data.output_text) as Record<string, unknown>;
      };
      const appearancePart = await invokeDossierPart(
        "GENERATE_CHARACTER_APPEARANCE",
        "Подробная внешность персонажа",
        "Опиши внешность по 11 полям: рост, телосложение, кожа, волосы, глаза, лицо, одежда, обувь, аксессуары, отличительные особенности, первое впечатление. Согласуй с народом, возрастом, происхождением, профессией и снаряжением. Без магических особенностей."
      );
      const storyPart = await invokeDossierPart(
        "GENERATE_CHARACTER_STORY",
        "Биография персонажа до начала кампании",
        "Напиши индивидуальную биографию на русском 220–280 слов, 3–4 абзаца. Добавь короткий источник места рождения, ровно 2 подтверждённых пункта канона и короткую отметку о вымышленных личных деталях. Не меняй личность и не выдумывай мировой канон."
      );
      const originsPart = await invokeDossierPart(
        "GENERATE_CHARACTER_ORIGINS",
        "Происхождение навыков, оружия и снаряжения",
        "Объясни происхождение каждого уже имеющегося навыка, переданного оружия и каждого предмета инвентаря. Не добавляй и не меняй механические данные. Для навыков используй формат 'точное имя навыка — содержательное происхождение'."
      );
      const biography = {
        ageYears: identity.ageYears,
        ageCertainty: "KNOWN",
        genderPresentation: identity.genderPresentation,
        birthplace: identity.birthplace,
        family: identity.family,
        upbringing: identity.upbringing,
        lifeEvents: identity.lifeEvents,
        personalityTraits: identity.personalityTraits,
        ideal: identity.ideal,
        bond: identity.bond,
        flaw: identity.flaw,
        motivation: identity.motivation,
        preCampaignDesire: identity.preCampaignDesire,
        appearance: String(appearancePart["appearance"] ?? ""),
        appearanceDetails: appearancePart["appearanceDetails"],
        biography: String(storyPart["biography"] ?? ""),
        birthplaceSource: String(storyPart["birthplaceSource"] ?? ""),
        canonBasis: storyPart["canonBasis"],
        inventedDetailsNotice: String(storyPart["inventedDetailsNotice"] ?? ""),
        skillOrigins: originsPart["skillOrigins"],
        weaponBackground: String(originsPart["weaponBackground"] ?? ""),
        equipmentBackground: String(originsPart["equipmentBackground"] ?? ""),
      } as CharacterBiography;
      const skillNames = generated.character.skillBonuses?.map((skill) => skill.name) ?? [];
      const skillOriginMap = new Map(biography["skillOrigins"].map((entry) => {
        const separator = entry.indexOf(" — ");
        return [separator < 0 ? "" : entry.slice(0, separator).trim(), separator < 0 ? "" : entry.slice(separator + 3).trim()];
      }));
      const skillOrigins = skillNames.map((name) => skillOriginMap.get(name) ?? "");
      if (skillOrigins.some((origin) => origin.length < 20) ||
          !biography.appearanceDetails || Object.values(biography.appearanceDetails).some((value) => typeof value !== "string" || value.length < 25) ||
          typeof biography["biography"] !== "string" || biography["biography"].length < 200 ||
          !Array.isArray(biography["canonBasis"]) || biography["canonBasis"].length < 1) {
        throw new Error("Полное досье не прошло проверку внешности, биографии, навыков или канона. Ничего не сохранено.");
      }
      const completeBiography: CharacterBiography = { ...biography, skillOrigins };
      await validateCharacterCompatibility({
        ...generated.character,
        summary: generated.summary,
        biography: completeBiography,
        generationBasis: { species: identity.species, className: identity.className, background: identity.background, birthplace: identity.birthplace },
      });
      const verifiedBiography = { ...completeBiography, inventedDetailsNotice: completeBiography.inventedDetailsNotice + " Проверка совместимости с каноном Экдрасиля и SRD 5.2.1 пройдена автоматически." };
      setCandidate({ ...generated, character: { ...generated.character, biography: verifiedBiography } });
      setBiographyReady(true);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Не удалось создать случайного персонажа.");
    } finally {
      setBiographyBusy(false);
    }
  }
  const loadDossier = () => { setMode("DOSSIER"); setCandidate(null); setConfirmed(false); setImportError(null); };
  const clearDossier = () => {
    if (!dossier || locked || dossierUploadBusy || biographyBusy) return;
    const result = attachSourceContent(dossier.id, {
      fileName: null,
      content: "",
      originLabel: "Лист персонажа удалён пользователем",
      notes: "Предыдущий файл удалён. Можно загрузить другой лист персонажа.",
    });
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setCandidate(null);
    setConfirmed(false);
    setBiographyReady(false);
    setImportError(null);
  };
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
  const confirmDossier = async () => {
    if (!parsed || !dossier || biographyBusy) return;
    setBiographyBusy(true);
    setImportError(null);
    try {
      // Send the parsed dossier only. The original file can contain a large amount
      // of repeated prose and is not needed for a rules/canon compatibility check.
      await validateCharacterCompatibility({ parsedDossier: parsed, fileName: dossier.fileName });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Проверка совместимости не пройдена.");
      setBiographyBusy(false);
      return;
    }
    setBiographyBusy(false);
    if (dossier.reviewStatus !== "VERIFIED" || dossier.contextEnabled !== true) {
      setImportError("Сначала проверь лист персонажа и отдельно разреши мастеру учитывать его в этой кампании.");
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
      hpCurrent: parsed.hitPointMaximum,
      hpMax: parsed.hitPointMaximum,
      hpTemp: 0,
      armorClass: parsed.armorClass,
      ...(parsed.abilityScores ? { abilityScores: parsed.abilityScores } : {}),
      proficiencyBonus: parsed.proficiencyBonus,
      speedFeet: parsed.speedFeet,
      size: /gnome/i.test(parsed.speciesAndClass ?? "") ? "SMALL" : "MEDIUM",
      ...(parsed.hitDice ? { hitDice: parsed.hitDice } : {}),
      ...(parsed.baseSavingThrowBonuses ? { baseSavingThrowBonuses: parsed.baseSavingThrowBonuses } : {}),
      ...(parsed.baseSavingThrowBonuses ? { savingThrowBonuses: parsed.baseSavingThrowBonuses } : {}),
      skillBonuses: parsed.skillBonuses,
      classFeaturesByLevel: parsed.classFeaturesByLevel,
      weaponAttacks: parsed.weaponAttacks,
      statsCertainty: parsed.abilityScores && parsed.hitPointMaximum !== null ? "KNOWN" : "APPROXIMATE",
      ...(parsed.background ? { background: parsed.background } : {}),
      inventory: parsed.inventory.map((item, i) => ({ id: "dossier-review-"+i, name: item.name, quantity: item.quantity, notes: item.notes, certainty: item.certainty, location: item.location, startPolicy: "KEEP_FROM_DOSSIER" as const, ...(item.attunement ? { attunement: "UNKNOWN" as const } : {}) })),
      resources: parsed.resources.map((item,i) => ({ id: "dossier-resource-"+i, name: item.name, current: item.max, max: item.max, recovery: item.recovery, certainty: item.certainty })),
      conditions: [],
      // Starting money is generated from the character's background at campaign start.
      currentLocationLabel: "Будет определено при запуске кампании",
      notes: "Загружено из проверенного досье. Новая кампания автоматически начинает персонажа с полными HP, нулевыми временными HP, восстановленными классовыми ресурсами, без состояний и со случайным стартовым балансом по предыстории. Стартовая локация назначается при запуске кампании.",
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
      <button disabled={locked} onClick={loadDossier} className="rounded-lg border border-border p-4 text-left hover:bg-accent disabled:opacity-50"><FileText className="mb-2 h-6 w-6"/><h2 className="font-semibold">Загрузить персонажа</h2><p className="mt-1 text-sm text-muted-foreground">Распознать параметры листа. Стартовые HP, классовые ресурсы, состояния, баланс и местоположение подготовятся автоматически при запуске кампании.</p></button>
      <button disabled={locked || biographyBusy} onClick={randomize} className="rounded-lg border border-border p-4 text-left hover:bg-accent disabled:opacity-50"><Dice5 className="mb-2 h-6 w-6"/><h2 className="font-semibold">Создать случайного персонажа</h2><p className="mt-1 text-sm text-muted-foreground">Криптографические броски D&D 2024, затем мастер автоматически создаст биографию по канону Экдрасиля через RouterAI.</p></button>
    </section>
    {mode === "DOSSIER" && <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Проверка досье перед импортом</h2>
      {!parsed ? <div className="space-y-2"><p className="text-sm text-muted-foreground">Лист персонажа загружается отдельно для этой кампании. Он не входит в канон Экдрасиля и не является частью системных правил мастера.</p><label className="block space-y-1.5 text-sm font-medium"><span>Файл персонажа (.docx, .txt, .md)</span><input type="file" accept=".docx,.txt,.md,.json,.csv" disabled={dossierUploadBusy || locked} onChange={handleDossierUpload} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" /></label>{dossierUploadBusy && <p className="text-xs text-muted-foreground">Читаю и обрабатываю лист персонажа…</p>}</div> : <>
        <p className="text-sm">Файл: <strong>{dossier?.fileName ?? "UNKNOWN"}</strong> · статус: {dossier?.reviewStatus ?? "UNKNOWN"}</p>{dossier?.reviewStatus === "VERIFIED" && dossier.contextEnabled === true && <p className="text-xs text-emerald-500">✓ Лист автоматически обработан и подключён к проверке мастера.</p>}
        <dl className="grid grid-cols-2 gap-2 text-sm">{[
          ["Имя",parsed.name],["Вид и класс",parsed.speciesAndClass],["Уровень",parsed.level],["Макс. HP",parsed.hitPointMaximum],["КД без плаща",parsed.armorClass === null ? null : parsed.armorClass - 1],["КД с настроенным плащом",parsed.armorClass],["Бонус мастерства",parsed.proficiencyBonus],["Скорость",parsed.speedFeet],["Навыков",parsed.skillBonuses.length],["Атак",parsed.weaponAttacks.length],["Классовых уровней с особенностями",parsed.classFeaturesByLevel.length],["Предметов",parsed.inventory.length],["Ресурсов",parsed.resources.length]
        ].map(([k,v])=><div className="rounded bg-muted/40 p-2" key={String(k)}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v ?? "UNKNOWN"}</dd></div>)}</dl>
        <div className="rounded bg-muted/30 p-3 text-sm"><AlertTriangle className="mr-2 inline h-4 w-4"/>Новая кампания автоматически подготовит стартовое состояние персонажа: полные HP, восстановленные классовые ресурсы, отсутствие временных HP и состояний, нулевой баланс и случайную стартовую локацию.</div>
        <p className="text-xs text-muted-foreground">Подтверждённые характеристики: {parsed.abilityScores ? Object.entries(parsed.abilityScores).map(([k,v])=>k.toUpperCase()+" "+v).join(" · ") : "UNKNOWN"}</p>
        {importError && <p className="text-xs text-destructive">{importError}</p>}
        {biographyBusy && <p className="text-sm text-primary">Мастер автоматически сверяет персонажа с хроникой Экдрасиля и SRD 5.2.1…</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={locked || !parsed || confirmed || biographyBusy} onClick={() => void confirmDossier()}>{biographyBusy ? "Проверяю совместимость…" : "Проверить и импортировать персонажа"}</Button>
          <Button type="button" variant="outline" disabled={locked || dossierUploadBusy || biographyBusy} onClick={clearDossier}>Удалить файл и загрузить другой</Button>
        </div>
      </>}
    </section>}
    {mode === "RANDOM" && biographyBusy && <section className="rounded-lg border border-primary/30 p-4 text-sm"><p className="font-semibold">Мастер Экдрасиля создаёт персонажа</p><p className="mt-2 text-muted-foreground">Проверяет канон, формирует биографию и сверяет детали с правилами D&D 2024. Карточка появится только после завершения генерации.</p></section>}
    {mode === "RANDOM" && !biographyBusy && !biographyReady && importError && <section className="rounded-lg border border-destructive/40 p-4 text-sm"><p className="font-semibold text-destructive">Не удалось создать персонажа</p><p className="mt-2 text-muted-foreground">{importError}</p><Button type="button" className="mt-3 w-full" disabled={locked} onClick={() => generationSeed ? void generateRandomCharacterWithMaster(generationSeed) : randomize()}>Повторить генерацию через API</Button></section>}
    {mode === "RANDOM" && candidate && biographyReady && <section className="space-y-3 rounded-lg border p-4">
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
        {biographyReady ? <div className="space-y-3 rounded-lg border p-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Место рождения</p><p className="font-medium">{candidate.character["biography"]?.birthplace ?? "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">Семья и происхождение</p><p>{candidate.character["biography"]?.family ?? "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">Детство и воспитание</p><p>{candidate.character["biography"]?.upbringing ?? "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">События до начала кампании</p><p>{candidate.character["biography"]?.lifeEvents.join(" ") || "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">Чего хотел в Экдрасиле перед началом кампании</p><p className="font-medium">{candidate.character["biography"]?.preCampaignDesire ?? "UNKNOWN"}</p></div>
          <div><p className="text-xs text-muted-foreground">Черты характера</p><p>{candidate.character["biography"]?.personalityTraits.join(", ") || "UNKNOWN"}</p></div>
        </div> : <p className="rounded-lg border p-3 text-sm text-muted-foreground">Мастер создаёт биографию по канону Экдрасиля. Шаблонная история пока не показывается.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Внешность персонажа</h3>
        {biographyReady && candidate.character["biography"]?.["appearance"] && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Общий портрет</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{candidate.character["biography"]["appearance"]}</p>
          </div>
        )}
        {biographyReady && candidate.character["biography"]?.appearanceDetails ? (
          <div className="overflow-hidden rounded-lg border">
            {([
              ["Рост", candidate.character["biography"].appearanceDetails.height],
              ["Телосложение", candidate.character["biography"].appearanceDetails.build],
              ["Кожа", candidate.character["biography"].appearanceDetails.skin],
              ["Волосы", candidate.character["biography"].appearanceDetails.hair],
              ["Глаза", candidate.character["biography"].appearanceDetails.eyes],
              ["Лицо", candidate.character["biography"].appearanceDetails.face],
              ["Одежда", candidate.character["biography"].appearanceDetails.clothing],
              ["Обувь", candidate.character["biography"].appearanceDetails.footwear],
              ["Аксессуары", candidate.character["biography"].appearanceDetails.accessories],
              ["Отличительные особенности", candidate.character["biography"].appearanceDetails.distinctiveFeatures],
              ["Первое впечатление", candidate.character["biography"].appearanceDetails.firstImpression],
            ] as const).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 border-b last:border-b-0 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{label}</span><span className="text-right">{value || "UNKNOWN"}</span>
              </div>
            ))}
          </div>
         ) : <p className="rounded-lg border p-3 text-sm text-muted-foreground">Мастер подробно создаёт внешность по народу, происхождению, возрасту и жизненному пути персонажа.</p>}
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
        {biographyReady && <div className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">Происхождение оружия</p><p>{candidate.character["biography"]?.["weaponBackground"] || "UNKNOWN"}</p><p className="mb-1 mt-3 text-xs text-muted-foreground">Происхождение снаряжения</p><p>{candidate.character["biography"]?.["equipmentBackground"] || "UNKNOWN"}</p></div>}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">5. Навыки</h3>
        <div className="rounded-lg border p-3">{candidate.character.skillBonuses?.map((skill)=><div key={skill.name} className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0"><span>{skill.name}</span><strong className="tabular-nums">+{skill.bonus}</strong></div>)}</div>
        {candidate.character["biography"]?.["skillOrigins"]?.length ? <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Как освоены навыки</p>{candidate.character["biography"]["skillOrigins"].map((entry,index)=><p key={index} className="border-b py-2 text-sm last:border-b-0"><strong>{candidate.character.skillBonuses?.[index]?.name ?? "Навык"}:</strong> {entry}</p>)}</div> : null}
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
        <p className="text-xs text-muted-foreground">После случайных бросков приложение автоматически отправляет только параметры сгенерированного персонажа в RouterAI. Ключ хранится на сервере Supabase и не попадает в браузер. Запрос может расходовать баланс RouterAI.</p>
        {biographyBusy && <p className="text-sm text-primary">Мастер Экдрасиля одновременно создаёт личность, полную историю, подробную внешность и досье…</p>}
        {!biographyBusy && !biographyReady && <div className="space-y-2"><p className="text-xs text-destructive">{importError || "Биография ещё не создана. Персонажа нельзя подтвердить без ответа мастера."}</p><Button type="button" variant="outline" disabled={locked} onClick={() => generationSeed ? void generateRandomCharacterWithMaster(generationSeed) : randomize()}>Повторить генерацию через API</Button></div>}
        {biographyReady && candidate.character["biography"] && <div className="space-y-1 rounded bg-muted/30 p-3 text-sm"><p className="font-medium">{candidate.character["biography"].ageYears === null ? "Возраст UNKNOWN" : "Возраст: " + candidate.character["biography"].ageYears}</p><p>{candidate.character["biography"]["biography"]}</p><p className="text-xs text-muted-foreground">События: {candidate.character["biography"].lifeEvents.join(" · ")}</p><div className="space-y-1 border-t pt-2"><p className="font-medium">Как освоены навыки</p>{candidate.character["biography"]["skillOrigins"].map((entry,index)=><p className="text-xs text-muted-foreground" key={index}>{candidate.character.skillBonuses?.[index]?.name ?? "Навык"}: {entry}</p>)}</div><div className="space-y-1 border-t pt-2"><p className="font-medium">Оружие</p><p className="text-xs text-muted-foreground">{candidate.character["biography"]["weaponBackground"]}</p><p className="font-medium">Снаряжение</p><p className="text-xs text-muted-foreground">{candidate.character["biography"]["equipmentBackground"]}</p></div><p className="text-xs text-muted-foreground">Основа канона: {candidate.character["biography"]["canonBasis"].join("; ")}</p><p className="text-xs text-emerald-500">Досье мастера получено и проверено. Механические параметры сохранены без изменений.</p></div>}
      </div>
      <details className="rounded border p-2"><summary className="cursor-pointer text-xs font-medium">Результаты бросков характеристик</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{candidate.rolls.map((roll)=><li key={roll}>{roll}</li>)}</ul></details>
      <p className="text-xs text-muted-foreground">Сейчас доступны 7 народов Экдрасиля: люди, эльфы, тёмные эльфы, гномы, краснолюды, полуэльфы и зверолюди. Классы и предыстории выбираются из реализованных профилей; места рождения — из 16 подтверждённых городов хроники. Механические параметры рассчитываются генератором, а мастер пишет индивидуальное досье и объясняет происхождение навыков, оружия и снаряжения. Мутации и проклятия не добавляются автоматически.</p>
      {importError && <p role="alert" className="text-xs text-destructive">{importError}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={locked || biographyBusy} onClick={randomize}>Создать другого</Button><Button disabled={locked || confirmed || biographyBusy || !biographyReady} onClick={confirmRandom}>Подтвердить персонажа</Button></div>
    </section>}
    {confirmed && <div className="rounded border border-emerald-500/40 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Досье персонажа импортировано и сохранено отдельно от канона мира.</div>}
    {characterReady && !locked && <section className="space-y-3 rounded-lg border border-primary/40 p-4">
      <div><h2 className="text-lg font-semibold">Персонаж готов к кампании</h2><p className="text-sm text-muted-foreground">{character.name} · {character.speciesAndClass} · HP будут определены случайной стартовой ситуацией; неизвестные остатки ресурсов останутся UNKNOWN.</p></div>
      <p className="text-xs text-muted-foreground">Применится профиль ОБСИДИАН 4.1 / D&D 2024: SRD 5.2.1, броски через Web Crypto с показом результатов, XP, стандартный учёт нагрузки, базовые правила выживания, региональные встречи без универсальных таблиц, без PvP и без дополнительных правил смерти, кроме отдельно согласованных правил текущей кампании. Профиль можно изменить в настройках до первого игрового хода.</p>
      <p className="text-xs text-muted-foreground">{serverReadiness === "CHECKING" ? "Автоматически проверяю ОБСИДИАН 4.1, SRD 5.2.1, Хронику Экдрасиля и руководство генерации…" : serverReadiness === "READY" ? "✓ Серверные документы автоматически проверены." : "Автоматическая проверка сервера не пройдена: " + (serverReadinessError ?? "неизвестная ошибка")}</p>
      {startError && <p role="alert" className="text-sm text-destructive">{startError}</p>}
      <Button className="w-full touch-target" disabled={startPending || serverReadiness !== "READY"} onClick={handleStartCampaign}>{startPending ? "Подготавливаю Экдрасиль…" : "Начать кампанию"}</Button>
    </section>}
    {!characterReady && mode === "RANDOM" && confirmed && <p className="rounded border border-amber-500/40 p-3 text-xs text-amber-200">Случайный персонаж ещё не подтверждён. Проверь его параметры и нажми «Подтвердить персонажа».</p>}
    {worldState.setup.confirmed && <div className="rounded border border-emerald-500/40 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Кампания подготовлена. <Link className="underline font-semibold" to="/game">Перейти к игре</Link></div>}
    
  </main>;
}
