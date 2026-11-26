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
  { label: "У городских ворот", text: (city: string) => `Лия только что вошла в ${city} вместе с обычным потоком путников. Она остановилась в стороне от ворот, сняла дорожную сумку с плеча и сверяет отметки на своей рабочей карте Вальтерры. Вокруг продолжается повседневная жизнь города; никто не обращается к ней и никакая встреча не назначена.` },
  { label: "В общем зале постоялого двора", text: (city: string) => `Лия находится в общем зале обычного постоялого двора в ${city}. После дороги она просушивает дорожную мантию, проверяет застёжки сумки и делает несколько пометок в личном дневнике. Это самостоятельная остановка путешественницы, а не заранее назначенная встреча.` },
  { label: "На городском рынке", text: (city: string) => `Лия стоит у края рыночных рядов ${city}, сравнивая дорожные припасы и наблюдая за тем, как устроена торговля. Катана остаётся в ножнах; её внимание занято обычными деталями нового места. Она никого не ищет и ни с кем не связана обязательством.` },
  { label: "На ремесленной улице", text: (city: string) => `Лия остановилась на ремесленной улице ${city}, чтобы проверить крепления ножен и ремни дорожной сумки. Она уже добралась до города в ходе очередного перемещения и пока решает только бытовые вопросы путешествия. Никакого заказа, поручения или обязательной встречи нет.` },
];

const HEALTH = [
  { label: "Здорова", description: "Лия отдохнувшая; заметных ранений нет.", min: 184, max: 184 },
  { label: "Незначительные повреждения", description: "Синяки, ссадины и болезненность после дороги; отдельное состояние D&D не назначается.", min: 165, max: 183 },
  { label: "Заметно ранена", description: "Несколько болезненных ушибов и одна перевязанная рана; Лия сохраняет подвижность, отдельное состояние D&D не назначается.", min: 135, max: 164 },
  { label: "Серьёзно ранена, но на ногах", description: "Глубокая перевязанная рана и выраженная усталость; она может передвигаться, но запас сил ограничен. Отдельное состояние D&D не назначается.", min: 100, max: 134 },
];

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

export function generateRandomStart(index = secureIndex): RandomStartResult {
  const cityIndex = index(CITIES.length);
  const sceneIndex = index(SCENES.length);
  const healthProfileRoll = index(HEALTH.length) + 1;
  const profile = HEALTH[healthProfileRoll - 1]!;
  const hpRoll = profile.min === profile.max ? 1 : index(profile.max - profile.min + 1) + 1;
  const hpCurrent = profile.min + hpRoll - 1;
  const city = CITIES[cityIndex]!;
  const scene = SCENES[sceneIndex]!;
  const sceneText = scene.text(city.name);
  const date = "2000 год (APPROXIMATE; точные день и время UNKNOWN)";
  const narrative = [
    "Стартовая сцена сгенерирована случайно для новой кампании. Метод: Web Crypto, равномерный выбор без смещения.",
    `Место: ${city.name}, ${city.region}, ${city.continent}. В Хронике это один из шестнадцати главных городов; население — ${city.population.toLocaleString("ru-RU")}.`,
    `Дата: ${date}. Досье подтверждает, что в 1901–2000 годах Лия перемещалась между крупными городами и пограничными областями, возвращаясь к знакомым ремесленникам, архивистам и охотникам. Конкретный предыдущий маршрут и причина прибытия сюда UNKNOWN; они не додумываются.`,
    sceneText,
    `Здоровье: ${profile.label}, ${hpCurrent}/184 HP. ${profile.description}`,
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
      healthProfileRoll, hpRoll, hpRange: [profile.min, profile.max],
    },
  };
}

export const RANDOM_START_CITY_COUNT = CITIES.length;
