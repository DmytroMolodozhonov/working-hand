/**
 * CreationRules.js — the rules of «Да пусть создастся …» (DivineCreation.js): pure data and checks, no THREE.
 *
 * What is made is told in words; the gods (the local Gemma — CreationPrompt.js) turn the words into a RECIPE, and the
 * recipe is checked here before anything appears:
 *   - a building (`type: 'build'`): parts from a fixed list (house, tower, castle, wall, city, statue, well, bridge…),
 *     their sizes in metres of the world (a block is 1 m, the hero ~3.5 m, a door 3 × 6, a storey 7 m), materials from
 *     the world's own blocks with their textures (MATERIALS) — the blocks themselves come from CreationBuild.js;
 *   - a creature (`type: 'creature'`): one of the body TEMPLATES (the skeleton: legs, wings, tail…) with its proportions,
 *     colours and pattern, ONE of 10 ways to walk (WALK) and, if it flies, ONE of 10 ways to fly (FLY), abilities from
 *     ABILITIES (they act on the world) and flaws from FLAWS, temper, health (20 by default) — CreatureForge.js builds it;
 *   - a plant (`type: 'plant'`): its form, trunk, crown, leaves, flowers, fruit, glow; how often it spreads, where it
 *     grows (HABITATS), how fast — CustomPlants.js.
 * Every number is clamped (CAPS), every word checked against its list: whatever the network writes, nothing breaks.
 * Without the network (none on this computer, it wrote nonsense twice) guessRecipe() reads the description itself —
 * the same recipe shape, from the words («замок», «шесть башен», «белый камень», «крылья», «плюётся огнём»…).
 *
 * Words nobody may make (insults, the obscene, hate): forbidden() — refused before the mana is taken.
 */

import { BLOCK } from '../world/Terrain.js';
import { createRng, hashString } from '../core/math.js';

export const CREATION = {
    COST: 1000, // mana, at once (the author: «стоит 1000 маны»); Creative: nothing
    THINK_MAX: 40, // s: the gods think longer — the magic fades, the mana comes back (the author)
    GESTATE_MIN: 4, // s: the seed of light grows at least this long, however fast the answer
    READ_T: 10, // s: «the gods read the description» part of the animation (the author: «до 10 секунд»)
    BUILD_MIN: 8, BUILD_MAX: 48, // s the building rises (by its size)
    BLOCKS_PER_S: 2400, // blocks a second at most (CreationBuild cells over the time)
    BIRTH_T: 7, // s a creature / a plant grows out of the light
    MAX_SIDE: 128, // m: the biggest footprint's side (a whole city)
    MAX_H: 72, // m: the highest roof over the ground
    MAX_CELLS: 260000, // blocks of one creation
    REACH: 90, // m: how far ahead the creation may be put (the wand's point)
    NEAR_OTHER: 6, // m between two creations' footprints
    MAX_BUILDS: 40, // creations of buildings in one world (records; the blocks themselves stay anyway)
    MAX_SPECIES: 16, // creatures of one's own: kinds in the world
    MAX_CREATURES: 28, // all of them alive at once (a kind breeds only under this)
    MAX_HOSTILE: 6, // hostile ones alive at once
    MAX_PLANT_SPECIES: 16,
    MAX_PLANTS: 900, // plants of one's own in the world
    PLANTS_PER_SPECIES: 160,
    COOLDOWN: 20, // s between two creations of one player
    DESC_MAX: 600, // letters of a description read
};

/** Health and the rest: the limits (the author: «20 здоровья по умолчанию; если укажет — больше»). */
export const CAPS = {
    HP_DEFAULT: 20, HP_MIN: 1, HP_MAX: 300,
    SIZE_MIN: 0.3, SIZE_MAX: 14, // m tall (a mouse… a creature over a house)
    SPEED: { slow: 2.2, normal: 4.2, fast: 7.5 }, // m/s on the ground (the hero runs ~8)
    DMG_MAX: 8, // a blow / a breath of a creature at most (a zombie's blow ~5)
    LEGS_MAX: 8, EYES_MAX: 8, HORNS_MAX: 6,
    PLANT_H_MIN: 0.3, PLANT_H_MAX: 24,
};

// ---------------------------------------------------------------------------------------------- materials
/** The world's own blocks a creation may be made of (their textures: Terrain/the voxel shader): key → block, words. */
export const MATERIALS = {
    stone: { block: BLOCK.CS_GREY, ru: /камен|камн|сер(ый|ого|ая)/ },
    dark: { block: BLOCK.CS_DARK, ru: /темн(ый|ого|ая|ом) камн|черн(ый|ого|ая)|мрачн|готич/ },
    white: { block: BLOCK.CS_WHITE, ru: /бел(ый|ого|ая|ом|ые|ых)|мрамор|светл/ },
    sand: { block: BLOCK.CS_SAND, ru: /песчан|желт|золотист|пустын/ },
    brick: { block: BLOCK.BRICK, ru: /кирпич|красн(ый|ого) камн/ },
    cobble: { block: BLOCK.COBBLE, ru: /булыжн|грубого камня/ },
    mossy: { block: BLOCK.CS_MOSSY, ru: /мох|мшист|древн|заброшен|руин/ },
    plaster: { block: BLOCK.PLASTER, ru: /штукатур|побелен|мазанк/ },
    planks: { block: BLOCK.PLANKS, ru: /деревян|доск|дерева/ },
    darkplanks: { block: BLOCK.PLANKS_DARK, ru: /темного дерева|темн(ые|ых) доск|морен/ },
    logs: { block: BLOCK.WOOD, ru: /бревен|бревн|сруб|изб/ },
    gold: { block: BLOCK.GOLD, ru: /золот/ },
    arcane: { block: BLOCK.ARCANE, ru: /волшебн|магическ|колдовск|аркан/ },
    arcanedark: { block: BLOCK.ARCANE_DARK, ru: /темн(ой|ая) маги|некромант/ },
    redroof: { block: BLOCK.ROOF_RED, ru: /красн(ой|ая|ые|ыми) крыш|черепиц/ },
    blueroof: { block: BLOCK.ROOF_BLUE, ru: /син(ей|ие|ими|яя) крыш|голуб/ },
    slateroof: { block: BLOCK.ROOF_SLATE, ru: /сланц|сер(ой|ая|ые) крыш/ },
    purpleroof: { block: BLOCK.ROOF_PURPLE, ru: /фиолет|пурпур|лилов/ },
    thatch: { block: BLOCK.THATCH, ru: /солом/ },
    snow: { block: BLOCK.SNOW, ru: /снежн|из снега/ },
};
export const MATERIAL_KEYS = Object.keys(MATERIALS);
const ROOFS = ['redroof', 'blueroof', 'slateroof', 'purpleroof', 'thatch', 'darkplanks', 'gold'];
const WALLS = ['stone', 'dark', 'white', 'sand', 'brick', 'cobble', 'mossy', 'plaster', 'planks', 'logs', 'arcane', 'arcanedark', 'gold', 'darkplanks', 'snow'];

// ---------------------------------------------------------------------------------------------- buildings
/**
 * The parts a building is made of: key → {ru words, default size [w, d, h] m, min, max}. A «city» and a «castle» are
 * parts that hold parts (CreationBuild lays them out). Sizes are the footprint (w across, d deep) and the height.
 */
export const PARTS = {
    city: { ru: /город|столиц|поселен|деревн|посел|селен|квартал/, size: [104, 80, 14], min: [52, 44, 8], max: [128, 128, 40] },
    castle: { ru: /замок|замка|крепост|цитадел|форт(?!ун)|дворец|дворц|палац/, size: [60, 60, 26], min: [44, 44, 14], max: [110, 110, 60] },
    house: { ru: /дом(?!ин)|домик|изб|хижин|коттедж|особняк|хат[ау]|жилищ|усадьб/, size: [14, 11, 11], min: [10, 9, 9], max: [40, 30, 30] },
    hall: { ru: /зал|ратуш|казарм|амбар|сара|склад|конюшн|таверн|трактир|харчевн|кузниц|лавк|магазин/, size: [24, 16, 13], min: [14, 11, 10], max: [60, 40, 30] },
    tower: { ru: /башн|башен|шпил|минарет|колокольн/, size: [10, 10, 26], min: [7, 7, 14], max: [24, 24, 70] },
    wall: { ru: /стен(?!д)|ограду|ограда|забор|частокол/, size: [40, 3, 9], min: [10, 2, 4], max: [128, 5, 20] },
    bridge: { ru: /мост/, size: [7, 30, 6], min: [5, 12, 3], max: [12, 100, 20] },
    well: { ru: /колодец|колодц/, size: [5, 5, 6], min: [4, 4, 5], max: [8, 8, 9] },
    fountain: { ru: /фонтан/, size: [11, 11, 6], min: [7, 7, 4], max: [24, 24, 12] },
    statue: { ru: /стату|скульптур|памятник|изваян|монумент|идол|бюст/, size: [10, 10, 18], min: [3, 3, 3], max: [40, 40, 60] },
    arch: { ru: /арк|ворот|врата/, size: [14, 4, 14], min: [8, 3, 9], max: [40, 8, 40] },
    pyramid: { ru: /пирамид|зиккурат/, size: [30, 30, 18], min: [10, 10, 6], max: [100, 100, 60] },
    obelisk: { ru: /обелиск|стел[уа]|колонн|столб/, size: [4, 4, 18], min: [2, 2, 6], max: [8, 8, 50] },
    temple: { ru: /храм|церк|собор|часовн|святилищ|капищ|монастыр|пагод/, size: [26, 36, 20], min: [14, 18, 12], max: [70, 90, 60] },
    lighthouse: { ru: /маяк/, size: [11, 11, 34], min: [8, 8, 18], max: [20, 20, 70] },
    windmill: { ru: /мельниц/, size: [11, 11, 22], min: [8, 8, 14], max: [18, 18, 40] },
    ship: { ru: /корабл|лодк|фрегат|галеон|ладь|судно|яхт|парусник/, size: [10, 34, 22], min: [6, 14, 8], max: [20, 70, 40] },
    garden: { ru: /сад(?!ов)|клумб|цветник|огород|парк/, size: [24, 24, 3], min: [10, 10, 2], max: [80, 80, 6] },
    pavilion: { ru: /беседк|павильон|ротонд|навес/, size: [10, 10, 9], min: [7, 7, 7], max: [24, 24, 16] },
    dome: { ru: /купол|обсерватор|планетар/, size: [22, 22, 16], min: [10, 10, 8], max: [70, 70, 40] },
    stairs: { ru: /лестниц|ступен/, size: [6, 20, 10], min: [4, 8, 3], max: [12, 60, 40] },
    maze: { ru: /лабиринт/, size: [40, 40, 7], min: [20, 20, 6], max: [100, 100, 10] },
};
export const PART_KEYS = Object.keys(PARTS);

/** What a statue may show (CreationBuild sculpts it of blocks): key → words. */
export const STATUE_SUBJECTS = {
    pig: /свин|свинь|поросен|хрю|кабан/, horse: /лошад|кон[яьеи]|скакун|пегас|единорог/, cow: /коров|бык|теленок|бизон/,
    sheep: /овц|баран|ягн/, dog: /собак|пес|пса|волк|щен/, cat: /кот|кошк|котен|лев|тигр/,
    bird: /птиц|орел|орл|сокол|ворон|голуб|сов[ау]|сов$|феникс/, fish: /рыб|кит|дельфин|акул/,
    dragon: /дракон|змей горыныч|виверн/, bear: /медвед/, rabbit: /заяц|зайц|кролик/, frog: /лягуш|жаб/,
    snake: /зме[йяию]|удав|питон/, knight: /рыцар|воин|солдат|страж/, king: /корол|царь|цар[яюе]|император|королев/,
    wizard: /волшебник|маг[ау]?\b|мага|колдун|чародей|ведьм/, human: /человек|девушк|мальчик|девочк|женщин|мужчин|героя|героин|я\b|меня|себя/,
    heart: /сердц|сердечк/, star: /звезд/, skull: /череп/, tree: /дерев/,
};
export const STATUE_KEYS = Object.keys(STATUE_SUBJECTS);

// ---------------------------------------------------------------------------------------------- creatures
/** The skeletons (the author: «как в Spore: заранее продуманные скелеты»): key → words, legs, the walk it suits. */
export const PLANS = {
    quadruped: { ru: /четвероног|четыр(е|ьмя) лап|лапах|зверь|звер[яе]|собак|кот|кош|лошад|волк|лис|бык|олен|медвед/, legs: 4, walk: 'trot' },
    biped: { ru: /двуног|на двух ногах|человекоподоб|гуманоид|ходит как человек|голем|тролл|гоблин|великан/, legs: 2, walk: 'stride' },
    bird: { ru: /птиц|клюв|перн|оперен|сов[ау]?\b|орел|орл|ворон|пингвин|страус|кур/, legs: 2, walk: 'hop' },
    insect: { ru: /насеком|жук|муравь|шесть ног|шестинож|пчел|оса\b|ос[ыу]\b|бабочк|стрекоз|кузнечик|таракан/, legs: 6, walk: 'scuttle' },
    spider: { ru: /паук|паучь|восемь ног|восьминог|скорпион|краб/, legs: 8, walk: 'scuttle' },
    serpent: { ru: /змея|змей|змею|змеи|червь|червя|гусениц|без ног|безног|угорь|питон/, legs: 0, walk: 'slither' },
    fish: { ru: /рыб|плавник|кит|дельфин|акул|морск(ое|ой) существ|русалк/, legs: 0, walk: 'slither' },
    blob: { ru: /слизень|слизн|желе|капл[яи]|шар(ик)?\b|сгусток|блоб|пузыр/, legs: 0, walk: 'bounce' },
    dragon: { ru: /дракон|виверн|ящер|динозавр|рептил|ящериц|крокодил/, legs: 4, walk: 'crawl' },
};
export const PLAN_KEYS = Object.keys(PLANS);

/**
 * The 10 ways to walk (the author: «до 10 типов ходьбы») — every one a whole animation of its own, safe for any body
 * (CreatureForge.poseCreature): the legs a body has are moved by it, missing ones are simply not there.
 */
export const WALK = {
    trot: { ru: /рысь|рысц|бега?ет как (собак|лошад)|скач[ае]т галоп|четырех лапах/, legs: [4, 6], speed: 1, hint: 'четыре ноги: диагональные пары вместе' },
    gallop: { ru: /галоп|мчится|носится|стремительн|быстр(ый|о) бег/, legs: [4], speed: 1.5, hint: 'прыжки: передние вместе, задние вместе' },
    stride: { ru: /на двух ногах|шага[ею]т|ходит как человек|прямоходящ/, legs: [2], speed: 1, hint: 'две ноги по очереди, руки качаются' },
    hop: { ru: /прыга|скач(ет|ут)|прыжками|как кенгуру|как лягушк|как заяц|как кролик/, legs: [2, 4], speed: 1.1, hint: 'обе ноги вместе, прыжками' },
    waddle: { ru: /вразвалк|переваливается|как утк|как пингвин|ковыля/, legs: [2], speed: 0.6, hint: 'короткие шаги, корпус качается' },
    scuttle: { ru: /семенит|бегает как паук|как таракан|быстро-быстро|семеня|многоног/, legs: [6, 8], speed: 1.3, hint: 'много ног волнами' },
    slither: { ru: /полз(ет|ает|ут)|извива|скользит|как змея/, legs: [0], speed: 0.8, hint: 'тело волной, без ног' },
    crawl: { ru: /ползет на лапах|как ящериц|как крокодил|низко над землей|пресмыка/, legs: [4, 6], speed: 0.8, hint: 'низко, лапы в стороны, тело изгибается' },
    roll: { ru: /катит|кати(тся|ться)|колесом|клубком|как шар/, legs: [0], speed: 1.4, hint: 'катится, вращаясь' },
    bounce: { ru: /подпрыгива|пружин|как мячик|как слизень|прыгает на месте/, legs: [0], speed: 0.9, hint: 'тело сжимается и подпрыгивает' },
};
export const WALK_KEYS = Object.keys(WALK);

/** The 10 ways to fly (the author: «до 10 типов полёта»). */
export const FLY = {
    flap: { ru: /машет крыль|как птица|летает как птиц/, wings: ['feather', 'bat', 'dragon', 'insect', 'butterfly'], hint: 'ровные взмахи крыльев' },
    soar: { ru: /парит|паря|планиру|как орел|высоко в небе/, wings: ['feather', 'dragon'], hint: 'крылья раскрыты, парит кругами, редкие взмахи' },
    hover: { ru: /завис|как колибри|как пчел|жужж/, wings: ['insect', 'feather', 'butterfly'], hint: 'зависает на месте, крылья мелькают' },
    flutter: { ru: /порха|как бабочк/, wings: ['butterfly', 'insect', 'feather'], hint: 'неровные взмахи, вверх-вниз' },
    bat: { ru: /как летуч|рывками|зигзаг/, wings: ['bat', 'dragon'], hint: 'рывки и зигзаги' },
    dragon: { ru: /тяжело летит|мощные взмахи|как дракон/, wings: ['dragon', 'bat', 'feather'], hint: 'медленные мощные взмахи' },
    float: { ru: /левитир|парит без крыльев|плывет по воздуху|висит в воздухе|летает магией|призрак/, wings: ['none'], hint: 'плывёт по воздуху без крыльев, покачиваясь' },
    pulse: { ru: /как медуз|толчками|пульсир/, wings: ['none'], hint: 'толчками, как медуза' },
    swoop: { ru: /пикиру|ныря(ет)? с высоты|камнем вниз/, wings: ['feather', 'bat', 'dragon'], hint: 'пикирует и взмывает' },
    spin: { ru: /крутится в полете|вертится|вращается|как семечко|как пропеллер/, wings: ['insect', 'none', 'feather'], hint: 'вращается вокруг себя' },
};
export const FLY_KEYS = Object.keys(FLY);
export const WING_KINDS = ['none', 'feather', 'bat', 'insect', 'dragon', 'butterfly'];
export const TAIL_KINDS = ['none', 'thin', 'bushy', 'club', 'fin', 'spiky', 'feather'];
export const SKINS = ['fur', 'scales', 'feathers', 'smooth', 'shell', 'crystal', 'slime', 'bark', 'stone'];
export const PATTERNS = ['none', 'spots', 'stripes', 'gradient', 'patches', 'rings', 'stars'];
export const TEMPERS = ['friendly', 'neutral', 'shy', 'hostile'];
export const DIETS = ['plants', 'meat', 'magic', 'anything'];

/**
 * Abilities that act on the world (the author: «плеваться огнём, водой, светиться…»): a white list — every one has its
 * own effect, cooldown and its harm capped (DMG ≤ CAPS.DMG_MAX). `ru`: how it is said.
 */
export const ABILITIES = {
    fireBreath: { ru: /огн|пламен|огнедыш|жжет|поджиг/, dmg: 6, cd: 7, range: 12, hint: 'дышит огнём: поджигает то, на что дышит' },
    waterSpit: { ru: /вод(ой|у)|плюет водой|брызг|водян/, dmg: 0, cd: 5, range: 14, hint: 'плюётся водой: гасит огонь, отталкивает' },
    iceBreath: { ru: /лед|ледян|мороз|холод|замора|снег/, dmg: 3, cd: 8, range: 11, hint: 'дышит холодом: замедляет (Ледяную Королеву и её свиту не берёт)' },
    poison: { ru: /яд|ядовит|отрав|кислот/, dmg: 4, cd: 8, range: 10, hint: 'плюётся ядом: урон понемногу' },
    lightning: { ru: /молни|электр|ток[ао]м|искр/, dmg: 7, cd: 10, range: 16, hint: 'бьёт молнией' },
    glow: { ru: /свет(ит|ится|ящ)|светлячк|сияет|сияющ|лучист|фосфор/, dmg: 0, cd: 0, range: 0, hint: 'светится в темноте' },
    invisible: { ru: /невидим|прозрачн|исчеза|прячется|маскир/, dmg: 0, cd: 14, range: 0, hint: 'становится невидимым, когда его пугают' },
    heal: { ru: /лечит|исцеля|целебн|лечебн|излечива/, dmg: 0, cd: 6, range: 8, hint: 'лечит друзей рядом (+2 здоровья)' },
    teleport: { ru: /телепорт|перемеща(ется)? мгновенн|исчезает и появляется/, dmg: 0, cd: 12, range: 18, hint: 'перескакивает на несколько метров, когда в опасности' },
    sing: { ru: /поет|песн|мелоди|мурлыч|успокаива/, dmg: 0, cd: 9, range: 14, hint: 'поёт: зомби и злые существа рядом замирают на 2 с' },
};
export const ABILITY_KEYS = Object.keys(ABILITIES);

/** Flaws (the author: «у существ могут быть изъяны»). */
export const FLAWS = {
    slow: { ru: /медленн|неповоротлив|ленив/, hint: 'медленный' },
    blind: { ru: /слеп|плохо видит/, hint: 'плохо видит: замечает только вблизи' },
    fragile: { ru: /хрупк|слаб(ое|ый|енький)|болезн/, hint: 'хрупкий: вдвое меньше здоровья' },
    clumsy: { ru: /неуклюж|спотыка|падает/, hint: 'неуклюжий: иногда спотыкается' },
    timid: { ru: /трус|пуглив|боязлив|робк/, hint: 'пугливый: убегает от всех' },
    hatesWater: { ru: /боится воды|не умеет плавать|тонет/, hint: 'боится воды' },
    sleepy: { ru: /сонн|спит днем|дремлет/, hint: 'днём часто дремлет' },
    loud: { ru: /громк|крикл|шумн|орет/, hint: 'громкий' },
};
export const FLAW_KEYS = Object.keys(FLAWS);

// ---------------------------------------------------------------------------------------------- plants
export const PLANT_FORMS = {
    tree: { ru: /дерев|деревь|дуб|сосн|ель|ив[аы]|клен|пальм|баобаб/, h: 9 },
    bush: { ru: /куст/, h: 2.2 },
    flower: { ru: /цвет(ок|ы|ов|ут|ет)|цветущ|роз[ау]|тюльпан|ромашк|лили|подсолнух|колокольчик/, h: 1.1 },
    grass: { ru: /трав|осок|злак|колос/, h: 0.8 },
    vine: { ru: /лиан|плющ|вьюн|виноград|вьется/, h: 4 },
    mushroom: { ru: /гриб|мухомор|поганк/, h: 1.2 },
    cactus: { ru: /кактус|колюч|агав/, h: 3 },
    reed: { ru: /камыш|тростник|бамбук/, h: 3 },
    crystal: { ru: /кристалл|самоцвет|каменн(ое|ый) растен/, h: 2.5 },
};
export const PLANT_FORM_KEYS = Object.keys(PLANT_FORMS);
export const CROWNS = ['round', 'cone', 'umbrella', 'weeping', 'spiral', 'columnar', 'none'];
export const LEAVES = ['broad', 'needle', 'fern', 'heart', 'feather', 'none'];
export const FRUITS = ['none', 'apple', 'berry', 'nut', 'crystal', 'bell', 'star'];
export const HABITATS = {
    meadow: /луг|полян|пол[ея]х|степ/, forest: /лес|чащ|рощ/, mountain: /гор[аыхе]|скал|утес|холм/, water: /вод[еыа]|у реки|озер|болот|берег|пруд/,
    desert: /пустын|песк/, snow: /снег|льд|холодн|север|тундр/, swamp: /болот|топ/, cave: /пещер|подзем/, any: /везде|повсюду|где угодно|всюду/,
};
export const HABITAT_KEYS = Object.keys(HABITATS);
/** How often a plant spreads: key → seeds a minute per plant, words. */
export const SPREAD = {
    never: { perMin: 0, ru: /не размножа|не распростран|одн[оа] единствен/ },
    rare: { perMin: 0.05, ru: /редко|медленно|изредка/ },
    normal: { perMin: 0.15, ru: /обычно|понемногу/ },
    often: { perMin: 0.4, ru: /часто|быстро|везде|повсюду|как сорняк|стремительно/ },
};
export const SPREAD_KEYS = Object.keys(SPREAD);

// ---------------------------------------------------------------------------------------------- colours
/** Colour words → colours (the network may give #hex; the words are read without it). */
export const COLOURS = [
    [/красн|алый|алая|багров|рубин/, 0xc8312b], [/оранжев|рыж|огненн/, 0xe8782a], [/желт|лимон|солнечн/, 0xf0d040], [/золот/, 0xe6b422],
    [/зелен|изумруд|салатов/, 0x3f9d3a], [/бирюз|аквамарин/, 0x2fc4c0], [/голуб|небесн/, 0x6fb7f0], [/син(ий|его|яя|ие|ей|ими|ее)|сапфир|лазур/, 0x2d58c8],
    [/фиолет|лилов|пурпур|аметист/, 0x8a45c8], [/розов/, 0xf08cb4], [/коричн|бур(ый|ая|ого)|шоколад/, 0x7a4a26], [/черн|угольн|темн(ый|ая|ое) как ночь/, 0x1e1e24],
    [/бел(ый|ая|ое|ого|ые)|снежн|молочн/, 0xf2f2f0], [/сер(ый|ая|ое|ого|ые)|пепельн|стальн/, 0x8a8f96], [/серебр/, 0xc8ced6], [/радужн|переливающ/, 0xb98cff],
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const pickKey = (v, keys, d) => (typeof v === 'string' && keys.includes(v) ? v : d);
const lower = (t) => String(t ?? '').toLowerCase().replace(/ё/g, 'е');

/** «#a1b2c3» / a number / a colour word → a colour number (null: none). */
export function colourOf(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return clamp(Math.round(v), 0, 0xffffff);
    const s = lower(v).trim();
    const m = /^#?([0-9a-f]{6})$/.exec(s);
    if (m) return parseInt(m[1], 16);
    const m3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
    if (m3) return parseInt(m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3], 16);
    for (const [re, c] of COLOURS) if (re.test(s)) return c;
    return null;
}

/** Every colour word of a description, in order. */
export function coloursIn(desc) {
    const s = lower(desc), out = [];
    const found = [];
    for (const [re, c] of COLOURS) {
        const g = new RegExp(re.source, 'g');
        let m;
        while ((m = g.exec(s))) found.push([m.index, c]);
    }
    found.sort((a, b) => a[0] - b[0]);
    for (const [, c] of found) if (!out.includes(c)) out.push(c);
    return out;
}

// ---------------------------------------------------------------------------------------------- numbers
const NUMS = { один: 1, одна: 1, одну: 1, одним: 1, одной: 1, два: 2, две: 2, двух: 2, двумя: 2, пара: 2, три: 3, трех: 3, тремя: 3, четыре: 4, четырех: 4, четырьмя: 4,
    пять: 5, пяти: 5, пятью: 5, шесть: 6, шести: 6, шестью: 6, семь: 7, семи: 7, семью: 7, восемь: 8, восьми: 8, восемью: 8, девять: 9, девяти: 9,
    десять: 10, десяти: 10, двенадцать: 12, двенадцати: 12, пятнадцать: 15, двадцать: 20, двадцати: 20, тридцать: 30, сорок: 40, пятьдесят: 50, сто: 100, двести: 200, триста: 300,
    много: 6, несколько: 3, дюжин: 12 };

/** The number said just before a word matching `re` («с шестью башнями», «3 дома», «20 здоровья»). null: none. */
export function countBefore(desc, re) {
    const w = lower(desc).replace(/[^a-zа-я0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < w.length; i++) {
        if (!re.test(w[i])) continue;
        for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
            if (/^\d+$/.test(w[k])) return +w[k];
            if (NUMS[w[k]] != null) return NUMS[w[k]];
        }
        // «здоровья 50», «башен: 6»
        if (/^\d+$/.test(w[i + 1] || '')) return +w[i + 1];
    }
    return null;
}

// ---------------------------------------------------------------------------------------------- what may not be made
const FORBIDDEN = [/ху[йяеи]|хуе|пизд|еб[ау]|ебл|ебн|ёб|бля[дт]|залуп|муда[кч]|педик|пидор|шлюх|сучк|сука\b|гандон/, /порн|секс|голая|голый|голые|обнаж|интим|эроти|член(?!ов|ами)|пенис|груди|сиськ|жоп/,
    /нацист|свастик|гитлер|фашист|расист|ку-клукс|зиг ?хайл|террор|джихад|игил/, /ребенк[ау] (боль|кров)|пытк|расчленен|изнасил|самоубий|суицид/];

/** Words nobody may make (the author: «запрет на оскорбительный / недопустимый контент»): why, or null. */
export function forbidden(desc) {
    const s = lower(desc);
    for (const re of FORBIDDEN) if (re.test(s)) return 'Боги не создают такого — опишите что-нибудь другое';
    return null;
}

// ---------------------------------------------------------------------------------------------- kind of creation
/** Is the description of a building, a creature or a plant? (the network decides first; this when it does not) */
export function kindOfDesc(desc) {
    const s = lower(desc);
    if (STATUE_RE.test(s) || /из (камня|кирпича|дерева|мрамора|золота|блоков)/.test(s)) return 'build';
    const creature = /существ|животн|зверь|звер[яеок]|чудищ|чудовищ|монстр|тварь|питом|создани|зверек|зверушк|птиц|насеком|дракон|рыб[ау]|паук|змея|змей(?!ка)|жук|слизень|слизн|котик|кот[ае]?\b|кошк|собак|лошадк|кролик|заяц|ящер|гриффон|единорог|бабочк|голем|тролл|гоблин|великан|ёж|еж\b|пчел|муравей|сова|лиса|волк|медвед|олен|мышь|мышк/.test(s)
        || /(с|со) (\S+ ){0,2}(глазами|глазом|ногами|лапами|крыльями|хвостом|рогами|рогом|ушами|клювом|щупальцами|чешуёй|чешуей|шерстью|перьями|панцирем)|умеющ(ее|ий|ая) (летать|плавать|ходить)|летающ(ее|ий|ая)|здоровья|двуног|четвероног|шестиног|многоног/.test(s);
    const plant = /растени|растенье|цвет(ок|ы|ов)|дерево|деревья|куст|гриб|трав[аыу]|лиан|кактус|плющ|мох|папоротник|цветущ|семена|размножа(ется|ются) (быстро|медленно|часто|редко)|распространя/.test(s);
    const build = PART_KEYS.some((k) => PARTS[k].ru.test(s)) && !/дом(ашн|овит)/.test(s);
    if (plant && !creature && !(build && !/дерев/.test(s))) return 'plant';
    if (creature) return 'creature';
    if (plant && !build) return 'plant';
    return 'build';
}
const STATUE_RE = PARTS.statue.ru;

// ---------------------------------------------------------------------------------------------- the guess (no network)
const has = (s, re) => re.test(s);
/** How big, from the words (a size word said of a part — «огромными глазами», «большой головой» — is no size of the whole). */
const sizeWord = (s0) => {
    const s = s0.replace(/(огромн|гигантск|больш|маленьк|крошечн|длинн|высок|широк|коротк|толст|тонк)\S*\s+(\S+\s+)?(глаз|ног|лап|крыл|хвост|уш|рог|голов|зуб|окн|двер|ше[йяию]|клюв|щупал)\S*/g, '');
    return /(огромн|гигантск|исполинск|громадн|колоссальн|величествен)/.test(s) ? 1.6 : /(большой|большая|большое|больших|высок|просторн|широк)/.test(s) ? 1.25
        : /(крошечн|малюсеньк|миниатюрн|игрушечн)/.test(s) ? 0.55 : /(маленьк|небольш|скромн|низк|уютн)/.test(s) ? 0.8 : 1;
};

/**
 * The recipe read from the words alone (no network; the network's recipe is laid over it — its gaps filled from here).
 * @returns {object} a recipe (sanitizeRecipe's shape)
 */
export function guessRecipe(desc, seed = 1) {
    const s = lower(desc).slice(0, CREATION.DESC_MAX);
    const type = kindOfDesc(s);
    const r = createRng((seed >>> 0) ^ hashString(s));
    const name = nameOf(desc);
    if (type === 'creature') return guessCreature(s, r, name);
    if (type === 'plant') return guessPlant(s, r, name);
    return guessBuild(s, r, name);
}

/** A short name from the description (its first words). */
export function nameOf(desc) {
    const t = String(desc ?? '').replace(/\s+/g, ' ').trim().replace(/^(с|со|из|в|на)\s/i, '');
    const words = t.split(' ').slice(0, 5);
    while (words.length > 1 && /^(с|со|и|из|в|на|по|для|к|у|о|а|но)$/i.test(words[words.length - 1].replace(/[,.;:!?]+$/, ''))) words.pop();
    const w = words.join(' ').replace(/[,.;:!?]+$/, '');
    return (w.charAt(0).toUpperCase() + w.slice(1)).slice(0, 40) || 'Творение';
}

/** The materials said, the most particular first («белого камня» is white stone, not plain stone). */
const MAT_ORDER = ['white', 'dark', 'sand', 'brick', 'mossy', 'cobble', 'arcanedark', 'arcane', 'gold', 'plaster', 'darkplanks', 'logs', 'planks', 'snow', 'stone',
    'redroof', 'blueroof', 'slateroof', 'purpleroof', 'thatch'];
function materialsIn(s) {
    const out = [];
    for (const k of MAT_ORDER) if (MATERIALS[k].ru.test(s)) out.push(k);
    // (plain «камень» beside a colour word of the same stone: one material)
    if (out.includes('stone') && out.some((k) => k === 'white' || k === 'dark' || k === 'sand' || k === 'mossy')) out.splice(out.indexOf('stone'), 1);
    return out;
}

function guessBuild(s, r, name) {
    const mats = materialsIn(s);
    const wall = mats.find((k) => WALLS.includes(k)) || null;
    const roof = mats.find((k) => ROOFS.includes(k) && k !== wall) || null;
    const k = sizeWord(s);
    const parts = [];
    // the biggest thing said first: a city holds houses, a castle towers
    const main = ['city', 'castle', 'temple', 'pyramid', 'lighthouse', 'windmill', 'ship', 'bridge', 'maze', 'dome', 'statue', 'fountain', 'well', 'tower', 'hall', 'house', 'arch', 'obelisk', 'pavilion', 'garden', 'wall', 'stairs']
        .find((p) => PARTS[p].ru.test(s)) || 'house';
    const P = PARTS[main];
    const size = P.size.map((v) => v * k);
    const part = { kind: main, size, floors: null, towers: null, houses: null };
    const floors = countBefore(s, /этаж/);
    if (floors) { part.floors = clamp(floors, 1, 9); size[2] = Math.max(size[2], 7 * part.floors + 4); }
    const towers = countBefore(s, /башн|башен/);
    if (towers != null) part.towers = clamp(towers, 0, 12);
    const houses = countBefore(s, /дом/);
    if (houses != null && main === 'city') part.houses = clamp(houses, 2, 40);
    if (main === 'statue') part.subject = STATUE_KEYS.find((q) => STATUE_SUBJECTS[q].test(s.replace(PARTS.statue.ru, ''))) || 'human';
    part.moat = /ров|рвом|рва\b/.test(s);
    part.walls = main === 'city' ? /стен|крепост|укреплен/.test(s) || k > 1.2 : main === 'castle' ? true : null;
    part.spires = /шпил|остр(ые|ыми) крыш|готич/.test(s);
    part.garden = /сад|цвет/.test(s);
    part.water = /вод|фонтан|пруд|озер/.test(s) && main !== 'fountain' && main !== 'well' && main !== 'ship';
    parts.push(part);
    // and the smaller things said besides («замок с фонтаном и статуей дракона»)
    if (main !== 'city') {
        for (const extra of ['fountain', 'well', 'statue', 'garden', 'obelisk', 'tower', 'arch']) {
            if (extra === main || !PARTS[extra].ru.test(s)) continue;
            if (extra === 'tower' && (main === 'castle' || main === 'lighthouse' || main === 'windmill')) continue;
            if (extra === 'garden' && !/сад\b|сад[оа]м|садик|клумб|парк/.test(s)) continue;
            const e = { kind: extra, size: PARTS[extra].size.slice() };
            if (extra === 'statue') e.subject = STATUE_KEYS.find((q) => STATUE_SUBJECTS[q].test(s.replace(PARTS.statue.ru, '').replace(PARTS[main].ru, ''))) || 'human';
            if (extra === 'tower') e.count = clamp(countBefore(s, /башн|башен/) || 1, 1, 6);
            parts.push(e);
        }
    }
    return { type: 'build', name, style: { wall, roof, trim: mats.find((m) => m !== wall && m !== roof && WALLS.includes(m)) || null, glass: !/без окон/.test(s) }, parts, scale: k };
}

function guessCreature(s, r, name) {
    let plan = PLAN_KEYS.find((p) => PLANS[p].ru.test(s)) || null;
    const legsSaid = countBefore(s, /ног|лап/);
    if (!plan) plan = legsSaid === 2 ? 'biped' : legsSaid === 6 ? 'insect' : legsSaid === 8 ? 'spider' : legsSaid === 0 ? 'blob' : 'quadruped';
    const wingsSaid = /крыл|летает|летать|летающ|летун|порха|парит/.test(s);
    let wings = 'none';
    if (wingsSaid) wings = /перн|перья|птич/.test(s) ? 'feather' : /кожист|перепонч|летуч/.test(s) ? 'bat' : /стрекоз|прозрачн(ые|ыми) крыл|пчел|мух/.test(s) ? 'insect'
        : /бабочк|узорчат|цветн(ые|ыми) крыл/.test(s) ? 'butterfly' : plan === 'dragon' ? 'dragon' : plan === 'insect' ? 'insect' : plan === 'bird' ? 'feather' : r() < 0.5 ? 'feather' : 'bat';
    if (/без крыльев|бескрыл/.test(s)) wings = 'none';
    const flies = (wingsSaid && !/не летает|не умеет летать/.test(s)) || /левитир|парит без крыльев|летает магией|призрак/.test(s);
    const k = sizeWord(s);
    const sizeSaid = /(\d+(?:[.,]\d+)?)\s*(м|метр)/.exec(s);
    const base = { quadruped: 1.6, biped: 2.6, bird: 1.1, insect: 0.9, spider: 1.4, serpent: 1.0, fish: 1.0, blob: 1.0, dragon: 3.5 }[plan];
    const size = clamp(sizeSaid ? parseFloat(sizeSaid[1].replace(',', '.')) : base * k * k, CAPS.SIZE_MIN, CAPS.SIZE_MAX);
    const hp = clamp(countBefore(s, /здоров|жизн|хп|hp/) ?? CAPS.HP_DEFAULT, CAPS.HP_MIN, CAPS.HP_MAX);
    const walk = WALK_KEYS.find((w) => WALK[w].ru.test(s)) || PLANS[plan].walk;
    const fly = flies ? FLY_KEYS.find((f) => FLY[f].ru.test(s)) || (wings === 'none' ? 'float' : wings === 'butterfly' ? 'flutter' : wings === 'insect' ? 'hover' : wings === 'dragon' ? 'dragon' : wings === 'bat' ? 'bat' : 'flap') : null;
    const cols = coloursIn(s);
    const eyesBig = /(больш|огромн|круглы|выпучен)\S* глаз/.test(s), eyesN = countBefore(s, /глаз/);
    const abilities = ABILITY_KEYS.filter((a) => ABILITIES[a].ru.test(s) && !(a === 'glow' && /не светится/.test(s)));
    if (/магическ|волшебн/.test(s) && !abilities.includes('glow')) abilities.push('glow');
    return {
        type: 'creature', name, plan, size,
        legs: legsSaid != null ? clamp(legsSaid, 0, CAPS.LEGS_MAX) : PLANS[plan].legs,
        legLen: /длинн\S* ног|длинноног|высок\S* ног/.test(s) ? 1.6 : /коротк\S* (ног|лап)|коротколап/.test(s) ? 0.55 : 1,
        legThick: /тонк\S* (ног|лап)|тонконог|худ/.test(s) ? 0.5 : /толст\S* (ног|лап)|мощн\S* лап|массивн/.test(s) ? 1.6 : 1,
        neck: /длинн\S* ше/.test(s) ? 1.8 : /без шеи|коротк\S* ше/.test(s) ? 0.3 : 1,
        head: /больш\S* голов|огромн\S* голов|головаст/.test(s) ? 1.5 : /маленьк\S* голов/.test(s) ? 0.7 : 1,
        eyes: { n: clamp(eyesN ?? (/циклоп|одноглаз/.test(s) ? 1 : 2), 1, CAPS.EYES_MAX), size: eyesBig ? 2 : /маленьк\S* глаз|глазк/.test(s) ? 0.6 : 1, color: /красн\S* глаз/.test(s) ? 0xff3020 : /светящ\S* глаз|горящ\S* глаз/.test(s) ? 0xffe060 : null },
        ears: /(длинн|больш|остр)\S* уш|ушаст|кролик|заяц|зайч/.test(s) ? 1.8 : /без ушей/.test(s) ? 0 : plan === 'biped' ? 0.5 : 1,
        horns: { n: clamp(countBefore(s, /рог/) ?? (/рог|рогат/.test(s) ? 2 : 0), 0, CAPS.HORNS_MAX), len: /длинн\S* рог/.test(s) ? 1.6 : 1 },
        tail: /без хвоста|бесхвост/.test(s) ? 'none' : /пушист\S* хвост/.test(s) ? 'bushy' : /булав/.test(s) ? 'club' : /шипаст\S* хвост|хвост[а-я]* (с )?шип/.test(s) ? 'spiky' : /плавник/.test(s) ? 'fin' : /хвост/.test(s) ? 'thin' : plan === 'bird' ? 'feather' : plan === 'fish' ? 'fin' : plan === 'insect' || plan === 'spider' || plan === 'blob' || plan === 'biped' ? 'none' : 'thin',
        tailLen: /длинн\S* хвост/.test(s) ? 1.7 : /коротк\S* хвост/.test(s) ? 0.5 : 1,
        wings, wingSpan: /огромн\S* крыл|больш\S* крыл|широк\S* крыл/.test(s) ? 1.5 : /маленьк\S* крыл|крылышк/.test(s) ? 0.6 : 1,
        skin: /пушист|мех|шерст|мохнат/.test(s) ? 'fur' : /чешу/.test(s) ? 'scales' : /перья|перн|оперен/.test(s) ? 'feathers' : /панцир|раковин|броня/.test(s) ? 'shell'
            : /кристалл|хрустал|стеклян/.test(s) ? 'crystal' : /слиз|склизк|желе/.test(s) ? 'slime' : /кор[аы]\b|деревянн/.test(s) ? 'bark' : /каменн/.test(s) ? 'stone'
                : { bird: 'feathers', dragon: 'scales', serpent: 'scales', fish: 'scales', blob: 'slime', insect: 'shell', spider: 'fur' }[plan] || 'fur',
        colors: [cols[0] ?? null, cols[1] ?? null, cols[2] ?? null],
        pattern: /пятн|пятнист|в крапин/.test(s) ? 'spots' : /полос|тигров/.test(s) ? 'stripes' : /кольц/.test(s) ? 'rings' : /звезд/.test(s) ? 'stars' : /переход|градиент|радужн/.test(s) ? 'gradient' : /пятнами|пег/.test(s) ? 'patches' : 'none',
        glow: abilities.includes('glow') ? (colourOf((/свет\S* (\S+)/.exec(s) || [])[1]) ?? cols[0] ?? 0x9ef0ff) : null,
        walk: plan === 'serpent' || plan === 'fish' ? (walk === 'roll' ? 'roll' : 'slither') : walk,
        fly, swim: /плава|в воде|водоплав|ныря/.test(s) || plan === 'fish',
        hp, speed: /быстр|стремительн|шустр|молниеносн/.test(s) ? 'fast' : /медленн|неторопл/.test(s) ? 'slow' : 'normal',
        abilities: abilities.slice(0, 4), flaws: FLAW_KEYS.filter((f) => FLAWS[f].ru.test(s)).slice(0, 3),
        temper: /злой|зл(ое|ая|ые)|агрессив|враждеб|хищн|кровожад|опасн|нападает/.test(s) ? 'hostile' : /пуглив|робк|застенчив/.test(s) ? 'shy' : /добр|дружелюб|ласков|милый|милое|милая|верн|ручн/.test(s) ? 'friendly' : 'neutral',
        diet: /хищн|мясо|ест мяс/.test(s) ? 'meat' : /магией|ест ману/.test(s) ? 'magic' : /всеяд/.test(s) ? 'anything' : 'plants',
        habitat: HABITAT_KEYS.find((h) => HABITATS[h].test(s)) || (plan === 'fish' ? 'water' : 'any'),
        breed: /не размножа|единствен/.test(s) ? 0 : /быстро размножа|плодовит|много потомства/.test(s) ? 2 : /размножа/.test(s) ? 1 : 0,
        count: clamp(countBefore(s, /существ|зверюш|зверь|звер[яе]|птиц|созда/) ?? 1, 1, 6),
    };
}

function guessPlant(s, r, name) {
    const form = PLANT_FORM_KEYS.find((f) => PLANT_FORMS[f].ru.test(s)) || 'flower';
    const cols = coloursIn(s);
    const k = sizeWord(s);
    const hSaid = /(\d+(?:[.,]\d+)?)\s*(м|метр)/.exec(s);
    const spread = SPREAD_KEYS.find((q) => SPREAD[q].ru.test(s)) || 'normal';
    const habitat = HABITAT_KEYS.filter((h) => HABITATS[h].test(s));
    return {
        type: 'plant', name, form,
        height: clamp(hSaid ? parseFloat(hSaid[1].replace(',', '.')) : PLANT_FORMS[form].h * k, CAPS.PLANT_H_MIN, CAPS.PLANT_H_MAX),
        trunk: { color: /бел\S* ствол|берез/.test(s) ? 0xe8e4dc : /черн\S* ствол/.test(s) ? 0x2a2420 : null, thick: /толст/.test(s) ? 1.5 : /тонк/.test(s) ? 0.6 : 1, twist: /кривой|извилист|скрюч|спирал/.test(s) ? 1 : 0 },
        crown: /плакуч|свисаю|ив[аы]/.test(s) ? 'weeping' : /конус|ель|елк|пирамидальн/.test(s) ? 'cone' : /зонт|плоск\S* крон|акаци/.test(s) ? 'umbrella' : /спирал|винт/.test(s) ? 'spiral' : /колонн|тополь|кипарис/.test(s) ? 'columnar' : form === 'tree' || form === 'bush' ? 'round' : 'none',
        leaves: /игл|хво/.test(s) ? 'needle' : /папоротн|резн/.test(s) ? 'fern' : /сердечк|в форме сердц/.test(s) ? 'heart' : /перист/.test(s) ? 'feather' : form === 'cactus' || form === 'crystal' || form === 'mushroom' ? 'none' : 'broad',
        leafColor: cols.find((c) => c !== 0xf0d040 && c !== 0xf08cb4) ?? null,
        flowers: { color: /цвет|бутон|соцвет|роз|тюльпан|ромашк|цветет/.test(s) ? (cols.find((c) => c !== 0x3f9d3a) ?? 0xf08cb4) : null, count: /много цвет|усыпан/.test(s) ? 2 : 1 },
        fruit: /яблок/.test(s) ? 'apple' : /ягод|вишн|клубник/.test(s) ? 'berry' : /орех|желуд|шишк/.test(s) ? 'nut' : /кристалл/.test(s) ? 'crystal' : /колокольч/.test(s) ? 'bell' : /звездочк|звезд/.test(s) ? 'star' : 'none',
        fruitColor: null,
        glow: /свет(ит|ится|ящ)|сия|мерца|фосфор|волшебн|магическ/.test(s) ? (cols[0] ?? 0x9ef0ff) : null,
        spread, habitat: habitat.length ? habitat.slice(0, 3) : ['any'],
        grow: /быстро раст|мгновенно/.test(s) ? 'fast' : /медленно раст/.test(s) ? 'slow' : 'normal',
        count: clamp(countBefore(s, /растени|дерев|куст|цвет|гриб/) ?? (form === 'tree' ? 1 : 5), 1, 20),
    };
}

// ---------------------------------------------------------------------------------------------- sanitize
/**
 * The network's recipe made safe: unknown words dropped, numbers clamped, gaps filled from guessRecipe(desc). Never
 * throws: a broken answer gives the guess itself.
 * @param {object|null} raw  the network's JSON (or null)
 * @returns {object} a recipe CreationBuild / CreatureForge / CustomPlants can always make
 */
export function sanitizeRecipe(raw, desc = '', seed = 1) {
    const guess = guessRecipe(desc, seed);
    const R = raw && typeof raw === 'object' ? raw : {};
    let type = ['build', 'creature', 'plant'].includes(R.type) ? R.type : guess.type;
    // (a statue «of a pig» is a building — the words decide when they say «статуя», whatever the network thought)
    if (STATUE_RE.test(lower(desc)) && type !== 'build') type = 'build';
    const base = type === guess.type ? guess : guessRecipe(type === 'creature' ? `существо ${desc}` : type === 'plant' ? `растение ${desc}` : `дом ${desc}`, seed);
    const name = (typeof R.name === 'string' && R.name.trim() ? R.name.trim() : base.name).replace(/[<>{}]/g, '').slice(0, 40);
    if (forbidden(name)) return { ...base, name: base.name };
    const body = R[type] && typeof R[type] === 'object' ? R[type] : R;
    if (type === 'creature') return cleanCreature(body, base, name);
    if (type === 'plant') return cleanPlant(body, base, name);
    return cleanBuild(body, base, name);
}

function cleanSize(v, P, scale = 1) {
    const a = Array.isArray(v) ? v : [];
    return [0, 1, 2].map((i) => clamp(num(a[i], P.size[i] * scale), P.min[i], P.max[i]));
}

function cleanBuild(b, base, name) {
    const style = b.style && typeof b.style === 'object' ? b.style : {};
    const mat = (v, keys, d) => pickKey(typeof v === 'string' ? v.toLowerCase() : v, keys, d);
    const st = {
        wall: mat(style.wall, WALLS, base.style.wall), roof: mat(style.roof, ROOFS, base.style.roof),
        trim: mat(style.trim, WALLS, base.style.trim), glass: style.glass !== undefined ? !!style.glass : base.style.glass,
    };
    const src = Array.isArray(b.parts) && b.parts.length ? b.parts : base.parts;
    const parts = [];
    for (const p of src.slice(0, 12)) {
        if (!p || typeof p !== 'object') continue;
        const kind = pickKey(p.kind, PART_KEYS, null);
        if (!kind) continue;
        const P = PARTS[kind];
        const g = base.parts.find((q) => q.kind === kind) || {};
        const q = { kind, size: cleanSize(p.size || g.size, P) };
        if (Array.isArray(p.at) && p.at.length >= 2) q.at = [clamp(num(p.at[0], 0), -60, 60), clamp(num(p.at[1], 0), -60, 60)];
        q.rot = [0, 1, 2, 3].includes(p.rot) ? p.rot : 0;
        if (p.floors != null || g.floors != null) q.floors = clamp(Math.round(num(p.floors ?? g.floors, 1)), 1, 9);
        if (p.towers != null || g.towers != null) q.towers = clamp(Math.round(num(p.towers ?? g.towers, 4)), 0, 12);
        if (p.houses != null || g.houses != null) q.houses = clamp(Math.round(num(p.houses ?? g.houses, 12)), 2, 40);
        if (p.count != null || g.count != null) q.count = clamp(Math.round(num(p.count ?? g.count, 1)), 1, 6);
        q.subject = pickKey(p.subject, STATUE_KEYS, g.subject || (kind === 'statue' ? 'human' : undefined));
        if (q.subject === undefined) delete q.subject;
        for (const f of ['moat', 'walls', 'spires', 'garden', 'water']) if (p[f] != null || g[f] != null) q[f] = !!(p[f] ?? g[f]);
        if (p.wall) q.wall = mat(p.wall, WALLS, undefined);
        if (p.roof) q.roof = mat(p.roof, ROOFS, undefined);
        if (q.wall === undefined) delete q.wall;
        if (q.roof === undefined) delete q.roof;
        parts.push(q);
    }
    if (!parts.length) parts.push(...base.parts);
    // the words said a thing the network forgot («…и колодец»): it is added
    for (const g of base.parts) if (!parts.some((p) => p.kind === g.kind) && parts.length < 12) parts.push(g);
    return { type: 'build', name, style: st, parts, scale: clamp(num(b.scale, base.scale || 1), 0.5, 1.8) };
}

function cleanCreature(c, base, name) {
    const plan = pickKey(c.plan, PLAN_KEYS, base.plan);
    const cols = Array.isArray(c.colors) ? c.colors.map(colourOf) : [];
    const walkAsked = pickKey(c.walk, WALK_KEYS, null);
    let wings = pickKey(c.wings, WING_KINDS, base.wings);
    let fly = c.fly === null || c.fly === 'none' ? null : pickKey(c.fly, FLY_KEYS, base.fly);
    if (fly && FLY[fly].wings[0] !== 'none' && wings === 'none') wings = FLY[fly].wings[0]; // (a flapping flight needs wings: they grow)
    if (!fly && base.fly) fly = base.fly; // (the words said it flies)
    const legs = clamp(Math.round(num(c.legs, base.legs)), 0, CAPS.LEGS_MAX);
    // the walk the body can do (the author: «при любых обстоятельствах ничего не ломалось»): legs it has decide
    let walk = walkAsked || base.walk;
    if (!WALK[walk].legs.includes(legs) && !(legs >= 4 && WALK[walk].legs.includes(4))) walk = legs === 0 ? (walk === 'roll' || walk === 'bounce' ? walk : plan === 'blob' ? 'bounce' : 'slither') : legs === 2 ? (walk === 'hop' || walk === 'waddle' ? walk : 'stride') : legs >= 6 ? 'scuttle' : 'trot';
    const abil = (Array.isArray(c.abilities) ? c.abilities : []).filter((a) => ABILITY_KEYS.includes(a));
    for (const a of base.abilities) if (!abil.includes(a)) abil.push(a);
    const flaws = (Array.isArray(c.flaws) ? c.flaws : []).filter((a) => FLAW_KEYS.includes(a));
    for (const a of base.flaws) if (!flaws.includes(a)) flaws.push(a);
    let hp = clamp(Math.round(num(c.hp, base.hp)), CAPS.HP_MIN, CAPS.HP_MAX);
    // (the words win over the network on the health: «20 здоровья» is the player's own number)
    if (base.hp !== CAPS.HP_DEFAULT) hp = base.hp;
    const eyes = c.eyes && typeof c.eyes === 'object' ? c.eyes : {};
    const horns = c.horns && typeof c.horns === 'object' ? c.horns : {};
    const out = {
        type: 'creature', name, plan, size: clamp(num(c.size, base.size), CAPS.SIZE_MIN, CAPS.SIZE_MAX), legs,
        legLen: clamp(num(c.legLen, base.legLen), 0.3, 2.2), legThick: clamp(num(c.legThick, base.legThick), 0.3, 2),
        neck: clamp(num(c.neck, base.neck), 0, 2.5), head: clamp(num(c.head, base.head), 0.4, 2.2),
        eyes: { n: clamp(Math.round(num(eyes.n, base.eyes.n)), 1, CAPS.EYES_MAX), size: clamp(num(eyes.size, base.eyes.size), 0.4, 3), color: colourOf(eyes.color) ?? base.eyes.color },
        ears: clamp(num(c.ears, base.ears), 0, 2.5),
        horns: { n: clamp(Math.round(num(horns.n, base.horns.n)), 0, CAPS.HORNS_MAX), len: clamp(num(horns.len, base.horns.len), 0.3, 2.5) },
        tail: pickKey(c.tail, TAIL_KINDS, base.tail), tailLen: clamp(num(c.tailLen, base.tailLen), 0.2, 2.5),
        wings, wingSpan: clamp(num(c.wingSpan, base.wingSpan), 0.4, 2.2),
        skin: pickKey(c.skin, SKINS, base.skin),
        colors: [0, 1, 2].map((i) => base.colors[i] ?? cols[i] ?? null), // (the colours said in the words first)
        pattern: pickKey(c.pattern, PATTERNS, base.pattern),
        glow: abil.includes('glow') ? (colourOf(c.glow) ?? base.glow ?? 0x9ef0ff) : null,
        walk, fly, swim: c.swim != null ? !!c.swim || base.swim : base.swim, hp,
        speed: pickKey(c.speed, ['slow', 'normal', 'fast'], base.speed),
        abilities: abil.slice(0, 4), flaws: flaws.slice(0, 3),
        temper: base.temper !== 'neutral' ? base.temper : pickKey(c.temper, TEMPERS, 'neutral'),
        diet: pickKey(c.diet, DIETS, base.diet), habitat: pickKey(c.habitat, HABITAT_KEYS, base.habitat),
        breed: clamp(Math.round(num(c.breed, base.breed)), 0, 2), count: clamp(Math.round(num(c.count, base.count)), 1, 6),
    };
    if (out.flaws.includes('fragile')) out.hp = Math.max(1, Math.round(out.hp / 2));
    return out;
}

function cleanPlant(p, base, name) {
    const trunk = p.trunk && typeof p.trunk === 'object' ? p.trunk : {};
    const flowers = p.flowers && typeof p.flowers === 'object' ? p.flowers : {};
    const hab = (Array.isArray(p.habitat) ? p.habitat : [p.habitat]).filter((h) => HABITAT_KEYS.includes(h));
    return {
        type: 'plant', name, form: pickKey(p.form, PLANT_FORM_KEYS, base.form),
        height: clamp(num(p.height, base.height), CAPS.PLANT_H_MIN, CAPS.PLANT_H_MAX),
        trunk: { color: base.trunk.color ?? colourOf(trunk.color), thick: clamp(num(trunk.thick, base.trunk.thick), 0.3, 2.5), twist: clamp(num(trunk.twist, base.trunk.twist), 0, 1) },
        crown: pickKey(p.crown, CROWNS, base.crown), leaves: pickKey(p.leaves, LEAVES, base.leaves),
        leafColor: base.leafColor ?? colourOf(p.leafColor),
        flowers: { color: base.flowers.color ?? colourOf(flowers.color), count: clamp(Math.round(num(flowers.count, base.flowers.count)), 0, 3) },
        fruit: pickKey(p.fruit, FRUITS, base.fruit), fruitColor: colourOf(p.fruitColor) ?? base.fruitColor,
        glow: base.glow ?? colourOf(p.glow),
        spread: base.spread !== 'normal' ? base.spread : pickKey(p.spread, SPREAD_KEYS, 'normal'),
        habitat: base.habitat[0] !== 'any' ? base.habitat : hab.length ? hab.slice(0, 3) : ['any'],
        grow: pickKey(p.grow, ['slow', 'normal', 'fast'], base.grow),
        count: clamp(Math.round(num(p.count, base.count)), 1, 20),
    };
}

/** A recipe's key (the same recipe — the same model, texture, plan on every computer): a short hash string. */
export function recipeKey(recipe) {
    return (hashString(JSON.stringify(recipe)) >>> 0).toString(36);
}

/** Russian names of the gaits (the HUD, the codex). */
export const WALK_RU = { trot: 'рысью', gallop: 'галопом', stride: 'на двух ногах', hop: 'прыжками', waddle: 'вразвалку', scuttle: 'семеня множеством ног', slither: 'ползком, извиваясь', crawl: 'низко, как ящерица', roll: 'катясь', bounce: 'подпрыгивая' };
export const FLY_RU = { flap: 'взмахами крыльев', soar: 'паря', hover: 'зависая', flutter: 'порхая', bat: 'рывками, как летучая мышь', dragon: 'мощными взмахами', float: 'плывя по воздуху без крыльев', pulse: 'толчками, как медуза', swoop: 'пикируя', spin: 'кружась' };
export const ABILITY_RU = { fireBreath: 'дышит огнём', waterSpit: 'плюётся водой', iceBreath: 'дышит холодом', poison: 'плюётся ядом', lightning: 'бьёт молнией', glow: 'светится', invisible: 'умеет становиться невидимым', heal: 'лечит друзей', teleport: 'перескакивает', sing: 'поёт' };

/**
 * ON WHOM AND ON WHAT (CLAUDE.md «На кого и на что»): the spell and what it makes.
 * The spell itself is no weapon: it hurts nobody; what it makes is real.
 */
export const CREATION_TARGETS = {
    // ---- the spell
    players: 'не действует: никого не ранит и не толкает; блок постройки ждёт, пока в его месте стоит игрок (никого не замуровать)',
    creatures: 'не действует: жители, рыцари, звери, моряки, зомби, драконы, Королева, скелеты… — никого не ранит; блоки ждут, пока тело уйдёт',
    ground: 'постройка: земля под ней ровняется (фундамент из камня), кусты и трава на месте стен убираются; вода — только мост и корабль',
    castles: 'не строится там, где уже стоят замок, деревня, башня волшебников, дом магии, корабль, чужая защита дома',
    godGift: 'не действует: храм богов, пьедесталы, дары богов — строить на них нельзя',
    enchanted: 'не действует: арены дуэлей и башни волшебников (заколдованный камень) не перестраиваются',
    space: 'не действует в космосе: нет земли — создать не на чем (spaceSpellBlock)',
    planets: 'на планетах — да (их земля), существа и растения — с их воздухом: без воздуха существо не родится',
    villagers: 'жители замка пугаются сияния (Danger «creation») и рыцари смотрят, но не нападают — это дар богов',
    // ---- what it makes
    builds: 'настоящие блоки мира: их ломают взрывы, прочность зданий (Structure.STUFF), строители замков не трогают; двери, кровати, сундуки и стёкла домов — настоящие',
    creaturesMade: 'настоящие существа: их бьют заклинания, оружие, взрывы, молния (CustomCreatures.TARGETS); в них можно вселиться «Империус Максима»',
    plantsMade: 'настоящие растения: горят от огня (Инферно, Hellfire), ломаются взрывами и «Total Destruction», растут и распространяются',
};
