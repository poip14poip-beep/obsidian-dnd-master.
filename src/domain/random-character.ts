import type { InventoryItem, PlayerCharacterState } from "./types";

type Ability = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
type Random = (length: number) => number;
type ClassKey = "Fighter" | "Rogue" | "Barbarian";
type BackgroundKey = "Soldier" | "Criminal";
type SpeciesKey = "Dwarf" | "Elf";

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
  Soldier: { abilities:["strength","dexterity","constitution"] as Ability[], feat:"Savage Attacker", skills:["Athletics","Intimidation"], tool:"Игровой набор (случайный)", gear:[["Копьё",1,"1d6 колющий; Thrown, Versatile; mastery Sap"],["Короткий лук",1,"1d6 колющий"],["Стрелы",20,"Боеприпасы"],["Игровой набор",1,"Инструмент"],["Набор целителя",1,"Стабилизация и лечение"],["Колчан",1,"Для стрел"],["Дорожная одежда",1,"Одежда"],["Золотые монеты",14,"14 GP"]] },
  Criminal: { abilities:["dexterity","constitution","intelligence"] as Ability[], feat:"Alert", skills:["Sleight of Hand","Stealth"], tool:"Воровские инструменты", gear:[["Кинжал",2,"1d4 колющий; Finesse, Light"],["Воровские инструменты",1,"Инструмент"],["Ломик",1,"Инструмент"],["Мешочек",2,"Контейнер"],["Дорожная одежда",1,"Одежда"],["Золотые монеты",16,"16 GP"]] },
} as const;

const SPECIES_DATA = {
  Dwarf: { size:"MEDIUM" as const, speed:30, hp:1, traits:"Тёмное зрение 120 футов; сопротивление урону ядом и преимущество на спасброски против состояния Отравлен; Dwarven Toughness: +1 к максимуму HP." },
  Elf: { size:"MEDIUM" as const, speed:35, hp:0, traits:"Тёмное зрение 60 футов; преимущество на спасброски против состояния Очарован; владение Восприятием (Keen Senses); Trance: продолжительный отдых за 4 часа медитации; Wood Elf: скорость 35 футов, заговор Druidcraft." },
} as const;

const GIVEN_NAMES = ["Арен","Брен","Кайр","Лиор","Мира","Селин","Тарен","Эйра","Вейл","Нерис","Оррин","Илана"];
const FAMILY_NAMES = ["Вейр","Талмор","Элден","Каменный Шаг","Серый Ворон","Ренн","Дорн","Лесная Тень","Марек","Валь"];
const mod = (score:number) => Math.floor((score-10)/2);
const choose = <T,>(list:readonly T[], random:Random):T => list[random(list.length)]!;
const rollStat = (random:Random) => {
  const dice=[0,1,2,3].map(()=>random(6)+1).sort((a,b)=>b-a);
  return dice[0]!+dice[1]!+dice[2]!;
};
const item = (name:string,quantity:number,notes:string):InventoryItem => ({
  id:"generated-"+name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-"),
  name,quantity,notes,certainty:"KNOWN",location:"CARRIED",startPolicy:"KEEP_FROM_DOSSIER",
});

export interface RandomCharacterResult {
  character: Partial<PlayerCharacterState>;
  summary: { name:string; className:string; background:string; species:string; abilityScores:Record<Ability,number>; hitPoints:number; armorClass:number; skills:string[]; equipment:string[]; features:string[] };
  rolls: string[];
}

export function generateRandomCharacter(random:Random):RandomCharacterResult {
  const className=choose(["Fighter","Rogue","Barbarian"] as const,random);
  const background=choose(["Soldier","Criminal"] as const,random);
  const species=choose(["Dwarf","Elf"] as const,random);
  const classData=CLASS_DATA[className];
  const backgroundData=BACKGROUND_DATA[background];
  const speciesData=SPECIES_DATA[species];
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
  const skills=[...new Set([...chosenClassSkills,...backgroundData.skills])];
  if(species==="Elf"&&!skills.includes("Perception")) skills.push("Perception");
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
  const allGear=[...classData.gear,...backgroundData.gear];
  const gold=allGear.filter(([name])=>name==="Золотые монеты").reduce((sum,[,qty])=>sum+Number(qty),0);
  const inventory=allGear.filter(([name])=>name!=="Золотые монеты").map(([name,qty,notes])=>item(String(name),Number(qty),String(notes)));
  const resource=classData.resource?[{id:"generated-class-resource",name:classData.resource.name,current:classData.resource.max,max:classData.resource.max,certainty:"KNOWN" as const,recovery:classData.resource.recovery}]:[];
  const featDescription=backgroundData.feat==="Alert"
    ?"Alert: добавляет бонус мастерства к инициативе; после броска инициативы может поменяться местами с инициативой согласного союзника."
    :"Savage Attacker: один раз за ход при попадании оружием бросает кости урона дважды и выбирает результат.";
  const classProficiencies=className==="Fighter"
    ?"Владение: все доспехи, щиты, простое и воинское оружие."
    :className==="Rogue"
      ?"Владение: лёгкие доспехи, простое оружие и воинское оружие со свойствами Finesse или Light; воровские инструменты."
      :"Владение: лёгкие и средние доспехи, щиты, простое и воинское оружие.";
  const featureText=[classProficiencies,classData.feature,...(className==="Rogue"?[`Expertise: ${expertiseSkills.join(", ")} (бонус мастерства удвоен).`]:[]),`Предыстория ${background}: Origin Feat — ${backgroundData.feat}. ${featDescription} Навыки: ${backgroundData.skills.join(", ")}; инструмент: ${backgroundData.tool}.`,`Вид ${species}: ${speciesData.traits}`];
  const character:Partial<PlayerCharacterState>={
    name:`${choose(GIVEN_NAMES,random)} ${choose(FAMILY_NAMES,random)}`,nameCertainty:"KNOWN",
    speciesAndClass:`${species} · ${className} 1 уровня · Предыстория: ${background}`,
    level:1,classLevel:1,epicCampaignLevels:0,hpCurrent:hpMax,hpMax,hpTemp:0,armorClass,
    abilityScores,proficiencyBonus:proficiency,size:speciesData.size,speedFeet:speciesData.speed,
    hitDice:`1d${classData.die}`,baseSavingThrowBonuses:saves,savingThrowBonuses:saves,
    skillBonuses,classFeaturesByLevel:[{level:1,features:featureText.join(" ")}],
    weaponAttacks:[{weapon:classData.weapon,attackBonus:attackMod,damage:`${classData.damage} + ${mod(abilityScores[classData.attackAbility])} урона`,mastery:classData.mastery}],
    statsCertainty:"KNOWN",currentLocationLabel:"UNKNOWN",conditions:[],resources:resource,inventory,
    currency:{cp:0,sp:0,ep:0,gp:gold,pp:0},
    notes:`Случайный персонаж 1 уровня, создан по ограниченному генератору D&D 2024 / SRD 5.2.1. Класс: ${className}; предыстория: ${background}; вид: ${species}. Броски характеристик: ${rolls.map(r=>`${r.ability} ${r.total}`).join(", ")}; затем применены повышения характеристик предыстории. Выбранные навыки: ${skills.join(", ")}. Origin Feat: ${backgroundData.feat}. Видовые черты: ${speciesData.traits} Дополнительные опции и детали, не входящие в этот генератор, не подразумеваются.`,
  };
  return {character,summary:{name:character.name!,className,background,species,abilityScores,hitPoints:hpMax,armorClass,skills,equipment:inventory.map(i=>`${i.name} × ${i.quantity}`),features:featureText},rolls:rolls.map(r=>`${r.ability}: 4d6 drop lowest = ${r.total}`)};
}
