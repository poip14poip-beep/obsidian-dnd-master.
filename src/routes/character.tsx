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

function Value({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono-code mt-1 break-words text-sm font-semibold text-foreground">
        {value === null || value === undefined || value === "" ? "UNKNOWN" : value}
      </p>
    </div>
  );
}

function CharacterPage() {
  const { sources, worldState, character, updateCharacterResource } = useObsidianStore();
  const [resourceDrafts, setResourceDrafts] = useState<Record<string, string>>({});
  const dossier = sources.find((source) => source.id === character.sourceDossierId);
  const load = calculatePlayerInventoryWeight(character, worldState.encumbranceMode);
  const stats = character.abilityScores;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">Лист персонажа</h1>
          <span className="mono-code rounded border border-layer-player/40 bg-layer-player/10 px-2 py-1 text-xs text-layer-player">
            PLAYER_CHARACTER_STATE · v{character.stateVersion}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Режим просмотра. Это подтверждённое состояние персонажа, а не форма редактирования.
          Изменения в ходе игры фиксируются мастером; игрок может отдельно внести только фактически проверенное текущее количество ресурса.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CertaintyBadge status={character.statsCertainty} />
          <span className="text-muted-foreground">
            Источник: {dossier?.title ?? character.sourceDossierId} · {dossier?.contentStatus === "ATTACHED" ? "прикреплён" : "не прикреплён"}
          </span>
        </div>
      </header>

      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">Основные параметры</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Value label="Имя" value={character.name} />
          <Value label="Вид и класс" value={character.speciesAndClass} />
          <Value label="Уровень" value={character.level} />
          <Value label="Текущие HP" value={character.hpCurrent} />
          <Value label="Максимальные HP" value={character.hpMax} />
          <Value label="Временные HP" value={character.hpTemp} />
          <Value label="Класс Доспеха (КД)" value={character.armorClass} />
          <Value label="Бонус мастерства" value={character.proficiencyBonus} />
          <Value label="Размер существа" value={character.size ?? "UNKNOWN"} />
          <Value label="Скорость" value={character.speedFeet === null || character.speedFeet === undefined ? "UNKNOWN" : `${character.speedFeet} ft`} />
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
                  <span>{skill.name}</span><span className="mono-code font-semibold">{skill.bonus >= 0 ? `+${skill.bonus}` : skill.bonus}</span>
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
                    <strong>{attack.weapon}</strong><span className="mono-code">Атака {attack.attackBonus >= 0 ? `+${attack.attackBonus}` : attack.attackBonus}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Урон: {attack.damage} · Mastery: {attack.mastery}</p>
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
                  <strong className="mono-code mr-2">{feature.level} ур.</strong>{feature.features}
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
                  <p className="text-sm font-medium">{resource.name}</p>
                  <p className="text-xs text-muted-foreground">Восстановление: {resource.recovery}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="mono-code text-sm font-semibold">{resource.current ?? "?"}/{resource.max ?? "?"}</p>
                  <input
                    aria-label={`Фактический остаток ресурса ${resource.name}`}
                    type="number" min={0} max={resource.max ?? undefined} step={1}
                    value={resourceDrafts[resource.id] ?? (resource.current === null ? "" : String(resource.current))}
                    onChange={(event) => setResourceDrafts((current) => ({ ...current, [resource.id]: event.target.value }))}
                    placeholder="UNKNOWN"
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
                        toast.success(`Остаток ресурса «${resource.name}» обновлён без продвижения игрового времени.`);
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
          <Value label="Известный переносимый вес" value={`${load.knownCarriedWeightLb.toFixed(2)} lb`} />
          <Value label="Вес монет" value={load.currencyWeightLb === null ? "UNKNOWN" : `${load.currencyWeightLb.toFixed(2)} lb`} />
          <Value label="Предел переносимой нагрузки" value={load.carryingCapacityLb === null ? "UNKNOWN" : `${load.carryingCapacityLb} lb`} />
          <Value label="Статус нагрузки" value={load.encumbranceStatus} />
        </div>
        {load.unknownCarriedItems.length > 0 && (
          <p className="rounded border border-status-approx/30 bg-status-approx/5 p-2 text-xs">
            Вес не установлен для предметов: {load.unknownCarriedItems.join(", ")}. Полная нагрузка остаётся UNKNOWN.
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
                  <span className="font-medium">{item.name}</span>
                  <span className="mono-code ml-2 text-xs text-muted-foreground">×{item.quantity}</span>
                  {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                  {item.attunement && <p className="text-xs text-muted-foreground">Настройка: {item.attunement}</p>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {item.location ?? "UNKNOWN"} · {item.unitWeightLb === null || item.unitWeightLb === undefined ? "вес UNKNOWN" : `${item.unitWeightLb} lb/ед.`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Value label="Хранится отдельно" value={`${load.storedWeightLb.toFixed(2)} lb`} />
          <Value label="Оставлено" value={`${load.droppedWeightLb.toFixed(2)} lb`} />
          <Value label="Режим нагрузки" value={worldState.encumbranceMode} />
          <Value label="Перегруз" value={load.overCapacity === null ? "UNKNOWN" : load.overCapacity ? "Да" : "Нет"} />
        </div>
      </section>

      {character.notes.trim() && (
        <section className="panel-surface space-y-2 p-4">
          <h2 className="text-sm font-semibold">Примечания</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{character.notes}</p>
        </section>
      )}
    </div>
  );
}
