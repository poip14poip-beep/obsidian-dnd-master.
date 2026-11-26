const ITEM_TRANSLATIONS: Record<string, string> = {
  "studded leather": "Клёпаный кожаный доспех",
  "cloak of protection": "Плащ защиты",
  "boots of elvenkind": "Сапоги эльфийского рода",
  "ring of protection": "Кольцо защиты",
  "amulet of health": "Амулет здоровья",
  "belt of giant strength": "Пояс силы великана",
  "bracers of defense": "Наручи защиты",
  "cloak of displacement": "Плащ смещения",
  "boots of speed": "Сапоги скорости",
  "boots of striding and springing": "Сапоги ходьбы и прыжков",
  "gloves of thievery": "Перчатки воровства",
  "gauntlets of ogre power": "Рукавицы силы огра",
  "helm of telepathy": "Шлем телепатии",
  "headband of intellect": "Повязка интеллекта",
  "periapt of wound closure": "Медальон закрытия ран",
  "potion of healing": "Зелье лечения",
  "greater potion of healing": "Большое зелье лечения",
  "superior potion of healing": "Превосходное зелье лечения",
  "supreme potion of healing": "Высшее зелье лечения",
  "bag of holding": "Сумка хранения",
  "immovable rod": "Неподвижный жезл",
  "sending stones": "Камни послания",
  "decanter of endless water": "Графин неиссякаемой воды",
  "weapon of warning": "Оружие предупреждения",
  "flame tongue": "Пламенный язык",
  "sun blade": "Солнечный клинок",
  "vorpal sword": "Ворпальный меч",
  "longsword": "Длинный меч",
  "shortsword": "Короткий меч",
  "dagger": "Кинжал",
  "rapier": "Рапира",
  "greatsword": "Двуручный меч",
  "longbow": "Длинный лук",
  "shortbow": "Короткий лук",
  "light crossbow": "Лёгкий арбалет",
  "heavy crossbow": "Тяжёлый арбалет",
  "studded leather armor": "Клёпаный кожаный доспех",
  "leather armor": "Кожаный доспех",
  "chain shirt": "Кольчужная рубаха",
  "scale mail": "Чешуйчатый доспех",
  "breastplate": "Кираса",
  "half plate": "Полулаты",
  "chain mail": "Кольчуга",
  "splint armor": "Наборный доспех",
  "plate armor": "Полный латный доспех",
  "shield": "Щит",
};

const SKILL_TRANSLATIONS: Record<string, string> = {
  athletics: "Атлетика",
  acrobatics: "Акробатика",
  "sleight of hand": "Ловкость рук",
  stealth: "Скрытность",
  arcana: "Магия",
  history: "История",
  investigation: "Анализ",
  nature: "Природа",
  religion: "Религия",
  "animal handling": "Уход за животными",
  insight: "Проницательность",
  medicine: "Медицина",
  perception: "Внимательность",
  survival: "Выживание",
  deception: "Обман",
  intimidation: "Запугивание",
  performance: "Выступление",
  persuasion: "Убеждение",
};

const SKILL_DESCRIPTIONS: Record<string, string> = {
  Атлетика: "Прыжки, лазание, плавание и преодоление препятствий силой.",
  Акробатика: "Удержание равновесия, кувырки и манёвры на узкой или шаткой поверхности.",
  "Ловкость рук": "Карманные кражи, ловкие манипуляции и незаметное обращение с предметами.",
  Скрытность: "Передвижение незамеченным, укрытие и попытки скрыться от наблюдателей.",
  Магия: "Знания о заклинаниях, магических традициях, символах и волшебных явлениях.",
  История: "Воспоминания о прошлом, исторических событиях, личностях и древних народах.",
  Анализ: "Поиск улик, исследование деталей и выводы на основе логики.",
  Природа: "Знания о местности, растениях, животных, погоде и природных циклах.",
  Религия: "Знания о божествах, культах, обрядах, священных символах и планах.",
  "Уход за животными": "Успокоение, понимание намерений и управление поведением животных.",
  Проницательность: "Распознавание эмоций, скрытых мотивов и обмана в поведении собеседника.",
  Медицина: "Оценка ранений, диагностика болезней и оказание первой помощи.",
  Внимательность: "Обнаружение скрытых объектов, звуков, существ и изменений вокруг.",
  Выживание: "Ориентирование, выслеживание, поиск пищи и безопасное движение по дикой местности.",
  Обман: "Убедительная ложь, маскировка намерений и введение других в заблуждение.",
  Запугивание: "Давление угрозами, демонстрацией силы или устрашающим поведением.",
  Выступление: "Пение, танец, актёрская игра, рассказы и другие публичные выступления.",
  Убеждение: "Добросовестные переговоры, аргументация и склонение собеседника к согласию.",
};

function normalizeLookup(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function localizeInventoryItemName(name: string): string {
  const trimmed = name.trim();
  const match = trimmed.match(/^(.*?)(\s*\+\s*\d+)$/);
  const base = normalizeLookup(match?.[1] ?? trimmed);
  const translated = ITEM_TRANSLATIONS[base];
  return translated ? translated + (match?.[2] ? " " + match[2].replace(/\s+/g, "") : "") : trimmed;
}

export function localizeSkillName(name: string): string {
  const trimmed = name.trim();
  return SKILL_TRANSLATIONS[normalizeLookup(trimmed)] ?? trimmed;
}

export function getSkillDescription(name: string): string {
  return SKILL_DESCRIPTIONS[localizeSkillName(name)] ?? "Проверка умения персонажа в соответствующей ситуации.";
}
