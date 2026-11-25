import type { InventoryItem, LocationRecord, PlayerCharacterState } from "./types";

export interface CanonStartCity {
  name: string;
  region: string;
  continent: string;
  population: number;
}

export interface RandomStartResult {
  city: CanonStartCity;
  scene: string;
  narrative: string;
  date: string;
  hpCurrent: number;
  healthLabel: string;
  healthDescription: string;
  inventory: InventoryItem[];
  characterPatch: Partial<PlayerCharacterState>;
  location: Omit<LocationRecord, "id">;
  generationRecord: {
    method: "WEB_CRYPTO_GETRANDOMVALUES";
    generatedAt: string;
    cityIndex: number;
    sceneIndex: number;
    healthProfileRoll: number;
    hpRoll: number;
    hpRange: [number, number];
  };
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
  {
    label: "У городских ворот",
    text: (city: string) => `Лия только что вошла в ${city} вместе с обычным потоком путников. Она остановилась в стороне от ворот, сняла дорожную сумку с плеча и сверяет отметки на своей рабочей карте Вальтерры. Вокруг продолжается повседневная жизнь города; никто не обращается к ней и никакая встреча не назначена.`,
  },
  {
    label: "В общем зале постоялого двора",
    text: (city: string) => `Лия находится в общем зале обычного постоялого двора в ${city}. После дороги она просушивает дорожную мантию, проверяет застёжки сумки и делает несколько пометок в личном дневнике. Это самостоятельная остановка путешественницы, а не заранее назначенная встреча.`,
  },
  {
    label: "На городском рынке",
    text: (city: string) => `Лия стоит у края рыночных рядов ${city}, сравнивая дорожные припасы и наблюдая за тем, как устроена торговля. Катана остаётся в ножнах; её внимание занято обычными деталями нового места. Она никого не ищет и ни с кем не связана обязательством.`,
  },
  {
    label: "На ремесленной улице",
    text: (city: string) => `Лия остановилась на ремесленной улице ${city}, чтобы проверить крепления ножен и ремни дорожной сумки. Она уже добралась до города в ходе очередного перемещения и пока решает только бытовые вопросы путешествия. Никакого заказа, поручения или обязательной встречи нет.`,
  },
];

interface HealthProfile {
  label: string;
  description: string;
  min: number;
  max: number;
}
const HEALTH_PROFILES: HealthProfile[] = [
  { label: "Здорова", description: "Лия отдохнувшая; заметных ранений нет.", min: 184, max: 184 },
  { label: "Незначительные повреждения", description: "Есть синяки, ссадины и болезненность после дороги; механическое состояние не накладывает отдельного условия.", min: 165, max: 183 },
  { label: "Заметно ранена", description: "Несколько болезненных ушибов и одна перевязанная рана; Лия сохраняет подвижность. Отдельное состояние D&D не назначается.", min: 135, max: 164 },
  { label: "Серьёзно ранена, но на ногах", description: "У Лии глубокая перевязанная рана и выраженная усталость; она может передвигаться, но запас сил ограничен. Отдельное состояние D&D не назначается.", min: 100, max: 134 },
];

function secureIndex(length: number): number {
  if (!Number.isInteger(length) || length < 1) throw new Error("Invalid random selection length.");
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Криптографический генератор случайных чисел недоступен. Старт не был сгенерирован.");
  }
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / length) * length;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return value % length;
}

function inventoryItem(
  name: string,
  quantity: number,
  notes: string,
  location: InventoryItem["location"],
  certainty: InventoryItem["certainty"] = "KNOWN",
): InventoryItem {
  return { id: `start-${name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}`, name, quantity, notes, location, certainty };
}

function createStartingInventory(): InventoryItem[] {
  return [
    inventoryItem("Кожа Последнего Часа", 1, "Авторский проклятый лёгкий доспех; +3 к КБ; бесшумный; надет.", "WORN"),
    inventoryItem("Cloak of Protection", 1, "Светлая дорожная мантия; +1 КБ и +1 ко всем спасброскам; требует настройки.", "WORN"),
    inventoryItem("Boots of Elvenkind", 1, "Преимущество на проверки Скрытности, связанные с тихим передвижением; надеты.", "WORN"),
    inventoryItem("Дорожная одежда", 1, "Рубаха, штаны, нижний слой, пояс, обмотки и запасные застёжки.", "WORN"),
    inventoryItem("Кожаные перчатки", 1, "Для работы с оружием, металлом и инструментами.", "WORN"),
    inventoryItem("Катана в ножнах", 1, "Longsword по механике; закреплена по диагонали на спине.", "WORN"),
    inventoryItem("Кинжал", 1, "Резервный клинок и хозяйственный инструмент; ножны на поясе.", "WORN"),
    inventoryItem("Дорожная сумка или рюкзак", 1, "Обычная дорожная сумка; точная модель UNKNOWN.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Точильный камень", 1, "Обслуживание кромки клинка.", "CARRIED"),
    inventoryItem("Масло для клинка", 1, "Флакон для защиты стали и металлических деталей от влаги.", "CARRIED"),
    inventoryItem("Комплект чистки оружия", 1, "Ткань, щётка, небольшие инструменты и ветошь.", "CARRIED"),
    inventoryItem("Ремкомплект ножен", 1, "Шнур, кожаная полоска, игла, запасная петля и заклёпки.", "CARRIED"),
    inventoryItem("Верёвка", 1, "15 метров, прочная походная.", "CARRIED"),
    inventoryItem("Крюк-кошка", 1, "Для закрепления верёвки там, где это возможно.", "CARRIED"),
    inventoryItem("Инструменты кузнеца", 1, "Комплект для осмотра и мелкого ремонта металлических деталей.", "CARRIED"),
    inventoryItem("Кожевенные инструменты", 1, "Для ремонта ремней, ножен, обуви и креплений.", "CARRIED"),
    inventoryItem("Полевой медицинский набор", 1, "Перевязки, игла, нить, ткань, щипцы и ножницы.", "CARRIED"),
    inventoryItem("Высушенные травы", 1, "Небольшая сумка; свойства зависят от местности и требуют проверки.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Блокнот наблюдений", 1, "Записи о чудовищах, следах, повадках и слабых местах.", "CARRIED"),
    inventoryItem("Исторический журнал", 1, "Даты, города, договоры и свидетельства.", "CARRIED"),
    inventoryItem("Тетрадь ритуальных схем", 1, "Известные Лии ритуалы; не универсальные заклинания.", "CARRIED"),
    inventoryItem("Лупа", 1, "Для исследования мелких деталей и надписей.", "CARRIED"),
    inventoryItem("Письменные принадлежности", 1, "Чернила, перо, бумага и нож для пера.", "CARRIED"),
    inventoryItem("Мел и уголь", 1, "Несколько кусков для разметки и схем.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Спальный мешок или плотное одеяло", 1, "Походное снаряжение.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Лёгкий тент или палатка", 1, "Походное снаряжение; точный вариант UNKNOWN.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Фляга", 1, "Содержимое на момент старта UNKNOWN.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Котелок и столовые принадлежности", 1, "Походный комплект.", "CARRIED"),
    inventoryItem("Огниво", 1, "Для разведения огня.", "CARRIED"),
    inventoryItem("Факелы или запасные источники света", 6, "Количество по досье.", "CARRIED"),
    inventoryItem("Сухой паёк", 1, "Запас на 2–3 дня; точный остаток APPROXIMATE.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Запасная одежда и нижнее бельё", 1, "Один комплект.", "CARRIED"),
    inventoryItem("Дождевой чехол для сумки", 1, "Для защиты дорожной сумки.", "CARRIED"),
    inventoryItem("Небольшой замок с ключом", 1, "Для дорожной сумки или поклажи.", "CARRIED"),
    inventoryItem("Иглы, нитки и заплатки", 1, "Небольшой ремонтный набор.", "CARRIED"),
    inventoryItem("Личный дневник", 1, "Не все периоды жизни записаны.", "CARRIED"),
    inventoryItem("Старые письма", 1, "Несколько писем от людей, с которыми Лия была близка.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Памятная вещь", 1, "Небольшой личный предмет; не магический артефакт.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Кошелёк", 1, "Текущая сумма денег UNKNOWN; не подставлять случайное число монет.", "CARRIED", "UNKNOWN"),
    inventoryItem("Рабочая карта Вальтерры", 1, "С пометками дорог и переправ; неполная.", "CARRIED", "KNOWN"),
    inventoryItem("Старые региональные карты", 1, "Несколько карт с несовпадающими границами.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Схемы Кхар-Дорна, Аэлиндора, Греймарка и Элиона", 1, "Отдельные схемы городов; актуальность требует проверки.", "CARRIED", "KNOWN"),
    inventoryItem("Копии договоров и свидетельств", 1, "Некоторые документы; полный перечень UNKNOWN.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Каталог источников", 1, "Пометки о личных наблюдениях, свидетельствах, архивных копиях и непроверенных данных.", "CARRIED", "KNOWN"),
    inventoryItem("Свёрток ритуальных принадлежностей", 1, "Тетрадь условий призыва, защитные схемы, мел, тонкий шнур, металлические метки, уголь, соль и компоненты; не универсальный инструмент.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Медицинский и полевой комплект", 1, "Чистая ткань, бинты, игла, нить, щипцы, ножницы, настойка, пузырьки, шина, мыло и повязки.", "CARRIED", "APPROXIMATE"),
    inventoryItem("Складной ремонтный набор", 1, "Шило, иглы, нить, куски кожи, пряжки, заклёпки, проволока, напильник, инструменты и запасные детали.", "CARRIED", "APPROXIMATE"),
  ];
}

export function generateRandomStart(index = secureIndex): RandomStartResult {
  const cityIndex = index(CITIES.length);
  const sceneIndex = index(SCENES.length);
  const healthProfileRoll = index(HEALTH_PROFILES.length) + 1;
  const profile = HEALTH_PROFILES[healthProfileRoll - 1]!;
  const hpRange: [number, number] = [profile.min, profile.max];
  const hpRoll = profile.min === profile.max ? 1 : index(profile.max - profile.min + 1) + 1;
  const hpCurrent = profile.min + hpRoll - 1;
  const city = CITIES[cityIndex]!;
  const scene = SCENES[sceneIndex]!;
  const sceneText = scene.text(city.name);
  const date = "2000 год (APPROXIMATE; точные день и время UNKNOWN)";
  const generatedAt = new Date().toISOString();
  const narrative = [
    `Стартовая сцена сгенерирована случайно для новой кампании. Метод выбора: Web Crypto (равномерный выбор без смещения).`,
    `Место: ${city.name}, ${city.region}, ${city.continent}. В Хронике это один из шестнадцати главных городов; население по сводной таблице — ${city.population.toLocaleString("ru-RU")}.`,
    `Дата: ${date}. В досье подтверждён только период 1901–2000 годов: Лия перемещалась между крупными городами и пограничными областями и возвращалась к знакомым ремесленникам, архивистам и охотникам. Конкретный предыдущий маршрут и причина прибытия в этот город не установлены; они не додумываются.`,
    sceneText,
    `Здоровье сгенерировано отдельно: ${profile.label}, ${hpCurrent}/184 HP. ${profile.description}`,
    `Это стартовая бытовая ситуация, а не задание: нет назначенного заказчика, обязательной встречи, квеста или скрытого требования следовать определённому сюжету. Мир и персонаж свободны для действий игрока.`,
  ].join("\n\n");
  const locationDescription = `${sceneText}\n\nСтартовая сцена кампании сгенерирована для этого прохождения; это не утверждение о более раннем историческом каноне.`;
  return {
    city,
    scene: scene.label,
    narrative,
    date,
    hpCurrent,
    healthLabel: profile.label,
    healthDescription: profile.description,
    inventory: createStartingInventory(),
    characterPatch: {
      name: "Лия Вейн",
      nameCertainty: "KNOWN",
      speciesAndClass: "Человек · Fighter 20 / Champion + 1 отдельный эпический уровень кампании",
      level: 21,
      classLevel: 20,
      epicCampaignLevels: 1,
      hpCurrent,
      hpMax: 184,
      hpTemp: 0,
      armorClass: 20,
      abilityScores: { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 },
      proficiencyBonus: 6,
      speedFeet: 30,
      hitDice: "20d10",
      baseSavingThrowBonuses: { strength: 11, dexterity: 3, constitution: 9, intelligence: 4, wisdom: 2, charisma: 3 },
      savingThrowBonuses: { strength: 12, dexterity: 4, constitution: 10, intelligence: 5, wisdom: 3, charisma: 4 },
      weaponAttacks: [
        { weapon: "Катана (Longsword)", attackBonus: 11, damage: "1d8+7 одной рукой с Dueling; 1d10+5 двумя руками", mastery: "Sap" },
        { weapon: "Кинжал", attackBonus: 11, damage: "1d4+5", mastery: "Nick" },
      ],
      statsCertainty: "KNOWN",
      currentLocationLabel: city.name,
      conditions: [],
      inventory: createStartingInventory(),
      notes: `Начальное состояние создано случайным генератором. ${profile.label}: ${profile.description} Деньги: UNKNOWN; точный баланс не задан. Старые тайники и имущество вне дорожной сумки не считаются находящимися при Лии. `,
    },
    location: {
      name: city.name,
      region: city.region,
      description: locationDescription,
      certainty: "KNOWN",
      sourceId: "src-ekdrasil-chronicle",
    },
    generationRecord: {
      method: "WEB_CRYPTO_GETRANDOMVALUES",
      generatedAt,
      cityIndex,
      sceneIndex,
      healthProfileRoll,
      hpRoll,
      hpRange,
    },
  };
}

export const RANDOM_START_CITY_COUNT = CITIES.length;
