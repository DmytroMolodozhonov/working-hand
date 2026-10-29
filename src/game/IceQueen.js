/**
 * IceQueen.js — the Ice Castle's life (the castle itself: src/world/IceCastle.js): the Ice Queen in
 * her throne hall, the evil snowmen round her palace, the two ice monsters at its gates, the ice
 * gates, the chandelier, the fire that melts it all — and the Ice Rod she drops.
 *
 * The author: «Ледяная Королева: 350 HP, красивый белоснежный наряд, примерно в полтора раза выше
 * обычного жителя, использует свой ледяной посох. Многие простейшие заклинания на ней не
 * работают — те, что даются без свитка, — кроме огня: к огню она уязвима, так же как и её замок;
 * чем сильнее огненное заклятие, тем сильнее урон. Жезлом она управляет снеговиками… Злые снеговики
 * ходят рядом с её замком, по 10 HP, их много; кидаются снежинками, одна снежинка −1 HP. Два ледяных
 * монстра — житель, увеличенный в два раза, горбатые, полностью изо льда; защищают её замок и
 * никого не пускают.» The Ice Rod: «просто крикнуть «Frozen» — и кто-то заморозится… даже если на нём
 * магические доспехи. Если «Frozen» сказано не на существо — можно прямо лёд создавать».
 *
 * Who decides (multiplayer): the host runs the creatures (their minds, their bodies, their hp) and
 * sends their state 10 times a second; their shots fly the same on every computer and each player's
 * own computer decides what hits him (his shield, his health). Players' blows and spells on them go to
 * the host. The queen's death, the monsters' and the palace's melted ice are saved with the world
 * (the ice as block edits); the rod is a thing (Items) — whoever has it, has it.
 *
 * «Кто/что × как действует» — ICE_TARGETS below (what hurts the queen, the monsters, the snowmen;
 * what the Ice Rod's «Frozen» does to every creature and thing; what melts the palace).
 */

import { confusedMiss } from './StrongSpells.js';
import * as THREE from 'three';
import { crowdStep } from './CrowdSources.js';
import { FACE, facesTarget, turnToward, yawTo } from './FaceTarget.js';
import { FarShape } from '../core/FarShape.js';
import { iceQueenModel, snowmanModel, friendSnowmanModel, puddleModel, iceMonsterModel, snowflakeShotModel, shardModel, iceSpikeModel, ICE_MATERIALS, ROD_TIP, FRIEND_H } from './IceModels.js';
import { iceYaw, iceLocal, PALACE_ICE, inIcePalace } from '../world/IceCastle.js';
import { IceFixtures, GATE } from './IceFixtures.js';
import { BLOCK, isPalaceIce, isSolid } from '../world/Terrain.js';
import { newUid } from './ItemTypes.js';
import { segmentSegmentDistSq } from '../core/math.js';
import { creditKill, GOD_SPELLS, hellKilled } from './Mana.js';
import { shieldHitCost } from './Combat.js';
import { hitBody } from './MagicWave.js';
import { registerKind } from './CreatureImpact.js';
import { SpeechBubble } from '../ui/SpeechBubble.js';
import { Chest } from '../entities/Chest.js';
import { MELT, meltStats, meltStage, applyFire, QUEEN_AI, rangeBand, mayFreeze, chargeOn, bladeGrow, freezeSeconds } from './IceGiants.js';
export { QUEEN_VS, MELT_STEPS } from './IceGiants.js'; // (the tables of the fight: «кто/что × как действует»)

export const ICE = {
    ACTIVE: 220, // m from the castle: a player this near wakes it (its creatures come out)
    SLEEP: 300, // …and when every player is this far, they go to rest (their state kept)
    QUEEN: { HP: 350, S: 1.5, H: 7.0, R: 1.0, SPEED: 2.6, TURN: 2.4, SIGHT: 55, LEASH: 75, CAST: 3.0, REACH: 34 },
    SNOW: { HP: 10, H: 3.0, R: 0.85, SPEED: 3.3, TURN: 5, MAX: 14, RESPAWN: 16, THROW: 2.4, RANGE: 26, SIGHT: 34, ROAM: 48,
        DMG: 1, // (only against ANOTHER evil snowman — the rod's war; the snowball hurts nobody else)
        PUSH: 4 }, // m/s: the snowball only shoves, ≈ 1 m back (friction 4/s); no damage, no wear — it is there to get in the way
    MONSTER: { HP: 180, S: 2, H: 7.6, R: 1.6, SPEED: 3.4, TURN: 1.8, PUNCH: 14, REACH: 4.6, BOULDER: 10, GUARD: 28, LEASH: 36, RESPAWN: 1200 },
    // the friendly snowman of the spell «Snowman» (nobody's: it only wanders and fears the heat)
    FRIEND: { HP: 10, H: FRIEND_H, R: 0.65, SPEED: 1.2, TURN: 3, MAX: 12, BUILD: 3.6, RANGE: 16, ROAM: 12, FLEE: 13, MELT: 4.5, MELT_DPS: 1.6, FLEE_K: 2.4, AWAKE: 150 },
    ROD: { FREEZE_T: 10, CREATURE_T: 12, RANGE: 45, LAYER: 2.3, LAYERS: 6, FOLLOW: 38, AIM: 1.2 },
    // the castle attacked from afar (a blast, fire, lightning on its ice — the author: «её подданные могут спуститься и
    // напасть на обидчика, защищая замок»): the snowmen and the monsters go out after whoever did it — this far, this long
    DEFEND: { R: 240, T: 120 }, // (R: past ICE.ACTIVE — from wherever the castle is awake)
    G: 14, // the shots' gravity
    // a giant in the castle (the monster of the pentagram, a dragon under its rider, a mind in a great creature): the queen and her people
    // see it by its edge from far, cannot lose it behind a wall, and the whole castle goes out against it; the rod's ice takes it —
    // the longer the wind-up and the ice, the greater it is (the queen's always works — the author: «посох может кого угодно»)
    GIANT: { SIZE: 2.5, RIDER_R: 5, RIDER_H: 12, SEE: 140, WIND_K: 0.18, WIND_MAX: 2.4, WATCH: 0.5, GREET: 12 },
};

/** Fire and how strong each kind is on the ice (the author: «чем сильнее огненное заклятие, тем сильнее урон»). */
export const FIRE_K = { fire: 1.5, burn: 1.5, Fire: 1.5, Campfire: 1.5, Inferno: 2, FireMaxima: 2.5, Hellfire: 3.5, heat: 0.5, dragonFire: 2.5, phoenixFire: 1.5, torch: 1 };
/**
 * Every cold kind of harm — ice, frost, snow, the rod, frozen water (the author: «у Ледяной Королевы
 * иммунитет к холоду и к холодным заклинаниям любого вида»). One list for every place where cold acts on
 * a creature: on the queen (and her monsters, and every snowman) none of them does anything — no damage,
 * no freezing, no ice round her, no slowing (Duel, WaterMagic, WaterVortex, WaterStorm, the rod…).
 */
export const COLD_KINDS = new Set(['Ice', 'IceDuel', 'IceBall', 'Frozen', 'RodFrozen', 'RodIce', 'cold', 'chill', 'snow', 'ice', 'frost', 'freeze',
    'FrozenWater', 'WaterFrozen', 'VortexIce', 'StormIce', 'IceTrap', 'IceBridge', 'IceWall', 'IceCastle', 'IceDuelMaxima', 'IceMaxima', 'iceBite']); // («Айс Максима» = «Frozen Maxima»: cold too)
/** Is `kind` (a spell, a harm) cold? */
export const isCold = (kind) => COLD_KINDS.has(kind);
/** Does the cold not touch this creature (the queen, her monsters, every snowman — they are ice themselves)? */
export const coldProof = (c) => !!c && (c.isIce === true || c.type === 'queen' || c.ck === 'I');
/** The small snow folk: the queen's evil snowmen and the friendly ones of «Snowman» (thrown about, a blow scatters them). */
const small = (type) => type === 'snowman' || type === 'friend';
/** The spells only a scroll (or a spell book) teaches: they act on the queen as on anyone. */
export const SCROLL_KINDS = new Set(['Lightning', 'LightningStrike', 'Thunderwave', 'ToTheSun', 'AvadaKedavra', 'TotalDestruction', 'TotalDestructionMaxima', 'LetItRain',
    'BombardoMaxima', 'Inspirius', 'LevitationMaxima', 'WindImpulse', 'WindImpulseMaxima', 'Invisibility', 'OvergrownMaxima', 'AlohomoraMaxima', 'FirefightingMaxima',
    'Alive', 'AliveMaxima', 'servant', 'CreateHouse', 'ImproveHouse', 'CreateCastle', 'DivineCreation', 'WaterVortexSuperMaxima', 'Boom',
    'Accentric', 'Pilbidrio', 'Electrum', 'Die']); // (the strong duel spells — StrongSpells.js: scrolls; «Дай» kills her outright) // («Бум» — not cold: on the queen as on anyone)
/** Not magic at all: blows, arrows, a cauldron bursting, a house's sphere shoving. */
const PLAIN = { melee: 1, arrow: 1, fist: 1, punch: 1, Cauldron: 1, Ward: 1, fall: 1, crush: 1, snow: 1, Liquidation: 0 };

/**
 * How much of `dmg` of `kind` the ice creature `type` takes ('queen' | 'monster' | 'snowman').
 * The queen: fire ×FIRE_K, the scroll spells as they are, blades and arrows as they are, a fist a
 * third; every spell known without a scroll — nothing. The monsters: the same, but a blade or an
 * arrow only chips ice (half), a fist hurts the fist, a blast cracks them (half). The snowmen: everything
 * (a blast shatters them, fire melts them at once); ice, cold and the rod — nothing on any of them.
 */
export function iceDamage(type, kind, dmg) {
    if (!(dmg > 0)) return 0;
    // cold: nothing (only an evil snowman's snowball breaks another evil snowman — the rod's war)
    if (COLD_KINDS.has(kind) && !(kind === 'snow' && type === 'snowman')) return 0;
    // a spell of the gods (the scrolls of their library — «Бум», «Planet Liquidation»…): every boss is open to it
    if (GOD_SPELLS.has(kind)) return dmg;
    const fire = FIRE_K[kind];
    if (small(type)) {
        if (fire) return dmg * fire * 2;
        if (kind === 'Bombardo' || kind === 'BombardoMaxima' || kind === 'Lightning') return dmg * 3;
        return dmg;
    }
    if (fire) return dmg * fire;
    if (SCROLL_KINDS.has(kind)) return dmg;
    if (kind in PLAIN) {
        const k = PLAIN[kind];
        if (type === 'monster') return dmg * (kind === 'fist' || kind === 'punch' ? 0.15 : kind === 'melee' || kind === 'arrow' ? 0.5 : k);
        return dmg * (kind === 'fist' || kind === 'punch' ? 0.33 : k);
    }
    // every other spell is one known without a scroll: the queen doesn't feel it; a monster's ice
    // only cracks under a blast
    if (type === 'monster' && (kind === 'Bombardo' || kind === 'Cauldron')) return dmg * 0.5;
    return 0;
}

/** A duel charge on an ice creature: what it takes (and whether it is stunned). */
export function iceBolt(type, spell) {
    if (COLD_KINDS.has(spell)) return { dmg: 0 }; // («Айс», «Frozen»: ice on ice — no harm, no stun, no freezing)
    if (spell === 'AvadaKedavra') return { dmg: 25 }; // (a scroll's curse: −25 on anyone)
    if (!small(type)) return { dmg: 0 }; // (the queen and her monsters: the simple duel magic does nothing)
    if (spell === 'Stupefy') return { dmg: 0, stun: 4 };
    if (spell === 'SapiraDuel') return { dmg: 10 };
    if (spell === 'SandsDuel') return { dmg: 3 };
    return { dmg: 2, stun: 1 };
}

/**
 * «Кто/что × как действует» (CLAUDE.md): the Ice Castle's creatures, the Ice Rod's «Frozen», the palace.
 */
export const ICE_TARGETS = {
    // ---- what acts on the queen / the monsters / the snowmen
    fire: { does: 'damage', why: 'огонь — их слабость: «Инферно» ×2, «Fire Maxima» ×2,5, «Адский огонь» ×3,5 (снеговик тает сразу); замок тоже тает' },
    melt: { does: 'shrink', why: 'ледяные великаны и злые снеговики ТАЮТ от огня (Инферно, Fire, Fire Maxima, огонь дракона, «Адский огонь» вдвое сильнее Инферно): с каждым попаданием меньше (до 30 % роста) и слабее бьют (урон, досягаемость, шаг — IceGiants.MELT_STEPS); убить огнём можно только когда он уже наименьший; размер идёт хосту и в снапшот, на коллизию и ходьбу (радиус, рост); Королева не тает — огонь на неё действует уроном' },
    queenVsPlayer: { does: 'see QUEEN_VS', why: 'удары Королевы по игроку: «Protection» и «Protection Maxima» держат всё (заморозка, льдины, шипы, вьюга, клинок — IceGiants.QUEEN_VS); магическая мантия и доспехи не держат, но платят запасом прочности и укорачивают заморозку' },
    scrollSpells: { does: 'damage', why: 'заклинания со свитка (молния, «Авада Кедавра» −25, «Тотальное разрушение», «Inspirius», «Бомбардо Максима»…) действуют как на всех' },
    plainSpells: { does: 'none', why: 'простые заклинания без свитка (Бомбардо, Сапира, Остолбеней, Айс, Джолт, Вайнд, вода…) на королеву не действуют — иней гасит их; монстра Бомбардо лишь трескает (½); снеговиков бьёт всё' },
    blade: { does: 'damage', why: 'меч и топор: королеве — полный урон, монстру — половина (лёд крошится), снеговику — полный' },
    arrow: { does: 'damage', why: 'стрелы — как клинок' },
    fist: { does: 'damage', why: 'кулак: королеве — треть, монстру почти ничего (лёд), снеговика разбивает' },
    ice: { does: 'none', why: '«Айс», «Frozen», холод, жезл: они сами изо льда' },
    push: { does: 'push', why: 'ветер и взрывы толкают снеговиков (валят), монстры и королева только качаются' },
    levitation: { does: 'none', why: '«Левиоса» их не поднимает: ледяная магия королевы держит их на земле («Левиоса Максима» тоже)' },
    water: { does: 'push', why: 'вода сбивает снеговика; королеву и монстров только толкает' },
    // ---- the Ice Rod's «Frozen» on everybody
    players: { does: 'freeze', why: 'жезл замораживает игрока, ДАЖЕ в магических доспехах и мантии; поднятый щит «Protection» отбивает' },
    zombies: { does: 'freeze', why: 'замерзает целиком (удар разбивает)' },
    castlePeople: { does: 'freeze', why: 'жители, рыцари, король, волшебники — во льду, даже в мантии (жезл сильнее мантии); жители пугаются' },
    animals: { does: 'freeze', why: 'во льду' },
    sailors: { does: 'freeze', why: 'во льду' },
    livingTrees: { does: 'freeze', why: 'дерево и скелет стоят во льду' },
    spider: { does: 'none', why: 'гигантской паучихе холод не страшен (Spider.js)' },
    dragon: { does: 'slow', why: 'великана не заморозить: −20 и медленнее (как «Айс», DragonKinds)' },
    phoenix: { does: 'none', why: 'лёд тает на огненной птице (но это нападение)' },
    owl: { does: 'none', why: 'ледяные существа сову не трогают; холод и «Frozen» (не со свитка) — она увёртывается и улетает' },
    canary: { does: 'none', why: 'ледяные существа канарика не трогают; холод и «Frozen» (не со свитка) замораживают его на несколько секунд' },
    spencer: { does: 'none', why: 'ледяные существа птичку Спенсера не трогают; холод («Айс», «Frozen») убивает её' },
    ghost: { does: 'none', why: 'ледяные существа призраков не видят и не трогают; холод призрака не берёт — не действует: призрак бестелесный' },
    custom: { does: 'none', why: 'ледяные существа созданных не трогают; холод (не со свитка) замедляет и ранит, кроме дышащих холодом' },
    gargoyle: { does: 'none', why: 'ледяные существа и горгульи друг друга не трогают (Королева и её слуги не «подряд»); холод замедляет горгулью' },
    bookBirds: { does: 'down', why: 'замёрзшая книга падает' },
    iceCreatures: { does: 'none', why: 'королева, монстры, снеговики — сами изо льда; злыми снеговиками жезл управляет, доброго («Snowman») не трогает' },
    // ---- the Ice Rod's «Frozen» on things
    ground: { does: 'ice', why: 'на землю, стену, крышу — слой льда на поверхности; ещё «Frozen» туда же — следующий слой (стены, мосты)' },
    water: { does: 'ice', why: 'вода, куда показали, покрывается льдом — по нему можно ходить' },
    palace: { does: 'ice', why: 'лёд жезла — тот же, что у замка: тает только от огня' },
    items: { does: 'none', why: 'вещи не замерзают (лёд встаёт под ними)' },
    ships: { does: 'none', why: 'на палубе лёд не встаёт (она движется)' },
    houseSphere: { does: 'none', why: 'внутри чужой защитной сферы лёд не встаёт' },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const TYPES = ['queen', 'snowman', 'monster', 'friend'];

/**
 * «Кто/что × как действует» for the friendly snowman of «Snowman» (IceQueen type 'friend'; it lives in
 * this same list — so every place that finds the Ice Castle's creatures (Duel._bodies/_creature,
 * Game.explode, birdRay, lightningAt, CreatureImpact 'I', Levitation, WaterVortex, the blows) finds it too).
 */
export const FRIEND_TARGETS = {
    fire: { does: 'melt', why: '10 HP; огонь ×2 (Инферно, Fire Maxima, Адский огонь — тает сразу); у костра, пожара, взрыва — убегает, рядом тает (меньше), растаял — лужица' },
    blows: { does: 'damage', why: 'меч, топор, стрелы, кулак рассыпают снег (полный урон); Бомбардо и молния ×3' },
    duel: { does: 'damage', why: 'дуэльные заряды как злому снеговику (Остолбеней — оглушает, Сапира −10…); «Авада Кедавра» −25' },
    cold: { does: 'none', why: '«Айс», «Frozen», жезл, снег — он сам из снега (COLD_KINDS)' },
    push: { does: 'push', why: 'ветер, взрывы, вода, «Джолт» отбрасывают его как злого снеговика' },
    levitation: { does: 'none', why: 'как все ледяные существа (ICE_TARGETS.levitation)' },
    queen: { does: 'none', why: 'Королева, её злые снеговики и монстры его не трогают; «Атака» жезлом на него не действует' },
    villagers: { does: 'none', why: 'жителей не пугает (никакой тревоги)' },
    master: { does: 'none', why: 'никому не подчиняется («Брейнрот», «Атака», концентрация — нет); «стоп» его не убирает' },
    network: { does: 'host', why: 'хост ведёт его (ум, тело, HP) и шлёт всем; сохраняется с миром, пока не растает' },
};
const r2 = (v) => Math.round(v * 100) / 100;
const vec = (a) => new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);

/** An ice creature's body as a capsule {a, b, r} (feet at model.position). */
export function iceBody(c, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const p = c.model.position;
    out.r = c.r;
    out.a.set(p.x, p.y + c.r, p.z);
    out.b.set(p.x, p.y + Math.max(c.r, c.h - c.r), p.z);
    return out;
}
export function iceCenter(c, out = new THREE.Vector3()) { const p = c.model.position; return out.set(p.x, p.y + c.h * 0.55, p.z); }

export class IceCastleLife {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.byIdMap = new Map();
        this.shots = [];
        this.fxs = []; // spikes, beams, gusts in flight
        this.state = { queenDead: false, queenHp: ICE.QUEEN.HP, monsters: [ICE.MONSTER.HP, ICE.MONSTER.HP], monsterMelt: [0, 0], monsterDeadAt: [0, 0], seen: false };
        this.active = false;
        this._netT = 0;
        this._spawnT = 3;
        this._thinkT = 0;
        this._seq = 0;
        this.rodCmd = null; // (the rod's holder) {k, id} the snowmen attack
        this._hud = null;
        this._gates = null;
        this.fixtures = new IceFixtures(this); // the gates' strength, the chandelier on its chain
        IceFixtures.initState(this.state);
        this.mapMark = null;
        void this.plan; // (worked out now, while loading — never in a frame of play)
    }

    get auth() { return this.game.authority; }
    get me() { return this.game.localId; }

    /** The castle's plan (null: none in this world). */
    get plan() {
        if (this._plan !== undefined) return this._plan;
        const t = this.game.world?.terrain?.data;
        if (!t) return null; // (no world yet: asked again later)
        this._plan = t.iceCastle?.plan || null;
        return this._plan;
    }

    // ================================================================ creatures
    targets() { return this.list.filter((c) => !c.dead); }
    byId(id) { const c = this.byIdMap.get(id); return c && !c.dead ? c : null; }
    get queen() { return this.list.find((c) => c.type === 'queen' && !c.dead) || null; }

    _spawn(type, pos, { id = null, hp = null, yaw = 0, slot = 0 } = {}) {
        const g = this.game;
        const model = type === 'queen' ? iceQueenModel() : type === 'snowman' ? snowmanModel() : type === 'friend' ? friendSnowmanModel() : iceMonsterModel();
        const S = type === 'queen' ? ICE.QUEEN.S : type === 'monster' ? ICE.MONSTER.S : 1;
        model.scale.setScalar(S);
        model.position.copy(pos);
        model.rotation.y = yaw;
        g.scene.add(model);
        // (drawn as one shape per material, its parts moved by the video card — FarShape; not the Snowman spell's friend: it
        // is built bit by bit and blinks, part by part)
        let one = null;
        if (type !== 'friend') { model.userData.farRadius = (type === 'queen' ? 5 : 3.5) * S; one = new FarShape(model); one.set(true); }
        const T = type === 'queen' ? ICE.QUEEN : type === 'monster' ? ICE.MONSTER : type === 'friend' ? ICE.FRIEND : ICE.SNOW;
        const c = {
            id: id || (type === 'queen' ? 'iceQueen' : type === 'monster' ? 'iceMon' + slot : (type === 'friend' ? 'frs' : 'snow') + (++this._seq) + Math.floor(Math.random() * 1e4).toString(36)),
            type, ck: 'I', isIce: true, model, group: model, one, oneT: 0, hp: hp ?? T.HP, max: T.HP, dead: false,
            r: T.R, h: T.H, speed: T.SPEED, turn: T.TURN || 3, slot,
            get isDead() { return this.dead; }, get position() { return this.model.position; },
            bodyCapsule: (out) => iceBody(c, out),
            base: { r: T.R, h: T.H, speed: T.SPEED, S }, melt: 0, sz: 1, blade: 0, bladeV: 0, bladeT: 0, sheathT: 0, charge: null, dmgK: 1, reachK: 1, meltAt: -1e9, meltHot: 0, // (a giant / a snowman melts: IceGiants.js)
            damageCooldown: 0, vy: 0, stunT: 0, frozenT: 0, walkT: Math.random() * 6, castT: 2 + Math.random() * 2, throwT: 1 + Math.random() * 2,
            home: pos.clone(), target: null, wp: null, anim: 0, act: null, actT: 0, hurtT: 0, lastBy: null,
        };
        this.list.push(c);
        this.byIdMap.set(c.id, c);
        return c;
    }

    _remove(c) {
        this.game.scene.remove(c.model);
        c.one?.dispose();
        if (c.bubble) { this.game.scene.remove(c.bubble.sprite); c.bubble.dispose?.(); }
        const i = this.list.indexOf(c);
        if (i >= 0) this.list.splice(i, 1);
        this.byIdMap.delete(c.id);
    }

    // ================================================================ damage
    /** A blow / a spell on an ice creature (`kind` decides how much: iceDamage). */
    hit(c, dmg, kind = null, by = undefined) {
        if (!c || c.dead) return 0;
        const g = this.game;
        const who = by === undefined ? g.localId : by;
        let n = iceDamage(c.type, kind, dmg);
        if (n <= 0 && dmg > 0) this._noEffect(c, kind, who);
        if (!this.auth) { if (dmg > 0) g.sync?.ice?.({ e: 'hit', id: c.id, dmg: r2(dmg), kind, by: who }); this._flash(c, n > 0); return n; }
        this._flash(c, n > 0);
        if (c.type === 'friend') {
            // the friendly snowman: nobody's foe, no achievement — it only runs from fire (where it came from)
            if (FIRE_K[kind]) { c.scaredT = 4; (c.fireFrom || (c.fireFrom = new THREE.Vector3())).copy(this._casterPos(who, c)); }
            if (n <= 0) return 0;
            c.hp = Math.max(0, c.hp - n);
            c.hurtT = 0.25;
            c.lastKind = kind;
            if (c.hp <= 0) this._die(c, who);
            return n;
        }
        if (who != null) c.lastBy = who;
        if (c.type === 'queen') g.achievements?.hit('iceQueen', c.id, who); else g.achievements?.fought(who); // (the achievement: everyone who took part)
        // (struck: it turns on whoever did it — a creature of the castle defends itself)
        if (who != null && (who === g.localId || g.remotes?.has(who))) c.foe = who;
        if (n <= 0) { if (c.type === 'queen' && (c.mockT || 0) <= 0) { c.mockT = 8; this._say(c, 'Твоя магия здесь бессильна!'); } return 0; }
        // (fire melts a giant / a snowman: smaller with every flame, weaker with every size — and it cannot die before it is the least: IceGiants.js)
        if ((c.type === 'monster' || c.type === 'snowman') && FIRE_K[kind]) { n = this._melt(c, kind, dmg, n); if (n <= 0) { c.hurtT = 0.1; return 0; } }
        c.hp = Math.max(0, c.hp - n);
        c.hurtT = 0.25;
        c.lastKind = kind; // (the last blow: the Queen killed by the Hellfire darkens the caster — HellKills.js)
        if (c.type === 'snowman' && FIRE_K[kind]) for (let i = 0; i < 6; i++) g.fx?.spark?.(iceCenter(c, _v), 0xdfefff, 0.2, _v2.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.8);
        if (c.hp <= 0) this._die(c, who);
        return n;
    }

    /**
     * (host) The fire on a giant / an evil snowman: it melts a step (at most every MELT.TICK s — a stream of flame calls every frame),
     * shrinks, hits weaker; the HP the fire takes from it meanwhile → returned (0 between the steps).
     */
    _melt(c, kind, raw, n) {
        const now = this._clock ? this._clock() : performance.now();
        c.meltHot = MELT.HOT;
        if (now - c.meltAt < MELT.TICK * 1000) return 0;
        c.meltAt = now;
        const r = applyFire(c.type, kind, raw, n, c.melt, c.hp);
        const hp = c.hp - r.hp;
        c.melt = r.melt;
        this._resize(c);
        this._sendSoon = true;
        return hp > 0 ? hp : 0;
    }

    /** A creature's size, reach, pace and blow follow its melting (every computer, from `c.melt`). */
    _resize(c) {
        const st = meltStats(c.melt), B = c.base;
        const stage = meltStage(c.melt);
        c.sz = st.scale; c.dmgK = st.dmg; c.reachK = st.reach;
        c.r = B.r * st.scale; c.h = B.h * st.scale; c.speed = B.speed * st.speed;
        if (!c.dead) c.model.scale.setScalar(B.S * st.scale * (c.rise > 0 ? Math.max(0.05, 1 - c.rise) : 1));
        c.model.userData.farRadius = (c.type === 'queen' ? 5 : 3.5) * B.S * st.scale;
        if (stage > (c.stage || 0)) { c.stage = stage; this._meltStageFx(c); }
        else c.stage = stage;
    }

    /** A step of the melting: a crack of ice, a puff of steam, a splash of water, a word to whoever did it. */
    _meltStageFx(c) {
        const g = this.game, p = iceCenter(c, _v);
        const big = c.type === 'monster';
        for (let i = 0; i < (big ? 26 : 10); i++) g.fx?.spark?.(p, i % 3 ? 0xeaf8ff : 0x8fd6ff, big ? 0.34 : 0.2, _v2.set((Math.random() - 0.5) * (big ? 7 : 4), 1 + Math.random() * (big ? 6 : 3), (Math.random() - 0.5) * (big ? 7 : 4)), big ? 1.4 : 0.9); // (steam and drops)
        g.sound?.playIce?.('iceCrack', c.model.position, big ? 1.1 : 0.6, 0.8 + 0.15 * (c.stage || 0)); // (the ice cracks, a little higher with every step)
        if (big) { g.fx.shake = Math.max(g.fx.shake || 0, 0.25); if ((c.stage || 0) >= 5) g.hud?.setVoice?.('💧 Ледяной великан растаял до обломка — теперь он слаб', true); }
    }

    _flash(c, real) {
        const g = this.game, p = iceCenter(c, _v);
        for (let i = 0; i < (real ? 10 : 6); i++) g.fx?.spark?.(p, real ? 0xe8fbff : 0x9fd8ff, 0.12 * (c.type === 'snowman' ? 1 : 1.6), _v2.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.5);
        c.hurtT = 0.2;
    }

    /** A blast / a burst at p reaches every ice body it touches. */
    hitAt(p, radius, dmg, kind, by = undefined) {
        const e = this._cap || (this._cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 });
        for (const c of this.targets()) {
            iceBody(c, e);
            const d = Math.sqrt(segmentSegmentDistSq([p.x, p.y, p.z], [p.x, p.y, p.z], [e.a.x, e.a.y, e.a.z], [e.b.x, e.b.y, e.b.z])) - e.r;
            if (d < radius) this.hit(c, dmg * (d <= 0 ? 1 : Math.max(0.3, 1 - d / radius)), kind, by);
        }
    }

    /** A beam / a stream along o + d·t (fire, lightning, thunder…): it hurts what it touches. */
    hitRay(o, d, len, width, dmg, kind, by = undefined) {
        const e = this._cap || (this._cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 });
        const q = [o.x + d.x * len, o.y + d.y * len, o.z + d.z * len];
        let any = false;
        for (const c of this.targets()) {
            iceBody(c, e);
            if (segmentSegmentDistSq([o.x, o.y, o.z], q, [e.a.x, e.a.y, e.a.z], [e.b.x, e.b.y, e.b.z]) <= (width + e.r) ** 2) { this.hit(c, dmg, kind, by); any = true; }
        }
        return any;
    }

    /** A duel charge reached an ice creature (host). */
    boltHit(c, spell, by = undefined, p = null) {
        if (!c || c.dead) return;
        // the strong charges (scroll spells: they act on her as on anyone — StrongMagic; «Дай» kills her, the Rod falls); the cold: below — nothing
        if (!isCold(spell) && this.game.strong?.boltHit?.('I', c, spell, by, p)) return;
        const b = iceBolt(c.type, spell);
        if (spell === 'Jolt' || spell === 'JoltMaxima') { this.push(spell, by, (_p, x) => (x === c ? _v3.copy(c.model.position).sub(this._casterPos(by, c)).setY(0).normalize().multiplyScalar(spell === 'JoltMaxima' ? 12 : 5) : null)); return; }
        if (b.stun) c.stunT = Math.max(c.stunT, b.stun);
        if (b.dmg > 0) this.hit(c, b.dmg, spell === 'AvadaKedavra' ? 'AvadaKedavra' : 'duel', by);
        else this._flash(c, false);
        if (b.dmg === 0 && !b.stun) this._noEffect(c, spell, by === undefined ? this.game.localId : by);
        if (b.dmg === 0 && !b.stun && c.type === 'queen' && (c.mockT || 0) <= 0) { c.mockT = 8; this._say(c, 'Твоя магия здесь бессильна!'); }
    }

    /**
     * My spell reached the queen (or her monster) and did nothing: by the rules (iceDamage) the spells known
     * without a scroll and the cold don't touch her — that is no «it didn't work». One short line says so
     * (only to the one who cast it, at most once in a while), and the spell journal notes it.
     */
    _noEffect(c, kind, who) {
        const g = this.game;
        if (who !== g.localId || (c.type !== 'queen' && c.type !== 'monster')) return;
        const now = performance.now();
        if (now - (this._noEffectAt || -1e9) < 6000) return;
        this._noEffectAt = now;
        const whom = c.type === 'queen' ? 'Королеву' : 'ледяного монстра';
        const why = isCold(kind) ? 'холод не действует на лёд' : 'нужны огонь или заклинания со свитков';
        g.hud?.setVoice?.(`❄️ Не действует на ${whom}: ${why}`, true);
        g.spellLog?.note?.(`❄️ попадание по ${c.type === 'queen' ? 'Ледяной Королеве' : 'ледяному монстру'} (${kind || '?'}) — не действует: ${why}`);
    }

    _casterPos(by, c) {
        const g = this.game;
        if (by === g.localId || by == null) return g.character?.group.position || c.model.position;
        return g.remotes?.get(by)?.position || c.model.position;
    }

    /**
     * Pushes (wind, blasts, waves): `pushAt(p, c)` gives the shove for a creature (or null). A snowman
     * is thrown and may fall; a monster and the queen only sway. → how many were pushed.
     */
    push(name, by, pushAt, opts = {}) {
        let n = 0;
        for (const c of this.targets()) {
            const v = pushAt(c.model.position, c);
            if (!v) continue;
            n++;
            const k = small(c.type) ? 1 : c.type === 'queen' ? 0.15 : 0.08;
            c.shove = (c.shove || new THREE.Vector3()).addScaledVector(_v.set(v.x, 0, v.z), k);
            if (small(c.type)) { c.vy = Math.max(c.vy, Math.min(8, (v.y || 0) * 0.6 + v.length() * 0.25)); if (v.length() > 9) c.stunT = Math.max(c.stunT, 1.5); }
            c.sway = Math.min(0.4, (c.sway || 0) + v.length() * 0.02);
        }
        return n;
    }

    /** A melted snowman's puddle: it spreads, then soaks away (every computer its own). */
    _puddle(c) {
        const m = puddleModel(), p = c.model.position;
        m.position.set(p.x, p.y + 0.01, p.z);
        m.scale.set(0.3, 1, 0.3);
        this.game.scene.add(m);
        (this.puddles || (this.puddles = [])).push({ m, t: 0 });
        this.game.sound?.playSnowStep?.(0.6);
    }

    _updatePuddles(dt) {
        const l = this.puddles;
        if (!l?.length) return;
        for (let i = l.length - 1; i >= 0; i--) {
            const q = l[i];
            q.t += dt;
            const s = q.t < 1.5 ? 0.3 + q.t * 0.9 : Math.max(0.01, 1.65 - (q.t - 1.5) / 18 * 1.65);
            q.m.scale.set(s * 1.6, 1, s * 1.6);
            if (q.t > 19.5) { this.game.scene.remove(q.m); l.splice(i, 1); }
        }
    }

    _die(c, killer) {
        const g = this.game;
        if (c.dead) return;
        c.dead = true;
        c.hp = 0;
        const p = iceCenter(c, new THREE.Vector3());
        const big = !small(c.type);
        if (c.type === 'friend' && (FIRE_K[c.lastKind] || c.melting)) { c.melting = true; this._puddle(c); } // (melted: a puddle with its coal and carrot)
        for (let i = 0; i < (big ? 70 : 24); i++) g.fx?.spark?.(p, i % 3 ? 0xe8fbff : 0x8fd6ff, (big ? 0.3 : 0.18), _v2.set((Math.random() - 0.5) * (big ? 12 : 6), Math.random() * (big ? 9 : 5), (Math.random() - 0.5) * (big ? 12 : 6)), big ? 1.4 : 0.9);
        g.sound?.playFrozenHit?.();
        if (c.type === 'queen') {
            this.state.queenDead = true;
            this.state.queenHp = 0;
            g.hud?.notify?.('❄️ Ледяная Королева побеждена! Её Ледяной Жезл упал на пол');
            this.fixtures.queenFell(); // (her magic leaves the gates: plain ice now)
            if (this.auth) {
                creditKill(g, killer, { kind: 'iceQueen' });
                if (c.lastKind === 'Hellfire') hellKilled(g, killer, 'I', 'queen', c.id); // (the Queen is humanoid: +1 black magic to the caster of the Hellfire)
                g.achievements?.killed('iceQueen', c.id, killer, p); // (the achievement: to all who fought her)
                // her rod falls where she stood (one in the world: she never comes back)
                const at = c.model.position.clone().add(_v.set(0, 2.5, 0));
                g.items?.spawnLoose({ kind: 'iceRod', uid: newUid(), godGift: true }, at, { hover: true }); // (a gift of the gods: no spell destroys it — ItemTypes.isGodGift)
                for (const s of this.list) if (s.type === 'snowman') s.foe = null; // (her snowmen: nobody's now — the rod's)
            }
        } else if (c.type === 'monster') {
            this.state.monsters[c.slot] = 0;
            this.state.monsterMelt[c.slot] = 0;
            this.state.monsterDeadAt[c.slot] = Date.now();
            if (this.auth) creditKill(g, killer, { kind: 'iceMonster' });
        } else if (this.auth && killer && c.type === 'snowman') creditKill(g, killer, { kind: 'snowman' }); // (the friendly one: no reward for it)
        // (it falls apart: the model sinks and is gone)
        c.deadT = 1.2;
        this._sendSoon = true;
    }

    // ================================================================ frame
    update(dt) {
        const g = this.game;
        const P = this.plan;
        this._t = (this._t || 0) + dt; // (the castle's clock, seconds: the queen's freezes and charges)
        const me = g.character?.group.position;
        if (!me) return;
        if (!P && !this.list.length && !this.puddles?.length && !this._friendsToLoad) { this._netSend(dt); return; } // (no castle here, no snowman: nothing to do)
        if (P) {
            const dMe = Math.hypot(me.x - P.x, me.z - P.z);
            // the minimap: the castle once seen (near enough to see its spires)
            if (!this.state.seen && dMe < 260) { this.state.seen = true; g.hud?.notify?.('❄️ Вдали сверкает Ледяной замок'); }
            this.mapMark = this.state.seen ? { x: P.x, z: P.z, name: 'Ледяной замок', icon: '❄' } : null;
            // the gates and the chandelier: whoever is near (each computer its own; the doors sync themselves) —
            // the host too while the castle is awake for anybody (it decides their strength: IceFixtures.js)
            const near = dMe < ICE.ACTIVE + 60 || (this.auth && this.active);
            if (near && !this._gates) this._makeGates();
            if (this._chests) for (const c of this._chests) c.locked = !this.state.queenDead; // (open to all once she is gone)
            if (!near && this._gates && dMe > ICE.SLEEP + 60) this._dropGates();
            if (this.auth) {
                let dNear = dMe;
                for (const r of g.remotes?.values() || []) if (r.position) dNear = Math.min(dNear, Math.hypot(r.position.x - P.x, r.position.z - P.z));
                if (!this.active && dNear < ICE.ACTIVE) this._wake();
                else if (this.active && dNear > ICE.SLEEP && !this._offender()) this._sleep();
                if (this.active) this._respawn(dt);
            }
        }
        if (this.auth) {
            if (this._friendsToLoad) this._loadFriends();
            if (this.active || P) this._watchGiants(dt);
            // (a snowman or a monster far from every player, with nobody to fight: thinks every few frames, the time added up —
            // the castle's guards on their rounds cost ~0.5 ms a frame seen from Creative's start)
            this._tick = (this._tick || 0) + 1;
            const every = Math.max(1, Math.min(8, Math.round(0.1 / Math.max(1e-3, dt))));
            for (const c of [...this.list]) {
                if (c.dead || (c.imp && g.imperius?.step('I', c, dt)) || !(c.type !== 'friend' || this._awake(c))) continue; // («Империус Максима»: a mind in it — ImperiusControl.step)
                if (every > 1 && (c.type === 'snowman' || c.type === 'monster') && !c.target && !c.act && !(c.stunT > 0) && !(c.frozenT > 0) && !c.vy && this._noneNear(c.model.position, 70)) {
                    c.thinkAcc = (c.thinkAcc || 0) + dt;
                    if ((this._tick + (c.slot || 0)) % every !== 0) continue;
                    const t = Math.min(0.1, c.thinkAcc); c.thinkAcc = 0;
                    this._think(c, t);
                    continue;
                }
                c.thinkAcc = 0;
                this._think(c, dt);
            }
        } else {
            for (const c of this.list) if (c.imp?.mine && !c.dead && g.imperius?.step('I', c, dt)) { /* (my mind in it) */ } else if (c.net && !c.dead) {
                c.model.position.lerp(c.net, Math.min(1, dt * 8));
                c.model.rotation.y = turnToward(c.model.rotation.y, c.netYaw ?? c.model.rotation.y, 6 * dt);
            }
        }
        for (const c of [...this.list]) {
            if (c.dead) {
                c.deadT -= dt; c.model.position.y -= dt * 1.5; c.model.scale.multiplyScalar(1 - dt * 0.6);
                if (c.type === 'friend' && c.melting) c.model.scale.y = Math.max(0.02, c.model.scale.y - dt * 1.5); // (melting: it slumps)
                if (c.deadT <= 0) this._remove(c);
                continue;
            }
            this._animate(c, dt);
            if (c.bubble) c.bubble.update(dt, _v.copy(c.model.position).setY(c.model.position.y + c.h + 0.6), g.camera);
            if (c.mockT > 0) c.mockT -= dt;
        }
        this._updatePuddles(dt);
        if (!P) { this._netSend(dt); return; }
        this.fixtures.update(dt);
        this._updateShots(dt);
        this._updateFx(dt);
        this._updateRod(dt);
        this._hudBar();
        this._netSend(dt);
    }

    /** No player within r m of p (me and the others on the server). */
    _noneNear(p, r) {
        const g = this.game, r2 = r * r, me = g.character?.group?.position;
        if (me && (me.x - p.x) ** 2 + (me.z - p.z) ** 2 < r2) return false;
        for (const rm of g.remotes?.values?.() || []) { const q = rm.position; if (q && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < r2) return false; }
        return true;
    }

    /** (host) Is this player (or anybody, id omitted) the one who attacked the castle lately? */
    _offender(id = undefined) {
        const o = this.offender;
        if (!o) return false;
        if (Date.now() > o.until) { this.offender = null; return false; }
        return id === undefined || o.id === id;
    }

    /**
     * (host) Someone struck the palace (a blast, lightning, fire on its ice — Game.applyExplosion, lightningAt,
     * meltAt): if it was a player, the castle wakes and its snowmen and monsters go out after him, wherever he
     * stands (ICE.DEFEND); the queen calls them. A guest's fire reaches here as {e: 'atk'}.
     */
    attacked(pos, radius, by) {
        const g = this.game, P = this.plan;
        if (!P || !pos || !this.auth) return;
        if (by === 'local') by = g.localId;
        if (by == null || !(by === g.localId || g.remotes?.has(by))) return;
        if (pos.x < P.x0 - radius - 2 || pos.x > P.x1 + radius + 2 || pos.z < P.z0 - radius - 2 || pos.z > P.z1 + radius + 2) return;
        if (!this.active) this._wake();
        // (CLAUDE.md: a creature knows who did it only if it saw the cast — else it goes to the threat itself)
        const at = this._players().find((q) => q.id === by)?.p;
        const seen = at && this.list.some((c) => !c.dead && c.type !== 'friend' && Math.hypot(at.x - c.model.position.x, at.z - c.model.position.z) < ICE.DEFEND.R && this._sees(c, at));
        if (!seen) {
            for (const c of this.list) if (c.type === 'snowman' && !c.dead && !c.target) { c.roam = { x: pos.x, z: pos.z }; c.roamT = 15; }
            return;
        }
        const fresh = !this._offender(by);
        this.offender = { id: by, until: Date.now() + ICE.DEFEND.T * 1000 };
        if (!fresh) return;
        for (const c of this.list) if (c.type === 'snowman' || c.type === 'monster') { c.foe = by; c.roam = null; }
        const q = this.queen;
        if (q) this._say(q, 'Кто посмел напасть на мой замок?! Слуги, схватите его!');
    }

    /**
     * (host, twice a second) A giant — the pentagram's monster, a dragon under its rider, a mind in a great creature — in the
     * palace's land: the castle wakes and goes out against it at once (nobody needs to see it strike first: it is a tower walking
     * through the hall), the queen cries out.
     */
    _watchGiants(dt) {
        const P = this.plan;
        if (!P || (this._gwT = (this._gwT || 0) - dt) > 0) return;
        this._gwT = ICE.GIANT.WATCH;
        for (const q of this._players()) {
            if (!q.giant || this._offender(q.id)) continue;
            const m = ICE.GIANT.GREET + q.rad;
            if (q.p.x < P.x0 - m || q.p.x > P.x1 + m || q.p.z < P.z0 - m || q.p.z > P.z1 + m) continue;
            if (!this.active) this._wake();
            this.offender = { id: q.id, until: Date.now() + ICE.DEFEND.T * 1000 };
            for (const c of this.list) if (c.type === 'snowman' || c.type === 'monster') { c.foe = q.id; c.roam = null; }
            const qn = this.queen;
            if (qn) this._say(qn, 'Что за чудовище ломится в мой замок?! Слуги, остановите его!');
            this.game.castleLife?.alarm?.(_v.set(q.p.x, q.p.y, q.p.z), 'monster', q.id, 30);
        }
    }

    /** (host) A player came near: the queen on her throne, the monsters at the gates, snowmen about. */
    _wake() {
        const P = this.plan;
        this.active = true;
        this._sendSoon = true;
        if (!this.state.queenDead && !this.list.some((c) => c.type === 'queen')) {
            this._spawn('queen', new THREE.Vector3(P.throne.x, P.throne.y, P.throne.z), { hp: this.state.queenHp || ICE.QUEEN.HP, yaw: iceYaw(P) + Math.PI });
        }
        for (let i = 0; i < 2; i++) {
            if (this.list.some((c) => c.type === 'monster' && c.slot === i)) continue;
            if (this.state.monsters[i] <= 0) {
                // (a monster killed comes back after a long while — while the queen lives)
                if (this.state.queenDead || Date.now() - (this.state.monsterDeadAt[i] || 0) < ICE.MONSTER.RESPAWN * 1000) continue;
                this.state.monsters[i] = ICE.MONSTER.HP;
                this.state.monsterMelt[i] = 0;
            }
            const q = P.guard[i];
            const m = this._spawn('monster', new THREE.Vector3(q.x, this._floor(q.x, q.z, q.y + 4), q.z), { hp: this.state.monsters[i], yaw: iceYaw(P) + Math.PI, slot: i });
            m.home.copy(m.model.position);
            if (this.state.monsterMelt[i] > 0) { m.melt = this.state.monsterMelt[i]; this._resize(m); } // (it left as small as it was)
        }
        for (let i = 0; i < 8; i++) this._spawnSnowman();
    }

    _sleep() {
        this.active = false;
        const h = this._rodHolder();
        for (const c of [...this.list]) {
            if (c.type === 'friend') continue; // (the friendly snowmen are nobody's: they stay where they wander)
            // (the snowmen following the rod's holder go on with him)
            if (c.type === 'snowman' && h && this.state.queenDead && Math.hypot(h.p.x - c.model.position.x, h.p.z - c.model.position.z) < ICE.ROD.FOLLOW) continue;
            if (c.type === 'queen' && !c.dead) this.state.queenHp = c.hp;
            if (c.type === 'monster' && !c.dead) { this.state.monsters[c.slot] = c.hp; this.state.monsterMelt[c.slot] = c.melt; }
            this._remove(c);
        }
        this._sendSoon = true;
    }

    /** The floor under (x, z) for a body whose feet may reach `reach`. */
    _floor(x, z, reach) {
        const col = this.game.collision;
        return col ? col.groundAt(x, z, reach) : 0;
    }

    _spawnSnowman(at = null) {
        const P = this.plan, g = this.game;
        const n = this.list.filter((c) => c.type === 'snowman' && !c.dead).length;
        if (n >= ICE.SNOW.MAX) return null;
        let x, z;
        if (at) { x = at.x + (Math.random() - 0.5) * 6; z = at.z + (Math.random() - 0.5) * 6; }
        else {
            // on the plateau (its rim is a cliff): not in the hall, nor right under a player's nose
            const me = g.character.group.position;
            let ok = false;
            for (let i = 0; i < 8 && !ok; i++) {
                const a = Math.random() * Math.PI * 2, d = (P.A || P.R) * (0.6 + Math.random() * 0.32); // (the arena: inside its wall)
                x = P.x + Math.cos(a) * d; z = P.z + Math.sin(a) * d;
                ok = Math.hypot(x - P.hall.x, z - P.hall.z) > P.hall.r + 4 && Math.hypot(me.x - x, me.z - z) > 10;
            }
            if (!ok) return null;
        }
        const y = this._floor(x, z, (at ? at.y : P.F) + 6);
        const s = this._spawn('snowman', new THREE.Vector3(x, y, z), { yaw: Math.random() * Math.PI * 2 });
        s.rise = 1; // (it rises out of the snow)
        for (let i = 0; i < 10; i++) g.fx?.spark?.(_v.set(x, y + 0.3, z), 0xffffff, 0.2, _v2.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.7);
        return s;
    }

    _respawn(dt) {
        this._spawnT -= dt;
        if (this._spawnT > 0) return;
        this._spawnT = ICE.SNOW.RESPAWN;
        if (this.state.queenDead) return; // (no queen: no new snowmen)
        this._spawnSnowman();
    }

    // ---------------------------------------------------------------- who is where
    _inside(p) {
        const P = this.plan;
        return Math.hypot(p.x - P.hall.x, p.z - P.hall.z) < P.hall.r + 1.2 && p.y > P.floor - 2.5 && p.y < P.hall.top;
    }

    /** Players as targets: {id, p (feet), c (centre)} (the dead, the invisible far off not). */
    _players(boss = false) {
        const g = this.game, out = boss ? this._plB || (this._plB = []) : this._pl || (this._pl = []);
        // (once a frame, into the same objects: no garbage — every mind asks it; the queen's own list: she sees the invisible)
        const fk = boss ? '_plFrameB' : '_plFrame';
        if (this[fk] === g.frameCount && g.frameCount != null) return out;
        this[fk] = g.frameCount;
        const pool = boss ? this._plPoolB || (this._plPoolB = []) : this._plPool || (this._plPool = []);
        out.length = 0;
        const qn = boss ? this.list.find((c) => c.type === 'queen' && !c.dead) : null;
        const bossInfo = qn ? { key: 'iceQueen', x: qn.model.position.x, z: qn.model.position.z, say: (t) => this._say(qn, t) } : null;
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p, bossInfo) : p);
        const put = (id, p, rod, size = 1, big = false) => {
            const e = pool[out.length] || (pool[out.length] = { id: null, p: new THREE.Vector3(), rod: false, size: 1, rad: 0.5, h: 3.5, giant: false });
            e.id = id; e.size = size; e.p.set(p.x, p.y - 1.95 * size, p.z); e.rod = rod;
            e.giant = big || size >= ICE.GIANT.SIZE;
            e.rad = Math.max(0.5, 0.48 * size, big && size < 3 ? ICE.GIANT.RIDER_R : 0); // (a body this wide: it is seen by its edge, not its middle)
            e.h = Math.max(3.5 * size, big && size < 3 ? ICE.GIANT.RIDER_H : 0);
            out.push(e);
        };
        if (!g.isDeadLocal && !g.combat?.dead) {
            // (the mind in a creature — «Империус»: the queen sees the creature; a dragon under its rider: the rider is as great as the dragon)
            const imp = g.imperius?.active && g.imperius.phase === 'on' ? g.imperius.creature : null;
            const ip = imp ? (imp.model?.position || imp.group?.position) : null;
            const ridden = !!g.dragonRide?.riding;
            const mine = ip || g.character.group.position;
            const p = seen(g.localId, mine);
            if (p) put(g.localId, p, !!g.items?.heldOf('iceRod'), ip ? Math.max(1, (imp.size || imp.scale || 1)) : (g.character.size || 1), !!ip || ridden);
        }
        for (const [id, r] of g.remotes || []) {
            if (r.dead || !r.position) continue;
            const p = seen(id, r.position);
            const onDragon = !!g.dragons?.list?.some((d) => d.tame?.rider === id);
            if (p) put(id, p, this._remoteRod(id), r.character?.size || 1, onDragon);
        }
        return out;
    }

    _remoteRod(id) {
        const h = this.game.items?.remoteHeld?.get(id);
        return h?.right?.item?.kind === 'iceRod' || h?.left?.item?.kind === 'iceRod';
    }

    /** Where the one holding the Ice Rod is (feet) — null: nobody holds it. */
    _rodHolder() {
        for (const q of this._players()) if (q.rod) return q;
        return null;
    }

    // ---------------------------------------------------------------- minds (host)
    _think(c, dt) {
        const g = this.game;
        c.damageCooldown = Math.max(0, c.damageCooldown - dt);
        if (c.hurtT > 0) c.hurtT -= dt;
        if (c.rise > 0) { c.rise -= dt * 1.5; this._ground(c, dt); return; }
        if (c.shove) { // (pushed: it slides)
            const p = c.model.position;
            p.x += c.shove.x * dt; p.z += c.shove.z * dt;
            c.shove.multiplyScalar(Math.max(0, 1 - 4 * dt));
            g.collision?.resolveCylinder?.(p, c.r, p.y, c.h, 1.05);
            if (c.shove.lengthSq() < 0.05) c.shove = null;
        }
        if (c.stunT > 0) { c.stunT -= dt; this._ground(c, dt); c.moving = false; return; }
        if (c.type === 'queen') this._thinkQueen(c, dt);
        else if (c.type === 'monster') this._thinkMonster(c, dt);
        else if (c.type === 'friend') this._thinkFriend(c, dt);
        else this._thinkSnowman(c, dt);
        this._ground(c, dt);
    }

    /** Gravity and the floor under its feet. */
    _ground(c, dt) {
        const p = c.model.position;
        const floor = this._floor(p.x, p.z, p.y + 1.05);
        if (p.y > floor + 0.02 || c.vy > 0) {
            c.vy -= 24 * dt;
            p.y += c.vy * dt;
            if (p.y <= floor) { p.y = floor; c.vy = 0; }
        } else { p.y = floor; c.vy = 0; }
    }

    /** One step toward (tx, tz), round the others (Crowd) and never through a wall. → still going. */
    _step(c, tx, tz, dt, stop = 0.5, speedK = 1) {
        const g = this.game, p = c.model.position;
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d <= stop) { c.moving = false; return false; }
        const sp = c.speed * speedK * (c.frozenT > 0 ? 0 : 1);
        const a = crowdStep(g, c, p, dx / d, dz / d, d - stop, { r: c.r, speed: sp, dt, look: 2 + c.r * 2, dy: c.h * 0.6 });
        c.moving = !!a;
        if (!a) return true;
        // (never into water, nor off a cliff: the castle's creatures keep to its mountain)
        const nx = p.x + a.x * sp * dt, nz = p.z + a.z * sp * dt;
        const t = g.world?.terrain?.data;
        if (t && t.get(Math.round(nx + a.x * c.r), Math.floor(p.y + 1.5), Math.round(nz + a.z * c.r)) === BLOCK.WATER) { c.moving = false; return true; }
        if (p.y - this._floor(nx + a.x * c.r, nz + a.z * c.r, p.y + 1.05) > 3.2) { c.moving = false; c.roam = null; return true; }
        p.x = nx; p.z = nz;
        g.collision?.resolveCylinder?.(p, c.r, p.y, c.h, 1.05);
        c.model.rotation.y = turnToward(c.model.rotation.y, Math.atan2(-a.x, -a.z), c.turn * dt);
        return true;
    }

    /** The next point on the way to `t` (through the gates when one is inside the hall and the other not). */
    _wayTo(c, t) {
        const P = this.plan;
        const ci = this._inside(c.model.position), ti = this._inside(t);
        if (ci === ti) { c.wp = null; return t; }
        const key = ci ? 'out' : 'in';
        if (!c.wp || c.wp.key !== key) c.wp = { key, i: 0 };
        const pts = ci ? [P.gate.inner, P.gate, P.gate.out] : [P.gate.out, P.gate, P.gate.inner];
        while (c.wp.i < pts.length && Math.hypot(pts[c.wp.i].x - c.model.position.x, pts[c.wp.i].z - c.model.position.z) < 1.6) c.wp.i++;
        if (c.wp.i >= 1 && c.wp.i <= 2) this._openGates(); // (the gates open before the castle's own)
        return c.wp.i < pts.length ? pts[c.wp.i] : t;
    }

    _face(c, tp, dt) { c.model.rotation.y = turnToward(c.model.rotation.y, yawTo(c.model.position.x, c.model.position.z, tp.x, tp.z), c.turn * dt); }

    /** A body to fight: a player (not the rod's holder near its snowmen), or the one who struck it. */
    _enemy(c, range, from = c.model.position) {
        let best = null;
        for (const q of this._players(c.type === 'queen')) {
            if (q.rod && c.type === 'snowman' && this.state.queenDead) continue; // (the rod's holder: the snowmen obey him)
            const d = Math.max(0, Math.hypot(q.p.x - from.x, q.p.z - from.z) - q.rad); // (by its edge: a great body is nearer than its middle)
            let r = c.type !== 'queen' && this._offender(q.id) ? Math.max(range, ICE.DEFEND.R) : q.id === c.foe ? range * 1.6 : range;
            if (q.giant) r = Math.max(r, Math.min(ICE.GIANT.SEE, range * 2.5 + q.rad * 2)); // (a giant cannot be missed: it is seen from far)
            if (d < r && (!best || d < best.d)) best = { k: 'p', id: q.id, p: q.p.clone(), d, rad: q.rad, size: q.size, giant: q.giant };
        }
        return best;
    }

    /**
     * The queen's tactics (the author: «заморозить издалека, как только ты достаточно близко — она подходит и разбивает»): she keeps 10…22 m from
     * her foe and throws her spells (the rod's freeze first of all, from 10…24 m, never point blank); when the freeze TOOK (his shield did not hold
     * it) she skates up fast, the rod grows into a blade in her hand, she turns to face him, raises it — and strikes; then the blade is a rod
     * again. One who holds «Protection» / «Protection Maxima» before him is not frozen and not cut (_shieldTakes). Cornered with the foe close, she
     * strikes with the blade anyway.
     */
    _thinkQueen(c, dt) {
        const g = this.game, P = this.plan, Q = ICE.QUEEN, A = QUEEN_AI;
        const p = c.model.position;
        const hall = P.hall;
        if (c.sheathT > 0) c.sheathT -= dt;
        // her foes: anyone in her castle's land, anyone who struck her
        const e = this._enemy(c, Q.SIGHT, _v3.set(P.x, p.y, P.z));
        c.target = e;
        if (!e) {
            // back to her throne
            if (c.charge) this._chargeEnd(c, false);
            const t = this._wayTo(c, P.throne);
            if (!this._step(c, t.x, t.z, dt, 0.6, 0.7)) this._face(c, _v.set(P.gate.x, 0, P.gate.z), dt);
            c.castT = Math.max(c.castT, 1.5);
            this._bladeStep(c, dt, 99);
            return;
        }
        if (!c.greeted) { c.greeted = true; this._say(c, e.giant ? 'Что за чудовище ломится в мой замок?! Заморозить его!' : 'Кто посмел войти в мой ледяной замок?!'); }
        const d = Math.max(0, Math.hypot(e.p.x - p.x, e.p.z - p.z) - (e.rad || 0));
        const see = e.giant || this._sees(c, e.p);
        const leash = Math.hypot(p.x - P.x, p.z - P.z) > Q.LEASH;
        // a frozen foe: run up, the blade, the blow (the freeze is over, he is gone, or she is too far from her hall — it ends)
        if (c.charge && (c.charge.id !== e.id || this._t > c.charge.until || leash)) this._chargeEnd(c, false);
        if (c.charge) { this._queenChase(c, e, d, dt); return; }
        // she keeps her distance: closer than KEEP_MIN she steps back (cornered with him near: the blade), further than KEEP_MAX she goes closer
        const band = rangeBand(d);
        if (leash) { const t = this._wayTo(c, hall); this._step(c, t.x, t.z, dt, 2); }
        else if (!see || band === 'far') { const t = this._wayTo(c, e.p); this._step(c, t.x, t.z, dt, t === e.p ? A.KEEP_MAX * 0.7 + (e.rad || 0) : 1.2); c.cornerT = 0; } // (the stop is for the foe, not for the gate on the way to him)
        else if (band === 'near' && !c.act) {
            const dx = p.x - e.p.x, dz = p.z - e.p.z, L = Math.hypot(dx, dz) || 1;
            this._step(c, p.x + (dx / L) * 8, p.z + (dz / L) * 8, dt, 0.3, 1.35);
            c.cornerT = c.moving ? 0 : (c.cornerT || 0) + dt;
            if (c.cornerT > 1.4 && d < 12 && see) { c.charge = { id: e.id, until: this._t + 4, t0: this._t, corner: true }; c.bladeT = 0; c.cornerT = 0; this._say(c, 'Не уйдёшь!'); return; }
        } else {
            // (at her distance: she sidesteps now and then, facing him)
            c.cornerT = 0;
            if ((c.evadeT = (c.evadeT || 0) - dt) <= 0 && Math.random() < A.EVADE * dt * 4) { c.evadeT = 0.9 + Math.random() * 0.8; c.evadeDir = Math.random() < 0.5 ? -1 : 1; }
            if (c.evadeT > 0 && !c.act) { const dx = e.p.x - p.x, dz = e.p.z - p.z, L = Math.hypot(dx, dz) || 1; this._step(c, p.x + (-dz / L) * c.evadeDir * 6, p.z + (dx / L) * c.evadeDir * 6, dt, 0.3, 1.2); if (!c.act) this._face(c, e.p, dt * 0.5); }
            else { c.moving = false; this._face(c, e.p, dt); }
        }
        this._bladeStep(c, dt, d);
        c.castT -= dt;
        if (c.castT > 0 || !see || d > Q.REACH || c.act) return;
        // «лицом к цели»: she casts only facing her foe
        if (!facesTarget(c.model.rotation.y, p.x, p.z, e.p.x, e.p.z, FACE.SPELL)) { this._face(c, e.p, dt); return; }
        c.castT = Q.CAST * (0.75 + Math.random() * 0.5);
        const nSnow = this.list.filter((s) => s.type === 'snowman' && !s.dead).length;
        const roll = Math.random();
        // (the rod's freeze first of all, at her range and not too often; a giant: the same; then the rest)
        const since = c.lastFreeze == null ? null : this._t - c.lastFreeze;
        const spell = mayFreeze(d, since) && (e.giant ? (!c.giantFrozen || Date.now() > c.giantFrozen) : true) && roll < 0.85 ? 'freeze'
            : nSnow < 5 && roll < 0.2 ? 'summon' : roll < 0.42 ? 'freeze' : roll < 0.64 ? 'spikes' : roll < 0.84 ? 'shards' : 'blizzard';
        if (spell === 'freeze' && !mayFreeze(d, since)) return; // (point blank or too soon: not the freeze — the next turn is another spell)
        c.act = spell; c.actT = 0.7; c.actTo = e;
        if (spell === 'freeze' && e.giant) c.actT = Math.min(ICE.GIANT.WIND_MAX, 0.7 + ICE.GIANT.WIND_K * Math.max(0, (e.size || 1) - 1) * (e.size > 4 ? 1.6 : 1)); // (the greater the body, the longer the rod gathers its cold)
        this._say(c, { freeze: 'Замри навеки!', spikes: 'Лёд, пронзи их!', shards: 'Осколки зимы!', blizzard: 'Вьюга, прогони их!', summon: 'Снеговики, ко мне!' }[spell]);
    }

    /** The blade follows what she is doing: out while she charges (grown by time and by how near she is), out for a while after, then the rod again. */
    _bladeStep(c, dt, d) {
        const A = QUEEN_AI;
        const want = c.charge ? bladeGrow(c.bladeT || 0, d) : c.sheathT > 0 ? 1 : 0;
        const k = dt / (want > c.blade ? A.GROW : 0.45);
        c.blade = Math.max(0, Math.min(1, c.blade + Math.max(-k, Math.min(k, want - c.blade))));
    }

    /** (host) She runs at a frozen foe (fast), grows the blade, faces him within reach, raises it and — the blow comes in _queenCast('slash'). */
    _queenChase(c, e, d, dt) {
        const A = QUEEN_AI, p = c.model.position;
        c.bladeT = (c.bladeT || 0) + dt;
        this._bladeStep(c, dt, d);
        if (c.act) { c.moving = false; return; } // (the blade is raised)
        if (d > A.STRIKE - 0.5) { const t = this._wayTo(c, e.p); this._step(c, t.x, t.z, dt, t === e.p ? A.STRIKE - 1.5 + (e.rad || 0) : 1.2, A.CHARGE_SPEED / c.speed); }
        else { c.moving = false; this._face(c, e.p, dt); }
        if (c.blade < 0.9 || d > A.STRIKE) return;
        // «лицом к цели»: she raises the blade only facing him
        if (!facesTarget(c.model.rotation.y, p.x, p.z, e.p.x, e.p.z, FACE.MELEE)) { this._face(c, e.p, dt); return; }
        c.act = 'slash'; c.actT = A.WINDUP; c.actTo = e;
    }

    /** (host) The charge is over: the blade turns back into the rod after the blow (1.5 s) or after SHEATH s if she never struck. */
    _chargeEnd(c, struck) {
        c.charge = null;
        c.sheathT = struck ? 1.5 : QUEEN_AI.SHEATH;
    }

    /** (host) A player's computer answered whether the queen's freeze took him (a shield held it: she does not chase). */
    _frozeAnswer(id, ok, T) {
        const c = this.queen;
        if (!c?.charge || c.charge.id !== id) return;
        if (!ok) { this._chargeEnd(c, false); c.sheathT = 0; return; }
        c.charge.until = this._t + Math.max(0.8, T - 0.3);
        c.charge.pend = false;
    }

    /** (host) Her spell leaves the rod (after the wind-up). */
    _queenCast(c, spell, e) {
        const g = this.game;
        const from = this._rodTip(c, new THREE.Vector3());
        const tp = e.k === 'p' ? this._playerCentre(e.id, new THREE.Vector3()) : null;
        if (!tp && spell !== 'summon') return;
        if (spell === 'summon') { for (let i = 0; i < 3; i++) this._spawnSnowman(c.model.position); this._fx({ e: 'fx', k: 'summon', o: [r2(from.x), r2(from.y), r2(from.z)] }); return; }
        if (spell === 'freeze') {
            this._fx({ e: 'fx', k: 'beam', o: [r2(from.x), r2(from.y), r2(from.z)], t: [r2(tp.x), r2(tp.y), r2(tp.z)] });
            c.lastFreeze = this._t;
            const r = this._freezePlayer(e.id, 'iceQueen', QUEEN_AI.FREEZE_T);
            const q = c.model.position, d = Math.max(0, Math.hypot(tp.x - q.x, tp.z - q.z) - (e.rad || 0));
            // (it took: she runs at him before he thaws — a guest's computer answers `frzr`; a shield held it: she goes on with her spells)
            if ((r === null || r.ok) && chargeOn(d, r ? r.T : QUEEN_AI.FREEZE_T)) { c.charge = { id: e.id, until: this._t + (r ? r.T : QUEEN_AI.FREEZE_T * 0.85) - 0.3, t0: this._t, pend: r === null }; c.bladeT = 0; c.sheathT = 0; }
            if (e.giant) c.giantFrozen = Date.now() + 9000;
            return;
        }
        if (spell === 'slash') {
            // the blow: the foe must still be within the blade's reach (he may have been thrown, have fled, thawed)
            const q = c.model.position, feet = e.k === 'p' ? this._playerFeet(e.id) : null;
            const reach = QUEEN_AI.STRIKE + 1.6 + (e.rad || 0);
            this._chargeEnd(c, true);
            if (!feet || Math.hypot(feet.x - q.x, feet.z - q.z) > reach) { c.sheathT = QUEEN_AI.SHEATH; return; }
            this._fx({ e: 'fx', k: 'slash', o: [r2(from.x), r2(from.y), r2(from.z)], t: [r2(tp.x), r2(tp.y), r2(tp.z)] });
            const push = _v3.set(tp.x - q.x, 0, tp.z - q.z).normalize().multiplyScalar(7).setY(3);
            this._hurtPlayer(e.id, QUEEN_AI.BLADE_DMG, 'blade', _v2.set(q.x, q.y + 3, q.z), push);
            this.game.fx.shake = Math.max(this.game.fx.shake || 0, 0.6);
            return;
        }
        if (spell === 'spikes') { const f = _feet(tp, new THREE.Vector3()); this._fx({ e: 'fx', k: 'spikes', t: [r2(f.x), r2(this._floor(f.x, f.z, f.y + 2)), r2(f.z)], q: [r2(from.x), r2(from.y), r2(from.z)] }); return; }
        if (spell === 'shards') { for (let i = 0; i < 5; i++) this._fire('shard', from, tp, { spread: 1.2, by: c.id, delay: i * 0.12, to: e }); return; }
        if (spell === 'blizzard') { const p = c.model.position; this._fx({ e: 'fx', k: 'gust', o: [r2(p.x), r2(p.y + 3), r2(p.z)], y: r2(c.model.rotation.y) }); }
    }

    _thinkMonster(c, dt) {
        const g = this.game, P = this.plan, M = ICE.MONSTER;
        const p = c.model.position;
        // guards: whoever comes near the gates (or struck it) — within its leash of its post
        let e = this._enemy(c, M.GUARD, _v3.set(P.gate.x, p.y, P.gate.z));
        if (!e && c.foe) e = this._enemy(c, M.LEASH);
        if (e && Math.hypot(e.p.x - c.home.x, e.p.z - c.home.z) > (this._offender(e.id) ? ICE.DEFEND.R : M.LEASH + 6)) e = null;
        c.target = e;
        if (c.act) { c.moving = false; return; }
        if (!e) {
            if (!this._step(c, c.home.x, c.home.z, dt, 0.8, 0.6)) this._face(c, _v.set(P.gate.out.x * 2 - P.gate.x, 0, P.gate.out.z * 2 - P.gate.z), dt);
            return;
        }
        const d = Math.max(0, Math.hypot(e.p.x - p.x, e.p.z - p.z) - (e.rad || 0));
        const REACH = M.REACH * c.reachK * (0.6 + 0.4 * c.sz); // (a melted giant is smaller: its arm reaches less)
        c.castT -= dt;
        if (d > REACH - 0.6) this._step(c, e.p.x, e.p.z, dt, REACH - 1 + (e.rad || 0));
        else { c.moving = false; this._face(c, e.p, dt); }
        // («лицом к цели»: it strikes / throws only facing its foe)
        if (!facesTarget(c.model.rotation.y, p.x, p.z, e.p.x, e.p.z, FACE.MELEE)) return;
        if (d <= REACH && c.castT <= 0) { c.castT = 1.6; c.act = 'punch'; c.actT = 0.55; c.actTo = e; }
        else if (d > 9 && d < 30 && c.castT <= -4 && (e.giant || this._sees(c, e.p))) { c.castT = 2; c.act = 'boulder'; c.actT = 0.8; c.actTo = e; }
    }

    _thinkSnowman(c, dt) {
        const g = this.game, P = this.plan, S = ICE.SNOW;
        const p = c.model.position;
        // the rod's holder near (the queen gone): his — they follow him and go for what he showed them
        const h = this.state.queenDead ? this._rodHolder() : null;
        let e = null;
        if (h && Math.hypot(h.p.x - p.x, h.p.z - p.z) < ICE.ROD.FOLLOW) {
            const cmd = this.rodCmd && !(this.rodCmd.k === 'I' && this.byId(this.rodCmd.id)?.type === 'friend') ? this.rodCmd : null;
            const tp = cmd ? this._bodyPos(cmd.k, cmd.id, new THREE.Vector3()) : null;
            if (tp) e = { k: cmd.k, id: cmd.id, p: tp, d: Math.hypot(tp.x - p.x, tp.z - p.z) };
            else {
                c.target = null;
                if (Math.hypot(h.p.x - p.x, h.p.z - p.z) > 5) { const t = this._wayTo(c, h.p); this._step(c, t.x, t.z, dt, 4); }
                else { c.moving = false; this._face(c, h.p, dt); }
                return;
            }
        }
        if (!e) e = this._enemy(c, S.SIGHT);
        c.target = e;
        if (!e) {
            // wandering round the palace
            if (!c.roam || Math.hypot(c.roam.x - p.x, c.roam.z - p.z) < 1.5 || (c.roamT -= dt) <= 0) {
                const a = Math.random() * Math.PI * 2, r = (P.A || P.R) * (0.4 + Math.random() * 0.5);
                c.roam = { x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r }; c.roamT = 8 + Math.random() * 8;
                if (Math.hypot(c.roam.x - P.hall.x, c.roam.z - P.hall.z) < P.hall.r + 4) c.roam = null;
            }
            if (c.roam) this._step(c, c.roam.x, c.roam.z, dt, 1, 0.45);
            return;
        }
        const d = Math.max(0, Math.hypot(e.p.x - p.x, e.p.z - p.z) - (e.rad || 0));
        const t = this._wayTo(c, e.p);
        if (t !== e.p || d > S.RANGE * 0.6) this._step(c, t.x, t.z, dt, 6);
        else if (d < 5) this._step(c, p.x - (e.p.x - p.x), p.z - (e.p.z - p.z), dt, 0.2, 0.6); // (keeps a throw away)
        else { c.moving = false; this._face(c, e.p, dt); }
        c.throwT -= dt;
        if (c.throwT > 0 || d > S.RANGE || t !== e.p) return;
        if (!facesTarget(c.model.rotation.y, p.x, p.z, e.p.x, e.p.z, FACE.ARROW * 1.5)) { this._face(c, e.p, dt); return; }
        const tp = e.k === 'p' ? this._playerCentre(e.id, new THREE.Vector3()) : this._bodyPos(e.k, e.id, new THREE.Vector3());
        if (!tp || !this._sees(c, tp)) return;
        c.throwT = S.THROW * (0.8 + Math.random() * 0.5);
        c.act = 'throw'; c.actT = 0.35; c.actTo = e;
        this._fire('snow', this._hand(c, new THREE.Vector3()), tp, { by: c.id, to: e, delay: 0.3 });
    }

    // ---------------------------------------------------------------- the friendly snowman (host)
    /** Is a player near enough for it to live (far from everybody it just stands, as the world does)? */
    _awake(c) {
        const p = c.model.position, R = ICE.FRIEND.AWAKE;
        for (const q of this._players()) if (Math.abs(q.p.x - p.x) < R && Math.abs(q.p.z - p.z) < R) return true;
        return false;
    }

    /**
     * The nearest heat round p within R (a campfire, a burning tree or block, fire / a blast the people
     * fear right now): `out` {x, z, d, k} — k how hot (1: a campfire … 2: a great fire) — or null.
     */
    _heatNear(p, R, out) {
        const g = this.game;
        let best = R;
        out.k = 0;
        const put = (x, z, y, k) => {
            if (Math.abs(y - p.y) > 6) return;
            const d = Math.hypot(x - p.x, z - p.z);
            if (d < best) { best = d; out.x = x; out.z = z; out.d = d; out.k = k; }
        };
        for (const f of g.campfires?.list?.values?.() || []) put(f.x, f.z, f.y, 1);
        const fire = g.fire;
        if (fire) {
            let n = 0;
            for (const b of fire.burningBlocks.values()) { if (++n > 400) break; if (Math.abs(b.x - p.x) < R && Math.abs(b.z - p.z) < R) put(b.x, b.z, b.L - 1, 1.5); }
            for (const { tree: t } of fire.burningTrees) if (t.alive) put(t.x, t.z, p.y, 2);
        }
        const fear = g.castleLife?.fright;
        if (fear) for (const z of fear.list.values()) {
            if (fear.now - z.at > 4) continue; // (only what is going on now)
            if (z.kind === 'fire' || z.kind === 'blast') put(z.x, z.z, z.y, z.kind === 'fire' ? 2 : 1);
            else if (z.kind === 'inspirius' || z.kind === 'boom' || z.kind === 'circle' || z.kind === 'ruin') put(z.x, z.z, z.y, 1);
        }
        return out.k > 0 ? out : null;
    }

    /** Somewhere to wander to near its home — snow if there is any (it keeps to the cold). */
    _friendRoam(c) {
        const t = this.game.world?.terrain?.data, p = c.model.position, F = ICE.FRIEND;
        let best = null;
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * F.ROAM;
            const x = c.home.x + Math.cos(a) * r, z = c.home.z + Math.sin(a) * r;
            const y = this._floor(x, z, p.y + 5);
            if (Math.abs(y - p.y) > 6) continue;
            const snow = t ? t.get(Math.round(x), Math.floor(y - 0.3 + 1.5), Math.round(z)) === BLOCK.SNOW : false;
            if (snow) return { x, z };
            if (!best) best = { x, z };
        }
        return best;
    }

    /** It wanders to and fro, stops to look round — and runs from the heat (near it, it melts). */
    _thinkFriend(c, dt) {
        const F = ICE.FRIEND, p = c.model.position;
        if (c.buildT < F.BUILD) { c.moving = false; return; } // (still being made)
        if ((c.heatT = (c.heatT || 0) - dt) <= 0) { c.heatT = 0.4; c.heat = this._heatNear(p, F.FLEE, c._heat || (c._heat = { x: 0, z: 0, d: 0, k: 0 })); }
        let h = c.heat;
        if (c.scaredT > 0) { // (fire hit it: it runs from where it came)
            c.scaredT -= dt;
            const d = Math.hypot(c.fireFrom.x - p.x, c.fireFrom.z - p.z);
            if (!h || d < h.d) h = { x: c.fireFrom.x, z: c.fireFrom.z, d, k: 0 };
        }
        if (h) {
            // near the heat it melts (it grows smaller: IceCastleLife._animate), and a great fire melts it away
            if (h.k > 0 && h.d < F.MELT) {
                const n = F.MELT_DPS * h.k * (1.4 - h.d / F.MELT) * dt;
                c.hp = Math.max(0, c.hp - n);
                c.melting = true;
                c.lastKind = 'heat';
                if (Math.random() < dt * 6) this.game.fx?.spark?.(_v.set(p.x, p.y + c.h * 0.8, p.z), 0xd8f4ff, 0.2, _v2.set(0, 1.5, 0), 1.0); // (steam)
                if (c.hp <= 0) { this._die(c, null); return; }
            }
            const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz) || 1;
            c.roam = null; c.idleT = 0;
            this._step(c, p.x + (dx / d) * 8, p.z + (dz / d) * 8, dt, 0.2, F.FLEE_K);
            return;
        }
        c.melting = false;
        // back in the cold, far from fire: the snow it stands on heals it a little
        if (c.hp < c.max) c.hp = Math.min(c.max, c.hp + dt * 0.15);
        if (c.idleT > 0) {
            c.idleT -= dt; c.moving = false;
            // (it looks at a player near)
            let q = null, qd = 7;
            for (const e of this._players()) { const d = Math.hypot(e.p.x - p.x, e.p.z - p.z); if (d < qd) { qd = d; q = e; } }
            if (q) this._face(c, q.p, dt);
            return;
        }
        if (!c.roam || Math.hypot(c.roam.x - p.x, c.roam.z - p.z) < 0.8 || (c.roamT -= dt) <= 0) {
            if (c.roam && Math.random() < 0.6) c.idleT = 1.5 + Math.random() * 3.5; // (a rest on the way)
            c.roam = this._friendRoam(c); c.roamT = 10 + Math.random() * 8;
            if (!c.roam) { c.idleT = 2; return; }
        }
        if (this._step(c, c.roam.x, c.roam.z, dt, 0.6, 1) && !c.moving) c.roamT -= dt * 3; // (blocked: it soon picks another way)
    }

    /** (host) A friendly snowman made by «Snowman» at pos. */
    makeFriend(pos, ry = 0) {
        if (this.list.filter((c) => c.type === 'friend' && !c.dead).length >= ICE.FRIEND.MAX) return null;
        const c = this._spawn('friend', pos, { yaw: ry });
        c.buildT = 0;
        c.idleT = 1;
        this._born(c);
        this._sendSoon = true;
        return c;
    }

    /** It is being made (every computer): the soft crunch and the merry ring. */
    _born(c) { this.game.sound?.playSnowman?.(c.model.position); }

    /**
     * «Snowman» said with the hand pointing at snow: the snow there rolls into three balls, they stack,
     * the coal eyes, the carrot and the twig arms come — and it is alive. Instant: no concentration held
     * (it is nobody's: «стоп» doesn't take it away). 30 mana (Creative: free).
     */
    castSnowman(isFinal = true) {
        const g = this.game, F = ICE.FRIEND;
        const now = Date.now();
        const early = g._interimCast;
        if (isFinal && early && early.name === 'Snowman' && now - early.at < 3000) { g._interimCast = null; return null; }
        if (now - (this._snowAt || 0) < 1500) return null;
        const say = (t) => { if (isFinal) g.hud?.setVoice?.(t, true); return null; };
        const h = g.builder?._hand?.();
        if (!h) return say('☃️ Поднимите руку, направьте её на снег и скажите «Snowman»');
        const t = g.world?.terrain?.data;
        const hit = t?.raycast(h.o, h.d, F.RANGE);
        if (!hit) return say('☃️ Направьте руку на снег (не дальше 16 м)');
        const b = t.get(Math.round(hit.x + h.d.x * 0.05), Math.floor(hit.y + h.d.y * 0.05 + 1.5), Math.round(hit.z + h.d.z * 0.05));
        if (b !== BLOCK.SNOW) return say('☃️ Снеговика лепят из снега — направьте руку на снег');
        if (g.ships?.footprintAt?.(hit.x, hit.y, hit.z)) return say('☃️ Здесь снеговик не встанет');
        if (this.list.filter((c) => c.type === 'friend' && !c.dead).length >= F.MAX) return say('☃️ Снеговиков вокруг уже много');
        const tired = g.combat?.check?.('Snowman');
        if (tired) return say(tired);
        g.combat?.pay?.('Snowman');
        g.mana?.success?.('Snowman');
        this._snowAt = now;
        g._interimCast = isFinal ? null : { name: 'Snowman', at: now };
        const pos = new THREE.Vector3(hit.x, 0, hit.z);
        pos.y = this._floor(pos.x, pos.z, hit.y + 1.2);
        const me = g.character.group.position;
        const ry = Math.atan2(-(me.x - pos.x), -(me.z - pos.z)); // (it comes alive facing its maker)
        if (this.auth) this.makeFriend(pos, ry);
        else g.sync?.ice?.({ e: 'mk', p: [r2(pos.x), r2(pos.y), r2(pos.z)], ry: r2(ry) });
        // the magic flies from the hand to the snow
        for (let k = 0; k < 18; k++) g.fx?.spark?.(_v.copy(h.o).lerp(pos, Math.random()), k % 2 ? 0xffffff : 0xcfeeff, 0.12, _v2.set(0, 0.3, 0), 0.6);
        return 'Snowman';
    }

    _loadFriends() {
        const l = this._friendsToLoad;
        this._friendsToLoad = null;
        for (const f of l) {
            if (this.list.filter((c) => c.type === 'friend').length >= ICE.FRIEND.MAX) break;
            const c = this._spawn('friend', new THREE.Vector3(f[0], f[1], f[2]), { yaw: f[3], hp: Math.max(1, Math.min(ICE.FRIEND.HP, +f[4] || ICE.FRIEND.HP)) });
            c.buildT = ICE.FRIEND.BUILD;
            if (Number.isFinite(f[5])) c.home.set(f[5], c.home.y, f[6]);
        }
        this._sendSoon = true;
    }

    /** (host) A wind-up done: the blow / the spell itself. */
    _actDone(c) {
        const e = c.actTo, act = c.act;
        c.act = null; c.actTo = null;
        if (!e) return;
        if (c.type === 'queen') { this._queenCast(c, act, e); return; }
        if (confusedMiss(c)) return; // (lost in Accentric's haze: the blow / the spell goes nowhere — StrongSpells)
        if (act === 'punch') {
            const tp = e.k === 'p' ? this._playerFeet(e.id) : this._bodyPos(e.k, e.id, new THREE.Vector3());
            if (!tp || Math.hypot(tp.x - c.model.position.x, tp.z - c.model.position.z) > ICE.MONSTER.REACH * c.reachK * (0.6 + 0.4 * c.sz) + 0.8 + (e.rad || 0)) return;
            // thrown back — away from the gates when it is at them (nobody gets in)
            const P = this.plan, p = c.model.position;
            const away = _v.set(tp.x - p.x, 0, tp.z - p.z);
            if (Math.hypot(tp.x - P.gate.x, tp.z - P.gate.z) < 12) away.set(P.gate.out.x - P.gate.x, 0, P.gate.out.z - P.gate.z);
            away.normalize().multiplyScalar(16 * (0.4 + 0.6 * c.dmgK)).setY(7 * (0.4 + 0.6 * c.dmgK)); // (a melted giant strikes weaker and throws less far)
            const pd = Math.max(1, Math.round(ICE.MONSTER.PUNCH * c.dmgK));
            if (e.k === 'p') this._hurtPlayer(e.id, pd, 'punch', p, away);
            else this._hurtBody(e.k, e.id, pd, c.id);
            this.game.fx.shake = Math.max(this.game.fx.shake || 0, 0.5);
        } else if (act === 'boulder') {
            const tp = e.k === 'p' ? this._playerCentre(e.id, new THREE.Vector3()) : this._bodyPos(e.k, e.id, new THREE.Vector3());
            if (tp) this._fire('boulder', this._hand(c, new THREE.Vector3()), tp, { by: c.id, to: e, dm: c.dmgK });
        }
    }

    _sees(c, tp) {
        if (tp.giant) return true; // (a body as great as a tower: no wall hides it)
        const col = this.game.collision, p = c.model.position;
        return !col?.lineOfSight || col.lineOfSight(p.x, p.y + c.h * 0.8, p.z, tp.x, tp.y + 1.5, tp.z, 1.0);
    }

    _hand(c, out) {
        const p = c.model.position, ry = c.model.rotation.y;
        const fx = -Math.sin(ry), fz = -Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry);
        const k = (c.type === 'monster' ? 2 : 1) * (c.sz || 1);
        return out.set(p.x + fx * 0.9 * k + sx * 0.6 * k, p.y + c.h * 0.75, p.z + fz * 0.9 * k + sz * 0.6 * k);
    }

    /** The crystal of a holder's rod (the queen: in her right hand). */
    _rodTip(c, out) {
        const rod = c.model.userData.rod;
        if (rod) { rod.updateWorldMatrix(true, false); return rod.localToWorld(out.set(0, ROD_TIP, 0)); }
        return this._hand(c, out);
    }

    _playerFeet(id) {
        for (const q of this._players()) if (q.id === id) return q.p;
        return null;
    }

    _playerCentre(id, out) {
        const g = this.game;
        out.giant = false;
        for (const q of this._players()) if (q.id === id) { out.giant = q.giant; break; }
        if (id === g.localId) return g.combat?.center ? g.combat.center(out) : out.copy(g.character.group.position);
        const r = g.remotes?.get(id);
        return r?.position ? out.copy(r.position).add(_v2.set(0, 0.6, 0)) : null;
    }

    /** Where a body of a duel kind is (its middle), or null. */
    _bodyPos(k, id, out) {
        const g = this.game;
        if (k === 'p') return this._playerCentre(id, out);
        if (k === 'I') { const c = this.byId(id); return c ? iceCenter(c, out) : null; }
        const e = this._be || (this._be = { kind: k, id, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 });
        const b = g.duel?._bodyOf?.(k, id, e);
        return b ? out.copy(b.a).lerp(b.b, 0.5) : null;
    }

    /** (host) A creature of any kind takes damage from the castle's creatures (MagicWave.hitBody knows each kind's rules). */
    _hurtBody(k, id, dmg, by, shove = null) {
        const g = this.game;
        if (k === 'I') { const c = this.byId(id); if (c && dmg > 0) this.hit(c, dmg, 'snow', null); return; }
        if (k === 'p') { this._hurtPlayer(id, dmg, 'snow'); return; }
        const kinds = { z: 'zombie', v: 'villager', a: 'animal', c: 'sailor', s: 'spider', D: 'dragon', f: 'phoenix', t: 'tree', b: 'book' };
        let obj = null;
        if (k === 'z') obj = g.zombieById?.get(id);
        else if (k === 's') obj = g.spiders?.byId(id);
        else if (k === 'D') obj = g.dragons?.byId(id);
        else obj = g.duel?._creature?.(k, id);
        if (!obj || !kinds[k]) return;
        const p = this._bodyPos(k, id, new THREE.Vector3()) || new THREE.Vector3();
        if (shove) { // (a snowball: no damage, no anger — a shove ≈ 1 m, the creature reels but keeps its feet)
            g.creatureImpact?.apply(obj, { v: shove.clone(), from: p.clone().sub(shove), by, kind: 'snow', stand: true, noSlide: false });
            return;
        }
        hitBody(g, kinds[k], obj, p, dmg, new THREE.Vector3(0, 0, 1), 'snow', by, 'snow');
    }

    // ================================================================ players: what reaches me
    /** (host) Hurt a player: my own self here; another's on his computer. */
    _hurtPlayer(id, dmg, kind, from = null, push = null, qk = null) {
        const g = this.game;
        if (id === g.localId) this._hurtMe(dmg, kind, from, push, qk);
        else g.sync?.ice?.({ e: 'hurt', to: id, dmg, kind, q: qk, f: from ? [r2(from.x), r2(from.y), r2(from.z)] : null, v: push ? [r2(push.x), r2(push.y), r2(push.z)] : null });
    }

    /**
     * (my computer) Does my shield stop an ice blow of the castle coming from `from`? «Protection» (facing it) and «Protection Maxima» (the dome,
     * all round, and half the price) hold the queen's freeze, shards, spikes, gust and blade — flash, mana paid; out of mana the shield
     * shatters and the blow goes on (QUEEN_VS). → true: held.
     */
    _shieldTakes(from, kind) {
        const c = this.game.combat;
        if (!from || !c?.shieldFactor) return false;
        return c.shieldFactor(from) >= 1 && !!c._blocked?.(from, kind);
    }

    /**
     * (my computer) A blow that got past the shield: the magic robe / armour do NOT stop it (QUEEN_VS.magicRobe) — they only pay for it, the
     * reserve going down by the spell's price (Armor.pierce). → true if a magic reserve paid (the freeze is shorter then).
     */
    _pierce(qk) {
        const g = this.game;
        if (!qk || !g.armor?.pierce) return false;
        return !!g.armor.pierce('Frozen', shieldHitCost(qk) * 2);
    }

    _hurtMe(dmg, kind, from = null, push = null, qk = null) {
        const g = this.game, c = g.combat;
        if (!c || g.isDeadLocal || c.dead) return;
        if (kind === 'snow') { this._snowOnMe(from, push); return; }
        if (kind === 'blade') { this._bladeOnMe(dmg, from, push); return; }
        if (this._shieldTakes(from, qk || (kind === 'punch' ? 'punch' : 'ice'))) return; // (my «Protection» takes it)
        if (qk) this._pierce(qk); // (the robe is not a shield: the blow comes through, the robe's reserve pays)
        if (c?.enabled) c.damage(dmg, null, kind === 'punch' ? 'iceMonster' : 'ice'); else g.damageLocalPlayer?.(dmg);
        if (push) g.knockback?.add(push);
        if (kind === 'punch') g.hud?.setVoice?.(`🧊 Удар ледяного монстра: −${dmg} HP`, true);
    }

    /**
     * (my computer) The queen's blade falls on me. The shield (Protection / Maxima) stops it; one who is FROZEN is broken to pieces («Вас разбил
     * жезл Королевы»; the monster form's ice is not shattered by blows — it takes the blade as a blow); one who is not takes BLADE_DMG through
     * the armour (the robe's reserve pays).
     */
    _bladeOnMe(dmg, from, push) {
        const g = this.game, c = g.combat;
        if (this._shieldTakes(from, 'QueenBlade')) { g.hud?.setVoice?.('🛡️ Щит удержал клинок Королевы', true); return; }
        if (c.godsKeepsOff?.('iceBlade')) { c._godsFx?.(null); return; }
        const mon = g.monster?.active;
        const magic = this._pierce('QueenBlade');
        if (c.frozen && !mon && c.enabled) { c.die(null, 'iceQueen'); return; } // (the fight modes only: where combat is off — «Айс» too — a frozen one is only hurt)
        if (c?.enabled) c.damage(dmg, null, 'iceBlade'); else g.damageLocalPlayer?.(dmg);
        if (push) g.knockback?.add(push);
        g.hud?.setVoice?.(magic ? `🧊 Клинок Королевы рассёк защиту мантии: −${dmg} HP` : `🧊 Клинок Королевы: −${dmg} HP`, true);
    }

    /**
     * (my computer) An evil snowman's snowball reached me (the author: it takes no HP, wears no armour / robe / shield /
     * magic durability, costs no mana; it only shoves me ≈ 1 m back — to get in the way). A shield in front stops the
     * shove for free; BodyImpact: the «устоял» pose (`stand`), a house's / the gods' ward still hold.
     */
    _snowOnMe(from, push) {
        const g = this.game, c = g.combat;
        if (!push || push.lengthSq() < 1e-6) return;
        if (from && c.shieldFactor?.(from) >= 1) return;
        g.hud?.flashColor?.('rgba(230, 245, 255, 0.35)');
        g.impact?.apply({ v: push.clone(), from: from ? from.clone() : null, by: null, kind: 'snow', stand: true, noShield: true });
    }

    /** (host / the caster's computer) Freeze a player in ice (the rod's ice: through any armour, but not through a shield). → {ok, T} for me; null: asked of his computer (it answers `frzr`). */
    _freezePlayer(id, by, T) {
        const g = this.game;
        if (id === g.localId) return this._frozenMe(by, T);
        g.sync?.ice?.({ e: 'frz', to: id, by, T });
        return null;
    }

    /**
     * (my computer) The rod's / the queen's ice reached me. A raised «Protection» (facing it) or the dome holds it (QUEEN_VS); a magic set / robe do
     * not — they only shorten the queen's freeze (×0.6) and pay for it; the gods' dome keeps it off. → {ok, T, held}
     */
    _frozenMe(by, T) {
        const g = this.game, c = g.combat;
        if (!c || g.isDeadLocal || c.dead) return { ok: false, T: 0 };
        const queen = by === 'iceQueen';
        const src = queen ? this.queen?.model.position : this._casterPos(by, { model: g.character.group });
        if (src && this._shieldTakes(src, queen ? 'QueenFreeze' : 'Frozen')) { if (queen) g.hud?.setVoice?.('🛡️ Щит удержал заморозку Ледяной Королевы', true); return { ok: false, T: 0, held: true }; }
        // (the Ice Rod is a gift of the gods: it freezes anybody — even the pentagram's monster, even a rider on a dragon; the others' cold does not)
        const mon = g.monster?.active;
        const magic = queen ? this._pierce('QueenFreeze') : false;
        if (queen) T = freezeSeconds(T, magic);
        c.freeze(by, T, { rod: true });
        if (!c.frozen) return { ok: false, T: 0 }; // (the gods' dome kept it off)
        g.hud?.flashColor?.('rgba(150, 220, 255, 0.6)');
        g.hud?.setVoice?.(queen ? (magic ? '🧊 Вы заморожены! Магия доспехов укоротила лёд — вставайте скорее, Королева бежит с клинком' : '🧊 Вы заморожены! Королева бежит к вам с клинком — вам нечем защититься') : mon ? '🧊 Вы заморожены посохом Ледяной Королевы — даже монстр не устоял перед божественным льдом' : '🧊 Ледяной Жезл заморозил вас — магические доспехи не спасают', true);
        if (g.dragonRide?.riding) g.dragonRide.iced?.(T);
        return { ok: true, T };
    }

    // ================================================================ shots
    /** (host) A shot leaves `from` for `to` (snow: a snowflake −1; shard −3; boulder −10), sent to all. */
    _fire(kind, from, to, { spread = 0, by = null, delay = 0, to: target = null, dm = 1 } = {}) {
        const speed = kind === 'boulder' ? 17 : kind === 'shard' ? 26 : 19;
        const tp = _v.copy(to).add(_v2.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.5, (Math.random() - 0.5) * spread));
        const d = Math.max(0.5, from.distanceTo(tp));
        const t = d / speed;
        const v = new THREE.Vector3().subVectors(tp, from).divideScalar(t);
        v.y += 0.5 * ICE.G * t; // (lobbed: it falls onto its target)
        const m = { e: 'shot', k: kind, o: [r2(from.x), r2(from.y), r2(from.z)], v: [r2(v.x), r2(v.y), r2(v.z)], by, d: delay, to: target ? [target.k, target.id] : null, dm: r2(dm) };
        this._addShot(m);
        this.game.sync?.ice?.(m);
    }

    _addShot(m) {
        const kind = m.k;
        const mesh = kind === 'shard' ? shardModel() : snowflakeShotModel();
        if (kind === 'boulder') mesh.scale.setScalar(3.2 * (0.5 + 0.5 * Math.max(0.2, Math.min(1, +m.dm || 1))));
        mesh.position.copy(vec(m.o));
        mesh.visible = !(m.d > 0);
        this.game.scene.add(mesh);
        this.shots.push({ kind, mesh, v: vec(m.v), by: m.by, delay: +m.d || 0, life: 5, to: m.to, dmg: (kind === 'boulder' ? ICE.MONSTER.BOULDER : kind === 'shard' ? 3 : 0) * Math.max(0.2, Math.min(1, +m.dm || 1)), r: kind === 'boulder' ? 1.0 : 0.35 });
    }

    _updateShots(dt) {
        const g = this.game, t = g.world?.terrain?.data;
        const meC = !g.isDeadLocal && !g.combat?.dead ? g.combat?.center?.(new THREE.Vector3()) : null;
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i];
            if (s.delay > 0) { s.delay -= dt; if (s.delay <= 0) s.mesh.visible = true; continue; }
            s.life -= dt;
            const p = s.mesh.position;
            s.v.y -= ICE.G * dt;
            p.addScaledVector(s.v, dt);
            s.mesh.rotation.z += dt * 9; s.mesh.rotation.x += dt * 5;
            if (s.kind === 'shard') s.mesh.quaternion.setFromUnitVectors(_v.set(0, 0, 1), _v2.copy(s.v).normalize());
            let end = s.life <= 0 || (t && t.isSolidAt(p.x, p.y, p.z));
            // me (my computer decides: my shield, my health)
            if (!end && meC && s.to?.[0] !== 'I' && meC.distanceTo(p) < s.r + 0.8) {
                end = true;
                const from = _v2.copy(p).addScaledVector(s.v, -0.05);
                if (s.kind === 'snow') {
                    // (a snowball is no spell: a shield stops its shove for nothing — 'Bounce' costs no mana)
                    if (g.combat?.shieldFactor?.(from) >= 1 && g.combat._blocked?.(from, 'Bounce')) this._burst(p, 8);
                    else this._hurtMe(0, 'snow', from, _v3.copy(s.v).setY(0).normalize().multiplyScalar(ICE.SNOW.PUSH));
                } else this._hurtMe(s.dmg, 'ice', from, s.kind === 'boulder' ? _v3.copy(s.v).setY(0).normalize().multiplyScalar(9).setY(5) : null, s.kind === 'shard' ? 'QueenShard' : null); // (the shield asks inside: the shard's price, the boulder's)
            }
            // (host) the creature it was thrown at, when it is not a player
            if (!end && this.auth && s.to && s.to[0] !== 'p') {
                const tp = this._bodyPos(s.to[0], s.to[1], _v3);
                if (tp && tp.distanceTo(p) < s.r + (s.to[0] === 'I' ? 1.6 : 1.0)) { end = true; this._shotHits(s); }
            }
            if (end) { if (s.kind === 'snow' && s.life > 0) g.sound?.playSnowStep?.(1.6); this._burst(p, s.kind === 'boulder' ? 26 : 8); this._dropShot(i); }
        }
    }

    /** (host) A shot reached the creature it was thrown at. Snowball: against another evil snowman it breaks it (the rod's war); on anything else it only shoves. */
    _shotHits(s) {
        const k = s.to[0];
        if (s.kind !== 'snow') { this._hurtBody(k, s.to[1], s.dmg, s.by); return; }
        if (k === 'I') { this._hurtBody(k, s.to[1], ICE.SNOW.DMG, s.by); return; }
        this._hurtBody(k, s.to[1], 0, s.by, _v3.copy(s.v).setY(0).normalize().multiplyScalar(ICE.SNOW.PUSH));
    }

    _burst(p, n) { for (let i = 0; i < n; i++) this.game.fx?.spark?.(p, i % 2 ? 0xffffff : 0xcfeeff, 0.12 + Math.random() * 0.1, _v2.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.6); }

    _dropShot(i) {
        const s = this.shots[i];
        this.game.scene.remove(s.mesh);
        this.shots.splice(i, 1);
    }

    // ================================================================ the queen's magic (every computer sees it)
    _fx(m) { this._applyFx(m); this.game.sync?.ice?.(m); }

    _applyFx(m) {
        const g = this.game;
        if (m.k === 'beam') {
            const o = vec(m.o), t = vec(m.t);
            const n = Math.ceil(o.distanceTo(t) / 0.6);
            for (let i = 0; i <= n; i++) g.fx?.spark?.(_v.lerpVectors(o, t, i / n), i % 2 ? 0xffffff : 0x9fe3ff, 0.18, _v2.set(0, 0.2, 0), 0.5);
            g.sound?.playIce?.();
        } else if (m.k === 'slash') {
            // the blade's blow: an arc of ice sparks from raised to low, a crack of ice
            const o = vec(m.o), t = vec(m.t);
            for (let i = 0; i <= 22; i++) { const k = i / 22, a = k * Math.PI; g.fx?.spark?.(_v.set(o.x + (t.x - o.x) * k, o.y + (t.y - o.y) * k + Math.sin(a) * 2.2, o.z + (t.z - o.z) * k), i % 2 ? 0xffffff : 0x9fe3ff, 0.22, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.6); }
            g.sound?.playIce?.('iceCrack', t, 1.2, 1.1);
            g.sound?.playFrozenHit?.();
        } else if (m.k === 'summon') {
            const o = vec(m.o);
            for (let i = 0; i < 30; i++) g.fx?.spark?.(o, 0xe8fbff, 0.2, _v2.set((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8), 1);
        } else if (m.k === 'spikes') {
            // a frost ring on the ground, then the spikes burst up out of it
            this.fxs.push({ k: 'spikes', p: vec(m.t), from: m.q ? vec(m.q) : null, t: 0, hit: false, meshes: [] });
        } else if (m.k === 'gust') {
            this.fxs.push({ k: 'gust', p: vec(m.o), y: +m.y || 0, t: 0, hit: false });
        }
    }

    _updateFx(dt) {
        const g = this.game;
        for (let i = this.fxs.length - 1; i >= 0; i--) {
            const f = this.fxs[i];
            f.t += dt;
            if (f.k === 'spikes') {
                if (f.t < 0.8) { if (Math.random() < 0.7) g.fx?.spark?.(_v.set(f.p.x + (Math.random() - 0.5) * 3, f.p.y + 0.1, f.p.z + (Math.random() - 0.5) * 3), 0xbfefff, 0.15, _v2.set(0, 0.6, 0), 0.4); continue; }
                if (!f.meshes.length) {
                    for (let k = 0; k < 6; k++) {
                        const m = iceSpikeModel();
                        const a = (k / 6) * Math.PI * 2, d = k ? 1.1 : 0;
                        m.position.set(f.p.x + Math.cos(a) * d, f.p.y - 0.5, f.p.z + Math.sin(a) * d);
                        m.scale.set(0.9, 0.01, 0.9);
                        m.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
                        g.scene.add(m);
                        f.meshes.push({ m, h: k ? 2 + Math.random() * 1.5 : 3.6 });
                    }
                    g.sound?.playFrozenHit?.();
                }
                const k = Math.min(1, (f.t - 0.8) / 0.15);
                for (const s of f.meshes) s.m.scale.y = s.h * (f.t < 2.6 ? k : Math.max(0.01, 1 - (f.t - 2.6) / 0.6));
                // (my computer: am I on it? up and hurt)
                if (!f.hit && f.t >= 0.85) {
                    f.hit = true;
                    const me = g.character?.group.position;
                    if (me && Math.hypot(me.x - f.p.x, me.z - f.p.z) < 1.9 && Math.abs(me.y - 1.95 - f.p.y) < 2.5) this._hurtMe(9, 'ice', f.from || f.p, _v.set(0, 9, 0), 'QueenSpikes'); // (from the queen: «Protection» facing her / the dome holds the spikes too)
                }
                if (f.t > 3.2) { for (const s of f.meshes) g.scene.remove(s.m); this.fxs.splice(i, 1); }
            } else if (f.k === 'gust') {
                const fx = -Math.sin(f.y), fz = -Math.cos(f.y);
                for (let n = 0; n < 6; n++) {
                    const d = Math.random() * 16;
                    g.fx?.spark?.(_v.set(f.p.x + fx * d + (Math.random() - 0.5) * d * 0.5, f.p.y + (Math.random() - 0.5) * 2, f.p.z + fz * d + (Math.random() - 0.5) * d * 0.5), 0xffffff, 0.12, _v2.set(fx * 14, 0, fz * 14), 0.5);
                }
                if (!f.hit && f.t > 0.2) {
                    f.hit = true;
                    const me = g.character?.group.position;
                    if (me) {
                        const dx = me.x - f.p.x, dz = me.z - f.p.z, d = Math.hypot(dx, dz);
                        if (d < 18 && (dx * fx + dz * fz) / Math.max(0.01, d) > Math.cos(0.6)) this._hurtMe(3, 'ice', f.p, _v.set(fx * 15, 4, fz * 15), 'QueenGust');
                    }
                }
                if (f.t > 1.2) this.fxs.splice(i, 1);
            }
        }
    }

    // ================================================================ looks
    _animate(c, dt) {
        const u = c.model.userData;
        const t = (c.walkT += dt * (c.moving ? (c.type === 'snowman' ? 7 : 5) : 1.2));
        if (c.act) { c.actT -= dt; if (c.actT <= 0 && this.auth) this._actDone(c); }
        const actK = c.act ? 1 : Math.max(0, (c.actLook || 0) - dt * 3);
        c.actLook = c.act ? 1 : actK;
        if (c.hurtT > 0) c.hurtT -= dt * (this.auth ? 0 : 1);
        if (c.sway) { c.model.rotation.z = Math.sin(t * 6) * c.sway; c.sway = Math.max(0, c.sway - dt * 0.5); } else c.model.rotation.z = 0;
        if (c.type === 'queen') {
            if (c.act) c.lastAct = c.act;
            c.bladeV = this.auth ? c.blade : c.bladeV + (c.blade - c.bladeV) * Math.min(1, dt * 10); // (a guest sees the blade grow smoothly)
            u.armR.rotation.x = -0.25 - actK * (c.lastAct === 'slash' ? 2.9 : 1.6) - c.bladeV * 0.5 + Math.sin(t * 0.8) * 0.04; // (the blade raised high before the blow, then it falls with the actLook's decay)
            u.armL.rotation.x = -0.15 - actK * 0.6 + (c.moving ? Math.sin(t) * 0.25 : 0);
            u.armL.rotation.z = -0.15 - actK * 0.5;
            u.cape.rotation.x = 0.06 + (c.moving ? 0.1 + Math.sin(t * 2) * 0.03 : Math.sin(t) * 0.02);
            u.skirt.rotation.y = Math.sin(t * 2) * (c.moving ? 0.05 : 0.01);
            ICE_MATERIALS.sparkle.opacity = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 160));
            const cr = u.rod.userData.crystal;
            if (cr) cr.scale.setScalar(1 + actK * 0.5 + c.bladeV * 0.8 + Math.sin(t * 3) * 0.05);
            if (u.blade) this._bladeLook(c, u);
        } else if (c.type === 'monster') {
            const w = c.moving ? Math.sin(t) : 0;
            u.legL.rotation.x = w * 0.45; u.legR.rotation.x = -w * 0.45;
            u.armL.rotation.x = -w * 0.35 + (c.act === 'punch' ? -actK * 2.2 : 0) + (c.act === 'boulder' ? -actK * 2.8 : 0);
            u.armR.rotation.x = w * 0.35 + (c.act === 'boulder' ? -actK * 2.8 : 0);
            u.torso.rotation.x = -0.5 + (c.act === 'punch' ? actK * 0.25 : 0) + Math.sin(t * 0.7) * 0.03;
        } else if (c.type === 'friend') {
            this._animFriend(c, u, t, dt);
        } else {
            // a snowman hops along (no legs): the body bounces, the twigs swing; out of the snow when it rises
            const hop = c.moving ? Math.abs(Math.sin(t)) * 0.35 : 0;
            u.body.position.y = hop; u.head.position.y = 2.6 + hop + Math.sin(t * 0.9) * 0.03;
            u.armR.rotation.x = c.act === 'throw' ? -2.4 * actK : Math.sin(t) * 0.2;
            u.armL.rotation.x = -Math.sin(t) * 0.2;
            if (c.rise > 0) { c.model.scale.setScalar(Math.max(0.05, 1 - c.rise) * c.sz); } else if (Math.abs(c.model.scale.x - c.sz) > 1e-3 && !c.dead) c.model.scale.setScalar(c.sz);
        }
        // hurt: a flash of red
        const hurt = c.hurtT > 0;
        if (hurt !== !!c._hurtShown) {
            c._hurtShown = hurt;
            c.model.traverse((o) => { if (o.isMesh && (o.material === ICE_MATERIALS.solid || o.material === ICE_MATERIALS.hit)) o.material = hurt ? ICE_MATERIALS.hit : ICE_MATERIALS.solid; });
            c.one?.check(); // (the one shape in the new colour at once)
        }
        if (c.one && (c.oneT += dt) > 0.5) { c.oneT = 0; c.one.check(); } // (a part shown / hidden by the game)
        if ((c.type === 'monster' || c.type === 'snowman') && (c.meltHot > 0 || c.melt > 0)) this._meltLook(c, dt);
    }

    /** The queen's rod grows into a blade (scale), with a ringing of ice and a flurry of sparks; it turns back the same way. */
    _bladeLook(c, u) {
        const g = this.game, v = c.bladeV;
        u.blade.scale.set(1, Math.max(0.001, v * QUEEN_AI.BLADE_LEN), 1);
        if (v > 0.06 && !c._bladeOut) { c._bladeOut = true; g.sound?.playIce?.('iceChime', c.model.position, 1.1, 1); g.sound?.playIce?.('iceCrack', c.model.position, 0.8, 1.5); }
        else if (v < 0.02) c._bladeOut = false;
        if (v > 0.06 && v < 0.97 && Math.random() < 0.6) { // (ice growing along it)
            const tip = this._rodTip(c, _v);
            for (let i = 0; i < 2; i++) g.fx?.spark?.(tip, i ? 0xffffff : 0x9fe3ff, 0.16, _v2.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
        }
    }

    /** A melting giant / snowman: steam while the fire is on it, drips and a crackle while it is smaller than it was (near the player only). */
    _meltLook(c, dt) {
        const g = this.game, me = g.character?.group?.position, p = c.model.position;
        if (c.meltHot > 0) c.meltHot -= dt;
        if (!me || (me.x - p.x) ** 2 + (me.z - p.z) ** 2 > 130 * 130) return;
        c._dripAcc = (c._dripAcc || 0) + ((c.meltHot > 0 ? 16 : 0) + c.melt * 4) * dt * (c.type === 'monster' ? 1 : 0.5);
        for (let n = 0; c._dripAcc >= 1 && n < 6; n++, c._dripAcc -= 1) {
            const a = Math.random() * Math.PI * 2, rr = c.r * 0.8 * Math.random(), y = p.y + c.h * (0.15 + 0.8 * Math.random());
            const steam = c.meltHot > 0 && Math.random() < 0.65;
            g.fx?.spark?.(_v.set(p.x + Math.cos(a) * rr, y, p.z + Math.sin(a) * rr), steam ? 0xeef9ff : 0x9fd8ff, steam ? 0.3 * c.sz + 0.1 : 0.12, steam ? _v2.set(Math.cos(a) * 0.4, 1.6 + Math.random() * 1.6, Math.sin(a) * 0.4) : _v2.set(0, -1 - Math.random(), 0), steam ? 1.2 : 0.7);
        }
        c._dripAcc = Math.min(c._dripAcc, 2);
        if (c.meltHot > 0 && Math.random() < dt * 1.6) g.sound?.playIce?.('iceCrack', p, 0.35, 1.3 + Math.random() * 0.6); // (the ice crackles in the heat)
    }

    /**
     * The friendly snowman: made bit by bit (three balls of snow roll and stack, then the face and the
     * twigs come, it blinks and turns its head — alive), then it waddles, blinks, looks about; the heat
     * melts it smaller.
     */
    _animFriend(c, u, t, dt) {
        const F = ICE.FRIEND, g = this.game;
        const B = c.buildT = Math.min(F.BUILD + 1, (c.buildT ?? F.BUILD) + dt);
        const cl = (x) => Math.max(0.01, Math.min(1, x));
        if (B < F.BUILD) {
            const k0 = cl(B / 0.9), k1 = cl((B - 0.9) / 0.8), k2 = cl((B - 1.75) / 0.8), k3 = cl((B - 2.55) / 0.5);
            u.base.scale.setScalar(k0); u.base.rotation.x = (1 - k0) * 5; u.base.position.y = 0.55 * k0; // (the first ball rolls up)
            u.mid.visible = B > 0.9; u.mid.scale.setScalar(cl(k1 * 1.6)); u.mid.position.y = 1.4 + (1 - k1) ** 2 * 1.4; // (the second lands on it)
            u.head.visible = B > 1.75; u.head.scale.setScalar(cl(k2 * 1.6)); u.head.position.y = 2.08 + (1 - k2) ** 2 * 1.2; // (the head on top)
            u.face.scale.setScalar(k3); u.scarf.scale.setScalar(k3); u.armL.scale.setScalar(k3); u.armR.scale.setScalar(k3); // (coal, carrot, twigs, the scarf)
            u.lids.visible = B > 3.1 && B < 3.24; // (it blinks…)
            u.head.rotation.y = B > 3.05 ? Math.sin(((B - 3.05) / 0.55) * Math.PI * 2) * 0.45 : 0; // (…and looks round: alive)
            if (B < 2.6 && Math.random() < dt * 16) {
                const p = c.model.position, a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 1.2;
                g.fx?.spark?.(_v.set(p.x + Math.cos(a) * r, p.y + 0.15, p.z + Math.sin(a) * r), 0xffffff, 0.14, _v2.set(-Math.cos(a) * r * 1.5, 0.8, -Math.sin(a) * r * 1.5), 0.6); // (the snow gathers in)
            }
            return;
        }
        if (!c._built) {
            c._built = true;
            u.base.scale.setScalar(1); u.base.rotation.x = 0;
            for (const o of [u.mid, u.head, u.face, u.scarf, u.armL, u.armR]) { o.visible = true; o.scale.setScalar(1); }
        }
        const hop = c.moving ? Math.abs(Math.sin(t)) * 0.15 : 0;
        u.base.position.y = 0.55 + hop; u.mid.position.y = 1.4 + hop; u.head.position.y = 2.08 + hop + Math.sin(t * 0.9) * 0.02;
        const scared = c.moving && c.melting;
        u.armL.rotation.z = scared ? -2.3 : -1.2; u.armR.rotation.z = scared ? 2.3 : 1.2; // (running from the heat: twigs up)
        u.armR.rotation.x = Math.sin(t) * 0.25; u.armL.rotation.x = -Math.sin(t) * 0.25;
        u.head.rotation.y = c.moving ? 0 : Math.sin(t * 0.45) * 0.4;
        c.blinkT = (c.blinkT ?? 3) - dt;
        if (c.blinkT <= -0.13) c.blinkT = 2.5 + Math.random() * 3.5;
        u.lids.visible = c.blinkT < 0;
        // the heat melts it smaller (its health is its snow)
        const k = 0.5 + 0.5 * Math.max(0, c.hp) / c.max;
        if (Math.abs(c.model.scale.x - k) > 0.004) c.model.scale.setScalar(k);
    }

    /** The queen speaks (coldly, majestically): words over her head, her voice if the villagers have voices. */
    _say(c, text, broadcast = true) {
        const g = this.game;
        if (!c.bubble) { c.bubble = new SpeechBubble(); g.scene.add(c.bubble.sprite); }
        c.bubble.show(text, { name: 'Ледяная Королева', seconds: 4, shout: /!$/.test(text), color: '#2a6f9e' });
        const me = g.character?.group.position;
        const talk = g.castleLife?.talk;
        if (me && talk?.voiceOn && talk.speech?.supported && c.model.position.distanceTo(me) < 45) {
            talk.speech.say(text, { voiceKey: 'iceQueen', role: 'queen', female: true, volume: 1, shout: /!$/.test(text) });
        }
        if (broadcast && this.auth) g.sync?.ice?.({ e: 'say', id: c.id, text });
    }

    _hudBar() {
        const g = this.game;
        if (typeof document === 'undefined') return;
        const q = this.queen;
        const me = g.character.group.position;
        const show = !!q && q.model.position.distanceTo(me) < 70;
        if (!this._hud && !show) return;
        if (!this._hud) {
            const el = this._hud = document.createElement('div');
            el.id = 'ice-bar';
            el.innerHTML = '<div class="boss-name">❄️ Ледяная Королева</div><div class="boss-track"><div class="boss-fill"></div></div>';
            document.body.appendChild(el);
        }
        if (this._hudShown !== show) { this._hudShown = show; this._hud.style.display = show ? 'block' : 'none'; }
        const w = show ? (100 * q.hp / ICE.QUEEN.HP).toFixed(1) + '%' : null;
        if (show && w !== this._hudW) { this._hudW = w; (this._fill || (this._fill = this._hud.querySelector('.boss-fill'))).style.width = w; }
    }

    // ================================================================ the gates and the chandelier
    _makeGates() {
        const g = this.game, P = this.plan;
        // the gates (strong, not invulnerable) and the chandelier on its chain: IceFixtures.js
        this.fixtures.make();
        this._gates = this.fixtures.leaves;
        const ry = iceYaw(P);
        // her chests by the throne: locked while she lives (Game.openChest → Items.lootChest 'iceQueen')
        this._chests = (P.chests || []).map((c, i) => {
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y, c.z), 'loot', ry, 'iceChest' + i, { style: 'ice' });
            chest.room = 'iceQueen';
            chest.locked = !this.state.queenDead;
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision?.addBox(chest.getCollisionBox());
            if (g._openedChests?.has(chest.id)) chest.setOpenInstant();
            g.chests?.push(chest);
            return chest;
        });
    }

    _dropGates() {
        const g = this.game;
        this.fixtures.drop();
        this._gates = null;
        for (const c of this._chests || []) {
            if (c.isOpen) (g._openedChests = g._openedChests || new Set()).add(c.id);
            if (c.boxId != null) g.collision?.removeBox(c.boxId);
            c.dispose();
            const i = g.chests?.indexOf(c);
            if (i >= 0) g.chests.splice(i, 1);
        }
        this._chests = null;
    }

    /** (host) The gates swing open before the castle's own creatures. */
    _openGates() {
        const g = this.game;
        for (const id of this._gates || []) {
            const d = g.doors?.list?.get(id);
            if (!d || d.a > 1.2 || d.holdSide) continue;
            g.doors._setAngle(d, 1.5);
            g.sync?.doorAngle?.(id, d.a);
        }
    }

    // ================================================================ fire melts the palace
    /**
     * Fire at a point melts the palace's ice (and the rod's ice) round it: the stronger the fire
     * (`power`: Inferno 1, Fire Maxima 2, the Hellfire 3), the wider and the more. The caster's computer
     * does it and sends the blocks (saved with the world).
     */
    meltAt(p, power = 1, by = null, radius = null) {
        const g = this.game, t = g.world?.terrain?.data;
        if (!t) return 0;
        // (the caster's own computer melts; fire of nobody's or of a creature — the host)
        const mine = by === g.localId || ((by == null || !g.remotes?.has(by)) && this.auth);
        if (!mine) return 0;
        const R = Math.min(9, radius ?? 1.2 + power * 0.9);
        this.fixtures.fire(p, R, power); // (fire is ice's weakness: the gates melt, the chandelier's chain)
        const edits = [];
        const x0 = Math.round(p.x - R), x1 = Math.round(p.x + R), z0 = Math.round(p.z - R), z1 = Math.round(p.z + R);
        const L0 = Math.floor(p.y + 1.5 - R), L1 = Math.ceil(p.y + 1.5 + R);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let L = L0; L <= L1; L++) {
            const b = t.get(x, L, z);
            if (!isPalaceIce(b) && b !== BLOCK.ICE && b !== BLOCK.SNOW) continue;
            const d = Math.hypot(x - p.x, L - 1 - p.y, z - p.z);
            if (d > R || (d > R * 0.4 && Math.random() > 0.35 + 0.2 * power - d / R * 0.4)) continue; // (the heart of the fire: all of it)
            if (isPalaceIce(b) && inIcePalace(this.plan, x, z) && Math.random() > PALACE_ICE.FIRE) continue; // (her own ice: dense — melts slower)
            if (b === BLOCK.SNOW && (L <= (this.plan?.F ?? -99) || power < 2)) continue; // (the mountain's own snow stays)
            t.set(x, L, z, BLOCK.AIR);
            edits.push([x, L, z, BLOCK.AIR]);
            if (edits.length < 12) g.fx?.spark?.(_v.set(x, L - 1, z), 0xd8f4ff, 0.25, _v2.set(0, 2 + Math.random() * 2, 0), 1.2); // (steam)
        }
        if (edits.length) {
            g.builder?._sendEdits?.(edits, true); // (the palace's ice melted: what it held may come down)
            if (by != null && inIcePalace(this.plan, p.x, p.z)) { if (this.auth) this.attacked(p, R, by); else g.sync?.ice?.({ e: 'atk', p: [r2(p.x), r2(p.y), r2(p.z)] }); }
            if (this.plan && Math.hypot(p.x - this.plan.x, p.z - this.plan.z) < this.plan.R + 30 && (this._meltSaidT || 0) < performance.now()) {
                this._meltSaidT = performance.now() + 15000;
                const q = this.queen;
                if (q) this._say(q, 'Мой замок тает! Ты заплатишь за это!');
            }
        }
        return edits.length;
    }

    /** A stream of fire along o + d·t melts the ice it reaches (the first ice block on its way). */
    meltRay(o, d, len, power = 1, by = null) {
        const t = this.game.world?.terrain?.data;
        if (!t) return 0;
        // (the gates' leaves are not blocks: a flame at them melts them — IceFixtures.js)
        const g = this.game, G = this.plan?.gate;
        if (G && this.fixtures.leaves && (by === g.localId || ((by == null || !g.remotes?.has(by)) && this.auth))) {
            const k = Math.max(0, Math.min(len, (G.x - o.x) * d.x + (G.y + 3 - o.y) * d.y + (G.z - o.z) * d.z));
            _v3.set(o.x + d.x * k, o.y + d.y * k, o.z + d.z * k);
            if (Math.hypot(_v3.x - G.x, _v3.y - G.y - 3, _v3.z - G.z) < 3.2) this.fixtures.fire(_v3, 1, power);
        }
        const h = t.raycast(o, d, len);
        if (!h) return 0;
        const b = t.get(Math.round(h.x + d.x * 0.3), Math.floor(h.y + d.y * 0.3 + 1.5), Math.round(h.z + d.z * 0.3));
        if (!isPalaceIce(b) && b !== BLOCK.ICE) return 0;
        return this.meltAt(_v3.set(h.x + d.x * 0.5, h.y + d.y * 0.5, h.z + d.z * 0.5), power, by);
    }

    // ================================================================ the Ice Rod
    /** The rod in my hand: {side, item, model} or null. */
    myRod() { return this.game.items?.heldOf?.('iceRod') || null; }

    /** Where my rod's crystal is and which way it points (its own axis: the fist turns it). */
    rodAim(h = this.myRod(), o = new THREE.Vector3(), d = new THREE.Vector3()) {
        if (!h) return null;
        h.model.updateWorldMatrix(true, false);
        h.model.localToWorld(o.set(0, ROD_TIP, 0));
        h.model.localToWorld(d.set(0, 0.3, 0));
        d.subVectors(o, d).normalize();
        return { o, d };
    }

    /**
     * «Frozen» with the Ice Rod in the hand: the creature the rod points at freezes — through any
     * armour, any robe; pointed at no creature, a layer of ice grows on the surface it points at.
     */
    rodFrozen(isFinal) {
        const g = this.game;
        const now = performance.now();
        if (now - (this._rodAt || 0) < 900) return null; // (one phrase, one «Frozen»)
        const aim = this.rodAim();
        if (!aim) return null;
        const body = this._aimBody(aim.o, aim.d, ICE.ROD.RANGE);
        const name = body ? 'RodFrozen' : 'RodIce';
        let ok; // (the rod is the gods' gift: its own power, no mana is spent)
        if (body) ok = this._rodFreeze(body, aim);
        else ok = this._rodIce(aim);
        if (!ok) return null;
        this._rodAt = now;
        g.mana?.success?.(name);
        g.castleLife?.alarm?.(aim.o, 'ice', g.localId, 6);
        const cr = this.myRod()?.model.userData.crystal;
        if (cr) cr.scale.setScalar(1.8);
        return 'Frozen';
    }

    /** The body the rod points at (Duel._bodies: every creature) — the nearest along its line, not behind a wall. */
    _aimBody(o, d, len) {
        const g = this.game, t = g.world?.terrain?.data;
        const wall = t?.raycast(o, d, len);
        const L = wall ? wall.dist : len;
        let best = null;
        const q = [o.x + d.x * L, o.y + d.y * L, o.z + d.z * L];
        const near = [];
        for (const e of g.duel?._bodies?.(g.localId) || []) {
            if (e.kind === 'p' && e.id === g.localId) continue;
            near.push({ kind: e.kind, id: e.id, a: e.a.clone(), b: e.b.clone(), r: e.r });
        }
        for (const c of this.targets()) { const e = iceBody(c); near.push({ kind: 'I', id: c.id, a: e.a, b: e.b, r: e.r }); }
        for (const e of near) {
            const mid = _v.copy(e.a).lerp(e.b, 0.5);
            const along = _v2.subVectors(mid, o).dot(d);
            const dist = Math.sqrt(segmentSegmentDistSq([o.x, o.y, o.z], q, [e.a.x, e.a.y, e.a.z], [e.b.x, e.b.y, e.b.z]));
            // (the rod's tip already in the body — it came right up: that one, though its middle is behind the tip)
            if (along < 0 && Math.sqrt(segmentSegmentDistSq([o.x, o.y, o.z], [o.x, o.y, o.z], [e.a.x, e.a.y, e.a.z], [e.b.x, e.b.y, e.b.z])) <= e.r) { best = { ...e, along: 0 }; break; }
            if (along < 0 || along > L + e.r) continue;
            if (dist > e.r + ICE.ROD.AIM + along * 0.04) continue;
            if (!best || along < best.along) best = { ...e, along };
        }
        return best;
    }

    /** (the caster's computer) The rod's freezing ice flies to the body. */
    _rodFreeze(b, aim) {
        const g = this.game;
        const to = _v.copy(b.a).lerp(b.b, 0.5);
        this._fx({ e: 'fx', k: 'beam', o: [r2(aim.o.x), r2(aim.o.y), r2(aim.o.z)], t: [r2(to.x), r2(to.y), r2(to.z)] });
        if (b.kind === 'I') { const c = this.byId(b.id); if (c?.type === 'friend') g.hud?.setVoice?.('☃️ Снеговик и так из снега — холод ему не страшен', true); else if (c?.type === 'snowman') g.hud?.setVoice?.('☃️ Снеговик и так изо льда — скажите «Атака», и снеговики нападут, на кого покажет жезл', true); else g.hud?.setVoice?.('❄️ Ледяное существо не заморозить — оно само изо льда', true); return true; }
        if (b.kind === 'p') { this._freezePlayer(b.id, g.localId, ICE.ROD.FREEZE_T); g.hud?.setVoice?.('🧊 «Frozen»! Он во льду — никакие доспехи не помогли', true); return true; }
        if (this.auth) this.applyRodFreeze(b.kind, b.id, g.localId);
        else g.sync?.ice?.({ e: 'rodF', k: b.kind, id: b.id, by: g.localId });
        g.hud?.setVoice?.('🧊 «Frozen»! Заморожен', true);
        return true;
    }

    /** (host) The rod's ice on a creature of a duel kind (ICE_TARGETS says what each does). */
    applyRodFreeze(k, id, by) {
        const g = this.game, T = ICE.ROD.CREATURE_T;
        if (k === 'I') return; // (the queen, her monsters, every snowman: cold-proof — COLD_KINDS)
        if (k === 'z') { const z = g.zombieById?.get(id); if (z && !z.isDead) { z.freezeProgress = 1; z.freeze?.(); } return; }
        if (k === 's') return; // (the spider: the cold doesn't take it)
        if (k === 'D') { const d = g.dragons?.byId(id); if (d) g.dragons.boltHit(d, 'IceDuel', by); return; }
        if (k === 'f') { const f = g.phoenixes?.byId(id); if (f) g.phoenixes.boltHit(f, 'IceDuel', by); return; }
        if (k === 'g') { const o = g.gargoyles?.byId(id); if (o) g.gargoyles.hit(o, 0, 'Ice', by); return; } // (an infernal gargoyle: the cold slows it — no harm, no freezing)
        if (k === 'C') { const cc = g.customCreatures?.byId(id); if (cc) g.customCreatures.hit(cc, 2, 'Frozen', by); return; } // (a creature of one's own: slowed, unless it breathes cold)
        if (k === 'N') { const cn = g.canaries?.byId(id); if (cn) g.canaries.hit(cn, 0, 'Frozen', by); return; } // (a canary: the cold stops it for a few seconds)
        if (k === 'G') { const o = g.ghosts?.byId(id); if (o) g.ghosts.hit(o, 0, 'Ice', by); return; } // (a ghost: cold does nothing — GhostRules)
        if (k === 'S') { const o = g.spencers?.byId(id); if (o) g.spencers.boltHit(o, 'IceDuel', by); return; } // (the invisible bird: cold kills it)
        if (k === 'o') { const o = g.owls?.byId(id); if (o) g.owls.boltHit(o, 'IceDuel', by); return; } // (an owl: no scroll's — it darts away)
        if (k === 'b') { const b = g.books?.birds?.get(id); if (b) g.books.hitBird(b, 99, 'ice'); return; }
        const c = g.duel?._creature?.(k, id);
        if (!c) return;
        c.stunT = Math.max(c.stunT || 0, T);
        if (k === 't') c.frozenT = T;
        g.duel?._encase?.(k, id, T);
        if (k === 'v') g.castleLife?.alarm?.(new THREE.Vector3(c.x, c.y, c.z), 'ice', by, 5);
        g.sync?.ice?.({ e: 'enc', k, id, T });
    }

    /**
     * (the caster's computer) Ice laid where the rod points: a layer on the surface hit (water there:
     * frozen over). Again at the same place: the next layer on top of it — walls and bridges grow.
     */
    _rodIce(aim) {
        const g = this.game, t = g.world?.terrain?.data;
        if (!t) return false;
        // the first solid block or water on the line
        let hit = null, water = false;
        const step = 0.25;
        for (let s = 0.5; s < ICE.ROD.RANGE; s += step) {
            const x = aim.o.x + aim.d.x * s, y = aim.o.y + aim.d.y * s, z = aim.o.z + aim.d.z * s;
            const b = t.get(Math.round(x), Math.floor(y + 1.5), Math.round(z));
            if (b === BLOCK.WATER) { hit = { x, y, z, s }; water = true; break; }
            if (isSolid(b)) { hit = { x, y, z, s }; break; }
        }
        if (!hit) { g.hud?.setVoice?.('❄️ Жезл ни на что не показывает — направьте его на землю, стену или воду', true); return false; }
        // the face it came in through: the cell just before the hit (where the ice grows)
        const back = hit.s - step;
        const px = aim.o.x + aim.d.x * back, py = aim.o.y + aim.d.y * back, pz = aim.o.z + aim.d.z * back;
        const ci = { x: Math.round(px), L: Math.floor(py + 1.5), z: Math.round(pz) };
        const hi = { x: Math.round(hit.x), L: Math.floor(hit.y + 1.5), z: Math.round(hit.z) };
        const n = { x: ci.x - hi.x, L: ci.L - hi.L, z: ci.z - hi.z };
        if (water) { n.x = 0; n.L = 0; n.z = 0; }
        const R = ICE.ROD.LAYER;
        const edits = [];
        const ship = g.ships;
        const me = g.character.group.position;
        // a disc across the face's normal round the hit (water: the water's own cells turn to ice)
        const axes = n.x ? ['L', 'z'] : n.z ? ['x', 'L'] : ['x', 'z'];
        const c0 = water ? hi : ci;
        const r = Math.ceil(R);
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
            if (a * a + b * b > R * R + 0.5) continue;
            const q = { x: c0.x, L: c0.L, z: c0.z };
            q[axes[0]] += a; q[axes[1]] += b;
            const cur = t.get(q.x, q.L, q.z);
            if (water ? cur !== BLOCK.WATER : (cur !== BLOCK.AIR && cur !== BLOCK.WATER)) continue;
            // (never inside a body — mine; not on a deck; not in another's protected house)
            if (Math.hypot(q.x - me.x, q.z - me.z) < 0.9 && q.L - 1 > me.y - 2.6 && q.L - 1 < me.y + 0.8) continue;
            if (ship?.footprintAt?.(q.x, q.L - 1, q.z)) continue;
            if (g.wards?.list?.size && g.wards.forbids?.(me, _v.set(q.x, q.L - 1, q.z))) continue;
            t.set(q.x, q.L, q.z, BLOCK.ICE_WALL);
            edits.push([q.x, q.L, q.z, BLOCK.ICE_WALL]);
        }
        if (!edits.length) { g.hud?.setVoice?.('❄️ Здесь лёд не встанет', true); return false; }
        g.builder?._sendEdits?.(edits);
        for (let i = 0; i < 24; i++) g.fx?.spark?.(_v.set(c0.x + (Math.random() - 0.5) * R * 2, c0.L - 1 + (Math.random() - 0.5), c0.z + (Math.random() - 0.5) * R * 2), i % 2 ? 0xffffff : 0xbfefff, 0.15, _v2.set(0, 1.5, 0), 0.6);
        const n0 = Math.round(aim.o.distanceTo(_v.set(c0.x, c0.L - 1, c0.z)));
        for (let i = 0; i <= n0; i += 1) g.fx?.spark?.(_v.copy(aim.o).addScaledVector(aim.d, i), 0xe8fbff, 0.1, _v2.set(0, 0, 0), 0.35);
        g.sound?.playFrozenHit?.();
        return true;
    }

    /** «Атака» with the rod in the hand: the snowmen near go for the creature the rod points at. */
    rodAttack(isFinal) {
        const g = this.game;
        const aim = this.rodAim();
        if (!aim) return false;
        const b = this._aimBody(aim.o, aim.d, ICE.ROD.RANGE);
        if (!b) { if (isFinal) g.hud?.setVoice?.('☃️ Покажите жезлом, на кого напасть', true); return false; }
        if (b.kind === 'I' && this.byId(b.id)?.type === 'friend') { if (isFinal) g.hud?.setVoice?.('☃️ Злые снеговики доброго снеговика не трогают', true); return true; }
        const cmd = { k: b.kind, id: b.id };
        if (this.auth) this.rodCmd = cmd; else g.sync?.ice?.({ e: 'cmd', k: cmd.k, id: cmd.id });
        g.hud?.setVoice?.('☃️ Снеговики, в атаку!', true);
        return true;
    }

    _updateRod(dt) {
        const h = this.myRod();
        const cr = h?.model.userData.crystal;
        if (cr && cr.scale.x > 1) cr.scale.setScalar(Math.max(1, cr.scale.x - dt * 2));
        // (host) the command lasts while its target lives
        if (this.auth && this.rodCmd && !this._bodyPos(this.rodCmd.k, this.rodCmd.id, _v)) this.rodCmd = null;
    }

    // ================================================================ network
    _netSend(dt) {
        const g = this.game;
        if (!this.auth || !g.sync) return;
        this._netT -= dt;
        if (this._netT > 0 && !this._sendSoon) return;
        this._netT = 0.1;
        this._sendSoon = false;
        // (no castle here and nobody to send: one empty list, then quiet)
        if (!this.plan && !this.list.length) { if (this._sentEmpty) return; this._sentEmpty = true; } else this._sentEmpty = false;
        const l = this.list.filter((c) => !c.dead || c.deadT > 0).map((c) => [c.id, TYPES.indexOf(c.type), r2(c.model.position.x), r2(c.model.position.y), r2(c.model.position.z), r2(c.model.rotation.y), Math.round(c.hp * 10) / 10, c.dead ? 1 : 0, (c.moving ? 1 : 0) | (c.act ? 2 : 0) | (c.melting ? 4 : 0), c.act || 0, c.slot || 0, c.type === 'friend' ? r2(Math.min(c.buildT, ICE.FRIEND.BUILD)) : 0, r2(c.melt || 0), r2(c.blade || 0)]);
        g.sync.ice?.({ e: 's', l, st: { qd: this.state.queenDead ? 1 : 0, ...this.fixtures.netState() } });
    }

    onNet(m, from) {
        const g = this.game;
        switch (m.e) {
            case 's': if (!this.auth) this._applyState(m); break;
            case 'hit': if (this.auth) { const c = this.byId(m.id); if (c) this.hit(c, Math.min(300, +m.dmg || 0), m.kind, m.by ?? from); } break;
            case 'hurt': if (m.to === this.me) this._hurtMe(Math.min(40, +m.dmg || 0), m.kind, m.f ? vec(m.f) : null, m.v ? vec(m.v) : null, typeof m.q === 'string' ? m.q : null); break;
            case 'frz': if (m.to === this.me) { const r = this._frozenMe(m.by, Math.min(20, +m.T || 6)); if (m.by === 'iceQueen') g.sync?.ice?.({ e: 'frzr', id: this.me, ok: r.ok ? 1 : 0, T: r.T || 0 }); } break;
            case 'frzr': if (this.auth) this._frozeAnswer(m.id, !!m.ok, +m.T || 0); break; // (a guest answers whether the queen's ice took him)
            case 'shot': if (!this.auth || from !== this.me) this._addShot(m); break;
            case 'fx': this._applyFx(m); break;
            case 'say': { const c = this.byIdMap.get(m.id); if (c && typeof m.text === 'string') this._say(c, m.text.slice(0, 80), false); break; }
            case 'rodF': if (this.auth && typeof m.k === 'string') this.applyRodFreeze(m.k, m.id, m.by ?? from); break;
            case 'enc': if (!this.auth && typeof m.k === 'string') g.duel?._encase?.(m.k, m.id, Math.min(20, +m.T || 10)); break;
            case 'cmd': if (this.auth && typeof m.k === 'string') this.rodCmd = { k: m.k, id: m.id }; break;
            case 'fix': if (this.auth && Array.isArray(m.p) && m.p.every(Number.isFinite)) this.fixtures.applyFire(vec(m.p), m.r, m.pw); break; // (a guest's fire at the gates / the chandelier)
            case 'atk': if (this.auth && Array.isArray(m.p) && m.p.every(Number.isFinite)) this.attacked(vec(m.p), 2, from); break; // (a guest's fire melted the palace)
            case 'mk': if (this.auth && Array.isArray(m.p) && m.p.every(Number.isFinite)) this.makeFriend(vec(m.p), +m.ry || 0); break; // (a guest's «Snowman»)
            default: break;
        }
    }

    _applyState(m) {
        const seen = new Set();
        for (const row of m.l || []) {
            const [id, ti, x, y, z, ry, hp, dead, fl, act, slot, bt, melt, blade] = row;
            seen.add(id);
            let c = this.byIdMap.get(id);
            const type = TYPES[ti] || 'snowman';
            if (!c) {
                if (dead) continue;
                c = this._spawn(type, new THREE.Vector3(x, y, z), { id, hp, yaw: ry, slot });
                if (type === 'friend') { c.buildT = +bt || 0; if (c.buildT < 1) this._born(c); }
            }
            c.melting = !!(fl & 4);
            if (type === 'queen') c.blade = Math.max(0, Math.min(1, +blade || 0));
            if ((+melt || 0) !== c.melt && (type === 'monster' || type === 'snowman')) { c.melt = Math.max(0, Math.min(1, +melt || 0)); c.meltHot = MELT.HOT; this._resize(c); }
            (c.net || (c.net = new THREE.Vector3())).set(x, y, z);
            c.netYaw = ry;
            if (hp < c.hp) c.hurtT = 0.2;
            c.hp = hp;
            c.moving = !!(fl & 1);
            c.act = act || null;
            if (c.act && c.actT <= 0) c.actT = 0.6;
            if (dead && !c.dead) this._die(c, null);
        }
        for (const c of [...this.list]) if (!seen.has(c.id) && !c.dead) this._remove(c);
        if (m.st) { this.state.queenDead = !!m.st.qd; this.fixtures.applyNet(m.st); }
    }

    // ================================================================ save
    snapshot() {
        const q = this.list.find((c) => c.type === 'queen' && !c.dead);
        const mons = this.state.monsters.slice();
        const melts = this.state.monsterMelt.slice();
        for (const c of this.list) if (c.type === 'monster' && !c.dead) { mons[c.slot] = Math.round(c.hp); melts[c.slot] = Math.round(c.melt * 100) / 100; }
        // the friendly snowmen stay in the world till they melt: [x, y, z, yaw, hp, homeX, homeZ]
        const friends = this.list.filter((c) => c.type === 'friend' && !c.dead).map((c) => [r2(c.model.position.x), r2(c.model.position.y), r2(c.model.position.z), r2(c.model.rotation.y), Math.round(c.hp * 10) / 10, r2(c.home.x), r2(c.home.z)]);
        return { queenDead: !!this.state.queenDead, queenHp: Math.round(q ? q.hp : this.state.queenHp), monsters: mons, monsterMelt: melts, monsterDeadAt: this.state.monsterDeadAt.slice(), seen: !!this.state.seen, friends, gateHp: Math.round(this.state.gateHp ?? 0), gateBroken: !!this.state.gateBroken, chandFallen: !!this.state.chandFallen };
    }

    restore(s) {
        if (!s || typeof s !== 'object') return;
        const n = (v, max) => Math.max(0, Math.min(max, +v || 0));
        this.state.queenDead = !!s.queenDead;
        this.state.queenHp = s.queenHp != null ? n(s.queenHp, ICE.QUEEN.HP) : ICE.QUEEN.HP;
        if (Array.isArray(s.monsters)) this.state.monsters = [0, 1].map((i) => (s.monsters[i] == null ? ICE.MONSTER.HP : n(s.monsters[i], ICE.MONSTER.HP)));
        if (Array.isArray(s.monsterMelt)) this.state.monsterMelt = [0, 1].map((i) => n(s.monsterMelt[i], 1));
        if (Array.isArray(s.monsterDeadAt)) this.state.monsterDeadAt = [0, 1].map((i) => +s.monsterDeadAt[i] || 0);
        this.state.seen = !!s.seen;
        // the gates' strength, broken or not; the chandelier fallen (IceFixtures.js)
        this.state.gateHp = s.gateHp != null ? n(s.gateHp, GATE.HP) : GATE.HP;
        this.state.gateBroken = !!s.gateBroken;
        this.state.chandFallen = !!s.chandFallen;
        if (this.state.queenDead) this.state.gateHp = Math.min(this.state.gateHp, GATE.WEAK_HP);
        if (Array.isArray(s.friends)) this._friendsToLoad = s.friends.filter((f) => Array.isArray(f) && f.length >= 5 && f.slice(0, 5).every(Number.isFinite)).slice(0, ICE.FRIEND.MAX);
    }

    // ================================================================ tests / debugging
    /** (debug, tests) Wake the castle now (as if a player came near). */
    wakeNow() { if (this.auth && this.plan && !this.active) this._wake(); }

    dispose() {
        for (const c of [...this.list]) this._remove(c);
        for (let i = this.shots.length - 1; i >= 0; i--) this._dropShot(i);
        for (const f of this.fxs) for (const s of f.meshes || []) this.game.scene.remove(s.m);
        for (const q of this.puddles || []) this.game.scene.remove(q.m);
        if (this.puddles) this.puddles.length = 0;
        this.fxs.length = 0;
        this._dropGates();
        if (this._hud) { this._hud.style.display = 'none'; this._hudShown = false; }
    }
}

/** A hero's group position (at the hips) → the feet. */
function _feet(p, out, size = 1) { return out.set(p.x, p.y - 1.95 * size, p.z); }

// pushes, gusts, knockdowns (CreatureImpact): a snowman is thrown and falls over; the queen and her
// monsters are too heavy (and full of magic) — they only sway (IceCastleLife.push does that)
registerKind('I', {
    name: 'ice', faces: -1,
    list: (g) => g.iceCastle?.list || [],
    get: (g, id) => g.iceCastle?.byId(id),
    alive: (c) => !c.dead,
    body: (c) => (small(c.type) ? 'snowman' : c.type === 'monster' ? 'iceMonster' : 'iceQueen'),
    centre: (c, out) => iceCenter(c, out),
    pivot: () => ({ obj: null, base: 0, lie: 0 }), // (its own sway shows the reel)
    head: (c) => c.model.userData.head || null, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { const p = c.model.position; p.x += dx; p.z += dz; g.collision?.resolveCylinder?.(p, c.r, p.y, c.h, 1.05); },
    toss(g, c, vy) { if (small(c.type)) c.vy = Math.max(c.vy || 0, vy); },
    hold(g, c, t) { c.stunT = Math.max(c.stunT || 0, small(c.type) ? t : Math.min(t, 0.5)); },
    frozen: () => false,
    noKnock: () => true, // (a snowman is thrown and slides, it doesn't lie down; the big ones only sway)
    struck(g, c, o) { if (o.by != null && c.type !== 'friend') c.foe = o.by; },
});
