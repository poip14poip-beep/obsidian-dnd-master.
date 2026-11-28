import type { InventoryItem, LocationRecord, PlayerCharacterState } from "./types";
import { ekdrasilDaysInYear, resolveEkdrasilDate } from "./ekdrasil-calendar";

export interface CanonStartCity { name: string; region: string; continent: string; population: number; }
export interface RandomStartResult {
  city: CanonStartCity; scene: string; placeName: string; narrative: string; date: string; hpCurrent: number;
  healthLabel: string; healthDescription: string; inventory: InventoryItem[];
  replaceInventory: boolean;
  characterPatch: Partial<PlayerCharacterState>; location: Omit<LocationRecord, "id">;
  generationRecord: NonNullable<import("./types").WorldState["startGeneration"]>;
}

const CITIES: CanonStartCity[] = [
  { name: "Вальдгард", region: "Арденхольм", continent: "Вальтерра", population: 85000 },
  { name: "Элион", region: "Солемар", continent: "Вальтерра", population: 70000 },
  { name: "Аэлиндор", region: "Лиарен", continent: "Вальтерра", population: 55000 },
  { name: "Кхар-Дорн", region: "Дорн-Кар", continent: "Вальтерра", population: 60000 },
  { name: "Крейнхольм", region: "Вестмар", continent: "Вальтерра", population: 75000 },
  { name: "Тар-Нер", region: "Неррат", continent: "Вальтерра", population: 50000 },
  { name: "Равенск", region: "Кардения", continent: "Вальтерра", population: 45000 },
  { name: "Морвейн", region: "Эстерваль", continent: "Вальтерра", population: 65000 },
  { name: "Греймарк", region: "Драугмарк", continent: "Вальтерра", population: 35000 },
  { name: "Азра-Кал", region: "Заракх", continent: "Сахр-Зар", population: 90000 },
  { name: "Рахимар", region: "Кас-Рахим", continent: "Сахр-Зар", population: 55000 },
  { name: "Ша-Мер", region: "Мерзах", continent: "Сахр-Зар", population: 75000 },
  { name: "Вальдрум", region: "Северная область", continent: "Нордвальд", population: 48000 },
  { name: "Скайнхейм", region: "Северная область", continent: "Нордвальд", population: 42000 },
  { name: "Эйргард", region: "Северная область", continent: "Нордвальд", population: 35000 },
  { name: "Морнхольд", region: "Северная область", continent: "Нордвальд", population: 29000 },
];

const SCENES = [
  { label: "У городских ворот", text: (city: string) => `Персонаж находится у городских ворот ${city}. Рядом проходят путники и городские служащие; дорожная сумка и личные вещи находятся при персонаже. Вокруг продолжается повседневная жизнь города; никто не обращается к персонажу и никакая встреча не назначена.` },
  { label: "В общем зале постоялого двора", text: (city: string) => `Персонаж находится в общем зале постоялого двора в ${city}. В зале слышны обычные разговоры посетителей и звон посуды; персонаж может самостоятельно выбрать дальнейшие действия.` },
  { label: "На городском рынке", text: (city: string) => `Персонаж находится у края рыночных рядов ${city}. Торговцы предлагают обычные товары, вокруг движутся покупатели; никто не обращается к персонажу и никакая встреча не назначена.` },
  { label: "На ремесленной улице", text: (city: string) => `Персонаж находится на ремесленной улице ${city}. Рядом работают мастерские и лавки; никто не обращается к персонажу и никакого заказа или обязательства не существует.` },
];

const HEALTH = [{ label: "Без заметных ранений", description: "Персонаж начинает кампанию с полными HP; травмы и состояния отсутствуют.", minRatio: 1, maxRatio: 1 }];

function secureIndex(length: number): number {
  if (!Number.isInteger(length) || length < 1) throw new Error("Invalid random selection length.");
  if (!globalThis.crypto?.getRandomValues) throw new Error("Криптографический генератор случайных чисел недоступен. Старт не был сгенерирован.");
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / length) * length;
  const buffer = new Uint32Array(1);
  let value = 0;
  do { globalThis.crypto.getRandomValues(buffer); value = buffer[0]!; } while (value >= limit);
  return value % length;
}


type StarterBackground = "Acolyte" | "Criminal" | "Sage" | "Soldier";
type RandomIndex = (length: number) => number;

const BACKGROUND_LABELS: Record<StarterBackground, string[]> = {
  Acolyte: ["послушник", "аколит", "служитель", "acolyte"],
  Criminal: ["преступник", "криминал", "вор", "criminal"],
  Sage: ["мудрец", "учёный", "ученый", "sage"],
  Soldier: ["солдат", "воин", "ветеран", "soldier"],
};

function resolveBackground(value: string | undefined): StarterBackground | null {
  const normalized = (value ?? "").toLocaleLowerCase("ru-RU");
  return (Object.keys(BACKGROUND_LABELS) as StarterBackground[]).find((key) =>
    BACKGROUND_LABELS[key].some((label) => normalized.includes(label)),
  ) ?? null;
}

function createItem(name: string, quantity: number, weight: number, notes: string): InventoryItem {
  return {
    id: "campaign-start-" + name.toLocaleLowerCase().replace(/[^a-zа-я0-9]+/gi, "-"),
    name, quantity, notes, certainty: "KNOWN", location: "CARRIED",
    unitWeightLb: weight, startPolicy: "REGENERATE_AT_START",
  };
}

function itemWeight(name: string, index: RandomIndex, notes = ""): { weight: number; approximate: boolean } {
  const n = (name + " " + notes).toLocaleLowerCase("ru-RU");
  const exact: Array<[RegExp, number]> = [
    [/кольчуг|chain mail/, 55], [/латы|plate armor/, 65], [/стёган|стеган|padded armor/, 8],
    [/чешуйчат|scale mail/, 45], [/клёпан|клепан|studded leather/, 13], [/кожан.*доспех|leather armor/, 10],
    [/катан|длинный меч|longsword/, 3], [/кинжал|dagger/, 1], [/короткий меч|shortsword/, 2],
    [/короткий лук|shortbow/, 2], [/длинный лук|longbow/, 2], [/арбалет|crossbow/, 5],
    [/стрел|arrow/, 0.05], [/болт|bolt/, 0.075], [/рацион|паёк|паек|rations?/, 2],
    [/факел|torch/, 1], [/щит|shield/, 6],
    [/плащ|cloak/, 4], [/сапог|ботин|boots/, 2], [/одежд|роб|robe|clothing/, 4],
    [/пояс|belt/, 1], [/перчат|gloves/, 0.25], [/накидк|hood|tunic/, 2],
    [/книга|book/, 5], [/пергамент/, 0.01], [/каллиграф|инструмент/, 2],
    [/медицин|целител|healer/, 3], [/трав|herb/, 1], [/рацион|провиант|rations/, 2],
    [/фляг|бурдюк|waterskin/, 5], [/ломик|crowbar/, 5], [/мешочек|pouch/, 1],
    [/игровой набор|gaming set/, 1], [/священный символ|holy symbol/, 1],
    [/чернил|ink/, 0.1], [/перо|quill/, 0.05], [/верёвк|rope/, 10],
  ];
  const found = exact.find(([pattern]) => pattern.test(n));
  if (found) return { weight: found[1], approximate: false };
  // A small, explicit estimate is preferable to leaving ordinary clothing or kit mass blank.
  const range: [number, number] = /оруж|меч|кинжал|лук|топор|weapon|sword|dagger|bow|axe/.test(n) ? [1, 6]
    : /доспех|брон|armor|armour/.test(n) ? [8, 25]
    : /одежд|роб|плащ|сапог|clothing|robe|cloak|boots/.test(n) ? [1, 5]
    : [0.25, 3];
  return { weight: Math.round((range[0] + index(1000) / 999 * (range[1] - range[0])) * 100) / 100, approximate: true };
}

function weightedRetained(items: InventoryItem[], index: RandomIndex): InventoryItem[] {
  return items.map((item) => {
    if (item.unitWeightLb !== null && item.unitWeightLb !== undefined) return item;
    const result = itemWeight(item.name, index, item.notes);
    return {
      ...item, unitWeightLb: result.weight,
      notes: [item.notes, result.approximate ? "Масса оценочная; назначена при подготовке старта." : "Масса по стандартному снаряжению."].filter(Boolean).join(" "),
    };
  });
}

function generateStartingConsumables(retained: InventoryItem[], index: RandomIndex): InventoryItem[] {
  const items = [
    createItem("Рационы", 1 + index(4), 2, "Запас еды на дорогу; количество определено случайно при старте кампании."),
    createItem("Факелы", 1 + index(4), 1, "Расходуемый источник света; количество определено случайно при старте кампании."),
  ];
  const names = retained.map((item) => item.name.toLocaleLowerCase("ru-RU"));
  if (/лук|bow/.test(names.join(" " )) && !/стрел|arrow/.test(names.join(" "))) {
    items.push(createItem("Стрелы", 10 + index(11), 0.05, "Боеприпасы для имеющегося лука; добавлены случайно при старте."));
  }
  if (/арбалет|crossbow/.test(names.join(" ")) && !/болт|bolt/.test(names.join(" "))) {
    items.push(createItem("Арбалетные болты", 10 + index(11), 0.075, "Боеприпасы для имеющегося арбалета; добавлены случайно при старте."));
  }
  return items;
}

function generateBackgroundCurrency(background: StarterBackground | null, index: RandomIndex) {
  const multiplier = background === "Criminal" ? 10 : 5;
  return { cp: index(6) + 1, sp: index(6) + 1, ep: 0, gp: (index(6) + index(6) + 2) * multiplier, pp: 0 };
}

export function generateRandomStart(
  hpMaximum: number,
  index = secureIndex,
  options: { background?: string; retainedInventory?: InventoryItem[]; generateStartingSupplies?: boolean } = {},
): RandomStartResult {
  const cityIndex = index(CITIES.length);
  const sceneIndex = index(SCENES.length);
  const healthProfileRoll = 1;
  const profile = HEALTH[healthProfileRoll - 1]!;
  if (!Number.isInteger(hpMaximum) || hpMaximum < 1) throw new Error("Максимум HP персонажа должен быть известен до генерации старта.");
  const minHp = Math.max(1, Math.ceil(hpMaximum * profile.minRatio));
  const maxHp = Math.max(minHp, Math.floor(hpMaximum * profile.maxRatio));
  const hpRoll = minHp === maxHp ? 1 : index(maxHp - minHp + 1) + 1;
  const hpCurrent = minHp + hpRoll - 1;
  const city = CITIES[cityIndex]!;
  const scene = SCENES[sceneIndex]!;
  const sceneText = scene.text(city.name);
  const startYear = 2000;
  const calendarDate = resolveEkdrasilDate(index(ekdrasilDaysInYear(startYear)) + 1, startYear, index(24), index(60));
  const date = calendarDate.formatted;
  const background = options.generateStartingSupplies ? resolveBackground(options.background) : null;
  const retainedInventory = weightedRetained(options.retainedInventory ?? [], index);
  const generatedConsumables = options.generateStartingSupplies
    ? generateStartingConsumables(retainedInventory, index)
    : [];
  const inventory = [...retainedInventory, ...generatedConsumables];
  const currency = options.generateStartingSupplies ? generateBackgroundCurrency(background, index) : undefined;
  const narrative = [
    "Стартовая сцена сгенерирована случайно для новой кампании. Метод: Web Crypto, равномерный выбор без смещения. Персонаж начинает с полными HP; случайные ранения без причины не назначаются.",
    options.generateStartingSupplies
      ? `Подтверждённые предметы из листа сохранены. Случайно добавлены только расходники; предыстория для расчёта денег: ${background ?? "не распознана, применён базовый диапазон"}.`
      : "Подтверждённый инвентарь сохранён; новых предметов не добавлено.",
    currency
      ? `Случайный стартовый капитал: ${currency.gp} зм, ${currency.sp} см, ${currency.cp} мм.`
      : "Денежный баланс сохранён без изменения.",
    `Место: ${city.name}, ${city.region}, ${city.continent}. В Хронике это один из шестнадцати главных городов; население — ${city.population.toLocaleString("ru-RU")}.`,
    `Дата и время: ${date}. Сезон: ${calendarDate.season ?? "межгодовой период"}. Используется канонический календарь Экдрасиля 2.4. Предыдущий маршрут персонажа и причина прибытия сюда UNKNOWN; они не додумываются.`,
    sceneText,
    `Здоровье: ${profile.label}, ${hpCurrent}/${hpMaximum} HP. ${profile.description}`,
    "Это бытовая стартовая ситуация, а не задание: нет заказчика, обязательной встречи, квеста или скрытого требования следовать сюжету. Игрок свободен действовать как хочет.",
  ].join("\n\n");
  const generatedAt = new Date().toISOString();
  return {
    city, scene: scene.label, placeName: scene.label, narrative, date, hpCurrent, healthLabel: profile.label,
    healthDescription: profile.description, inventory, replaceInventory: true,
    characterPatch: {
      // A generated starting condition may set current HP, but must never rebuild or overwrite the imported character.
      hpCurrent, hpTemp: 0, currentLocationLabel: city.name,
      ...(currency ? { currency } : {}),

    },
    location: {
      name: city.name, region: city.region, cityName: city.name, placeName: scene.label,
      description: `${sceneText}\n\nСцена сгенерирована для этого прохождения; это не утверждение о более раннем историческом каноне.`,
      certainty: "KNOWN", sourceId: "src-ekdrasil-chronicle",
    },
    generationRecord: {
      method: "WEB_CRYPTO_GETRANDOMVALUES", generatedAt, cityIndex, sceneIndex,
      healthProfileRoll, hpRoll, hpRange: [minHp, maxHp],
    },
  };
}

export const RANDOM_START_CITY_COUNT = CITIES.length;
