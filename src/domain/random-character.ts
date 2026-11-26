import type { InventoryItem, PlayerCharacterState } from "./types";

type Ability = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
type Random = (length: number) => number;
type ClassKey = "Fighter" | "Rogue" | "Barbarian";
type BackgroundKey = "Acolyte" | "Criminal" | "Sage" | "Soldier";
type SpeciesKey = "Human" | "Elf" | "Dark Elf" | "Gnome" | "Red Dwarf" | "Half-Elf" | "Beastfolk";

const CLASS_LABELS: Record<ClassKey, string> = { Fighter: "Воин", Rogue: "Плут", Barbarian: "Варвар" };
const SPECIES_LABELS: Record<SpeciesKey, string> = {
  Human: "Человек", Elf: "Эльф", "Dark Elf": "Тёмный эльф", Gnome: "Гном",
  "Red Dwarf": "Краснолюд", "Half-Elf": "Полуэльф", Beastfolk: "Зверолюд",
};
const BACKGROUND_LABELS: Record<BackgroundKey, string> = {
  Acolyte: "Послушник", Criminal: "Преступник", Sage: "Мудрец", Soldier: "Солдат",
};
const ABILITIES: Ability[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const SKILL_ABILITY: Record<string, Ability> = {
  Acrobatics:"dexterity", Animal:"wisdom", "Animal Handling":"wisdom", Arcana:"intelligence",
  Athletics:"strength", Deception:"charisma", History:"intelligence", Insight:"wisdom",
  Intimidation:"charisma", Investigation:"intelligence", Medicine:"wisdom", Nature:"intelligence",
  Perception:"wisdom", Performance:"charisma", Persuasion:"charisma", Religion:"intelligence",
  "Sleight of Hand":"dexterity", Stealth:"dexterity", Survival:"wisdom",
};
const CLASS_DATA = {
  Fighter: {
    die:10, saves:["strength","constitution"] as Ability[],
    skills:["Acrobatics","Animal Handling","Athletics","History","Insight","Intimidation","Perception","Survival"],
    gear:[["Кольчуга",1,"КД 16; тяжёлый доспех"],["Двуручный меч",1,"2d6 рубящий; двуручное; mastery Graze"],["Цеп",1,"1d8 дробящий; mastery Sap"],["Метательные копья",8,"1d6 колющий; mastery Slow"],["Набор исследователя подземелий",1,"Стартовый набор"],["Золотые монеты",4,"4 GP"]],
    feature:"Fighting Style: Defense (+1 КД в доспехе); Second Wind (2 использования, бонусное действие, восстановление 1d10+1 HP); Weapon Mastery (3 вида оружия).",
    resource:{name:"Second Wind",max:2,recovery:"1 использование после короткого отдыха; все после продолжительного отдыха."},
    armor:17, weapon:"Двуручный меч",damage:"2d6",mastery:"Graze", attackAbility:"strength" as Ability,
  },
  Rogue: {
    die:8, saves:["dexterity","intelligence"] as Ability[],
    skills:["Acrobatics","Athletics","Deception","Insight","Intimidation","Investigation","Perception","Persuasion","Sleight of Hand","Stealth"],
    gear:[["Кожаный доспех",1,"КД 11 + модификатор Ловкости"],["Кинжал",2,"1d4 колющий; Finesse, Light; mastery Nick"],["Короткий меч",1,"1d6 колющий; Finesse, Light; mastery Vex"],["Короткий лук",1,"1d6 колющий; боеприпасы 80/320 футов"],["Стрелы",20,"Боеприпасы для короткого лука"],["Колчан",1,"Для стрел"],["Воровские инструменты",1,"Владение инструментом"],["Набор взломщика",1,"Стартовый набор"],["Золотые монеты",8,"8 GP"]],
    feature:"Expertise: выбери 2 навыка/инструмента из имеющих владение; Sneak Attack 1d6 (один раз за ход при соблюдении условий); Thieves' Cant.",
    resource:null, armor:null, weapon:"Короткий меч",damage:"1d6",mastery:"Vex", attackAbility:"dexterity" as Ability,
  },
  Barbarian: {
    die:12, saves:["strength","constitution"] as Ability[],
    skills:["Animal Handling","Athletics","Intimidation","Nature","Perception","Survival"],
    gear:[["Секира",1,"1d12 рубящий; тяжёлое; mastery Cleave"],["Ручной топор",4,"1d6 рубящий; Light, Thrown; mastery Vex"],["Набор исследователя",1,"Стартовый набор"],["Золотые монеты",15,"15 GP"]],
    feature:"Rage (2 использования; бонусное действие; сопротивление дробящему, колющему и рубящему урону; +2 к урону атакой Силой); Unarmored Defense (10 + Ловкость + Телосложение); Weapon Mastery (2 вида оружия).",
    resource:{name:"Rage",max:2,recovery:"1 использование после короткого отдыха; все после продолжительного отдыха."},
    armor:null, weapon:"Секира",damage:"1d12",mastery:"Cleave", attackAbility:"strength" as Ability,
  },
} as const;

const BACKGROUND_DATA = {
  Acolyte: { abilities:["intelligence","wisdom","charisma"] as Ability[], feat:"Ритуальная подготовка (адаптация Экдрасиля)", skills:["Insight","Religion"], tool:"Каллиграфические принадлежности", gear:[["Каллиграфические принадлежности",1,"Инструмент"],["Книга молитв",1,"Книга"],["Священный символ",1,"Фокусировка"],["Пергамент",10,"Листы пергамента"],["Роба",1,"Одежда"],["Золотые монеты",8,"8 GP"]], alternativeGold:50 },
  Criminal: { abilities:["dexterity","constitution","intelligence"] as Ability[], feat:"Alert", skills:["Sleight of Hand","Stealth"], tool:"Воровские инструменты", gear:[["Кинжал",2,"1d4 колющий; Finesse, Light"],["Воровские инструменты",1,"Инструмент"],["Ломик",1,"Инструмент"],["Мешочек",2,"Контейнер"],["Дорожная одежда",1,"Одежда"],["Золотые монеты",16,"16 GP"]], alternativeGold:50 },
  Sage: { abilities:["constitution","intelligence","wisdom"] as Ability[], feat:"Исследовательская подготовка (адаптация Экдрасиля)", skills:["Arcana","History"], tool:"Каллиграфические принадлежности", gear:[["Каллиграфические принадлежности",1,"Инструмент"],["Книга истории",1,"Книга"],["Пергамент",8,"Листы пергамента"],["Роба",1,"Одежда"],["Золотые монеты",8,"8 GP"]], alternativeGold:50 },
  Soldier: { abilities:["strength","dexterity","constitution"] as Ability[], feat:"Savage Attacker", skills:["Athletics","Intimidation"], tool:"Игровой набор (выбрать вид)", gear:[["Копьё",1,"1d6 колющий; Thrown, Versatile; mastery Sap"],["Короткий лук",1,"1d6 колющий"],["Стрелы",20,"Боеприпасы"],["Игровой набор",1,"Инструмент"],["Набор целителя",1,"Стабилизация и лечение"],["Колчан",1,"Для стрел"],["Дорожная одежда",1,"Одежда"],["Золотые монеты",14,"14 GP"]], alternativeGold:50 },
} as const;

const SPECIES_DATA: Record<SpeciesKey,{size:"MEDIUM";speed:number;hp:number;traits:string;skill?:string;skillOptions?:string[];skillCount?:number}> = {
  Human:{size:"MEDIUM",speed:30,hp:0,traits:"Народная гибкость (домашнее правило Экдрасиля): владение одним навыком на выбор.",skillOptions:["Acrobatics","Animal Handling","Arcana","Athletics","Deception","History","Insight","Intimidation","Investigation","Medicine","Nature","Perception","Performance","Persuasion","Religion","Sleight of Hand","Stealth","Survival"],skillCount:1},
  Elf:{size:"MEDIUM",speed:30,hp:0,traits:"Острые чувства: владение навыком Восприятие. Магические расовые черты D&D не переносятся автоматически в Экдрасиль.",skill:"Perception"},
  "Dark Elf":{size:"MEDIUM",speed:30,hp:0,traits:"Сумеречное зрение (домашнее правило Экдрасиля): тёмное зрение 60 футов; выдержка: владение одним навыком из Проницательности или Выживания.",skillOptions:["Insight","Survival"],skillCount:1},
  Gnome:{size:"MEDIUM",speed:30,hp:0,traits:"Гномья наблюдательность (домашнее правило Экдрасиля): владение Расследованием; инженерная сноровка: владение одним ремесленным инструментом.",skill:"Investigation"},
  "Red Dwarf":{size:"MEDIUM",speed:30,hp:1,traits:"Крепкое сложение (домашнее правило Экдрасиля): +1 HP на 1 уровне; владение Атлетикой или Выживанием.",skillOptions:["Athletics","Survival"],skillCount:1},
  "Half-Elf":{size:"MEDIUM",speed:30,hp:0,traits:"Смешанное наследие (домашнее правило Экдрасиля): владение двумя навыками на выбор.",skillOptions:["Acrobatics","Animal Handling","Arcana","Athletics","Deception","History","Insight","Intimidation","Investigation","Medicine","Nature","Perception","Performance","Persuasion","Religion","Sleight of Hand","Stealth","Survival"],skillCount:2},
  Beastfolk:{size:"MEDIUM",speed:30,hp:0,traits:"Разнообразная телесная адаптация (домашнее правило Экдрасиля): владение одним навыком — Атлетика, Восприятие или Выживание. Индивидуальные особенности зверолюда описываются отдельно и не дают дополнительных механических преимуществ.",skillOptions:["Athletics","Perception","Survival"],skillCount:1},
};

const GIVEN_NAMES = ["Арен","Брен","Кайр","Лиор","Мира","Селин","Тарен","Эйра","Вейл","Нерис","Оррин","Илана"];
const FAMILY_NAMES = ["Вейр","Талмор","Элден","Каменный Шаг","Серый Ворон","Ренн","Дорн","Лесная Тень","Марек","Валь"];
const mod = (score:number) => Math.floor((score-10)/2);
const choose = <T,>(list:readonly T[], random:Random):T => list[random(list.length)]!;
const rollStat = (random:Random) => {
  const dice=[0,1,2,3].map(()=>random(6)+1).sort((a,b)=>b-a);
  return dice[0]!+dice[1]!+dice[2]!;
};
const item = (name:string,quantity:number,notes:string,slot:number):InventoryItem => ({
  id:"generated-"+name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-")+"-"+slot,
  name,quantity,notes,certainty:"KNOWN",location:"CARRIED",startPolicy:"KEEP_FROM_DOSSIER",
});

export interface RandomCharacterResult {
  character: Partial<PlayerCharacterState>;
  summary: { name:string; className:string; background:string; species:string; abilityScores:Record<Ability,number>; hitPoints:number; armorClass:number; skills:string[]; equipment:string[]; features:string[] };
  rolls: string[];
}

export function generateRandomCharacter(random:Random):RandomCharacterResult {
  const className=choose(["Fighter","Rogue","Barbarian"] as const,random);
  const background=choose(["Acolyte","Criminal","Sage","Soldier"] as const,random);
  const species=choose(["Human","Elf","Dark Elf","Gnome","Red Dwarf","Half-Elf","Beastfolk"] as const,random);
  const classData=CLASS_DATA[className];
  const backgroundData=BACKGROUND_DATA[background];
  const speciesData=SPECIES_DATA[species];
  // Species skills are granted by the selected Ekdrasil profile.
  const speciesSkills:string[] = speciesData.skill ? [speciesData.skill] : [];
  const speciesSkillPool=[...(speciesData.skillOptions ?? [])];
  while(speciesSkills.length < (speciesData.skillCount ?? 0)){
    const picked=choose(speciesSkillPool,random);
    speciesSkillPool.splice(speciesSkillPool.indexOf(picked),1);
    speciesSkills.push(picked);
  }
  const rolls=ABILITIES.map((ability)=>({ability,total:rollStat(random)}));
  // Assign rolled scores to abilities in random order, then apply the background's legal ability increases.
  const shuffled=[...ABILITIES];
  for(let i=shuffled.length-1;i>0;i--){const j=random(i+1);[shuffled[i],shuffled[j]]=[shuffled[j]!,shuffled[i]!];}
  const abilityScores=Object.fromEntries(rolls.map((roll,i)=>[shuffled[i]!,roll.total])) as Record<Ability,number>;
  const backgroundAbilities=[...backgroundData.abilities];
  const first=choose(backgroundAbilities,random);
  const second=choose(backgroundAbilities.filter((a)=>a!==first),random);
  abilityScores[first]=Math.min(20,abilityScores[first]+2);
  abilityScores[second]=Math.min(20,abilityScores[second]+1);

  const classSkills=[...classData.skills];
  const chosenClassSkills:string[]=[];
  const classSkillCount=className==="Rogue"?4:2;
  while(chosenClassSkills.length<classSkillCount){
    const next=choose(classSkills,random); classSkills.splice(classSkills.indexOf(next),1); chosenClassSkills.push(next);
  }
  const skills=[...new Set([...chosenClassSkills,...backgroundData.skills,...speciesSkills])];
  const proficiency=2;
  const expertisePool=[...skills];
  const expertiseSkills:string[]=[];
  if(className==="Rogue"){
    while(expertiseSkills.length<2){const picked=choose(expertisePool,random);expertisePool.splice(expertisePool.indexOf(picked),1);expertiseSkills.push(picked);}
  }
  const skillBonuses=skills.map((name)=>({name,bonus:mod(abilityScores[SKILL_ABILITY[name]??"wisdom"])+proficiency+(expertiseSkills.includes(name)?proficiency:0),basis:`${(SKILL_ABILITY[name]??"wisdom").toUpperCase()} + ${expertiseSkills.includes(name)?"экспертность":"владение"}`}));
  const saves=Object.fromEntries(ABILITIES.map((a)=>[a,mod(abilityScores[a])+(classData.saves.includes(a)?proficiency:0)])) as Record<Ability,number>;
  const conMod=mod(abilityScores.constitution);
  const hpMax=Math.max(1,classData.die+conMod+speciesData.hp);
  const dexMod=mod(abilityScores.dexterity);
  const armorClass=className==="Fighter"?17:className==="Rogue"?11+dexMod:10+dexMod+conMod;
  const attackMod=mod(abilityScores[classData.attackAbility])+proficiency;
  const backgroundUsesGold=choose([false,true] as const,random);
  const backgroundGear=backgroundUsesGold
    ? [["Золотые монеты",backgroundData.alternativeGold,"50 GP (альтернативный комплект предыстории)"]] as const
    : backgroundData.gear;
  const allGear=[...classData.gear,...backgroundGear];
  const gold=allGear.filter(([name])=>name==="Золотые монеты").reduce((sum,[,qty])=>sum+Number(qty),0);
  const inventory=allGear.filter(([name])=>name!=="Золотые монеты").map(([name,qty,notes],index)=>item(String(name),Number(qty),String(notes),index));
  const resource=classData.resource?[{id:"generated-class-resource",name:classData.resource.name,current:classData.resource.max,max:classData.resource.max,certainty:"KNOWN" as const,recovery:classData.resource.recovery}]:[];
  const featDescription=backgroundData.feat==="Alert"
    ?"Alert (SRD 5.2.1): бонус мастерства к инициативе; после броска инициативы можно поменяться местами с инициативой согласного союзника."
    :backgroundData.feat==="Savage Attacker"
      ?"Savage Attacker (SRD 5.2.1): один раз за ход при попадании оружием бросить кости урона дважды и выбрать результат."
      :backgroundData.feat==="Ритуальная подготовка (адаптация Экдрасиля)"
        ?"Ритуальная подготовка (домашняя адаптация Экдрасиля): знание религиозных обрядов, символики, погребальных традиций и документированных ритуальных схем. Не даёт заклинаний, сверхъестественного канала или автоматического контакта с ангелами."
        :"Исследовательская подготовка (домашняя адаптация Экдрасиля): методика архивного поиска, анализа древних записей, алхимических описаний и символических систем. Не даёт заклинаний и не позволяет мгновенно создавать магические эффекты.";
  const classProficiencies=className==="Fighter"
    ?"Владение: все доспехи, щиты, простое и воинское оружие."
    :className==="Rogue"
      ?"Владение: лёгкие доспехи, простое оружие и воинское оружие со свойствами Finesse или Light; воровские инструменты."
      :"Владение: лёгкие и средние доспехи, щиты, простое и воинское оружие.";
  const classLabel = CLASS_LABELS[className];
  const speciesLabel = SPECIES_LABELS[species];
  const backgroundLabel = BACKGROUND_LABELS[background];
  const featureText=[classProficiencies,classData.feature,...(className==="Rogue"?[`Expertise: ${expertiseSkills.join(", ")} (бонус мастерства удвоен).`]:[]),`Предыстория ${backgroundLabel}: Origin Feat — ${backgroundData.feat}. ${featDescription} Навыки: ${backgroundData.skills.join(", ")}; инструмент: ${backgroundData.tool}.`,`Народ ${speciesLabel}: ${speciesData.traits}`];
  const origins = [
    ["Вальдгард","Арденхольм","Вальтерра"],["Элион","Солемар","Вальтерра"],["Аэлиндор","Лиарен","Вальтерра"],
    ["Кхар-Дорн","Дорн-Кар","Вальтерра"],["Крейнхольм","Вестмар","Вальтерра"],["Тар-Нер","Неррат","Вальтерра"],
    ["Равенск","Кардения","Вальтерра"],["Морвейн","Эстерваль","Вальтерра"],["Греймарк","Драугмарк","Вальтерра"],
    ["Азра-Кал","Заракх","Сахр-Зар"],["Рахимар","Кас-Рахим","Сахр-Зар"],["Ша-Мер","Мерзах","Сахр-Зар"],
    ["Вальдрум","Северная область","Нордвальд"],["Скайнхейм","Северная область","Нордвальд"],
    ["Эйргард","Северная область","Нордвальд"],["Морнхольд","Северная область","Нордвальд"],
  ] as const;
  const origin=choose(origins,random);
  const appearance=choose([
    "стройное телосложение, внимательный взгляд и заметный шрам на руке",
    "крепкое телосложение, короткие волосы и следы тяжёлой работы на ладонях",
    "невысокий рост, аккуратная одежда и настороженная манера держаться",
    "высокий рост, дорожная одежда и несколько старых отметин от ран",
    "подвижная фигура, выразительные глаза и привычка осматривать помещение",
  ],random);
  const family=choose([
    "Вырос(ла) в большой семье ремесленников; отношения с родными остались непростыми.",
    "Родители рано разошлись, и большую часть детства воспитывал близкий родственник.",
    "Семья жила скромно; с детства приходилось помогать с работой и заботиться о младших.",
    "Почти не помнит ранних лет и поддерживает связь только с одним родственником.",
    "Происходит из семьи торговцев, часто переезжавшей между поселениями.",
  ],random);
  const event=choose([
    "В юности пережил(а) неудачное ученичество и с тех пор предпочитает полагаться на собственные навыки.",
    "Однажды помог(ла) незнакомцу в беде; тот поступок изменил отношение к чужим проблемам.",
    "Потерял(а) работу после конфликта и был(а) вынужден(а) начать заново.",
    "Несколько лет провёл(а) в дороге, работая за еду и ночлег.",
    "Принял(а) неверное решение, последствия которого до сих пор старается исправить.",
  ],random);
  const traits=choose([
    ["сдержанный","наблюдательный"],["прямолинейный","упорный"],
    ["дружелюбный","любознательный"],["осторожный","недоверчивый"],
    ["ироничный","импульсивный"],
  ] as const,random);
  const motivation=choose([
    "Найти дело, которое позволит жить независимо и не быть никому обязанным.",
    "Отыскать человека, с которым давно потеряна связь.",
    "Доказать себе, что прошлые ошибки не определяют всю жизнь.",
    "Заработать достаточно, чтобы обеспечить безопасность близким.",
    "Понять, почему прежняя жизнь закончилась именно так.",
  ],random);
  const age=18+random(63);
  const biography = {
    ageYears:age, ageCertainty:"KNOWN" as const, genderPresentation:"UNKNOWN",
    appearance, birthplace:origin[0]+", "+origin[1]+", "+origin[2],
    birthplaceSource:"Хроника Экдрасиля, Том XI, §44: подтверждённый главный город и государство/область; конкретное рождение в городе сгенерировано.",
    family, upbringing:"Детство прошло в "+origin[0]+". "+family,
    lifeEvents:[event], personalityTraits:[...traits],
    ideal:"Самостоятельность и право самому выбирать свой путь.",
    bond:"Сохраняет личную вещь, напоминающую о семье.",
    flaw:"Неохотно просит о помощи, даже когда она необходима.",
    motivation,
    preCampaignDesire:motivation,
    biography:"Персонаж родился в "+origin[0]+", в области "+origin[1]+" на континенте "+origin[2]+". "+family+" "+event+" Сейчас он(а) ищет собственное место в мире. "+motivation,
    canonBasis:["Хроника Экдрасиля, Том XI, §44: город "+origin[0]+" — "+origin[1]+", континент "+origin[2]+"."],
    inventedDetailsNotice:"Возраст, семья, внешность, личные события, черты характера и мотивация сгенерированы для персонажа и не являются установленными фактами хроники.",
  };
  const character:Partial<PlayerCharacterState>={
    name:`${choose(GIVEN_NAMES,random)} ${choose(FAMILY_NAMES,random)}`,nameCertainty:"KNOWN",biography:{...biography,skillOrigins:[],weaponBackground:"",equipmentBackground:""},
    speciesAndClass:`${speciesLabel} · ${classLabel}, 1 уровень · Предыстория: ${backgroundLabel}`,
    level:1,classLevel:1,epicCampaignLevels:0,hpCurrent:hpMax,hpMax,hpTemp:0,armorClass,
    abilityScores,proficiencyBonus:proficiency,size:speciesData.size,speedFeet:speciesData.speed,
    hitDice:`1d${classData.die}`,baseSavingThrowBonuses:saves,savingThrowBonuses:saves,
    skillBonuses,classFeaturesByLevel:[{level:1,features:featureText.join(" ")}],
    weaponAttacks:[{weapon:classData.weapon,attackBonus:attackMod,damage:`${classData.damage} + ${mod(abilityScores[classData.attackAbility])} урона`,mastery:classData.mastery}],
    statsCertainty:"KNOWN",currentLocationLabel:"UNKNOWN",conditions:[],resources:resource,inventory,
    currency:{cp:0,sp:0,ep:0,gp:gold,pp:0},
    notes:`Случайный персонаж 1 уровня, создан по адаптированному генератору Экдрасиля на основе D&D 2024 / SRD 5.2.1. Свободная повседневная магия в Экдрасиле отсутствует; сверхъестественные явления редки, ограничены и требуют конкретного источника. Класс: ${classLabel}; предыстория: ${backgroundLabel}; народ: ${speciesLabel}. Броски характеристик: ${rolls.map(r=>`${r.ability} ${r.total}`).join(", ")}; затем применены повышения характеристик предыстории. Выбранные навыки: ${skills.join(", ")}. Происхождение: ${biography.birthplace}. Биография: ${biography.biography} Origin Feat: ${backgroundData.feat}. Видовые черты: ${speciesData.traits} Видовые профили, помеченные как домашнее правило Экдрасиля, требуют отдельного тестирования баланса. Дополнительные опции не подразумеваются.`,
  };
  return {character,summary:{name:character.name!,className:classLabel,background:backgroundLabel,species:speciesLabel,hitPoints:hpMax,armorClass,skills,equipment:inventory.map(i=>`${i.name} × ${i.quantity}`),features:featureText},rolls:rolls.map(r=>`${r.ability}: 4d6 drop lowest = ${r.total}`)};
}
