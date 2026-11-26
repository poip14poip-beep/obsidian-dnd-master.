import type { InventoryItem, LocationRecord, PlayerCharacterState } from "./types";

export interface CanonStartCity { name: string; region: string; continent: string; population: number; }
export interface RandomStartResult {
  city: CanonStartCity; scene: string; narrative: string; date: string; hpCurrent: number;
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

function resolveBackground(value: string | undefined, index: RandomIndex): StarterBackground {
  const normalized = (value ?? "").toLocaleLowerCase("ru-RU");
  const found = (Object.keys(BACKGROUND_LABELS) as StarterBackground[]).find((key) =>
    BACKGROUND_LABELS[key].some((label) => normalized.includes(label)),
  );
  return found ?? (["Acolyte", "Criminal", "Sage", "Soldier"] as const)[index(4)]!;
}

function createItem(name: string, quantity: number, weight: number, notes: string): InventoryItem {
  return {
    id: "campaign-start-" + name.toLocaleLowerCase().replace(/[^a-zа-я0-9]+/gi, "-"),
    name, quantity, notes, certainty: "KNOWN", location: "CARRIED",
    unitWeightLb: weight, startPolicy: "REGENERATE_AT_START",
  };
}

function itemWeight(name: string, index: RandomIndex): { weight: number; approximate: boolean } {
  const n = name.toLocaleLowerCase("ru-RU");
  const exact: Array<[RegExp, number]> = [
    [/кольчуг|chain mail/, 55], [/латы|plate armor/, 65], [/стёган|стеган|padded armor/, 8],
    [/чешуйчат|scale mail/, 45], [/клёпан|клепан|studded leather/, 13], [/кожан.*доспех|leather armor/, 10],
    [/катан|длинный меч|longsword/, 3], [/кинжал|dagger/, 1], [/короткий меч|shortsword/, 2],
    [/короткий лук|shortbow/, 2], [/длинный лук|longbow/, 2], [/арбалет|crossbow/, 5],
    [/стрел|arrow/, 0.05], [/болт|bolt/, 0.075], [/щит|shield/, 6],
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
  const range = /оруж|меч|кинжал|лук|топор|weapon|sword|dagger|bow|axe/.test(n) ? [1, 6]
    : /доспех|брон|armor|armour/.test(n) ? [8, 25]
    : /одежд|роб|плащ|сапог|clothing|robe|cloak|boots/.test(n) ? [1, 5]
    : [0.25, 3];
  return { weight: Math.round((range[0] + index(1000) / 999 * (range[1] - range[0])) * 100) / 100, approximate: true };
}

function weightedRetained(items: InventoryItem[], index: RandomIndex): InventoryItem[] {
  return items.map((item) => {
    if (item.unitWeightLb !== null && item.unitWeightLb !== undefined) return item;
    const result = itemWeight(item.name, index);
    return {
      ...item, unitWeightLb: result.weight,
      notes: [item.notes, result.approximate ? "Масса оценочная; назначена при подготовке старта." : "Масса по стандартному снаряжению."].filter(Boolean).join(" "),
    };
  });
}

function generateBackgroundKit(background: StarterBackground, index: RandomIndex): InventoryItem[] {
  const rations = 1 + index(4);
  const packs: Record<StarterBackground, InventoryItem[]> = {
    Acolyte: [
      createItem("Книга молитв", 1, 2, "Личная книга обрядов и молитв; происхождение связано с предысторией."),
      createItem("Священный символ", 1, 1, "Обычный символ веры; сам по себе не создаёт магических эффектов."),
      createItem("Пергамент", 6 + index(5), 0.01, "Листы для записей."),
      createItem("Роба", 1, 4, "Повседневная одежда служителя."),
      createItem("Рационы", rations, 2, "Запас провизии."),
    ],
    Criminal: [
      createItem("Воровские инструменты", 1, 2, "Набор инструментов; наличие не даёт владение без соответствующего навыка."),
      createItem("Ломик", 1, 5, "Небольшой ломик."),
      createItem("Мешочек", 1, 1, "Для мелких вещей и монет."),
      createItem("Дорожная одежда", 1, 4, "Повседневная одежда."),
      createItem("Рационы", rations, 2, "Запас провизии."),
    ],
    Sage: [
      createItem("Книга заметок", 1, 5, "Личные записи и справочные заметки; не является каноническим источником."),
      createItem("Каллиграфические принадлежности", 1, 2, "Перо, чернила и простые принадлежности."),
      createItem("Пергамент", 6 + index(7), 0.01, "Листы для записей."),
      createItem("Роба", 1, 4, "Повседневная одежда."),
      createItem("Рационы", rations, 2, "Запас провизии."),
    ],
    Soldier: [
      createItem("Игровой набор", 1, 1, "Небольшой набор для простой игры."),
      createItem("Набор целителя", 1, 3, "Перевязочные материалы и базовые принадлежности."),
      createItem("Дорожная одежда", 1, 4, "Повседневная одежда."),
      createItem("Рационы", rations, 2, "Запас провизии."),
      createItem("Фляга с водой", 1, 5, "Заполненная фляга."),
    ],
  };
  return packs[background];
}

function generateBackgroundCurrency(background: StarterBackground, index: RandomIndex) {
  const multiplier = background === "Criminal" ? 10 : 5;
  return { cp: index(6) + 1, sp: index(6) + 1, ep: 0, gp: (index(6) + index(6) + 2) * multiplier, pp: 0 };
}

export function generateRandomStart(
  hpMaximum: number,
  index = secureIndex,
  options: { background?: string; retainedInventory?: InventoryItem[]; generateBackgroundKit?: boolean } = {},
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
  const date = "2000 год (APPROXIMATE; точные день и время UNKNOWN)";
  const background = resolveBackground(options.background, index);
  const retainedInventory = weightedRetained(options.retainedInventory ?? [], index);
  const generatedKit = options.generateBackgroundKit ? generateBackgroundKit(background, index) : [];
  const alreadyHasClothing = retainedInventory.some((item) => /одежд|роб|плащ|сапог|ботин|clothing|robe|cloak|boots/i.test(item.name));
  const backgroundKit = alreadyHasClothing
    ? generatedKit.filter((item) => !/одежд|роб|плащ|сапог|ботин|clothing|robe|cloak|boots/i.test(item.name))
    : generatedKit;
  const inventory = [...retainedInventory, ...backgroundKit];
  const currency = options.generateBackgroundKit ? generateBackgroundCurrency(background, index) : undefined;
  const narrative = [
    "Стартовая сцена сгенерирована случайно для новой кампании. Метод: Web Crypto, равномерный выбор без смещения. Персонаж начинает с полными HP; случайные ранения без причины не назначаются.",
    options.generateBackgroundKit
      ? `Стартовый комплект сгенерирован по предыстории «${background}». Сохранены только подтверждённые одежда, броня и оружие; остальные вещи досье не переносятся.`
      : "Подтверждённый инвентарь сохранён; новых предметов не добавлено.",
    currency
      ? `Случайный стартовый капитал: ${currency.gp} зм, ${currency.sp} см, ${currency.cp} мм.`
      : "Денежный баланс сохранён без изменения.",
    `Место: ${city.name}, ${city.region}, ${city.continent}. В Хронике это один из шестнадцати главных городов; население — ${city.population.toLocaleString("ru-RU")}.`,
    `Дата: ${date}. Предыдущий маршрут персонажа и причина прибытия сюда UNKNOWN; они не додумываются.`,
    sceneText,
    `Здоровье: ${profile.label}, ${hpCurrent}/${hpMaximum} HP. ${profile.description}`,
    "Это бытовая стартовая ситуация, а не задание: нет заказчика, обязательной встречи, квеста или скрытого требования следовать сюжету. Игрок свободен действовать как хочет.",
  ].join("\n\n");
  const generatedAt = new Date().toISOString();
  return {
    city, scene: scene.label, narrative, date, hpCurrent, healthLabel: profile.label,
    healthDescription: profile.description, inventory, replaceInventory: true,
    characterPatch: {
      // A generated starting condition may set current HP, but must never rebuild or overwrite the imported character.
      hpCurrent, hpTemp: 0, currentLocationLabel: city.name,
      ...(currency ? { currency } : {}),
      ...(options.generateBackgroundKit ? { background } : {}),
    },
    location: {
      name: city.name, region: city.region,
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
