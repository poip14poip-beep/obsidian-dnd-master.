import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { CertaintyBadge } from "@/components/StatusPill";
import { calculatePlayerInventoryWeight } from "@/domain/inventory-weight";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/character")({
  head: () => ({
    meta: [
      { title: "Персонаж — Obsidian Control" },
      { name: "description", content: "Только чтение подтверждённого состояния PLAYER_CHARACTER_STATE." },
    ],
  }),
  component: CharacterPage,
});

const RU_TERMS: Array<[RegExp, string]> = [
[/Second Wind/gi,"Второе дыхание"],[/Action Surge/gi,"Всплеск действий"],[/Indomitable/gi,"Несгибаемость"],[/Fighting Style/gi,"Боевой стиль"],[/Weapon Mastery/gi,"Мастерство владения оружием"],[/Tactical Mind/gi,"Тактический ум"],[/Tactical Shift/gi,"Тактическое смещение"],[/Tactical Master/gi,"Тактическое мастерство"],[/Studied Attacks/gi,"Изученные атаки"],[/Improved Critical/gi,"Улучшенный критический удар"],[/Remarkable Athlete/gi,"Выдающийся атлет"],[/Additional Fighting Style/gi,"Дополнительный боевой стиль"],[/Ability Score Improvement/gi,"Увеличение характеристик"],[/Extra Attack/gi,"Дополнительная атака"],[/Heroic Warrior/gi,"Героический воин"],[/Superior Critical/gi,"Превосходный критический удар"],[/Champion/gi,"Чемпион"],[/Fighter/gi,"Воин"],[/Rogue/gi,"Плут"],[/Barbarian/gi,"Варвар"],[/Human/gi,"Человек"],[/Dark Elf/gi,"Тёмный эльф"],[/Half-Elf/gi,"Полуэльф"],[/Beastfolk/gi,"Зверолюд"],[/Athletics/gi,"Атлетика"],[/Acrobatics/gi,"Акробатика"],[/Sleight of Hand/gi,"Ловкость рук"],[/Stealth/gi,"Скрытность"],[/Arcana/gi,"Магия"],[/History/gi,"История"],[/Investigation/gi,"Расследование"],[/Insight/gi,"Проницательность"],[/Perception/gi,"Внимательность"],[/Survival/gi,"Выживание"],[/Animal Handling/gi,"Обращение с животными"],[/Medicine/gi,"Медицина"],[/Nature/gi,"Природа"],[/Religion/gi,"Религия"],[/Deception/gi,"Обман"],[/Intimidation/gi,"Запугивание"],[/Performance/gi,"Выступление"],[/Persuasion/gi,"Убеждение"],[/Dueling/gi,"Дуэлянт"],[/Defense/gi,"Защита"],[/Longsword/gi,"Длинный меч"],[/Dagger/gi,"Кинжал"],[/Short Rest/gi,"Короткий отдых"],[/Long Rest/gi,"Продолжительный отдых"],[/Attack/gi,"Атака"],[/Sap/gi,"Ослабление"],[/Nick/gi,"Дополнительный удар"],[/Push/gi,"Отталкивание"],[/Slow/gi,"Замедление"],[/Cloak of Protection/gi,"Защитный плащ"],[/Boots of Elvenkind/gi,"Эльфийские сапоги"],[/Studded Leather/gi,"Украшенный заклёпками кожаный доспех"],[/UNKNOWN/g,"Неизвестно"],[/WORN/g,"Надето"],[/CARRIED/g,"При себе"],[/STORED/g,"Хранится отдельно"],[/DROPPED/g,"Оставлено"],[/OTHER/g,"Другое"],[/MEDIUM/g,"Средний"],[/SMALL/g,"Маленький"],[/TINY/g,"Крошечный"],[/LARGE/g,"Большой"],[/HUGE/g,"Огромный"],[/GARGANTUAN/g,"Гигантский"],[/STANDARD/g,"Обычный"],[/VARIANT/g,"Вариантный"],[/ABSTRACT/g,"Условный"]];
function ru(value: string | number | null | undefined): string {
 if (value === null || value === undefined || value === "") return "Неизвестно";
 let result = String(value);
 for (const [pattern, replacement] of RU_TERMS) result = result.replace(pattern, replacement);
 return result.replace(/\\bft\\b/gi, "фут.").replace(/\\blb\\b/gi, "фунт").replace(/\\bHP\\b/g, "ОЗ");
}

function Value({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono-code mt-1 break-words text-sm font-semibold text-foreground">
        {ru(value)}
      </p>
    </div>
  );
}

function extractDossierSection(content: string, start: RegExp, end: RegExp): string {
 const lines = content.split(/\\r?\\n/);
 const first = lines.findIndex(line => start.test(line.trim()));
 if (first < 0) return '';
 const last = lines.findIndex((line, index) => index > first && end.test(line.trim()));
 return lines.slice(first + 1, last < 0 ? lines.length : last).filter(line => !/^<PARSED TEXT FOR PAGE:/i.test(line.trim())).join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
}
function CharacterPage() {
  const { sources, worldState, character, updateCharacterResource } = useObsidianStore();
  const [resourceDrafts, setResourceDrafts] = useState<Record<string, string>>({});
  const dossier = sources.find((source) => source.id === character.sourceDossierId);
  const dossierLifeHistory = dossier?.content ? extractDossierSection(dossier.content, /^5\\.\\s*Подробная биография/i, /^6\\.\\s*Области опыта/i) : ''; 
  const dossierAppearance = dossier?.content ? extractDossierSection(dossier.content, /^1\\.\\s*Внешность и экипировка/i, /^2\\.\\s*Прозвища/i) : '';
  const load = calculatePlayerInventoryWeight(character, worldState.encumbranceMode);
  const stats = character.abilityScores;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">Лист персонажа</h1>
          <span className="mono-code rounded border border-layer-player/40 bg-layer-player/10 px-2 py-1 text-xs text-layer-player">
            ЛИСТ ПЕРСОНАЖА · v{character.stateVersion}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Режим просмотра. Это подтверждённое состояние персонажа, а не форма редактирования.
          Изменения в ходе игры фиксируются мастером; игрок может отдельно внести только фактически проверенное текущее количество ресурса.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CertaintyBadge status={character.statsCertainty} />
          <span className="text-muted-foreground">
            Источник: {ru(dossier?.title ?? character.sourceDossierId)} · {dossier?.contentStatus === "ATTACHED" ? "прикреплён" : "не прикреплён"}
          </span>
        </div>
      </header>

      {!character.biography?.biography && dossierLifeHistory && (
        <section className="panel-surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">История жизни до кампании</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{ru(dossierLifeHistory)}</div>
        </section>
      )}
      {character.biography && (
        <section className="panel-surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">История жизни до кампании</h2>
          <p className="text-sm leading-relaxed">{ru(character.biography.biography)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Value label="Возраст" value={character.biography.ageYears === null ? "Неизвестно" : character.biography.ageYears} />
            <Value label="Место рождения" value={ru(character.biography.birthplace)} />
            <Value label="Внешность" value={ru(character.biography.appearance)} />
          </div>
          <p className="text-xs text-muted-foreground">{ru(character.biography.inventedDetailsNotice)}</p>
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Подробности личности и прошлого</summary>
            <div className="mt-2 space-y-2 text-sm">
              <p><strong>Семья:</strong> {ru(character.biography.family)}</p>
              <p><strong>Воспитание:</strong> {ru(character.biography.upbringing)}</p>
              <p><strong>События:</strong> {ru(character.biography.lifeEvents.join(" "))}</p>
              <p><strong>Характер:</strong> {ru(character.biography.personalityTraits.join(", "))}</p>
              <p><strong>Идеал:</strong> {ru(character.biography.ideal)}</p>
              <p><strong>Привязанность:</strong> {ru(character.biography.bond)}</p>
              <p><strong>Слабость:</strong> {ru(character.biography.flaw)}</p>
              <p><strong>Мотивация:</strong> {ru(character.biography.motivation)}</p>
              <p className="text-xs text-muted-foreground">Основа канона: {ru(character.biography.canonBasis.join("; "))}</p>
            </div>
          </details>
        </section>
      )}
      {!character.biography?.appearanceDetails && dossierAppearance && (
        <section className="panel-surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Внешность</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{ru(dossierAppearance)}</div>
        </section>
      )}
      {character.biography?.appearanceDetails && (
        <section className="panel-surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Внешность</h2>
          <p className="text-sm leading-relaxed">{ru(character.biography.appearance)}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              ["Рост", character.biography.appearanceDetails.height], ["Телосложение", character.biography.appearanceDetails.build],
              ["Кожа", character.biography.appearanceDetails.skin], ["Волосы", character.biography.appearanceDetails.hair],
              ["Глаза", character.biography.appearanceDetails.eyes], ["Лицо", character.biography.appearanceDetails.face],
              ["Одежда", character.biography.appearanceDetails.clothing], ["Обувь", character.biography.appearanceDetails.footwear],
              ["Аксессуары", character.biography.appearanceDetails.accessories], ["Отличительные черты", character.biography.appearanceDetails.distinctiveFeatures],
              ["Первое впечатление", character.biography.appearanceDetails.firstImpression],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm leading-relaxed">{ru(value)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {character.recentPreCampaignHistory?.trim() && (
        <section className="panel-surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Последний месяц перед кампанией</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{ru(character.recentPreCampaignHistory)}</p>
          <p className="text-xs text-muted-foreground">Отдельная предыстория, связывающая жизнь персонажа с точкой и датой начала приключения.</p>
        </section>
      )}
      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">Основные параметры</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Value label="Имя" value={character.name} />
          <Value label="Вид и класс" value={character.speciesAndClass} />
          <Value label="Уровень" value={character.level} />
          <Value label="Текущие очки здоровья" value={character.hpCurrent} />
          <Value label="Максимальные очки здоровья" value={character.hpMax} />
          <Value label="Временные очки здоровья" value={character.hpTemp} />
          <Value label="Класс Доспеха (КД)" value={character.armorClass} />
          <Value label="Бонус мастерства" value={character.proficiencyBonus} />
          <Value label="Размер существа" value={ru(character.size ?? "UNKNOWN")} />
          <Value label="Скорость" value={character.speedFeet === null || character.speedFeet === undefined ? "UNKNOWN" : `${character.speedFeet} фут.`} />
        </div>
        {stats && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Характеристики</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {([
                ["СИЛ", stats.strength], ["ЛОВ", stats.dexterity], ["ТЕЛ", stats.constitution],
                ["ИНТ", stats.intelligence], ["МДР", stats.wisdom], ["ХАР", stats.charisma],
              ] as const).map(([label, score]) => (
                <Value key={label} label={label} value={score} />
              ))}
            </div>
          </div>
        )}
        <Value label="Текущее местоположение персонажа" value={character.currentLocationLabel} />
        {character.hitDice && <Value label="Кости хитов" value={character.hitDice} />}
        {(character.savingThrowBonuses ?? character.baseSavingThrowBonuses) && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Текущие спасброски</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {([
                ["СИЛ", (character.savingThrowBonuses ?? character.baseSavingThrowBonuses)!.strength], ["ЛОВ", (character.savingThrowBonuses ?? character.baseSavingThrowBonuses)!.dexterity],
                ["ТЕЛ", (character.savingThrowBonuses ?? character.baseSavingThrowBonuses)!.constitution], ["ИНТ", (character.savingThrowBonuses ?? character.baseSavingThrowBonuses)!.intelligence],
                ["МДР", (character.savingThrowBonuses ?? character.baseSavingThrowBonuses)!.wisdom], ["ХАР", (character.savingThrowBonuses ?? character.baseSavingThrowBonuses)!.charisma],
              ] as const).map(([label, value]) => <Value key={label} label={label} value={value >= 0 ? `+${value}` : value} />)}
            </div>
          </div>
        )}
        {character.skillBonuses && character.skillBonuses.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Навыки</h3>
            <ul className="divide-y divide-border">
              {character.skillBonuses.map((skill) => (
                <li key={skill.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{ru(skill.name)}</span><span className="mono-code font-semibold">{skill.bonus >= 0 ? `+${skill.bonus}` : skill.bonus}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {character.weaponAttacks && character.weaponAttacks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Атаки оружием</h3>
            <div className="space-y-2">
              {character.weaponAttacks.map((attack) => (
                <div key={attack.weapon} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{ru(attack.weapon)}</strong><span className="mono-code">Атака {attack.attackBonus >= 0 ? `+${attack.attackBonus}` : attack.attackBonus}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Урон: {ru(attack.damage)} · Владение оружием: {ru(attack.mastery)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {character.classFeaturesByLevel && character.classFeaturesByLevel.length > 0 && (
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Классовые особенности по уровням ({character.classFeaturesByLevel.length})</summary>
            <ul className="mt-2 space-y-2">
              {character.classFeaturesByLevel.map((feature) => (
                <li key={feature.level} className="text-sm">
                  <strong className="mono-code mr-2">{feature.level} ур.</strong>{ru(feature.features)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">Ресурсы и состояния</h2>
        {character.resources.length === 0 ? (
          <p className="text-xs text-muted-foreground">Подтверждённые ресурсы не внесены.</p>
        ) : (
          <div className="space-y-2">
            {character.resources.map((resource) => (
              <div key={resource.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{ru(resource.name)}</p>
                  <p className="text-xs text-muted-foreground">Восстановление: {ru(resource.recovery)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="mono-code text-sm font-semibold">{resource.current ?? "?"}/{resource.max ?? "?"}</p>
                  <input
                    aria-label={`Фактический остаток ресурса ${ru(resource.name)}`}
                    type="number" min={0} max={resource.max ?? undefined} step={1}
                    value={resourceDrafts[resource.id] ?? (resource.current === null ? "" : String(resource.current))}
                    onChange={(event) => setResourceDrafts((current) => ({ ...current, [resource.id]: event.target.value }))}
                    placeholder="Неизвестно"
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs"
                    onClick={() => {
                      const raw = resourceDrafts[resource.id] ?? (resource.current === null ? "" : String(resource.current));
                      const value = Number(raw);
                      if (raw.trim() === "" || !Number.isInteger(value) || value < 0 || (resource.max !== null && value > resource.max)) {
                        toast.error(`Укажи целое значение от 0 до ${resource.max ?? "допустимого максимума"}.`);
                        return;
                      }
                      const result = updateCharacterResource(resource.id, value);
                      if (result.ok) {
                        setResourceDrafts((current) => { const { [resource.id]: _saved, ...rest } = current; return rest; });
                        toast.success(`Остаток ресурса «${ru(resource.name)}» обновлён без продвижения игрового времени.`);
                      }
                      else toast.error(result.error);
                    }}
                  >Зафиксировать</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Value label="Состояния" value={character.conditions.length ? character.conditions.join(", ") : "Нет подтверждённых состояний"} />
      </section>

      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">Инвентарь ({character.inventory.length})</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Value label="Известный переносимый вес" value={`${load.knownCarriedWeightLb.toFixed(2)} фунт.`} />
          <Value label="Вес монет" value={load.currencyWeightLb === null ? "Неизвестно" : `${load.currencyWeightLb.toFixed(2)} фунт.`} />
          <Value label="Предел переносимой нагрузки" value={load.carryingCapacityLb === null ? "Неизвестно" : `${load.carryingCapacityLb} фунт.`} />
          <Value label="Статус нагрузки" value={load.encumbranceStatus} />
        </div>
        {load.unknownCarriedItems.length > 0 && (
          <p className="rounded border border-status-approx/30 bg-status-approx/5 p-2 text-xs">
            Вес не установлен для предметов: {load.unknownCarriedItems.join(", ")}. Полная нагрузка пока не определена.
          </p>
        )}
        {load.unknownLocationItems.length > 0 && (
          <p className="rounded border border-status-approx/30 bg-status-approx/5 p-2 text-xs">
            Не установлено местоположение: {load.unknownLocationItems.join(", ")}.
          </p>
        )}
        {character.inventory.length === 0 ? (
          <p className="text-xs text-muted-foreground">Инвентарь не содержит подтверждённых предметов.</p>
        ) : (
          <ul className="divide-y divide-border">
            {character.inventory.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium">{ru(item.name)}</span>
                  <span className="mono-code ml-2 text-xs text-muted-foreground">×{item.quantity}</span>
                  {item.notes && <p className="text-xs text-muted-foreground">{ru(item.notes)}</p>}
                  {item.attunement && <p className="text-xs text-muted-foreground">Настройка: {item.attunement}</p>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {ru(item.location ?? "Неизвестно")} · {item.unitWeightLb === null || item.unitWeightLb === undefined ? "вес не установлен" : `${item.unitWeightLb} фунт/ед.`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Value label="Хранится отдельно" value={`${load.storedWeightLb.toFixed(2)} фунт.`} />
          <Value label="Оставлено" value={`${load.droppedWeightLb.toFixed(2)} фунт.`} />
          <Value label="Режим нагрузки" value={worldState.encumbranceMode} />
          <Value label="Перегруз" value={load.overCapacity === null ? "Неизвестно" : load.overCapacity ? "Да" : "Нет"} />
        </div>
      </section>

      {character.notes.trim() && (
        <section className="panel-surface space-y-2 p-4">
          <h2 className="text-sm font-semibold">Примечания</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ru(character.notes)}</p>
        </section>
      )}
    </div>
  );
}
