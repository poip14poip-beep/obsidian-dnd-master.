import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Dice5, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useObsidianStore } from "@/store/obsidian-store";
import { extractDossierBasics } from "@/domain/dossier-parser";

export const Route = createFileRoute("/play")({ component: PlayPage });

type Mode = "DOSSIER" | "RANDOM" | null;
type RandomCandidate = { strength:number; dexterity:number; constitution:number; intelligence:number; wisdom:number; charisma:number; classChoice:string; speciesChoice:string };
function rollAbility(): number {
  const dice = [0, 1, 2, 3].map(() => Math.floor(Math.random() * 6) + 1).sort((a,b) => b-a);
  return dice[0]! + dice[1]! + dice[2]!;
}
function PlayPage() {
  const { sources, updatePlayerCharacter, worldState, sessionLog } = useObsidianStore();
  const [mode, setMode] = useState<Mode>(null);
  const [candidate, setCandidate] = useState<RandomCandidate | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const dossier = sources.find(s => s.type === "PLAYER_DOSSIER" && s.contentStatus === "ATTACHED");
  const parsed = useMemo(() => dossier?.content ? extractDossierBasics(dossier.content) : null, [dossier?.content]);
  const locked = worldState.setup.confirmed || sessionLog.lastTurnNumber > 0;
  const randomize = () => {
    const stats = { strength: rollAbility(), dexterity: rollAbility(), constitution: rollAbility(), intelligence: rollAbility(), wisdom: rollAbility(), charisma: rollAbility() };
    const classes = ["Боец", "Плут", "Жрец", "Следопыт", "Волшебник", "Паладин", "Варвар", "Бард"];
    const speciesList = ["Человек", "Эльф", "Дварф", "Полурослик", "Гном", "Тифлинг", "Драконорождённый"];
    const draw = (list: string[]) => list[Math.floor(Math.random() * list.length)]!;
    setCandidate({ ...stats, level: 1, classChoice: draw(classes), speciesChoice: draw(speciesList) });
    setMode("RANDOM");
    setConfirmed(false);
  };
  const loadDossier = () => { setMode("DOSSIER"); setCandidate(null); setConfirmed(false); };
  const confirmDossier = () => {
    if (!parsed || !dossier) return;
    const result = updatePlayerCharacter({
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
      ...(parsed.savingThrowBonuses ? { savingThrowBonuses: parsed.savingThrowBonuses } : {}),
      ...(parsed.baseSavingThrowBonuses ? { baseSavingThrowBonuses: parsed.baseSavingThrowBonuses } : {}),
      skillBonuses: parsed.skillBonuses,
      classFeaturesByLevel: parsed.classFeaturesByLevel,
      weaponAttacks: parsed.weaponAttacks,
      statsCertainty: parsed.abilityScores && parsed.hitPointMaximum !== null && parsed.armorClass !== null ? "KNOWN" : "APPROXIMATE",
      inventory: parsed.inventory.map((item, i) => ({ id: "dossier-review-"+i, name: item.name, quantity: item.quantity, notes: item.notes, certainty: item.certainty, location: item.location, startPolicy: item.startPolicy })),
      resources: parsed.resources.map((item,i) => ({ id: "dossier-resource-"+i, name: item.name, current: item.current, max: item.max, recovery: item.recovery, certainty: item.certainty })),
      notes: "Загружено из досье персонажа после отдельного просмотра и подтверждения. Текущие HP, деньги и текущее местоположение не выводятся из досье; UNKNOWN.",
    });
    if (result.ok) setConfirmed(true);
  };
  const confirmRandom = () => {
    if (!candidate) return;
    const result = updatePlayerCharacter({
      name: "Новый персонаж (имя не задано)",
      nameCertainty: "APPROXIMATE",
      speciesAndClass: "Случайная заготовка · " + candidate.classChoice + " · " + candidate.speciesChoice,
      level: 1, hpCurrent: null, hpMax: null, armorClass: null,
      abilityScores: { strength:candidate.strength, dexterity:candidate.dexterity, constitution:candidate.constitution, intelligence:candidate.intelligence, wisdom:candidate.wisdom, charisma:candidate.charisma },
      statsCertainty: "APPROXIMATE",
      currentLocationLabel: "UNKNOWN", conditions: [], inventory: [], resources: [],
      notes: "Случайная заготовка персонажа. Характеристики получены бросками 4d6 с отбрасыванием наименьшего кубика. Вид и класс выбраны случайно; детали класса, происхождение, навыки, снаряжение, HP, КД и заклинания требуют отдельной подготовки и проверки.",
    });
    if (result.ok) setConfirmed(true);
  };
  return <main className="mx-auto max-w-3xl space-y-4 p-4 pb-20">
    <header className="space-y-1"><p className="text-xs uppercase tracking-wider text-primary">ОБСИДИАН 4.1 · подготовка</p><h1 className="text-2xl font-bold">Играть в Экдрасиль</h1><p className="text-sm text-muted-foreground">Сначала выбери источник персонажа. Ничего не записывается в активный лист до твоего подтверждения.</p></header>
    {locked && <div className="rounded border border-amber-500/40 p-3 text-sm"><Lock className="mr-2 inline h-4 w-4"/>Кампания уже подтверждена или содержит игровые ходы. Изменение стартового персонажа заблокировано.</div>}
    <section className="grid gap-3 sm:grid-cols-2">
      <button disabled={locked} onClick={loadDossier} className="rounded-lg border border-border p-4 text-left hover:bg-accent disabled:opacity-50"><FileText className="mb-2 h-6 w-6"/><h2 className="font-semibold">Загрузить существующее досье</h2><p className="mt-1 text-sm text-muted-foreground">Распознать подтверждённые поля, показать неизвестные данные и только затем предложить импорт.</p></button>
      <button disabled={locked} onClick={randomize} className="rounded-lg border border-border p-4 text-left hover:bg-accent disabled:opacity-50"><Dice5 className="mb-2 h-6 w-6"/><h2 className="font-semibold">Создать случайного персонажа</h2><p className="mt-1 text-sm text-muted-foreground">Сгенерировать первичную заготовку с бросками характеристик, видом и классом.</p></button>
    </section>
    {mode === "DOSSIER" && <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Проверка досье перед импортом</h2>
      {!parsed ? <p className="text-sm text-destructive">Досье не прикреплено. Открой раздел источников и добавь файл персонажа.</p> : <>
        <p className="text-sm">Источник: <strong>{dossier?.title}</strong> · статус: {dossier?.reviewStatus ?? "UNKNOWN"}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">{[
          ["Имя",parsed.name],["Вид и класс",parsed.speciesAndClass],["Уровень",parsed.level],["Макс. HP",parsed.hitPointMaximum],["КД",parsed.armorClass],["Бонус мастерства",parsed.proficiencyBonus],["Скорость",parsed.speedFeet],["Предметов",parsed.inventory.length],["Ресурсов",parsed.resources.length]
        ].map(([k,v])=><div className="rounded bg-muted/40 p-2" key={String(k)}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v ?? "UNKNOWN"}</dd></div>)}</dl>
        <div className="rounded bg-muted/30 p-3 text-sm"><AlertTriangle className="mr-2 inline h-4 w-4"/>Текущие HP, деньги, местоположение, активные состояния и фактические остатки ресурсов не выводятся автоматически. После импорта потребуется отдельная подготовка старта.</div>
        <p className="text-xs text-muted-foreground">Подтверждённые характеристики: {parsed.abilityScores ? Object.entries(parsed.abilityScores).map(([k,v])=>k.toUpperCase()+" "+v).join(" · ") : "UNKNOWN"}</p>
        <Button disabled={locked || !parsed || confirmed} onClick={confirmDossier}>Подтвердить импорт досье</Button>
      </>}
    </section>}
    {mode === "RANDOM" && candidate && <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Случайная заготовка персонажа</h2>
      <p className="text-sm text-muted-foreground">Характеристики: 4d6, отбрасывается наименьший кубик. Вид: <strong>{candidate.speciesChoice}</strong> · класс: <strong>{candidate.classChoice}</strong>.</p>
      <div className="grid grid-cols-3 gap-2">{Object.entries(candidate).filter(([k])=>k!=="level").map(([k,v])=><div className="rounded bg-muted/40 p-2 text-center" key={k}><p className="text-xs text-muted-foreground">{k.toUpperCase()}</p><p className="text-xl font-bold">{v}</p></div>)}</div>
      <div className="rounded bg-muted/30 p-3 text-sm">HP, КД, навыки, владения, происхождение, снаряжение, заклинания и классовые особенности останутся UNKNOWN до следующего этапа заполнения и проверки по D&D 2024.</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={randomize}>Перебросить характеристики</Button><Button disabled={locked || confirmed} onClick={confirmRandom}>Подтвердить заготовку</Button></div>
    </section>}
    {confirmed && <div className="rounded border border-emerald-500/40 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Подтверждение записано в локальное состояние. Следующий этап — обязательная подготовка кампании и проверка недостающих данных.</div>}
    <div className="flex flex-wrap gap-3 text-sm"><Link className="underline" to="/settings">Мастер подготовки кампании</Link><Link className="underline" to="/character">Открыть лист персонажа</Link><Link className="underline" to="/">На главную</Link></div>
  </main>;
}
