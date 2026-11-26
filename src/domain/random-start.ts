import type { InventoryItem, LocationRecord, PlayerCharacterState } from "./types";

export interface CanonStartCity { name: string; region: string; continent: string; population: number; }
export interface RandomStartResult {
  city: CanonStartCity; scene: string; narrative: string; date: string; hpCurrent: number;
  healthLabel: string; healthDescription: string; inventory: InventoryItem[];
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

export function generateRandomStart(hpMaximum: number, index = secureIndex): RandomStartResult {
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
  const narrative = [
    "Стартовая сцена сгенерирована случайно для новой кампании. Метод: Web Crypto, равномерный выбор без смещения. Персонаж начинает с полными HP; случайные ранения без причины не назначаются.",
    `Место: ${city.name}, ${city.region}, ${city.continent}. В Хронике это один из шестнадцати главных городов; население — ${city.population.toLocaleString("ru-RU")}.`,
    `Дата: ${date}. Предыдущий маршрут персонажа и причина прибытия сюда UNKNOWN; они не додумываются.`,
    sceneText,
    `Здоровье: ${profile.label}, ${hpCurrent}/${hpMaximum} HP. ${profile.description}`,
    "Это бытовая стартовая ситуация, а не задание: нет заказчика, обязательной встречи, квеста или скрытого требования следовать сюжету. Игрок свободен действовать как хочет.",
  ].join("\n\n");
  const generatedAt = new Date().toISOString();
  return {
    city, scene: scene.label, narrative, date, hpCurrent, healthLabel: profile.label,
    healthDescription: profile.description, inventory: [],
    characterPatch: {
      // A generated starting condition may set current HP, but must never rebuild or overwrite the imported character.
      hpCurrent, hpTemp: 0, currentLocationLabel: city.name,
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
