/**
 * SpellManager.js — voice spells.
 *
 * Same spells, words, damage and look as the original (Сапира, Тандервейв,
 * Инферно, Санд/Даст, Айс) plus the new «Бомбардо» — an explosive orb that
 * blows up blocks, trees, tables and zombies.
 *
 * Visuals use the pooled Effects (no per-spark meshes). Damage only happens
 * where `authoritative` is true (single player / multiplayer host); other
 * peers render the same spell for the eyes only.
 */

import { dieWords } from '../game/StrongSpells.js';
import { isExpelliarmus } from '../game/Expelliarmus.js';
import { alohomoraWords, isLockWord } from '../game/Alohomora.js';
import * as THREE from 'three';
import { INFERNO, InfernoLook, infernoReach, infernoDrain, inStream, streamStop } from './InfernoStream.js';
import { thunderPush } from '../game/Impact.js';
import { isUpWord } from '../game/UpSpell.js';
import { overgrownPush, overgrownRange } from '../game/Overgrown.js';
import { FIREFIGHT, firefightWords } from '../game/Firefighting.js';
import { IMPULSE, impulsePush } from '../game/WindImpulse.js';
import { iceMagicWords } from '../game/IceMagic.js';
import { bridgeWords } from '../game/Bridge.js';
import { flyingMaximaWords } from '../game/Space.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Bombardo blast radius; «Бомбардо Максима» is MAXIMA_POWER times stronger. */
export const BOMBARDO_RADIUS = 3.6;
export const MAXIMA_POWER = 3;
/** Crater radius for a given power: 3× the energy → ~1.7× wider, ~5× more ground removed. */
export function bombardoRadius(power = 1) {
    return BOMBARDO_RADIUS * Math.sqrt(power);
}

/** Recognise a spell name in a voice transcript. Exported for tests. */
const RAY_SPELLS = new Set(['Sapira', 'Thunderwave', 'Wind', 'WindMaxima', 'Overgrown', 'OvergrownMaxima', 'Sands', 'Ice', 'Bombardo', 'BombardoMaxima']);

/** «Вайнд» on creatures and players: this many times its push on loose things. */
export const WIND_BODY_K = 2;

/** The planet spells of the gods' scrolls by their words (Russian and English as the recognizer writes them), or null. */
export function planetSpellWords(s) {
    const has = (...w) => w.some((x) => s.includes(x));
    if (has('terraform', 'teraform', 'терраформ', 'тераформ', 'тэрраформ', 'тэраформ', 'терафор', 'террафор', 'терроформ', 'тероформ')) return 'TerraformPlanet';
    const lev = has('вингард', 'wingard', 'левиос', 'левиоз', 'leviosa', 'leviose', 'вин гард');
    if (lev && has('супер', 'super', 'сюпер', 'суппер', 'супр')) return 'LevitationSuperMaxima';
    const planet = has('planet', 'плэнет', 'планет', 'плэнит', 'планит', 'плейнет', 'пленет', 'плэнэт', 'plannet');
    if (!planet) return null;
    // «Planet Liquidation» («Плэнет ликвидэйшн», «Уничтожь планету»): the planet word with «ликвид…» / «уничтож…» —
    // here, before «Liquidation» alone (the long phrase wins: never a plain «Ликвидейшн» while «планет» was said)
    if (has('liquid', 'ликвид', 'ликвед', 'уничтож', 'destroy', 'дестрой', 'взорви')) return 'PlanetLiquidation';
    if (has('enlarg', 'inlarg', 'энларж', 'инларж', 'энлардж', 'инлардж', 'энлаж', 'инлаж', 'enlage', 'увелич', 'больше')) return 'EnlargePlanet';
    if (has('creat', 'crate', 'крейт', 'криейт', 'криэйт', 'креит', 'криет', 'созда', 'сотвор', 'make', 'мейк')) return 'CreatePlanet';
    return null;
}

// «Бум» («Boom»): the word alone, or said twice — a phrase of at most three words, each «бум» or a little word
// («ну», «давай»). Boom.js asks more: the hand (the wand) raised and aimed at a mountain or a building.
const BOOM_WORD = /^(?:бу+м+|boo+m+|bou?m+|bu+m+|бум+с?)$/; // (the recognizer writes it «бум», «бумм», «буум», «boom», «bum»)
const BOOM_FILL = new Set(['ну', 'давай', 'а', 'эй', 'вот', 'раз']);
export function boomWords(s) {
    const w = String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);
    if (!w.length || w.length > 3) return false;
    return w.some((x) => BOOM_WORD.test(x)) && w.every((x) => BOOM_WORD.test(x) || BOOM_FILL.has(x));
}

// «Protection Gods» («протекшн гадс / годс / гатс», «protection gods / god»), «Божественная защита», «Щит / защита богов»;
// with «Максима» — the dome. The shield word AND the gods' word (never «год» in talk, never a plain «Protection»).
const GODS_PROTECT_W = /(protect|протек|протэк|протект|щит|защит)/;
const GODS_WORD = /^(gods?|gads?|godz|гад[зсц]?|год[зсц]|годсс?|гатс|гоц|гаддс|гаттс|бог|бога|богов|богам|боги|божеств\S*|божествен\S*)$/;
export function godsShieldWords(s) {
    s = String(s || '').toLowerCase().replace(/ё/g, 'е');
    if (!GODS_PROTECT_W.test(s) && !/божествен/.test(s)) return null;
    if (!s.split(/[^a-zа-я]+/).some((w) => GODS_WORD.test(w))) return null;
    return /(максим|maxim|макс|max|купол)/.test(s) ? 'ProtectionGodsMaxima' : 'ProtectionGods';
}

export function matchSpell(text) {
    const s = (text || '').toLowerCase().trim();
    if (!s) return null;
    const has = (...words) => words.some((w) => s.includes(w));
    // «Дай» («Die», «Дия»): an everyday word — only the whole phrase, one word of its own (StrongSpells.dieWords)
    if (dieWords(s)) return 'Die';
    // «Create an Ice Castle» / «Ice Bridge» («айс касл», «айс бридж», «создай ледяной замок / мост»): the ice
    // word AND the castle / bridge word — first, before «castle» of any other castle and the lone «Айс» (IceMagic.js)
    const iceMagic = iceMagicWords(s);
    if (iceMagic) return iceMagic;
    // «Create a Bridge» («криейт э бридж», «создай мост»): after «Ice Bridge», a word of its own (Bridge.js)
    if (bridgeWords(s)) return 'CreateBridge';
    // «Protection Gods» / «… Maxima» («Протекшн Гадс», «Божественная защита»): the gods' shield — the long phrase first,
    // never a plain «Protection» while the gods' word was said (ProtectionGods.js)
    const gods = godsShieldWords(s);
    if (gods) return gods;
    // the gods' scrolls (PlanetMagic.js): «Create a Planet», «Enlarge Planet», «Terraform Planet» — the planet word
    // with its verb (never the house / castle «Create…»); «Wingardium Leviosa Super Maxima» — before the plain Maxima
    const pw = planetSpellWords(s);
    if (pw) return pw;
    // «Inspirius» («Инспириус»): the mightiest — its whole word (never «инспирация» / «inspiration» in talk)
    if (has('inspir', 'инспир', 'инспайр', 'энспир', 'инспер') && !has('inspirat', 'инспирац')) return 'Inspirius';
    // «Бум» («Boom», «Бумм»): a short word — only on its own (never «бумага», «бумеранг», «и тут бум — всё упало»)
    if (boomWords(s)) return 'Boom';
    // «Give Me My Power» («Гив ми май пауэр», «Верни мне мою силу»): your power back from your own skeleton (Legacy.js)
    if (has('give me my power', 'give me power', 'give my power', 'гив ми май пауэр', 'гив ми май пауер', 'гив ми май пауа', 'гив ми май павер', 'гиф ми май пауэр', 'гив ми мой пауэр',
        'верни мне мою силу', 'верни мою силу', 'дай мне мою силу', 'верните мне мою силу')) return 'GiveMyPower';
    // «Snowman» («Сноумен», «Снеговик»): a friendly snowman out of the snow pointed at — before Sands' «man»-free
    // short tokens and «Alive» (IceQueen.castSnowman)
    if (has('snowman', 'snow man', 'snowmen', 'snoman', 'сноумен', 'сноумэн', 'сноуман', 'сноу мен', 'сноу мэн', 'сноу ман', 'сноумин', 'сномен', 'снoумен', 'снеговик', 'снеговичок')) return 'Snowman';
    // «Circle Attack» («Сёркл Аттак», «…Максима»): the circle word AND the attack word — before Wave Attack, Attack
    if ((has('circle', 'cirkle', 'circl', 'сёркл', 'серкл', 'серкл', 'сёркол', 'серкол', 'сиркл', 'церкл', 'сёркал', 'серкал', 'сёрк', 'серк', 'круговая', 'круговую', 'круговой') &&
        has('attack', 'atack', 'attac', 'атак', 'аттак', 'атэк', 'этак', 'атек', 'аттек', 'эттек', 'аттэк', 'эттак')) || has('circleattack', 'сёрклаттак', 'серклаттак', 'серкалатак')) {
        return has('макс', 'max', 'мах', 'maks') ? 'CircleAttackMaxima' : 'CircleAttack';
    }
    // «Firefighting» («файрфайтинг», «фаер файтинг»…): the fire word AND «fighting» — before Hellfire, Fire, Fire Maxima
    const ff = firefightWords(s);
    if (ff) return ff;
    // «Let the Hellfire Come» (whole words only): before «fire» / «файр» (Fire, Fire Maxima), «лет» (Let it rain)…
    const hell = hellfireWords(s);
    if (hell === 2) return 'Hellfire';
    if (hell === 1) return null; // («hellfire» alone: wait for «come» — never a campfire)
    // «Экспеллиармус»: the whole word only (before every short token that might sit inside it)
    if (isExpelliarmus(s)) return 'Expelliarmus';
    // «Suit Up» («сьют ап», «одеть всё»): all the armour on at once — before «Up» («ап») (Armor.js)
    if (has('suit up', 'suitup', 'soot up', 'сьют ап', 'сьютап', 'сют ап', 'сютап', 'съют ап', 'съютап', 'шьют ап', 'сьют', 'облачись', 'облачиться',
        'надеть все', 'надеть всё', 'одеть все', 'одеть всё', 'надень все', 'надень всё', 'одень все', 'одень всё')) return 'SuitUp';
    // «Disarmor» («дизармор», «раздеть»): the plain steel flies off the one the hand points at (a duel charge)
    if (has('disarmor', 'dis armor', 'disarmour', 'дизармор', 'дисармор', 'дезармор', 'дизарм', 'дисарм', 'дизармо', 'раздень', 'раздеть', 'разоблач')) return 'Disarmor';
    // «Алохомора» («…Максима»): whole words round «хомор» / «хамор» — before «Максима» alone, «мах»…
    const alo = alohomoraWords(s);
    if (alo) return alo === 2 ? 'AlohomoraMaxima' : 'Alohomora';
    // «Lock» («Лок», «Lock door»): a short word — only the whole phrase (before «door» → «Create a Door»)
    if (isLockWord(s)) return 'Lock';
    // «Up» («Ап»): a short word — only the whole phrase (UpSpell.js)
    if (isUpWord(s)) return 'Up';
    // «Джолт» («…Максима»): a short word — only as a word of its own (never inside another word)
    const jolt = joltWords(s);
    if (jolt) return jolt;
    // «Create a Castle» («криейт э касл», «создай замок»): before the house (its own words)
    if (castleWords(s)) return 'CreateCastle';
    // «Create a House» / «Improve a House» (before the beds and «Protection House»: its own words)
    const house = houseWords(s);
    if (house) return house;
    // the newer spells' long words (before every short token that may sit inside them: «вайнд», «сан», «лед»…)
    const mx = () => has('макс', 'max', 'мах', 'maks', 'мекс', 'мэкс');
    if (has('импульс', 'импулс', 'импалс', 'импэлс', 'импульз', 'импелс', 'импольс', 'impuls', 'impals', 'impulse')) return mx() ? 'WindImpulseMaxima' : 'WindImpulse';
    if (has('drawdown', 'draw down', 'drowdown', 'drow down', 'дравдаун', 'драв даун', 'дродаун', 'дро даун', 'драудаун', 'драу даун', 'дровдаун', 'дров даун', 'драфдаун', 'дравдан', 'дродан', 'дравдаон', 'просядь')) return mx() ? 'DrawdownMaxima' : 'Drawdown';
    if (has('ликвидейш', 'ликвидэйш', 'ликвидеш', 'ликвидайш', 'ликвидац', 'ликвидир', 'ликвидей', 'liquidat', 'liquidation', 'ликвидейтион')) return mx() ? 'LiquidationMaxima' : 'Liquidation';
    if (has('стичинг', 'стичин', 'ститчинг', 'ститчин', 'стиччинг', 'стичен', 'стечинг', 'стичэнг', 'stitching', 'stitchin', 'stiching', 'stitch', 'сшив', 'сшей')) return 'Stitching';
    // Beds (first: colour words like «синий» / «red» must not turn into other spells)
    if (has('цвет', 'color', 'colour', 'колор', 'калор', 'колар', 'покрас', 'перекрас', 'раскрас', 'чейндж', 'чендж', 'change')) return 'ChangeColor';
    if (has('кроват') || (has('bed', 'бед', 'бэд') && has('creat', 'крейт', 'криейт', 'криэйт', 'креит', 'созда', 'сдела', 'a bed', 'э бед', 'э бэд'))) return 'CreateBed';
    // «Let it rain» («Лет ит рейн», heard as «летит рейн», «лед ит рэйн»…): before everything with short tokens
    if ((has('rain', 'reign', 'рейн', 'рэйн', 'рейм', 'рэин', 'реин', 'рейна') && has('let', 'лет', 'лэт', 'лед', 'лит ит', 'лидит')) ||
        has('letitrain', 'летитрейн', 'пусть идёт дождь', 'пусть идет дождь', 'пусть пойдёт дождь', 'пусть пойдет дождь', 'пусть льёт дождь', 'пусть льет дождь')) return 'LetItRain';
    // «Create a Board» (a surfboard) — never «абордаж» (boarding a ship)
    if (!has('абордаж', 'abordag', 'aborda') && (has('surfboard', 'surf board', 'серфборд', 'сёрфборд', 'серф борд', 'сёрф борд') ||
        (has('board', 'борд', 'bord', 'bored', 'доск') && has('creat', 'крейт', 'криейт', 'криэйт', 'креит', 'созда', 'сдела', 'make', 'мейк')))) return 'CreateBoard';
    // Wand spells
    if (has('раскрой', 'раскрои', 'секрет', 'тайны', 'reveal', 'secret', 'ревил', 'ривил', 'равиал', 'ревиал')) return 'Reveal';
    // the Lumos' modes and «Lumos Following» (before the plain Lumos: its word is in them)
    if (has('фоловинг', 'фолловинг', 'фоллоуинг', 'фолоуинг', 'фоловин', 'фолловин', 'following', 'folowing', 'followin')) return 'LumosFollowing';
    if (has('flashlight', 'flash light', 'флешлайт', 'флэшлайт', 'флеш лайт', 'флэш лайт', 'флешлай', 'фонарик')) return 'LumosFlashlight';
    if (has('ahead', 'эхед', 'эхэд', 'ахед', 'ахэд', 'ехед', 'э хед', 'ехэд', 'э хэд', 'ahed', 'aheed', 'ахэт', 'эхет', 'эхэт', 'ахет', 'ahet', 'ahat')) return 'LumosAhead';
    if (has('люмос', 'лумос', 'люмус', 'lumos', 'lumus', 'люмаз')) return has('макс', 'max', 'мах') ? 'LumosMaxima' : 'Lumos';
    if (has('нокс', 'nox', 'нокса', 'knox', 'knocks', 'nocks')) return 'Nox';
    // «Lightning Writing»: drawing in the air (before «Lightning Strike»: the same first word)
    if (has('райтинг', 'райтин', 'врайтин', 'райдинг', 'writing', 'writin', 'righting', 'латин', 'вратин', 'latin', 'vratin', 'братин', 'ратин')) return 'Draw';
    // «Water Vortex» («вотер вортекс»): before everything that shares its sounds (water ball, Maxima…)
    if (has('vortex', 'vortec', 'vortx', 'вортекс', 'вортэкс', 'вортикс', 'вортекз', 'вортес', 'вотекс', 'вортакс', 'водоворот', 'ворт экс')) return has('супер', 'super', 'сюпер', 'суппер', 'супр') ? 'WaterVortexSuperMaxima' : 'WaterVortex'; // («Super Maxima»: the great water storm, WaterStorm.js)
    // «Total Destruction» («Тотал Дестракшн»): before Stand («st…») and every short token
    if (has('total destr', 'totaldestr', 'тотал', 'тоталь', 'тоутал', 'тотл', 'totl', 'total') && has('destr', 'дестр', 'дистр', 'дэстр', 'destruct', 'дестракш', 'дестрак', 'дистрак', 'разруш', 'струкш', 'стракш')) return has('макс', 'max', 'мах', 'maks') ? 'TotalDestructionMaxima' : 'TotalDestruction';
    if (has('дестракшн', 'дестракшен', 'дестрекшн', 'дистракшн', 'destruction', 'тотальное разрушение')) return has('макс', 'max', 'мах', 'maks') ? 'TotalDestructionMaxima' : 'TotalDestruction';
    // «Overgrown» («Овергроун», «Оверграун»): before the shield / Ice / Sands short tokens
    const flat = s.replace(/[\s-]+/g, '');
    if (/(овер|оувер|овир|авер|обер|офер|over|ower|ouer)(гро|гра|groun|grow|gron|gran)/.test(flat)) return has('макс', 'max', 'мах', 'maks') ? 'OvergrownMaxima' : 'Overgrown';
    // The shield magic of a house (HouseWards.js), whole phrases — before the plain «Protection»
    const ward = wardWords(s);
    if (ward) return ward;
    // «Invisible» / «Invisibility» (after the house's «Protection Invisible»: there «protection» is said too)
    if (!PROTECT_W.test(s) && has('инвизиб', 'инвизаб', 'инвизеб', 'инвисиб', 'энвизиб', 'инвизибл', 'invisib', 'невидим')) return 'Invisibility';
    // Shield first: «Protection Maxima» must not become Bombardo/water «максима»
    if (has('протекш', 'протэкш', 'протекш', 'протекц', 'protect', 'протект', 'щит')) return has('максим', 'maxim', 'макс', 'max') ? 'ProtectionMaxima' : 'Protection';
    // Building (before the short tokens of other spells)
    if (has('stand', 'стэнд', 'стенд', 'стоп', 'stop')) return 'Stand'; // («стоп» also stops every spell still going)
    // («Assemble» too: «Gather» is not always heard right)
    if (has('gather', 'гезер', 'гэзер', 'гэзэр', 'гезэр', 'гэзар', 'гезар', 'гэдер', 'гедер', 'гадер', 'гатер', 'газер', 'гаазер', 'гэзе ', 'гезе ', 'собери', 'собрать', 'assembl', 'ассембл', 'асембл', 'эссембл', 'эсембл', 'ассэмбл', 'асэмбл')) return 'Gather';
    // (a Russian noun alone is everyday talk — «где стена замка», «покажи дорогу», «на крыше» — it
    // builds only with «создай / построй / крейт…» in the same phrase)
    const make = () => has('creat', 'крейт', 'криейт', 'криэйт', 'креит', 'созда', 'сдела', 'постро', 'build', 'билд');
    if (has('floor', 'флор', 'флоор', 'флур')) return 'CreateFloor';
    if (has('ceiling', 'силинг', 'сейлинг', 'силин', 'эсилин') || (has('потол') && make())) return 'CreateCeiling';
    if (has('roof', 'руф') || (has('крыш') && make())) return 'BuildRoof';
    if (has('wall', 'уолл', 'уол') || (has('стену', 'стена', 'стенк') && make())) return 'CreateWall';
    if (has('door') || (has('двер', ' дор', 'дорь') && make())) return 'CreateDoor';
    // «To the Sun» (before «Даст»: «sun» is one of its words)
    if (has('to the sun', 'to the son', 'tothesun', 'ту зе сан', 'ту зэ сан', 'ту за сан', 'ту де сан', 'ту ze сан', 'тузесан', 'тузэсан', 'тузасан', 'к солнцу', 'солнц')) return 'ToTheSun';
    // New spell first: its words must never be mistaken for the short Sand/Ice tokens.
    if (has('бомбар', 'бомбор', 'бамбар', 'бонбар', 'помбар', 'бомбард', 'bombar', 'bombor', 'bambar', 'бомба', 'bomb')) {
        // «Бомбардо Максима»: the same word plus «максима»
        return has('макс', 'max', 'мэкс', 'мекс', 'maks', 'мах') ? 'BombardoMaxima' : 'Bombardo';
    }
    if (has('лайтнинг', 'лайтинг', 'лайтнин', 'лайтин', 'lightning', 'lightnin', 'lighting', 'страйк', 'strike', 'лайт нинг')) return 'LightningStrike';
    // the strong duel spells (StrongSpells.js): their long words before the short tokens they hold («сент», «ром»…)
    if (has('accentr', 'acentr', 'eccentr', 'akcentr', 'акцентр', 'аксентр', 'акцэнтр', 'эксентр', 'эксцентр', 'иксентр', 'ексцентр', 'акценрик', 'аксенрик')) return 'Accentric';
    if (has('pilbid', 'pilbed', 'pilbyd', 'пилбид', 'пильбид', 'пилбед', 'пелбид', 'пилбит', 'пил бид', 'пилбидр', 'филбид', 'билбид')) return 'Pilbidrio';
    if (has('electrum', 'electrom', 'elektrum', 'elektrom', 'электрум', 'электром', 'элекрум', 'элэктром', 'электрон', 'илектром') && !has('электромоб', 'электромагн', 'электромонт')) return 'Electrum';
    // Duel magic
    if (has('авада', 'кедавр', 'кидавр', 'avada', 'kedavr', 'kadavr', 'водокидавр', 'адакедавр')) return 'AvadaKedavra';
    // «Alive»: a tree comes alive (its sounds before the short Ice / Sands / Flight tokens)
    if (has('alive', 'a live', 'alife', 'алайв', 'алаив', 'алайф', 'элайв', 'элаив', 'элайф', 'эллайв', 'аллайв', 'олайв', 'алив', 'элив', 'алайве', 'оживи', 'оживай', 'оживл')) return has('макс', 'max', 'мах', 'maks', 'мекс', 'мэкс') ? 'AliveMaxima' : 'Alive'; // («…Максима»: everything near comes alive)
    if (has('остолбен', 'остолбин', 'столбен', 'ступеф', 'stupef', 'stupif', 'ступиф')) return 'Stupefy';
    if (has('вингард', 'вингард', 'wingard', 'левиос', 'левиоз', 'leviosa', 'leviose', 'левиоc', 'вин гард')) return has('макс', 'max', 'мах', 'maks', 'мекс', 'мэкс') ? 'LevitationMaxima' : 'Levitation'; // («…Максима»: LevitationMaxima.js)
    if (has('паузин', 'паузен', 'паузи', 'пауза', 'паузу', 'pausin', 'pauzin', 'pause', 'повзин')) return 'Pause';
    // Ships' sails: «Анфёрл» (unfurl) lets them down, «Фёрл» (furl) rolls them up (before Wind: «Вайнд» goes into the sails after)
    if (has('убрать парус', 'убери парус', 'уберите парус', 'свернуть парус', 'сверни парус', 'сверните парус', 'спусти парус', 'furl the sail')) return 'Furl';
    if (has('анфёрл', 'анферл', 'анфёл', 'анфел', 'анфорл', 'анфурл', 'анфирл', 'энфёрл', 'энферл', 'энфурл', 'ан фёрл', 'ан ферл', 'ан фурл', 'unfurl', 'un furl', 'open sail', 'опен сейл', 'поднять парус', 'подними парус', 'поднимите парус', 'открыть парус', 'открой парус', 'распусти парус', 'распустить парус', 'поставь парус', 'поставить парус')) return 'Unfurl'; // (all the sails at once: no «Максима» — «Анфёрл Максима» is just «Анфёрл»)
    if (has('фёрл', 'ферл', 'фурл', 'furl')) return 'Furl';
    // Water: «Air Bubble», «Wave Attack» (before Thunderwave/Wind: they share sounds)
    const maxW = () => has('макс', 'max', 'мах');
    // («Bubble» as the Russian recognizer hears it: «бабал», «бобл», «бубл», «пабл»…)
    if (has('bubble', 'bubbl', 'buble', 'bobble', 'babble', 'бабл', 'баббл', 'бабол', 'бабал', 'бабел', 'бабэл', 'бабыл', 'бобл', 'боббл', 'бубл', 'пабл', 'паббл', 'баблы', 'пузыр', 'эйр баб', 'air bub')) return maxW() ? 'AirBubbleMaxima' : 'AirBubble';
    if ((has('wave', 'вейв', 'вэйв', 'уэйв', 'волн') && has('attack', 'атак', 'аттак', 'атт', 'атэк', 'эттак', 'атак', 'атек', 'эттек', 'этек')) || has('waveattack', 'вейватак')) return maxW() ? 'WaveAttackMaxima' : 'WaveAttack';
    if (has('breakthrough', 'брейкфру', 'брейкср', 'брэйкфру', 'брейк сру', 'брейк фру', 'брейксру', 'break through', 'прорыв')) return has('макс', 'max', 'мах') ? 'BreakthroughMaxima' : 'Breakthrough';
    if (has('рескью', 'рескю', 'рэскью', 'rescue', 'рескьу', 'спасен', 'спаси')) return 'Rescue';
    if (has('атак', 'attack', 'аттак', 'атэк', 'этак', 'атака', 'в атаку', 'атек', 'аттек', 'эттек', 'этек', 'аттэк', 'эттэк', 'атык', 'attac', 'atack')) return 'Attack';
    if (has('earthquake', 'earth quake', 'earthcake', 'эрсквейк', 'эртквейк', 'ерсквейк', 'эрскейк', 'эрткейк', 'эрс квейк', 'квейк', 'quake', 'землетряс', 'эрскейп', 'escape', 'эскейп', 'искейп', 'ескейп', 'скейп', 'эскейт', 'skype', 'скайп')) return has('макс', 'max', 'мах') ? 'EarthquakeMaxima' : 'Earthquake';
    if (has('брейнрот', 'брейн рот', 'брейнрод', 'брэйнрот', 'brainrot', 'brain rot', 'брейн', 'брэйн', 'brain')) return 'Brainrot';
    if (has('вайнд', 'вайнт', 'ваинт', 'винд', 'вайн', 'уинд', 'уайнд', 'wind', 'wine', 'whined', 'ветер', 'ветр', 'ваинд')) return has('макс', 'max', 'мах') ? 'WindMaxima' : 'Wind';
    if (has('акцио', 'акцыо', 'акцие', 'акция', 'акций', 'аксио', 'акчо', 'акио', 'accio', 'acio', 'akio', 'akcio', 'aksio', 'axio', 'эксио')) return 'Accio';
    // «Fire Maxima» (before the lone «Максима» and the campfire «Fire»)
    if (has('fire', 'файр', 'фаер', 'фаир', 'фаэр', 'файер') && has('макс', 'max', 'мах', 'maks')) return 'FireMaxima';
    // Water bending (before Ice/Sands: their short tokens would catch these words)
    const water = has('вотер', 'ватер', 'уотер', 'water', 'вотр', 'водян', 'вода', 'воду', 'уатер', 'watter', 'woter');
    if (has('форминг', 'forming', 'формин') || (water && has('форм', 'form'))) return 'WaterForming';
    if (water && has('бол', 'бал', 'ball', 'bowl', 'bol', 'шар', 'буль', 'бул')) return 'Waterball';
    // «Айс» and «Frozen» are one spell; «Айс Максима» = «Frozen Maxima» = «Ice Maxima» (StrongSpells.js)
    const frozen = has('фрозен', 'фроузен', 'фрозэн', 'фризен', 'frozen', 'frosen', 'заморо');
    if ((frozen || s.split(/[^a-zа-яё]+/).some((w) => ICE_WORD.test(w))) && has('максим', 'maxim', 'макс', 'max', 'мах')) return 'IceMaxima';
    if (frozen) return 'Frozen';
    // «Flying Maxima» («Флайн Максима», «Флайинг Максима»): into space (Space.js) — before the lone «Максима» and «Флайн»
    if (flyingMaximaWords(s)) return 'FlyingMaxima';
    if (has('максим', 'maxim', 'макс', 'max')) return 'Maxima';
    if (has('флайн', 'флаин', 'флайм', 'флай', 'флэй', 'флей', 'фляй', 'fly', 'flai', 'полёт', 'полет', 'взлёт', 'взлет')) return 'Flight';
    // «Thunder wave» heard as «Сандер вейв»: the wave word wins over the Sand tokens
    if (has('тандер', 'сандер', 'сандэр', 'thunder', 'sander', 'сандр', 'тандр') || (has('вейв', 'wave', 'вэйв', 'уэйв') && has('сан', 'тан', 'san', 'tan', 'сун', 'фан'))) return 'Thunderwave';
    if (has('сап', 'sap', 'саб', 'sab', 'саф', 'saf', 'сат', 'sat', 'зап', 'zap')) return 'Sapira';
    if (has('танд', 'thun', 'молн', 'гром', 'удар')) return 'Thunderwave';
    // «Fire» (a campfire) before Inferno: «Инферно» never contains these words
    if (has('fire', 'файр', 'фаер', 'фаир', 'фаэр', 'файер', 'костёр', 'костер', 'костр')) return 'Fire';
    if (has('инфер', 'infer', 'огон')) return 'Inferno';
    if (has('санд', 'sand', 'сенд', 'send', 'санс', 'sans', 'песо', 'peso', 'цент', 'cent', 'даст', 'dust', 'sun', 'son', 'sam', 'set', 'sed')) return 'Sands';
    // «Айс» only as a word of its own: inside other words it is everywhere («лучше», «получилось»,
    // «следующий», «наиболее», «найс», «this»…) and cast itself in the middle of a talk
    if (s.split(/[^a-zа-яё]+/).some((w) => ICE_WORD.test(w))) return 'Ice';
    return null;
}
const ICE_WORD = /^(?:(?:айс|айз|аис)(?:а|у|е|ом)?|ice|ais|лёд|лед)$/;

/**
 * «Джолт» as a Russian recognizer hears it — «джолт», «джольт», «жолт», «джоулт», «джолд», «jolt»…
 * — a whole word only; with «Максима» in the phrase: «Джолт Максима». → 'Jolt' | 'JoltMaxima' | null
 */
const JOLT_WORD = /^(?:(?:дж|ж|дьж)(?:о|оу|оо)(?:л|ль)(?:т|д|тт)(?:а|у|ом|ы)?|jolt(?:s|ed)?|joult|jolth|djolt|zholt)$/;
export function joltWords(s) {
    const words = (s || '').toLowerCase().split(/[^a-zа-яё]+/);
    if (!words.some((w) => JOLT_WORD.test(w))) return null;
    return words.some((w) => /^(?:макс|max|мах|maks|мекс|мэкс)/.test(w)) ? 'JoltMaxima' : 'Jolt';
}

// «Protection House» («протекшн хаус», «протекшен хаус», «протекшн хауз»…), «Protection House Grant»
// («… грант»), «Protection Invisible» («протекшн инвизибл», «… невидимый»): the word «protection» AND
// «house» / «invisible» — never one of them alone (a «дом» in talk, a plain «Protection» shield).
const PROTECT_W = /(протек|протэк|протект|protect|протекц)/;
const HOUSE_W = /(хаус|хауз|хаос|хаусе|хауc|house|haus|хоус|хаўс|хаус)/;
const INVIS_W = /(инвиз|инвис|энвиз|invis|невидим|инвизиб)/;
const GRANT_W = /(грант|гранд|grant|грэнт|грант)/;
export function wardWords(s) {
    if (!PROTECT_W.test(s)) return null;
    if (INVIS_W.test(s)) return 'ProtectionInvisible';
    if (HOUSE_W.test(s)) return GRANT_W.test(s) ? 'ProtectionHouseGrant' : 'ProtectionHouse';
    return null;
}

// «Create a House» («криейт э хаус», «создай дом»), «Improve a House» («импрув э хаус», «улучши дом»):
// a word of making / improving AND «house» / «дом» — never «Protection House», never «дом» alone in talk.
const MAKE_W = /(creat|крейт|криейт|криэйт|креит|кріейт|созда|сотвори)/;
const IMPROVE_W = /(improv|импрув|импруф|имрув|импрув|улучш)/;
const HOUSE_SAID = /(хаус|хауз|хаос|house|haus|хоус)/;
export function houseWords(s) {
    s = String(s || '').toLowerCase();
    if (PROTECT_W.test(s)) return null;
    const house = HOUSE_SAID.test(s) || s.split(/[^a-zа-яё]+/).some((w) => /^(дом|дома|домик)$/.test(w));
    if (!house) return null;
    if (IMPROVE_W.test(s)) return 'ImproveHouse';
    if (MAKE_W.test(s)) return 'CreateHouse';
    return null;
}

// «Create a Castle» («криейт э касл», «крейт э кастл», «создай замок», «сотвори замок»): a word of making
// AND «castle» / «замок» — never «замок» alone (a lock in talk), never «Lock».
const CASTLE_SAID = /(castl|castel|касл|кастл|кэсл|кэстл|кесл|кестл|касел|кассл|кастел|каст?ле|кастыл)/;
const CASTLE_RU = /^(замок|замка|замочек|дворец|дворца)$/;
// (the Russian verb only as an order — «создай», «построй»: «я создал замок», «строить замок» in talk is no spell;
// and a short phrase — a sentence about a castle is talk: «как классно, что я создал свой замок с троном»)
const MAKE_CASTLE = /(creat|crate|крейт|криейт|криэйт|креит|кріейт|креэйт|криет)/;
const MAKE_CASTLE_RU = /^(создай|сотвори|построй|возведи)$/;
export function castleWords(s) {
    s = String(s || '').toLowerCase().replace(/ё/g, 'е');
    const words = s.split(/[^a-zа-я]+/).filter(Boolean);
    if (words.length > 5) return false;
    const castle = CASTLE_SAID.test(s) || words.some((w) => CASTLE_RU.test(w));
    return castle && (MAKE_CASTLE.test(s) || words.some((w) => MAKE_CASTLE_RU.test(w)));
}

// «Let the Hellfire Come» as the Russian recognizer writes it: «лет зе хеллфаер кам», «хелфайр кам»,
// «come hellfire», «хелл фаер»… The word «hellfire» (whole, or «hell» + «fire» side by side) AND «come»
// or «let» as words of their own: talk about fire, a «камин» or «5 лет» never casts it.
const HELL_W = /^(?:х[еэи]лл?ь?|hell?)$/; // («хел», «хелл», «хель», «хэл», «хил»…)
const FIRE_W = /^(?:ф[аэ][йи]?[еэя]?р|фер|файа|fire|fier|fyre|fair|faer|fayer|fer)$/;
const HELLFIRE_W = /^(?:х[еэи]лл?ь?|hell?)(?:ф[аэ][йи]?[еэя]?р|фер|файа|fire|fier|fyre|fair|faer|fayer|fer)$/;
const COME_W = /^(?:кам|кем|кум|камм|ком|камэ|каме|камон|комон|come|comes|cum|cam|kam|kum|cmon)$/;
const LET_W = /^(?:лет|лэт|летс|лэтс|лец|лед|летзе|лэтзе|let|lets)$/;
// («the»: as the recognizer writes it between «Let» and «Hellfire»)
const THE_W = /^(?:зе|зэ|дзе|the|ze)$/;

/**
 * «Let the Hellfire Come» (or «Hellfire come», «Come, hellfire», «Да придёт адский огонь»)?
 * @returns 2 = the spell; 1 = only the word «hellfire» (not a spell yet); 0 = no
 */
export function hellfireWords(text) {
    const w = String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);
    let fire = false;
    for (let i = 0; i < w.length && !fire; i++) fire = HELLFIRE_W.test(w[i]) || (HELL_W.test(w[i]) && i + 1 < w.length && FIRE_W.test(w[i + 1]));
    if (fire) return w.some((x) => COME_W.test(x) || LET_W.test(x)) ? 2 : 1;
    // «Hell» lost by the recognizer («лет зе фаер кам»): «let / the» + «fire» is never a campfire —
    // with «come» it is the spell, without it wait for the rest of the phrase
    if (w.some((x) => FIRE_W.test(x)) && w.some((x) => LET_W.test(x) || THE_W.test(x))) return w.some((x) => COME_W.test(x)) ? 2 : 1;
    // the Russian words: «Да придёт адский огонь» (the whole phrase)
    const t = w.join(' ');
    return /(^| )адск[а-я]* (огон|огн|пламя)/.test(t) && /(^| )(прид[а-я]*|приди|явись|гряди)( |$)/.test(t) ? 2 : 0;
}

export class SpellManager {
    /**
     * @param {THREE.Scene} scene
     * @param {Effects} fx
     * @param {object} hooks
     *   zombies(): Zombie[]
     *   authoritative(): boolean
     *   damage(z, amount, isWeapon, dir)
     *   explode(pos, radius, casterId, power)   (authoritative only)
     *   handPose(casterId, side) -> {origin, dir} | null   (live hand for ice beam)
 *   ignite(origin, dir, length) / igniteAt(pos, radius)   set trees on fire
 *   burn(o, d, len, casterId) -> bool   the Inferno stream burns what it reaches (true: something burnt)
 *   waters() -> [{x,y,z,r}]   water balls / vortex water that stop the flame;  blockAt(x,y,z) -> 'water'|'solid'|null
 *   drain(casterId, mana) -> false when the caster has no mana left (the held flame goes out)
 *   players(casterId) -> player targets (Свободный мир): {local, center(), hit(kind, from, push), blocks(from), chill(amount, from)}
     *   collision: CollisionWorld
     *   terrain(): Terrain|null
     */
    constructor(scene, fx, hooks) {
        this.scene = scene;
        this.fx = fx;
        this.hooks = hooks;
        this.spells = [];
        this.soundManager = null;

        // Re-usable projectile meshes (sand ball, bombardo orb)
        this.sandBalls = this._ballPool(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd2b48c }), 6);
        this.orbs = this._ballPool(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb347 }), 6);
        for (const o of this.orbs) {
            const halo = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
            o.add(halo);
        }
    }

    _ballPool(geo, mat, n) {
        const arr = [];
        for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(geo, mat);
            m.visible = false;
            m.userData.free = true;
            this.scene.add(m);
            arr.push(m);
        }
        return arr;
    }

    _takeBall(pool) {
        const m = pool.find((b) => b.userData.free) || pool[0];
        m.userData.free = false;
        m.visible = true;
        return m;
    }

    _freeBall(m) {
        m.visible = false;
        m.scale.setScalar(1);
        m.userData.free = true;
    }

    setSoundManager(sm) {
        this.soundManager = sm;
    }

    /** A spell's own effect (SpellMusic: 'fxWind'…) at `pos` — heard near it; not made yet: the old sound `fallback`. */
    _fx(key, pos, rate = 1, fallback = 'playWhoosh') {
        const sm = this.soundManager;
        if (!sm) return;
        try { if (!sm.playSpellFx?.(key, pos, 1, rate) && fallback) this._sound(fallback); } catch (e) { console.warn('Sound error', e); }
    }

    _sound(fn, ...args) {
        if (!this.soundManager || !this.soundManager[fn]) return;
        try { this.soundManager[fn](...args); } catch (e) { console.warn('Sound error', e); }
    }

    get zombies() {
        return this.hooks.zombies ? this.hooks.zombies() : [];
    }

    get auth() {
        return this.hooks.authoritative ? this.hooks.authoritative() : true;
    }

    /**
     * @param {string} text  voice transcript or spell name
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction (normalised)
     * @param {string} handSide
     * @param {string} [casterId]
     * @returns {string|null} spell name
     */
    castSpell(text, origin, direction, handSide, casterId = 'local') {
        const name = matchSpell(text);
        if (!name) return null;
        this.cast(name, origin, direction, handSide, casterId);
        return name;
    }

    cast(name, origin, direction, handSide, casterId = 'local') {
        const o = origin.clone();
        const d = direction.clone().normalize();
        this._from = o; // (where the spell comes from: a house's sphere stops it from outside)
        // book-birds are knocked down by the spells that fly
        if (RAY_SPELLS.has(name) && this.hooks.birdRay) this.hooks.birdRay(o, d, 30, name.endsWith('Maxima') ? 2 : 1, name);
        switch (name) {
            case 'Sapira': this.castSapira(o, d, casterId); break;
            case 'Thunderwave': this.castThunderwave(o, d, casterId); break;
            case 'Wind': this.castWind(o, d, casterId, 1); break;
            case 'Brainrot': this.castBrainrot(o, direction.clone()); break; // (its length = the distance)
            case 'Storm': if (this.hooks.storm) this.hooks.storm(o); break;
            case 'ToTheSun': this.hooks.sun?.(o); break;
            case 'LetItRain': this.castLetItRain(o, casterId); break;
            case 'LightningHold': this.castLightningHold(casterId, handSide); break;
            case 'LightningHit': this.castLightningHit(o, casterId); break;
            case 'LightningCatch': this.castLightningCatch(o, casterId); break;
            // (the beam: `direction` = from the target point back to the caster's hands)
            case 'LightningBeam': this.castLightningHit(o, casterId, o.clone().add(direction)); break;
            case 'Earthquake': this.castEarthquake(o, d, casterId, 1); break;
            case 'EarthquakeMaxima': this.castEarthquake(o, d, casterId, 3); break;
            case 'WindMaxima': this.castWind(o, d, casterId, 3); break;
            case 'Overgrown': case 'OvergrownMaxima': this.castOvergrown(name, o, d, casterId); break;
            // («Wave Attack»: raised, aimed, sent — WaveAttack.js; an old one-shot: d's length = the distance)
            case 'WaveAttack': case 'WaveAttackMaxima': this.hooks.wave?.(name, o.clone(), direction.clone(), handSide, casterId); break;
            case 'Inferno': this.castInferno(o, d, casterId, handSide || 'right'); break;
            case 'Firefighting': case 'FirefightingMaxima': this.castFirefighting(name === 'FirefightingMaxima', o, d, casterId, handSide || 'right'); break;
            case 'Sands': this.castSands(o, d, casterId); break;
            case 'Ice': this.castIce(o, d, handSide, casterId); break;
            case 'Bombardo': this.castBombardo(o, d, casterId); break;
            case 'BombardoMaxima': this.castBombardo(o, d, casterId, MAXIMA_POWER); break;
            case 'WindImpulse': case 'WindImpulseMaxima': this.castImpulse(name, o, casterId); break;
            case 'Drawdown': case 'DrawdownMaxima': this.hooks.drawdown?.(name, o, casterId); break; // (Drawdown.js)
            case 'Liquidation': case 'LiquidationMaxima': this.hooks.liquidation?.(name, o, d, casterId); break; // (Liquidation.js)
            case 'Stitching': this.hooks.stitching?.(o, d, casterId); break; // (Stitching.js)
            case 'CreateBridge': this.hooks.bridge?.(o, direction.clone(), casterId); break; // (Bridge.js: o = the feet, its length = to the far end)
            case 'WallRise': case 'WallRiseMaxima': this.castWallRise(o, d, casterId, name === 'WallRiseMaxima'); break; // (Breakthrough's wall)
            case 'Flight': return false; // handled by the game (it moves the caster)
            case 'FlyingMaxima': return false; // (Space.js: the game moves the caster)
            default: return false;
        }
        return true;
    }

    update(dt) {
        for (let i = this.spells.length - 1; i >= 0; i--) {
            const spell = this.spells[i];
            spell.life -= dt;
            if (spell.onUpdate && spell.life > 0) spell.onUpdate(spell, dt);
            if (spell.life <= 0) {
                if (spell.onEnd) spell.onEnd(spell);
                this.spells.splice(i, 1);
            }
        }
    }

    /** A spell this caster holds now (flames, ice beams, the ground sinking — Concentration.js), or null. */
    heldBy(casterId) {
        for (const sp of this.spells) if (sp.held && sp.by === casterId && sp.life > 0) return sp;
        return null;
    }

    /** «Стоп»: the spells this caster holds (flames, ice beams, the storm in the hands) end now. */
    stopBy(casterId) {
        let n = 0;
        for (const sp of this.spells) if (sp.held && sp.by === casterId && sp.life > 0) { sp.life = 0; n++; }
        return n > 0;
    }

    clear() {
        for (const s of this.spells) if (s.onEnd) s.onEnd(s);
        this.spells.length = 0;
    }

    /** Players a spell from `casterId` can hit (never the caster). */
    _players(casterId) {
        return this.hooks.players ? this.hooks.players(casterId) : [];
    }

    _damage(z, amount, isWeapon, dir) {
        if (this._from && this.hooks.shielded?.(this._from, z.group.position)) return; // (in a protected house)
        if (this.auth && this.hooks.damage) this.hooks.damage(z, amount, isWeapon, dir);
    }

    // -------------------------------------------------------------- Inferno
    /**
     * A stream of fire from the hand (see InfernoStream.js): it follows the caster's live
     * hand every frame, grows out in ~0.3 s, stops at a shield facing it, at water
     * (steam) and at walls, burns every creature in it. The caster pays mana while holding it.
     */
    castInferno(origin, direction, casterId, handSide = 'right') {
        this._sound('playInferno');
        const look = new InfernoLook(this.fx);
        const o = origin.clone(), d = direction.clone();
        const right = new THREE.Vector3(), up = new THREE.Vector3();
        const flame = { t: 0, len: 0, end: null, o, d, burnT: 0, drainT: 0, worked: false };
        this.spells.push({
            life: INFERNO.LIFE,
            held: true, by: casterId, kind: 'Inferno', flame, // («стоп» ends it)
            onUpdate: (spell, dt) => {
                // the stream comes out of the live hand, wherever it points now
                const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                if (live && live.dir && live.dir.lengthSq() > 1e-6) { o.copy(live.origin); d.copy(live.dir).normalize(); }
                // the caster pays mana while holding it (the hook says no when it ran out)
                if (this.hooks.drain && this.hooks.drain(casterId, infernoDrain(dt), dt) === false) { flame.noMana = true; spell.life = 0; return; }
                flame.t += dt;
                const players = this._players(casterId);
                const stop = streamStop(o, d, infernoReach(flame.t), {
                    waters: this.hooks.waters ? this.hooks.waters() : [],
                    shields: players.filter((p) => p.blocks(o)).map((p) => { const c = p.center(); return { x: c.x, y: c.y, z: c.z, r: 0.8 }; }),
                    blockAt: this.hooks.blockAt || null,
                });
                flame.len = stop.t; flame.end = stop.by;
                // a house's sphere stops the flame from outside
                const wt = this.hooks.wardClip ? this.hooks.wardClip(o, d, flame.len) : flame.len;
                if (wt < flame.len) { flame.len = wt; flame.end = 'shield'; }
                this._from = o;
                right.crossVectors(d, UP);
                if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
                right.normalize();
                up.crossVectors(right, d).normalize();
                look.draw(dt, o, d, flame.len, flame.end, right, up);
                // water hisses (steam) where the flame meets it
                flame.hissT = (flame.hissT || 0) - dt;
                if (flame.end === 'water' && flame.hissT <= 0) { flame.hissT = 1.2; this._sound('playSplash'); }
                let hit = false;
                for (const z of this.zombies) {
                    if (z.isDead || z.damageCooldown > 0) continue;
                    _a.copy(z.group.position); _a.y += 1;
                    if (!inStream(o, d, flame.len, _a, 0.6)) continue;
                    this._damage(z, 1, true, d);
                    z.damageCooldown = 0.1;
                    hit = true;
                }
                for (const p of players) {
                    if (!p.local) continue; // (every computer burns only its own player)
                    if (inStream(o, d, flame.len, p.center(), 0.5) && p.hit('Inferno', o)) hit = true;
                }
                // trees, dry blocks, animals, villagers, knights, spiders, living trees…
                flame.burnT -= dt;
                if (flame.burnT <= 0) {
                    flame.burnT = INFERNO.BURN_TICK / (this.hooks.fireBoost?.(casterId) || 1); // (the dragon's wand: it burns 60% more)
                    if (this.hooks.burn && this.hooks.burn(o, d, flame.len, casterId)) hit = true;
                    else if (!this.hooks.burn && this.hooks.ignite) this.hooks.ignite(o, d, flame.len);
                }
                // mana: the flame really burnt something — or simply came out and burnt a while (the author: the first
                // Inferno counts even into the air / at stone; only one cut off at once — no mana — does not)
                if ((hit || flame.t >= INFERNO.COUNT_AFTER) && !flame.worked) { flame.worked = true; this.hooks.success?.(casterId, 'Inferno'); }
            },
            onEnd: () => { if (flame.noMana) this.hooks.flameOut?.(casterId); }, // (it went out everywhere)
        });
    }

    // --------------------------------------------------------- Firefighting
    /**
     * «Firefighting»: the air taken away in a cone from the hand — the fire there goes out; «… Maxima»: held
     * for 5 s that follows the caster's live hand («стоп» ends it). What it does: Firefighting.js.
     */
    castFirefighting(max, origin, direction, casterId, handSide = 'right') {
        const name = max ? 'FirefightingMaxima' : 'Firefighting';
        const sp = { o: origin.clone(), d: direction.clone().normalize(), max, t: 0, by: casterId, side: handSide, done: false, worked: false };
        this.spells.push({
            life: max ? FIREFIGHT.MAX_LIFE : FIREFIGHT.BURST,
            held: max, by: casterId, kind: name, spray: sp, // (the hose: «стоп» ends it)
            onUpdate: (spell, dt) => {
                if (max) {
                    const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                    if (live && live.dir && live.dir.lengthSq() > 1e-6) { sp.o.copy(live.origin); sp.d.copy(live.dir).normalize(); }
                }
                sp.t += dt;
                this._from = sp.o;
                // mana: it really put a fire out
                if (this.hooks.firefight?.(sp, dt) && !sp.worked) { sp.worked = true; this.hooks.success?.(casterId, name); }
            },
        });
    }

    // --------------------------------------------------------- Thunderwave
    castThunderwave(origin, direction, casterId) {
        this._sound('playThunder');
        for (let i = 0; i < 20; i++) {
            _a.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5 + 3, (Math.random() - 0.5) * 5).add(origin);
            this.fx.spark(_a, 0x88ffff, 1.5, _b.copy(direction).multiplyScalar(5), 0.5);
        }
        const range = 40;
        for (let k = 0; k < 15; k++) {
            const boltDir = direction.clone().applyAxisAngle(UP, (Math.random() - 0.5) * 2.0).normalize();
            const curr = origin.clone();
            const segments = 8;
            const segLen = (range * (0.5 + Math.random() * 0.5)) / segments;
            for (let s = 0; s < segments; s++) {
                const next = curr.clone().addScaledVector(boltDir, segLen);
                next.x += (Math.random() - 0.5) * 2; next.y += (Math.random() - 0.5) * 2; next.z += (Math.random() - 0.5) * 2;
                this.fx.bolts.add(curr, next, 0.15 + k * 0.01);
                curr.copy(next);
            }
        }
        this.fx.lightFlash(origin, 0xaaddff, 3, 0.3, 50);
        for (const z of this.zombies) {
            if (z.isDead) continue;
            const to = _a.subVectors(z.group.position, origin);
            const dist = to.length();
            const dirTo = _b.copy(to).normalize();
            if ((dist < 4.0 && direction.dot(dirTo) > -0.2) || (dist < range && direction.angleTo(dirTo) < 1.2)) {
                if (this.auth) {
                    z.damageCooldown = 0;
                    this._damage(z, 5, true, dirTo);
                    if (!this.hooks.creatures) z.group.position.addScaledVector(dirTo, 8);
                }
            }
        }
        // every creature in the wave is shoved by its strength there (near: off its feet; far: a stagger)
        const wave = (pos) => {
            const to = new THREE.Vector3().subVectors(pos, origin);
            const dist = to.length();
            const dirTo = to.clone().normalize();
            if (!((dist < 4.0 && direction.dot(dirTo) > -0.2) || (dist < range && direction.angleTo(dirTo) < 1.2))) return null;
            return dirTo.setY(0).normalize().multiplyScalar(thunderPush(dist)).setY(1);
        };
        if (this.auth) this.hooks.creatures?.('Thunderwave', casterId, wave, { from: origin, noSlide: (c) => c.isAnimal /* (Animals throws its own) */ });
        for (const p of this._players(casterId)) {
            if (!p.local) continue;
            const v = wave(p.center());
            if (v) p.hit('Thunderwave', origin, v);
        }
    }

    // ---------------------------------------------------------- Let it rain
    /**
     * «Let it rain»: a silvery-blue stream of magic rises from the hand (the wand) high
     * into the sky, a ring of sparks spreads up there — and the clouds gather into rain.
     */
    castLetItRain(origin, casterId) {
        const top = _a.copy(origin).add(_b.set(0, 60, 0));
        this.fx.straightBeam(origin, top, 0.09, 0x9fd4ff, 0.85, 1.6, null, THREE.AdditiveBlending);
        this.fx.straightBeam(origin, top, 0.3, 0x5f8fff, 0.35, 1.6, null, THREE.AdditiveBlending);
        this.fx.lightFlash(origin, 0x9fd4ff, 4, 0.5, 30);
        // sparks spiral up along the stream
        for (let i = 0; i < 70; i++) {
            const a = i * 0.7, r = 0.25 + Math.random() * 0.25;
            _c.set(Math.cos(a) * r * 2, 14 + Math.random() * 16, Math.sin(a) * r * 2);
            this.fx.spark(origin, i % 3 ? 0xbfe6ff : 0xffffff, 0.1, _c, 1.2 + Math.random() * 0.8);
        }
        // a ring of light opens high above (where the clouds will be)
        const ringAt = origin.clone().setY(origin.y + 26);
        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            _c.set(Math.cos(a) * 9, 0.5, Math.sin(a) * 9);
            this.fx.spark(ringAt, 0xcfe8ff, 0.22, _c, 1.6);
        }
        this.hooks.rain?.(origin, casterId);
    }

    // ------------------------------------------------------ Lightning Strike
    /** The lightning sits in the caster's hand: a crackling bolt from the sky to it (≤ 5 s). */
    castLightningHold(casterId, side) {
        this._holds = this._holds || new Map();
        const prev = this._holds.get(casterId);
        if (prev) prev.life = 0;
        const sky = new THREE.Vector3();
        const spell = {
            life: 8.5,
            held: true, by: casterId,
            onUpdate: () => {
                // the power of the storm sits in both hands: strands from the sky, arcs between the hands
                const hands = [];
                for (const s of ['right', 'left']) {
                    const hp = this.hooks.handPose ? this.hooks.handPose(casterId, s) : null;
                    if (hp) hands.push(hp.origin.clone());
                }
                if (!hands.length) return;
                for (const hand of hands) {
                    sky.set(hand.x + 6, hand.y + 45, hand.z - 4);
                    this._jagged(sky, hand, 12, 2.2, 0.05);
                    if (Math.random() < 0.5) this._jagged(sky, hand, 10, 3.5, 0.05);
                    for (let k = 0; k < 2; k++) this.fx.spark(hand, Math.random() < 0.5 ? 0xffffff : 0x9fd8ff, 0.22, _b.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), 0.3);
                }
                if (hands.length === 2 && Math.random() < 0.6) this._jagged(hands[0], hands[1], 5, 0.4, 0.05);
            },
            onEnd: () => { if (this._holds.get(casterId) === spell) this._holds.delete(casterId); },
        };
        this._holds.set(casterId, spell);
        this.spells.push(spell);
    }

    /** A jagged bolt from a to b (segments live one frame unless `life`). */
    _jagged(a, b, n, amp, life) {
        const dir = _a.subVectors(b, a);
        let prev = a.clone();
        for (let i = 1; i <= n; i++) {
            const p = a.clone().addScaledVector(dir, i / n);
            if (i < n) p.add(_c.set((Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * 2 * amp));
            this.fx.bolts.add(prev, p, life);
            prev = p;
        }
    }

    /** The storm's lightning comes down into the caster's raised hands: a huge flash, no harm. */
    castLightningCatch(o, casterId) {
        const hands = [];
        for (const s of ['right', 'left']) { const hp = this.hooks.handPose ? this.hooks.handPose(casterId, s) : null; if (hp) hands.push(hp.origin.clone()); }
        if (!hands.length) hands.push(o.clone().add(_b.set(0, 4, 0)));
        for (const hand of hands) {
            const sky = new THREE.Vector3(hand.x + 8, hand.y + 70, hand.z - 5);
            for (let k = 0; k < 4; k++) this._jagged(sky, hand, 18, 4 - k, 0.4 + k * 0.05);
            for (let i = 0; i < 30; i++) this.fx.spark(hand, i % 3 ? 0xffffff : 0x9fd8ff, 0.3, _b.set((Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10), 0.7);
            this.fx.lightFlash(hand, 0xdde8ff, 16, 0.6, 140);
        }
        this.fx.shake = Math.max(this.fx.shake, 1.5);
        this._sound('playThunder');
    }

    /**
     * The lightning strikes `point` — from the sky, or (`from`) out of the caster's hands
     * in a huge crackling beam: everything right there is hit hard.
     */
    castLightningHit(point, casterId, from = null) {
        const hold = this._holds && this._holds.get(casterId);
        if (hold) hold.life = 0;
        const sky = from ? from.clone() : new THREE.Vector3(point.x + 8, point.y + 70, point.z - 5);
        for (let k = 0; k < (from ? 5 : 3); k++) this._jagged(sky, point, from ? 14 : 16, from ? 2.4 - k * 0.4 : 3 - k, 0.45 + k * 0.05);
        if (from) this.fx.lightFlash(from, 0xdde8ff, 10, 0.4, 80);
        for (let k = 0; k < 6; k++) { // branches
            const mid = sky.clone().lerp(point, 0.3 + Math.random() * 0.5);
            this._jagged(mid, mid.clone().add(_b.set((Math.random() - 0.5) * 14, -6 - Math.random() * 8, (Math.random() - 0.5) * 14)), 5, 1, 0.3);
        }
        this.fx.lightFlash(point, 0xdde8ff, 14, 0.5, 120);
        this.fx.shake = Math.max(this.fx.shake, 1.2);
        for (let i = 0; i < 40; i++) this.fx.spark(point, i % 3 ? 0xffffff : 0x9fd8ff, 0.25, _b.set((Math.random() - 0.5) * 12, Math.random() * 9, (Math.random() - 0.5) * 12), 0.6);
        this._sound('playThunder');
        if (this.hooks.ignite) this.hooks.ignite(point.clone().add(UP.clone().multiplyScalar(4)), _b.set(0, -1, 0), 6);
        const R = 3.2;
        if (this.auth) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                if (z.group.position.distanceTo(point) < R + 0.5) { z.damageCooldown = 0; this._damage(z, 20, false, _b.set(0, 0, 1)); }
            }
            // whoever lives through it is thrown off its feet, away from the strike
            this.hooks.creatures?.('Lightning', casterId, (pos) => {
                if (pos.distanceTo(point) > R + 1.5) return null;
                const v = new THREE.Vector3(pos.x - point.x, 0, pos.z - point.z);
                if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
                return v.normalize().multiplyScalar(8);
            }, { from: point });
        }
        for (const p of this._players(casterId)) {
            if (!p.local) continue;
            if (p.center().distanceTo(point) < R + 0.5) p.hit('Lightning', point);
        }
        if (this.hooks.lightningAt) this.hooks.lightningAt(point, casterId);
    }

    // ---------------------------------------------------------- Earthquake
    /**
     * «Earthquake»: a stomp sends a quake along the ground in one direction — a
     * crack opens, dust and stones jump, and everything it runs under falls
     * down for a few seconds and gets hurt. Maxima: 3× stronger, longer, wider.
     */
    castEarthquake(origin, direction, casterId, power = 1) {
        this._sound('playExplosion', origin, origin, power > 1 ? 2 : 1);
        const dir = direction.clone().setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
        dir.normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const length = power > 1 ? 32 : 20;
        const half = power > 1 ? 4 : 2.4; // half-width of the hit strip
        const SPEED = 16; // m/s the wave runs
        const ground = (x, z) => (this.hooks.collision ? this.hooks.collision.surfaceY(x, z) : 0);
        // The crack: a jagged dark line on the ground that opens as the wave passes
        const crackMat = new THREE.MeshBasicMaterial({ color: 0x1c120c, transparent: true, opacity: 0.95, depthWrite: false });
        const glowMat = new THREE.MeshBasicMaterial({ color: power > 1 ? 0xff6a2a : 0xd08a4a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
        const crack = new THREE.Group();
        this.scene.add(crack);
        const segs = [];
        // a «Максима» tears three cracks side by side (the middle one wide and glowing)
        const lanes = power > 1 ? [0, -2.2, 2.2] : [0];
        for (const lane of lanes) {
            let prev = origin.clone().addScaledVector(dir, 1).addScaledVector(side, lane * 0.4);
            const w = (power > 1 ? 0.55 : 0.32) * (lane ? 0.7 : 1);
            for (let d = 2; d <= length; d += 1.6) {
                const p = origin.clone().addScaledVector(dir, d).addScaledVector(side, lane * Math.min(1, d / 6) + (Math.random() - 0.5) * 1.2);
                for (const q of [prev, p]) q.y = ground(q.x, q.z) + 0.04;
                const len = prev.distanceTo(p);
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, len), crackMat);
                m.position.copy(prev).lerp(p, 0.5);
                m.lookAt(p);
                m.scale.set(0.01, 1, 1);
                const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 0.05, len), glowMat);
                glow.position.y = 0.01;
                m.add(glow);
                crack.add(m);
                segs.push({ m, d, lane, at: p.clone() });
                prev = p;
            }
        }
        const hit = new Set(), fell = new Set(); // (hurt once; thrown off the feet once)
        let t = 0;
        this.spells.push({
            life: length / SPEED + 8,
            onUpdate: (spell, dt) => {
                t += dt;
                const front = t * SPEED;
                for (const s of segs) {
                    if (s.d > front) continue;
                    s.m.scale.x = Math.min(1, s.m.scale.x + dt * 6);
                    // dust and stones jump where the wave passes now (every piece once, even on a slow frame)
                    if (!s.burst) {
                        s.burst = true;
                        const p = s.m.position;
                        for (let i = 0; i < (power > 1 ? 12 : 6); i++) {
                            this.fx.spark(_a.set(p.x + (Math.random() - 0.5) * half, p.y + 0.2, p.z + (Math.random() - 0.5) * half), [0x8a6a4a, 0x6b5440, 0xa38766][i % 3], 0.3 + Math.random() * 0.3 * power, _b.set((Math.random() - 0.5) * 3, 3 + Math.random() * 4 * power, (Math.random() - 0.5) * 3), 1.0);
                        }
                        // big rocks thrown out of the crack, and a cloud of dust along it
                        for (let i = 0; i < (power > 1 ? 4 : 2); i++) {
                            this.fx.spark(_a.set(p.x, p.y + 0.3, p.z), i % 2 ? 0x5a4a3c : 0x7d6a55, 0.55 + Math.random() * 0.35 * power, _b.copy(side).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3)).setY(5 + Math.random() * 3 * power), 1.4);
                        }
                        for (let i = 0; i < (power > 1 ? 5 : 3); i++) {
                            this.fx.glow?.spawn(p.x + (Math.random() - 0.5) * half, p.y + 0.4, p.z + (Math.random() - 0.5) * half, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0xb59a78, 0.9 + Math.random() * 0.8 * power, 1.4, { shrink: -0.4 });
                        }
                        // the ground really breaks along the crack (the host decides, everybody gets the blocks)
                        if (this.auth) this.hooks.quakeGround?.(s.at.x, s.at.z, power, s.lane >= 0 ? side : _b.copy(side).negate());
                    }
                }
                // Whatever the wave runs under falls down (once)
                if (front <= length + 1) {
                    const reached = (pos) => {
                        const to = _a.subVectors(pos, origin);
                        const along = to.dot(dir);
                        if (along < 0.5 || along > length || along > front) return false;
                        return Math.abs(to.dot(side)) < half;
                    };
                    if (this.auth) {
                        for (const z of this.zombies) {
                            if (z.isDead || hit.has(z)) continue;
                            if (!reached(z.group.position)) continue;
                            hit.add(z);
                            if (!this.hooks.creatures) {
                                z.stunTimer = Math.max(z.stunTimer || 0, power > 1 ? 4 : 2.5);
                                z.vy = Math.max(z.vy || 0, 4 + power * 2);
                            }
                            z.damageCooldown = 0;
                            this._damage(z, power > 1 ? 12 : 4, false, dir);
                        }
                        // the ground runs away under their feet: everything it runs under falls back against it
                        this.hooks.creatures?.(power > 1 ? 'EarthquakeMaxima' : 'Earthquake', casterId,
                            (pos) => (reached(pos) ? dir.clone().multiplyScalar(power > 1 ? -5 : -3) : null),
                            { skip: (c) => fell.has(c), each: (c) => fell.add(c) });
                    }
                    if (this.hooks.quakeMe && !hit.has('me')) {
                        if (this.hooks.quakeMe(casterId, origin, reached, power, dir)) hit.add('me');
                    }
                    // the ground shakes under whoever is near the running wave
                    this.hooks.quakeShake?.(_c.copy(origin).addScaledVector(dir, Math.min(front, length)), power, casterId);
                }
                // the crack fades away after a while
                const fade = t - length / SPEED - 5;
                if (fade > 0) { crackMat.opacity = Math.max(0, 0.95 - fade / 3); glowMat.opacity = Math.max(0, 0.7 - fade / 3); }
                else glowMat.opacity = 0.45 + Math.sin(t * 9) * 0.25;
            },
            onEnd: () => {
                this.scene.remove(crack);
                crack.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
                crackMat.dispose(); glowMat.dispose();
            },
        });
    }

    // ------------------------------------------------------------ Brainrot
    /**
     * «Брейнрот»: hypnotic rings roll out from a glowing spot above the
     * wizard's head towards the zombie (the length of `direction` = distance).
     */
    castBrainrot(origin, direction) {
        this._fx('fxBrainrot', origin, 1, 'playSapira');
        const dist = Math.max(2, direction.length());
        const dir = direction.clone().normalize();
        if (!this._ringGeo) this._ringGeo = new THREE.TorusGeometry(1, 0.09, 8, 40);
        const cols = [0xd65bff, 0xff5bd6, 0x8f5bff, 0x5bffd0];
        const rings = [];
        for (let i = 0; i < 9; i++) {
            const m = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            m.visible = false;
            this.scene.add(m);
            rings.push({ m, delay: i * 0.16 });
        }
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7bff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        orb.position.copy(origin);
        this.scene.add(orb);
        const SPEED = 11;
        let t = 0;
        this.spells.push({
            life: 0.16 * 9 + dist / SPEED + 0.3,
            onUpdate: (spell, dt) => {
                t += dt;
                orb.scale.setScalar(1 + Math.sin(t * 14) * 0.25);
                for (const r of rings) {
                    const lt = t - r.delay;
                    if (lt < 0) continue;
                    const d = lt * SPEED;
                    if (d > dist) { r.m.visible = false; continue; }
                    r.m.visible = true;
                    r.m.position.copy(origin).addScaledVector(dir, d);
                    r.m.scale.setScalar(0.35 + d * 0.09);
                    r.m.rotateZ(dt * 5);
                    r.m.material.opacity = 0.85 * (1 - d / dist * 0.6);
                }
            },
            onEnd: () => {
                for (const r of rings) { this.scene.remove(r.m); r.m.material.dispose(); }
                this.scene.remove(orb); orb.geometry.dispose(); orb.material.dispose();
            },
        });
    }

    // ---------------------------------------------------------------- Wind
    /**
     * «Вайнд»: a gust from the hand blows away whatever is in front — zombies,
     * players, loose things. Harmless. «Вайнд Максима» is 3× stronger and reaches further.
     */
    castWind(origin, direction, casterId, power = 1) {
        this._fx('fxWind', origin, power > 1 ? 0.8 : 1);
        const range = power > 1 ? 24 : 14;
        const cone = 0.65;
        const strength = 13 * power; // m/s at the hand (loose things)
        // creatures and players get twice that (the author: twice as strong on everyone it blows at) —
        // along the ground; the lift only a little more, so nobody is thrown up into the sky
        const body = (v) => v && v.clone().multiplyScalar(WIND_BODY_K).setY(v.y * 1.25);
        // Visible gust: pale swirling streaks flying out in a cone
        const n = power > 1 ? 70 : 35;
        for (let i = 0; i < n; i++) {
            const spread = _b.set((Math.random() - 0.5) * cone * 1.6, (Math.random() - 0.5) * cone * 1.2, (Math.random() - 0.5) * cone * 1.6);
            const v = _a.copy(direction).add(spread).normalize().multiplyScalar(range * (0.9 + Math.random() * 0.8));
            const start = _c.copy(origin).addScaledVector(direction, Math.random() * 1.5);
            this.fx.spark(start, Math.random() < 0.5 ? 0xe8f6ff : 0xbfe3ff, 0.18 + Math.random() * 0.25 * power, v, 0.7 + Math.random() * 0.3);
        }
        const push = (pos) => {
            const to = _a.subVectors(pos, origin);
            const dist = to.length();
            if (dist > range) return null;
            const dirTo = to.normalize();
            if (dist > 2.5 && direction.angleTo(dirTo) > cone) return null;
            if (dist <= 2.5 && direction.dot(dirTo) < 0) return null;
            const k = strength * (1 - 0.6 * dist / range);
            return _b.copy(direction).lerp(dirTo, 0.5).setY(0).normalize().multiplyScalar(k).setY(k * 0.35);
        };
        // Creatures (moved where they are simulated): a stagger across the cone, off the feet point-blank
        if (this.auth && this.hooks.creatures) this.hooks.creatures(power > 1 ? 'WindMaxima' : 'Wind', casterId, (pos) => body(push(pos)), { from: origin });
        else if (this.auth) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                const v = body(push(_c.copy(z.group.position).add(UP)));
                if (!v) continue;
                z.windVel = (z.windVel || new THREE.Vector3()).add(v.clone().setY(0));
                z.vy = Math.max(z.vy || 0, v.y);
            }
        }
        // Loose things (where their physics runs)
        for (const w of this.hooks.weapons ? this.hooks.weapons() : []) {
            if (w.holder || w.remoteTarget) continue;
            const v = push(w.position);
            if (!v) continue;
            w.hover = null;
            w.wake();
            w.velocity.add(v);
            w.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }
        // Me, if another wizard blew at me (every machine moves its own player)
        if (this.hooks.blowMe) this.hooks.blowMe(casterId, origin, (pos) => body(push(pos)), power > 1 ? 'WindMaxima' : 'Wind');
        // Ships: the wind fills the sails it reaches (src/game/Ships.js)
        this.hooks.windShips?.(origin, direction, power, casterId);
        // Doors: the gust swings the leaves it reaches (every computer the same — Doors.blow; a locked one only rattles)
        this.hooks.doors?.((p) => push(p), origin);
    }

    // ---------------------------------------------------------- Wind Impulse
    /**
     * «Wind Impulse» («… Maxima»): the wand raised up — a ring of air bursts out of the caster in
     * every direction (no ball, no ray): everybody and everything within 3 m (9 m) is pushed away
     * from them. Never hurts by itself. What it does to whom: WindImpulse.js (IMPULSE_TARGETS).
     * `origin`: the caster's body.
     */
    castImpulse(name, origin, casterId) {
        const P = IMPULSE[name];
        const max = name === 'WindImpulseMaxima';
        this._fx('fxWind', origin, max ? 0.7 : 1.2);
        // the visible wave of air: a pale shell and a ring on the ground rushing out, streaks of air
        if (!this._impGeo) { this._impGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true); this._impRing = new THREE.RingGeometry(0.86, 1, 48); }
        const shellMat = new THREE.MeshBasicMaterial({ color: 0xe4f4ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const shell = new THREE.Mesh(this._impGeo, shellMat);
        const ring = new THREE.Mesh(this._impRing, ringMat);
        ring.rotation.x = -Math.PI / 2;
        const ground = this.hooks.collision ? this.hooks.collision.surfaceY(origin.x, origin.z) : origin.y - 1.5;
        shell.position.set(origin.x, (origin.y + ground) / 2 + 0.3, origin.z);
        ring.position.set(origin.x, ground + 0.06, origin.z);
        this.scene.add(shell); this.scene.add(ring);
        const H = Math.max(1.6, origin.y - ground + 1.2) * (max ? 1.4 : 1);
        const n = max ? 90 : 40;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
            const v = _a.set(Math.cos(a), (Math.random() - 0.3) * 0.25, Math.sin(a)).multiplyScalar(P.r * (2.2 + Math.random()));
            this.fx.spark(_c.set(origin.x, ground + 0.2 + Math.random() * H, origin.z), Math.random() < 0.5 ? 0xe8f6ff : 0xbfe3ff, 0.12 + Math.random() * 0.15, v, 0.4 + Math.random() * 0.15);
        }
        for (let i = 0; i < (max ? 18 : 8); i++) { // (dust thrown off the ground at the ring's edge)
            const a = Math.random() * Math.PI * 2;
            this.fx.glow?.spawn(origin.x + Math.cos(a) * 0.6, ground + 0.2, origin.z + Math.sin(a) * 0.6, Math.cos(a) * P.r * 1.6, 0.4, Math.sin(a) * P.r * 1.6, 0xd8cdb8, 0.5 + Math.random() * 0.4, 0.6, { shrink: -0.6 });
        }
        let t = 0;
        const T = max ? 0.55 : 0.35;
        this.spells.push({
            life: T,
            onUpdate: (spell, dt) => {
                t += dt;
                const k = Math.min(1, t / T), r = 0.4 + (P.r + 0.6) * Math.sqrt(k);
                shell.scale.set(r, H * (1 - 0.4 * k), r);
                ring.scale.setScalar(r);
                shellMat.opacity = 0.32 * (1 - k);
                ringMat.opacity = 0.55 * (1 - k);
            },
            onEnd: () => { this.scene.remove(shell); this.scene.remove(ring); shellMat.dispose(); ringMat.dispose(); },
        });
        const push = (pos) => impulsePush(name, origin, pos);
        // creatures (where they are simulated): pushed away; whoever flies off a ledge is watched till it lands
        if (this.auth && this.hooks.creatures) {
            this.hooks.creatures(name, casterId, (pos) => { const v = push(pos); return v && v.clone(); },
                { from: origin, fly: true, each: (c, ck, res) => { if (res !== 'none') this.hooks.fallWatch?.(ck, c, casterId); } });
        } else if (this.auth) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                const v = push(_c.copy(z.group.position).add(UP));
                if (!v) continue;
                z.windVel = (z.windVel || new THREE.Vector3()).add(v.clone().setY(0));
                z.vy = Math.max(z.vy || 0, v.y);
            }
        }
        // loose things (where their physics runs), book-birds, doors
        for (const w of this.hooks.weapons ? this.hooks.weapons() : []) {
            if (w.holder || w.remoteTarget) continue;
            const v = push(w.position);
            if (!v) continue;
            w.hover = null;
            w.wake();
            w.velocity.addScaledVector(v, 0.7);
            w.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }
        this.hooks.impulseWorld?.(name, origin, P.r, push, casterId);
        // doors: the wave swings the leaves it reaches, away from the caster (Doors.blow; a locked one only rattles)
        this.hooks.doors?.((p) => push(p), origin);
        // me, if another wizard's wave reached me (every machine moves its own player)
        if (this.hooks.blowMe) this.hooks.blowMe(casterId, origin, (pos) => { const v = push(pos); return v && v.clone(); }, name);
    }

    // ------------------------------------------------------------- Overgrown
    /**
     * «Overgrown»: whoever the hand points at — one creature or a crowd — is thrown apart, to the
     * sides of the spell's line and up. Never hurts by itself (a fall from up high does).
     * «Overgrown Максима» is twice as strong.
     */
    castOvergrown(name, origin, direction, casterId) {
        const power = name === 'OvergrownMaxima' ? 2 : 1;
        const range = overgrownRange(name);
        this._fx('fxGrow', origin, power > 1 ? 0.8 : 1);
        // a green burst at the hand and a ring-wave rolling out to the target, opening sideways
        for (let i = 0; i < 14 * power; i++) {
            const v = _a.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(4).addScaledVector(direction, 2);
            this.fx.spark(_c.copy(origin), Math.random() < 0.5 ? 0x9cff7a : 0xd8ffb0, 0.15 + Math.random() * 0.15, v, 0.4 + Math.random() * 0.2);
        }
        const side = _b.set(-direction.z, 0, direction.x);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        const n = 26 * power;
        for (let i = 0; i < n; i++) {
            const along = 1 + Math.random() * range * 0.9;
            const sgn = i % 2 ? 1 : -1;
            const start = _c.copy(origin).addScaledVector(direction, along * 0.15);
            const v = _a.copy(direction).multiplyScalar(along).addScaledVector(side, sgn * (1 + Math.random() * 3) * power);
            v.y += 2 + Math.random() * 2 * power;
            this.fx.spark(start, i % 3 ? 0x7be35a : 0xe8ffd0, 0.18 + Math.random() * 0.2, v, 0.8 + Math.random() * 0.3);
        }
        const push = (pos) => overgrownPush(name, origin, direction, pos);
        // Creatures (where they are simulated): thrown apart; whoever flies off a ledge is watched till it lands
        if (this.auth && this.hooks.creatures) {
            this.hooks.creatures(name, casterId, (pos) => { const v = push(pos); return v && v.clone(); },
                { from: origin, fly: true, each: (c, ck, res) => { if (res !== 'none') this.hooks.fallWatch?.(ck, c, casterId); } });
            this.hooks.scatterCrew?.(origin, (pos) => push(pos), casterId);
        }
        // Loose things (where their physics runs)
        for (const w of this.hooks.weapons ? this.hooks.weapons() : []) {
            if (w.holder || w.remoteTarget) continue;
            const v = push(w.position);
            if (!v) continue;
            w.hover = null;
            w.wake();
            w.velocity.add(v);
        }
        // Me, if another wizard pointed it at me (every machine moves its own player)
        if (this.hooks.blowMe) this.hooks.blowMe(casterId, origin, (pos) => push(pos), name);
        // Doors: the burst shoves a leaf onward, along the pointing (not to the side: a leaf turns only round its hinges)
        this.hooks.doors?.((p) => { const v = push(p); return v && _c.copy(direction).setY(0).normalize().multiplyScalar(Math.hypot(v.x, v.z)); }, origin);
    }

    // --------------------------------------------------------------- Sands
    castSands(origin, direction, casterId) {
        this._sound('playWhoosh');
        const players = this._players(casterId);
        const ball = this._takeBall(this.sandBalls);
        ball.position.copy(origin);
        const velocity = direction.clone().multiplyScalar(25.0);
        const sanded = new Set();
        this.spells.push({
            life: 3.0,
            onUpdate: (spell, dt) => {
                ball.position.addScaledVector(velocity, dt);
                ball.rotation.x += dt * 5;
                ball.rotation.y += dt * 5;
                if (Math.random() > 0.5) {
                    this.fx.spark(ball.position, 0xd2b48c, 0.2, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
                }
                for (const z of this.zombies) {
                    if (z.isDead) continue;
                    _a.copy(z.group.position); _a.y += 1.2;
                    if (ball.position.distanceTo(_a) < 1.5) {
                        if (this.auth && this.hooks.sand) this.hooks.sand(z);
                        for (let k = 0; k < 20; k++) {
                            this.fx.spark(ball.position, 0xd2b48c, 0.4, _b.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                        }
                        spell.life = 0;
                        return;
                    }
                }
                // people and animals: sand in the face — they reel back
                if (this.auth && this.hooks.creatures) {
                    const n = this.hooks.creatures('Sands', casterId, (pos) => (ball.position.distanceTo(pos) < 1.8 ? velocity.clone().setY(0).normalize().multiplyScalar(5) : null),
                        { kinds: ['v', 'a'], from: origin, skip: (c) => sanded.has(c), each: (c) => sanded.add(c) });
                    if (n) {
                        for (let k = 0; k < 20; k++) this.fx.spark(ball.position, 0xd2b48c, 0.4, _b.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                        spell.life = 0;
                        return;
                    }
                }
                for (const p of players) {
                    if (ball.position.distanceTo(p.center()) >= 1.5) continue;
                    if (p.blocks(origin)) {
                        // Bounces off the shield
                        velocity.multiplyScalar(-0.8);
                        ball.position.addScaledVector(velocity, dt * 2);
                        p.hit('Sands', origin);
                        continue;
                    }
                    if (p.local) p.hit('Sands', origin);
                    for (let k = 0; k < 20; k++) {
                        this.fx.spark(ball.position, 0xd2b48c, 0.4, _b.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                    }
                    spell.life = 0;
                    return;
                }
                if (ball.position.distanceTo(origin) > 20) spell.life = 0;
            },
            onEnd: () => this._freeBall(ball),
        });
    }

    // ----------------------------------------------------------------- Ice
    castIce(origin, direction, handSide, casterId) {
        let target = null, minDist = Infinity;
        for (const z of this.zombies) {
            if (z.isDead || z.isFrozen) continue;
            _a.copy(z.group.position); _a.y += 1.2;
            _a.sub(origin);
            const dist = _a.length();
            if (dist > 20) continue;
            if (direction.angleTo(_a.normalize()) < 0.4 && dist < minDist) { minDist = dist; target = z; }
        }
        // Players can be frozen too (Свободный мир)
        let player = null;
        for (const p of this._players(casterId)) {
            _a.subVectors(p.center(), origin);
            const dist = _a.length();
            if (dist > 20) continue;
            if (direction.angleTo(_a.normalize()) < 0.4 && dist < minDist) { minDist = dist; player = p; target = null; }
        }
        if (player) { this._icePlayer(origin, direction, handSide, casterId, player); return; }
        if (!target) {
            this.fx.straightBeam(origin, _a.copy(origin).addScaledVector(direction, 20), 0.4, 0x88ffff, 0.5, 0.5);
            return;
        }
        this._sound('playIce');
        const beam = this.fx.acquireIceBeam();
        const initialDir = direction.clone();
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), dir = new THREE.Vector3();
        this.spells.push({
            life: 5.0,
            held: true, by: casterId,
            onUpdate: (spell, dt) => {
                if (target.isDead) { spell.life = 0; return; }
                p2.copy(target.group.position); p2.y += 1.2;
                const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                if (live) { p0.copy(live.origin); dir.copy(live.dir); } else { p0.copy(origin); dir.copy(initialDir); }
                // Beam breaks if the hand turns away more than ~25° from where it was cast
                if (dir.angleTo(initialDir) > 0.45) { spell.life = 0; return; }
                const dist = p0.distanceTo(p2);
                p1.copy(p0).addScaledVector(dir, dist * 0.5);
                if (beam) beam.setCurve(p0, p1, p2);
                if (this.auth && this.hooks.chill) this.hooks.chill(target, (1.0 / 5.0) * dt);
                if (Math.random() > 0.5) {
                    this.fx.spark(p2, 0xaaddff, 0.4, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
                }
            },
            onEnd: () => this.fx.releaseIceBeam(beam),
        });
    }

    /** Ice beam on a player: freezes in 5 s, breaks when they run out of it or a shield stops it. */
    _icePlayer(origin, direction, handSide, casterId, player) {
        this._sound('playIce');
        const beam = this.fx.acquireIceBeam();
        const initialDir = direction.clone();
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), dir = new THREE.Vector3();
        this.spells.push({
            life: 5.5,
            held: true, by: casterId,
            onUpdate: (spell, dt) => {
                p2.copy(player.center());
                const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                if (live) { p0.copy(live.origin); dir.copy(live.dir); } else { p0.copy(origin); dir.copy(initialDir); }
                if (dir.angleTo(initialDir) > 0.45) { spell.life = 0; return; }
                // The target got away: out of the beam's reach or direction
                const to = _a.subVectors(p2, p0);
                if (to.length() > 24 || dir.angleTo(to.normalize()) > 0.55) { spell.life = 0; return; }
                const dist = p0.distanceTo(p2);
                p1.copy(p0).addScaledVector(dir, dist * 0.5);
                if (beam) beam.setCurve(p0, p1, p2);
                if (player.local && !player.chill(dt / 5, p0)) { spell.life = 0; return; }
                if (!player.local && player.blocks(p0)) { spell.life = 0; return; }
                if (Math.random() > 0.5) this.fx.spark(p2, 0xaaddff, 0.4, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
            },
            onEnd: () => this.fx.releaseIceBeam(beam),
        });
    }

    // ---------------------------------------------------- Breakthrough's wall
    /** The wall shoots up out of the ground at `center` (across `dir`): whoever stands on it is thrown back. */
    castWallRise(center, dir, casterId, max) {
        dir = dir.clone().setY(0);
        if (dir.lengthSq() < 1e-6) return;
        dir.normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x), width = max ? 9 : 5;
        const push = (p) => {
            const to = new THREE.Vector3(p.x - center.x, 0, p.z - center.z);
            if (Math.abs(to.dot(side)) > width / 2 + 1 || Math.abs(to.dot(dir)) > 1.6) return null;
            return dir.clone().multiplyScalar(max ? 12 : 8).setY(max ? 8 : 6);
        };
        const name = max ? 'WallRiseMaxima' : 'WallRise';
        this._fx('fxStone', center, max ? 0.85 : 1);
        if (this.auth && this.hooks.creatures) this.hooks.creatures(name, casterId, push);
        else if (this.auth) {
            for (const z of this.zombies) {
                if (z.isDead) continue;
                const v = push(z.group.position);
                if (v) { z.windVel = (z.windVel || new THREE.Vector3()).add(v.clone().setY(0)); z.vy = Math.max(z.vy || 0, v.y); }
            }
        }
        if (this.hooks.blowMe) this.hooks.blowMe(casterId, center, push, name);
    }

    // -------------------------------------------------------------- Sapira
    castSapira(origin, direction, casterId) {
        this._sound('playSapira');
        const len = 100;
        const end = _a.copy(origin).addScaledVector(direction, len);
        this.fx.straightBeam(origin, end, 0.2, 0x000000, 1.0, 1.5, (s) => { s.mesh.material.opacity = 1; });
        this.fx.straightBeam(origin, end, 0.6, 0x9b59b6, 0.5, 1.5, (s) => {
            const scale = 1 + Math.sin(s.life * 10) * 0.5;
            s.mesh.scale.x = 0.6 * scale;
            s.mesh.scale.z = 0.6 * scale;
        }, THREE.AdditiveBlending);
        for (const z of this.zombies) {
            if (z.isDead) continue;
            _b.copy(z.group.position); _b.y += 1.2;
            _c.subVectors(_b, origin);
            const proj = _c.dot(direction);
            if (proj < 0 || proj > len) continue;
            _c.copy(origin).addScaledVector(direction, proj);
            if (_c.distanceTo(_b) < 1.5) this._damage(z, 10, true, direction);
        }
        // the beam's charge throws whoever it goes through off their feet
        if (this.auth) this.hooks.creatures?.('Sapira', casterId, (pos) => {
            const to = new THREE.Vector3().subVectors(pos, origin), proj = to.dot(direction);
            if (proj < 0 || proj > len || origin.clone().addScaledVector(direction, proj).distanceTo(pos) > 1.8) return null;
            return direction.clone().setY(0).normalize().multiplyScalar(12);
        }, { from: origin });
        for (const p of this._players(casterId)) {
            if (!p.local) continue;
            _b.copy(p.center());
            _c.subVectors(_b, origin);
            const proj = _c.dot(direction);
            if (proj < 0 || proj > len) continue;
            _c.copy(origin).addScaledVector(direction, proj);
            if (_c.distanceTo(_b) < 1.5) p.hit('Sapira', origin);
        }
    }

    // ------------------------------------------------------------ Bombardo
    castBombardo(origin, direction, casterId, power = 1) {
        const maxima = power > 1;
        this._sound('playBombardoCast');
        const orb = this._takeBall(this.orbs);
        const size = maxima ? 2.3 : 1;
        orb.scale.setScalar(size);
        orb.position.copy(origin).addScaledVector(direction, 0.8 * size);
        // (the orb shows a little ahead of the hand — whatever stands in that gap is touched first: below)
        let gapFrom = origin.clone();
        const vel = direction.clone().multiplyScalar(maxima ? 27 : 32);
        const gravity = maxima ? 3.5 : 6;
        const radius = bombardoRadius(power);
        const hitR2 = 1.3 * size * size;
        const prev = new THREE.Vector3();
        const collision = this.hooks.collision;
        if (maxima) this.fx.castBurst(origin, direction);
        const handOrigin = origin.clone();
        const players = this._players(casterId);
        let age = 0;
        let exploded = false;
        const explodeAt = (p) => {
            if (exploded) return;
            exploded = true;
            this.hooks.success?.(casterId, maxima ? 'BombardoMaxima' : 'Bombardo'); // (mana: it went off)
            if (this.auth && this.hooks.explode) this.hooks.explode(p.clone(), radius, casterId, power);
            else this.fx.lightFlash(p, 0xffaa55, 2 * size, 0.15, 20 * size); // client: real blast arrives from the host
        };
        this.spells.push({
            life: maxima ? 3.2 : 2.6,
            onUpdate: (spell, dt) => {
                // first frame: the way from the hand to where the orb appeared (a wall or a knight right before the hand)
                if (gapFrom) { prev.copy(gapFrom); gapFrom = null; } else prev.copy(orb.position);
                age += dt;
                vel.y -= gravity * dt;
                orb.position.addScaledVector(vel, dt);
                orb.rotation.y += dt * 8;
                // Trail
                const trail = maxima ? 8 : 3;
                for (let k = 0; k < trail; k++) {
                    const j = maxima ? 4 : 2;
                    this.fx.glow.spawn(orb.position.x, orb.position.y, orb.position.z,
                        (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j,
                        k === 0 ? 0xffd27a : (maxima && k % 3 === 1 ? 0xff2a00 : 0xff6a00), (0.35 + Math.random() * 0.3) * (maxima ? 2 : 1), maxima ? 0.45 : 0.3, { shrink: 2.0 });
                }
                // Maxima: magic keeps pouring out of the hand for a moment
                if (maxima && age < 0.45) {
                    for (let k = 0; k < 5; k++) {
                        const sp = 14 + Math.random() * 16;
                        this.fx.glow.spawn(handOrigin.x, handOrigin.y, handOrigin.z,
                            direction.x * sp + (Math.random() - 0.5) * 4, direction.y * sp + (Math.random() - 0.5) * 4, direction.z * sp + (Math.random() - 0.5) * 4,
                            Math.random() < 0.4 ? 0xffffff : 0xffa030, 0.3 + Math.random() * 0.4, 0.25 + Math.random() * 0.2, { shrink: 2.5 });
                    }
                }
                // Terrain (voxel DDA between last and current position)
                const terrain = this.hooks.terrain ? this.hooks.terrain() : null;
                const step = _a.subVectors(orb.position, prev);
                const stepLen = step.length();
                if (terrain && stepLen > 0) {
                    const hit = terrain.raycast(prev, step.clone().divideScalar(stepLen), stepLen);
                    if (hit) { explodeAt(_b.set(hit.x, hit.y, hit.z)); spell.life = 0; return; }
                }
                // a house's sphere: the orb bursts on it, outside
                const wh = this.hooks.wardHit?.(prev, orb.position);
                if (wh) { explodeAt(wh); spell.life = 0; return; }
                // Walls / tables / trees / floor
                if (collision && collision.pointBlocked(orb.position.x, orb.position.y, orb.position.z)) {
                    explodeAt(prev); spell.life = 0; return;
                }
                // a tree's crown: the orb bursts in the leaves (not through them, 50 m on)
                if (this.hooks.leavesAt?.(orb.position.x, orb.position.y, orb.position.z)) {
                    explodeAt(orb.position); spell.life = 0; return;
                }
                // every creature on this step's way (knights, villagers, animals, sailors, trees, the spider…:
                // Duel.touchOnWay) — not only zombies; and touched along the whole move, not only where it ended
                const bh = this.hooks.bodyOnWay?.(prev, orb.position, casterId);
                if (bh) { explodeAt(bh); spell.life = 0; return; }
                // Players: a shield sends the orb back, otherwise it blows up on them
                for (const p of players) {
                    const pc = p.center();
                    if (orb.position.distanceTo(pc) > 1.2 + size * 0.45) continue;
                    if (p.blocks(origin)) {
                        _a.subVectors(orb.position, pc).normalize();
                        vel.reflect(_a).multiplyScalar(0.9);
                        orb.position.copy(pc).addScaledVector(_a, 1.4 + size * 0.5);
                        p.hit('Bounce', origin);
                        continue;
                    }
                    explodeAt(orb.position); spell.life = 0; return;
                }
                // Zombies
                for (const z of this.zombies) {
                    if (z.isDead) continue;
                    const zp = z.group.position;
                    const dx = orb.position.x - zp.x, dz = orb.position.z - zp.z;
                    if (dx * dx + dz * dz < hitR2 && orb.position.y > zp.y - 1 - size && orb.position.y < zp.y + 3 + size) {
                        explodeAt(orb.position); spell.life = 0; return;
                    }
                }
            },
            onEnd: (spell) => {
                if (!exploded) explodeAt(orb.position); // fizzles out with a bang at max range
                this._freeBall(orb);
            },
        });
    }
}
