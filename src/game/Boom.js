/**
 * Boom.js — «Бум» («Boom»): a mountain (a castle, a tower, a rock) torn apart from inside.
 *
 * The author: «Оно может уничтожать целые горы. Оно сильнее Инспириуса в десять раз. Но когда ты
 * произносишь, оно действует не от твоей палочки, а изнутри: вот гора или замок — он изнутри уничтожается,
 * как взрыв бомбы… как будто там внутри сидела сила, особенно в горе, и гору разорвала — части полетели
 * туда-сюда, полностью. Стоит 1000 маны. Его можно найти в храме богов на Венере».
 *
 *   - Said: «Boom» / «Бум» / «Бумм» — the word on its own (SpellManager.boomWords), with the hand (the wand)
 *     raised and aimed at the target: talk with «бум» in it never casts it (and outside Creative only one
 *     who burnt its scroll knows it — the fifth pedestal of the gods' library; 750 mana (the author changed it from 1000), in Creative free).
 *   - Aimed: a mountain, a hill, a rock or a building (castle, tower, house, the Ice Queen's palace…) up to
 *     REACH m along the hand. Its middle is found INSIDE it — the middle of its mass along the line of the
 *     hand, half-way up from the land round it (boomTarget): nothing flies from the wand.
 *   - Instant (no concentration): ~1.3 s the mountain shakes and groans from inside, its cracks glow, the
 *     ground swells (VoxelShading.BOOM_SWELL) — then it bursts: rocks fly every way on arcs and fall, dust,
 *     a shock wave (weaker than inside), and a crater (BoomCarve.js: the mountain gone, a bowl down to 14 m
 *     below the land round it, 112 m across; the sea comes into it if it is near).
 *   - +100 mana cells the first time it really works (Mana.GOD_SPELLS: a gift of the gods, like the planets'
 *     scrolls; death takes them into the body — Legacy.js — «Give Me My Power» gives them back).
 *
 * Who / what (CLAUDE.md «на кого и на что»): BOOM_TARGETS. Network: the caster says where ('bum' — the
 * middle, the land's height); every computer swells, bursts and digs the same crater (saved in g.explosions,
 * replayed whole by a save / a late joiner — BoomCarve.runBoom); the host hurts and throws the creatures and
 * the ships, each computer its own player. Performance: the crater is dug a few ms a frame (BoomCarve.boomStep),
 * the chunks rebuilt by the workers, the rocks are one instanced mesh of ROCKS (a pool), its sounds made on
 * the loading screen.
 */

import * as THREE from 'three';
import { BLOCK, BASE_COLORS } from '../world/Terrain.js';
import { boomJob, boomStep, boomReach, boomColumns, BOOM_SHAPE } from '../world/BoomCarve.js';
import { BOOM_SWELL } from '../world/VoxelShading.js';
import { eachBody, hitBody, throwBody } from './MagicWave.js';

const R = BOOM_SHAPE.R, WALL = boomReach(R); // (the bowl; its torn wall slopes up out to WALL)
export const BOOM = {
    NAME: 'Boom',
    COST: 750, // mana, at once (the author: 750) (Combat.SPELL_COST)
    REACH: 230, // m: a mountain this far along the hand
    R, // m: the crater's radius (BoomCarve)
    SWELL: 1.3, // s: it shakes, glows and swells before it bursts
    LIFT: 1.8, // m: the ground swells this much at the middle
    HARM_R: 130, // m: the shock wave's reach
    ZONES: [[R, 1000], [R * 1.5, 150], [130, 40]], // [up to m from the middle, harm]: inside — nothing lives
    SHOCK_T: 1.8, // s the shock wave takes to reach HARM_R
    MIN_RELIEF: 5, // m above the land round it: a hill (or a building) — its middle is looked for in its mass; lower: plain land, torn where the hand points
    BUDGET: 2.5, // ms a frame for the crater
    FLOW: 3000, // cells of water a second at least, as the sea pours into the crater
    FLOOD_T: 8, // s: about this long for the sea to fill it (the cells opened under its level ÷ this a second)
    ROCKS: 200, // the flying rocks (one instanced mesh)
};

/** Who and what it touches — and how (CLAUDE.md). «Не действует» is written too, with why. */
export const BOOM_TARGETS = {
    aim: 'цель — любая земля до 230 м по руке: ровное поле, берег, дно под водой (рвётся прямо там, куда показывает рука, изнутри, в нескольких метрах под землёй), холм, гора, скала или постройка (замок, башня, дом, ледяной дворец — середина ищется внутри неё); небо — нечего разорвать (мана не тратится)',
    me: 'сам волшебник — как все: стоять на горе, которую разрываешь, — смерть (вне Творческого)',
    players: 'все игроки: в кратере (до 56 м от середины) −1000 — смерть, до 84 м −150, до 130 м −40; сбивает с ног и отбрасывает (ближе — дальше); щит «Protection» — половина, купол «Protection Maxima» — четверть; каждый компьютер решает за своего игрока',
    zombies: 'в кратере — разорваны; дальше −150 / −40, отбрасывает',
    castlePeople: 'жители, рыцари, король, волшебники: в кратере погибают, дальше −150 / −40 и отброс; смертельный страх (castleLife.alarm «boom», 130 м): все бегут прочь',
    animals: 'в кратере погибают, дальше −150 / −40, отбрасывает',
    sailors: 'моряки (ships.crew): в кратере — смерть; скелеты Чёрных Усов — кости ломает (Sailors CRUSH «Boom»); отбрасывает',
    spider: 'гигантская паучиха: −1000 / −150 / −40 — в кратере не выживает; слишком тяжёлая, чтобы улететь',
    dragons: 'дракон: −1000 / −150 / −40 (это не огонь — DragonKinds.ON_DRAGON.Boom); только качается',
    iceCastle: 'со свитка — не холод: Королеве, монстрам и снеговикам −1000 / −150 / −40, как всем (IceQueen.SCROLL_KINDS); ледяной дворец разрывает, как гору',
    blackship: 'капитану Чёрные Усы и скелетам — как всем морякам; сам чёрный корабль: заклинание богов — его проклятие не держит (как и против «Инспириуса»): барьер вспыхивает и ломается, корабль разносит, как любой (Ships.boom)',
    phoenixes: 'феникс: −1000 / −150 / −40 (не огонь), отбрасывает',
    owls: 'сова: в зоне насмерть (Owls.TARGETS.Boom); падает перо',
    customCreatures: 'созданное существо: заклинание богов — насмерть в зоне',
    canaries: 'канарик: в зоне насмерть (Canaries.hit — заклинание богов); остаются кожа и кость',
    tarons: 'Тарон: в зоне насмерть (Taron.hit — заклинание богов); остаются железо и красные камни',
    spencers: 'птичка Спенсера: в зоне насмерть; падает перо',
    ghosts: 'призрак: заклинание богов рассеивает его на время (не навсегда)',
    gargoyles: 'горгулья: в зоне насмерть — заклинание богов (GargoyleRules.TARGETS.Boom): разбита на камни',
    livingTrees: 'ожившее дерево и скелет с кладбища: −1000 / −150 / −40 — разорваны в щепки (LivingTrees.MIGHTY_ON_TREES)',
    bookBirds: 'книги-птицы сбивает на землю',
    servants: 'слуги («Брейнрот», «Alive») — как все существа в зоне',
    ground: 'гора (холм, скала, замок) разорвана изнутри целиком: кратер 112 м в поперечнике и на 14 м ниже земли вокруг, его стена дальше идёт круто вверх (ещё 26 м — у большой горы край не отрезан стеной, а обрушен склоном); что было на ней и в ней (деревья, дома, пещеры, сундуки) — разлетается; что осталось висеть на краю — падает (Collapse)',
    ruin: 'за краем кратера постройки стоят (разрыв был внутри горы, наружу — только ударная волна по существам); что повисло на краю — падает; кратер строители не застраивают (Rebuild, Danger.REBUILT)',
    houseSphere: 'сферу «Protection House» ломает сразу (HouseWards.BREAK.Boom)',
    ships: 'корабль в зоне кратера разорван: пробоины ниже ватерлинии по всему борту, мачты сломаны, паруса в клочья, пожар — тонет (Ships.boom); дальше — крен, урон, пробоина, рваные паруса',
    items: 'вещи на земле разлетаются (Wreck.afterBlast), оружие отбрасывает',
    water: 'кратер у моря, реки или озера заливается водой (BoomCarve: вода идёт с её края)',
    fire: 'не огонь: ничего не поджигает (это разрыв камня, а не пламя)',
    godGifts: 'не действует — дар богов: храм богов на Венере (весь, в его границах), пьедесталы, Ледяной Жезл — золотая защита вспыхивает, ничего не ломается, никто не отлетает',
    space: 'в открытом космосе нет горы — не действует (Space.spaceSpellBlock); на Луне, Марсе, Венере и других планетах — как на Земле (воздух не нужен)',
};

/** The harm at distance `d` from the middle (0: out of reach). */
export function boomDamage(d) {
    for (const [r, h] of BOOM.ZONES) if (d <= r) return h;
    return 0;
}

/** How hard it throws at distance `d`. */
export function boomThrow(d) {
    const k = Math.max(0, 1 - d / BOOM.HARM_R);
    return { speed: 8 + 34 * k, toss: 5 + 18 * k };
}

/** How far the shock wave has gone `t` s after the burst. */
export function boomFront(t) {
    return BOOM.HARM_R * Math.pow(Math.min(1, Math.max(0, t) / BOOM.SHOCK_T), 0.7);
}

/** Why it can't be cast now (null: it can). */
export function boomBlock({ enabled, mana }) {
    if (!enabled) return null; // (Creative: no mana rules)
    if ((mana ?? 0) < BOOM.COST) return 'mana';
    return null;
}

/** The ground's top at (x, z) — only where the land is made already (never a chunk made in a frame), else `def`. */
function groundAt(data, x, z, def) {
    const ix = Math.round(x), iz = Math.round(z);
    return data.hasChunk && !data.hasChunk(ix >> 5, iz >> 5) ? def : data.topLayer(ix, iz) - 0.5;
}

const isBuilt = (t) => t >= BLOCK.CS_GREY && t <= BLOCK.RUNE || (t >= BLOCK.ICE_WALL && t <= BLOCK.ICE_DARK) || t === BLOCK.PLANKS || t === BLOCK.PLANKS_DARK;

/**
 * Where «Бум» bursts when the hand at `o` points along `dir` (pure: a TerrainData).
 * @returns {{c: {x, y, z}, base: number, hit: {x, y, z}, relief: number, built: number}|{why: 'none'}} (flat: true — plain land, torn right where the hand points)
 */
export function boomTarget(data, o, dir, reach = BOOM.REACH) {
    const hit = data?.raycast?.(o, dir, reach);
    if (!hit) return { why: 'none' };
    const hx = Math.round(hit.x), hz = Math.round(hit.z);
    // the land round it: a low share of the ground on a ring round the place
    const ring = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ring.push(data.topLayer(Math.round(hx + Math.cos(a) * R * 1.25), Math.round(hz + Math.sin(a) * R * 1.25)) - 1);
    }
    ring.sort((a, b) => a - b);
    const base = Math.max(-4, ring[6]);
    // built blocks round the place hit (a castle on flat land is a target too)
    let built = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const x = hx + dx * 2, z = hz + dz * 2, top = data.topLayer(x, z);
        for (let L = top; L > top - 10; L--) if (isBuilt(data.get(x, L, z))) { built++; break; }
    }
    // its middle: the centre of its mass along the line of the hand (across), half-way up from the land
    // (the profile goes on past a low foothill or a cliff's foot to the mountain behind it)
    const fl = Math.hypot(dir.x, dir.z);
    let sx = 0, sz = 0, sw = 0, sh = 0, n = 0, top = data.topLayer(hx, hz) - 1 - base;
    if (fl > 0.05) {
        const ux = dir.x / fl, uz = dir.z / fl;
        for (let s = -4; s <= R * 1.2; s += 2) {
            const x = hx + ux * s, z = hz + uz * s, h = data.topLayer(Math.round(x), Math.round(z)) - 1 - base;
            if (h > 2) { sx += x * h; sz += z * h; sw += h; sh += h; n++; if (h > top) top = h; }
        }
    }
    const relief = top;
    // any land is a target (the author: «не только горы — любой клочок земли»): flat ground, a field, a beach,
    // the sea's floor — torn from inside right where the hand points (its middle a few metres under the ground);
    // a hill, a mountain or a building — its middle is found as its mass along the hand
    const here = data.topLayer(hx, hz) - 1 - base;
    if (here < BOOM.MIN_RELIEF && built < 4) {
        const gy = data.topLayer(hx, hz) - 1;
        const flat = { x: Math.round(hit.x * 100) / 100, y: Math.round((Math.min(gy, base + 2) - 4) * 100) / 100, z: Math.round(hit.z * 100) / 100 };
        return { c: flat, base: Math.min(base, gy), hit: { x: hit.x, y: hit.y, z: hit.z }, relief, built, flat: true };
    }
    let cx = hx, cz = hz;
    if (sw > 0) { cx = sx / sw; cz = sz / sw; }
    const off = Math.hypot(cx - hx, cz - hz), max = R * 0.7;
    if (off > max) { cx = hx + (cx - hx) * max / off; cz = hz + (cz - hz) * max / off; }
    const avg = n ? sh / n : Math.max(1, relief);
    const c = { x: Math.round(cx * 100) / 100, y: Math.round((base + Math.max(2, avg) / 2) * 100) / 100, z: Math.round(cz * 100) / 100 };
    return { c, base, hit: { x: hit.x, y: hit.y, z: hit.z }, relief, built };
}

const ORANGE = 0xff6a1a, GOLDEN = 0xffd27a;
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _col = new THREE.Color();
const r2 = (v) => Math.round(v * 100) / 100;

export class Boom {
    constructor(game) {
        this.game = game;
        this.list = []; // bursts going on (mine and others'): {c, base, R, by, mine, t, burst, job, …}
        this.rocks = null; // the pool (built in sampleModels / the first burst)
        this._lastCast = 0;
    }

    _creative() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    /** The hand with the wand, or the raised hand. */
    _castSide() {
        const g = this.game;
        const w = g.items?.heldOf?.('wand');
        if (w) return w.side;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        for (const s of [pref, pref === 'right' ? 'left' : 'right']) if (ch?.isArmRaised?.(s)) return s;
        return pref;
    }

    /** Was the hand (the wand) raised for magic as it was said? (No camera: the words alone.) */
    _intent() {
        const g = this.game, now = Date.now();
        if (this.testAim || !g.currentPose?.hasPose) return true;
        return !!(g.isMagicActive || now - (g.lastMagicTime || 0) < 3000 || now - (g._armsUpAt || 0) < 3000);
    }

    /**
     * The words heard: the place aimed at bursts from inside. Only the whole, final phrase.
     * @returns {string|null}
     */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        if (!isFinal) return null;
        const say = (t) => { g.hud?.setVoice(t, true); return null; };
        // («бум» is a short word of talk too: only a command — the hand raised for magic and aimed)
        if (!this._intent()) { g.netLog?.('💥 «Бум» без поднятой руки — не колдую'); g.lastCastWhy = 'рука не поднята — это не команда'; return null; }
        if (Date.now() - this._lastCast < 2500 || this.list.some((b) => b.mine && !b.burst)) return null; // (one at a time: it is bursting already)
        const side = this._castSide();
        const o = this.testAim?.o || (g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side));
        const d = (this.testAim?.d || (ch.getPointingDirection ? ch.getPointingDirection(side) : ch.getHandDirection(side))).clone().normalize();
        const data = g.world?.terrain?.data;
        const T = data ? boomTarget(data, o, d) : { why: 'none' };
        if (T.why) return say(`💥 «Бум» разрывает землю изнутри — наведите руку (палочку) на землю, гору или постройку, не дальше ${BOOM.REACH} м`);
        // a gift of the gods: the temple's golden ward takes it — nothing breaks (no mana spent)
        if (g.temple?.wards?.(_v.set(T.c.x, T.c.y, T.c.z), 0) || g.temple?.wards?.(_v.set(T.hit.x, T.hit.y, T.hit.z), 0)) {
            g.temple.wardHit?.(_v.set(T.hit.x, T.hit.y, T.hit.z), 12);
            g.sound?.playExplosion?.(_v, ch?.group.position, 0.6);
            return say('🏛️ Храм богов — дар богов: его золотая защита не пускает «Бум»');
        }
        const c = g.combat;
        const why = boomBlock({ enabled: !!c?.enabled, mana: c?.fatigue });
        if (why === 'mana') { const tired = c?.check(BOOM.NAME); return say(tired || `💥 «Бум» стоит <b>${BOOM.COST} маны</b>`); }
        const tired = c?.check(BOOM.NAME);
        if (tired) return say(tired);
        c?.pay(BOOM.NAME);
        this._lastCast = Date.now();
        const e = { c: [r2(T.c.x), r2(T.c.y), r2(T.c.z)], b: T.base };
        this.start(e, g.localId, true);
        g.sync?.boom?.(e);
        g.hud?.setVoice('💥 <b>Бум!</b> Гора дрожит изнутри…', true);
        return BOOM.NAME;
    }

    /** Another player's «Бум» from the network. */
    onNet(m) {
        const g = this.game;
        if (m.by === g.localId || !Array.isArray(m.c)) return;
        g.voiceGate?.noteRemote?.(BOOM.NAME, performance.now()); // (my microphone may hear their voice)
        this.start({ c: m.c, b: +m.b || 0 }, m.by, false);
    }

    /** It begins (every computer): the mountain shakes and glows, then bursts (update). */
    start(e, by, mine) {
        const g = this.game;
        const c = new THREE.Vector3(e.c[0], e.c[1], e.c[2]);
        const b = { c, base: e.b, R, by, mine, t: 0, burst: false, job: null, front: 0, hit: new Set(), meDone: false, harmT: 0, rockT: 0, done: false, swellR: R * 1.15 };
        this.list.push(b);
        g.sound?.playBoomSwell?.(c, g.character?.group.position);
        if (g.authority) g.castleLife?.alarm(c, 'boom', by, BOOM.HARM_R); // (the ground shakes and groans: everyone runs)
        g.perf?.note?.('«Бум»');
        return b;
    }

    // =========================================================== every frame
    update(dt) {
        dt = Math.min(dt, 0.05);
        let swell = null;
        for (const b of [...this.list]) {
            b.t += dt;
            if (!b.burst) {
                this._swell(b, dt);
                if (!swell || b.t > swell.t) swell = b;
                if (b.t >= BOOM.SWELL) this._burst(b);
            } else this._after(b, dt);
        }
        // the ground's swelling and its glowing cracks (one at a time: the newest)
        const K = BOOM_SWELL.k.value;
        if (swell) {
            const u = Math.min(1, swell.t / BOOM.SWELL);
            BOOM_SWELL.c.value.set(swell.c.x, swell.c.z, swell.swellR, swell.base);
            K.set(BOOM.LIFT * u * u, u, swell.t);
        } else if (K.y > 0) {
            K.x = 0;
            K.y = Math.max(0, K.y - dt * 4); // (the cracks' glow fades as it bursts)
            K.z += dt;
        }
        this._rocksUpdate(dt);
    }

    /** The swelling: shaking, groaning, dust out of the cracks, stones jumping, a glow from inside. */
    _swell(b, dt) {
        const g = this.game, fx = g.fx, c = b.c;
        const u = Math.min(1, b.t / BOOM.SWELL);
        const me = g.character?.group.position;
        const dist = me ? me.distanceTo(c) : 0;
        if (fx) fx.shake = Math.max(fx.shake || 0, (0.15 + 1.2 * u * u) * Math.max(0.25, 1 - dist / 400));
        g.fx?.lightFlash?.(_a.set(c.x, c.y + 6, c.z), ORANGE, 6 + 30 * u * u, 0.12, 160);
        const data = g.world?.terrain?.data;
        if (!fx || !data) return;
        const n = Math.round(2 + 10 * u);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * b.swellR * Math.min(1, u * 1.25);
            const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
            const y = groundAt(data, x, z, b.base);
            if (Math.abs(y - c.y) > 90) continue;
            fx.smoke?.spawn(x, y + 0.3, z, (Math.random() - 0.5), 3 + Math.random() * 4 * u, (Math.random() - 0.5), Math.random() < 0.3 ? 0x6a3a22 : 0x8a7d6c, 1 + Math.random() * 2, 1.6 + Math.random(), { shrink: -0.5, spin: 1 });
            if (i % 2) fx.debris?.spawn(x, y + 0.4, z, (Math.random() - 0.5) * 3, 3 + Math.random() * 7 * u, (Math.random() - 0.5) * 3, 0x6b5f52, 0.2 + Math.random() * 0.35, 1.4, { shrink: 0.1, fade: false, spin: 8 });
            if (i % 3 === 0) fx.glow?.spawn(x, y + 0.2, z, 0, 2 + Math.random() * 3, 0, Math.random() < 0.5 ? ORANGE : GOLDEN, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, { shrink: 1 });
        }
    }

    /** It bursts (every computer the same). */
    _burst(b) {
        const g = this.game, c = b.c, fx = g.fx;
        b.burst = true;
        b.t = 0;
        const me = g.character?.group.position;
        g.sound?.playBoomBlast?.(c, me);
        // the crater: dug a few ms a frame (_after); saved now (a save / a late joiner gets it whole)
        const data = g.world?.destructible ? g.world?.terrain?.data : null;
        const entry = { boom: 1, p: [r2(c.x), r2(c.y), r2(c.z)], b: b.base, r: R };
        if (data?.carveColumn) { b.job = boomJob(data, entry); g.explosions?.push(entry); }
        g.wards?.struck?.(c, R, BOOM.NAME, b.by); // (a house's sphere of protection breaks at once — the host decides)
        g.water?.explode?.(c, R);
        g.ships?.boom?.(c, R, b.by); // (every computer: rocked; the host: torn apart)
        g.books?.hitAt?.(c, R, b.by);
        g.houses?.hitAt?.(c, R);
        g.boards?.blast?.(c, R, 9);
        g.cauldrons?.blast?.(c, R, 9);
        if (g.authority) g.dragons?.noise?.(c, b.by);
        if (b.by === g.localId) g.mana?.success?.(BOOM.NAME); // (+100 cells the first time: a gift of the gods)
        if (fx) {
            fx.lightFlash?.(_a.set(c.x, c.y + 10, c.z), 0xffe0b0, 60, 1.6, 600);
            fx.explosion?.(_a.set(c.x, c.y + 6, c.z), 22, 14);
            const dist = me ? me.distanceTo(c) : 0;
            fx.shake = Math.max(fx.shake || 0, Math.max(0.5, 4 - dist / 90));
            // the burst of dust and stone out of the whole mountain
            for (let i = 0; i < 50; i++) {
                const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R * 0.8, up = Math.random();
                const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = c.y + (up - 0.3) * 30;
                fx.smoke?.spawn(x, y, z, Math.cos(a) * (6 + 14 * Math.random()), 6 + 22 * up, Math.sin(a) * (6 + 14 * Math.random()), [0x6e6258, 0x8a7d6c, 0x5a4f46, 0x7a5a40][i % 4], 4 + Math.random() * 6, 5 + Math.random() * 4, { shrink: -0.25, spin: 1 });
                if (i % 2) fx.glow?.spawn(x, y, z, Math.cos(a) * 20, 10 + 30 * up, Math.sin(a) * 20, [ORANGE, GOLDEN, 0xff3a10][i % 3], 0.5 + Math.random(), 0.8 + Math.random() * 0.8, { shrink: 0.9, spin: 6 });
            }
        }
        // the first great rocks: out of the heart of it, at once
        this._rocksReady();
        b.heart = 50; // (thrown over the first frames: _after)
        this._ring(b);
    }

    /** After the burst: the crater dug on, the rocks out of it, the shock wave, the ruin round it. */
    _after(b, dt) {
        const g = this.game, c = b.c;
        // the great rocks out of the heart of it (a dozen a frame)
        for (let i = 0; i < 12 && b.heart > 0; i++, b.heart--) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * R * 0.5;
            _v.set(c.x + Math.cos(a) * r, c.y + (Math.random() - 0.2) * 18, c.z + Math.sin(a) * r);
            this._throwRock(b, _v, [0x7b7468, 0x6a5a48, 0x8d8478, 0x5a5048][b.heart % 4], 1.6 + Math.random() * 2.6);
        }
        // the crater, a few ms a frame
        if (b.job && !b.job.done) {
            const j = b.job;
            // (the sea pours in over a few seconds: so many cells of water a second — a front crossing the crater)
            if (j.phase === 'flood' && !b.flowRate) b.flowRate = Math.max(BOOM.FLOW, (j.wet?.length || 0) / 3 / BOOM.FLOOD_T);
            boomStep(j, BOOM.BUDGET, j.phase === 'flood' ? Math.max(60, Math.ceil(b.flowRate * dt)) : Infinity);
            this._spray(b);
            const s = b.job.samples;
            // a few of the torn blocks fly as rocks (the pool takes what it can; the dust takes the rest)
            const debris = [];
            for (let i = 0, k = 0; i + 3 < s.length && k < 14; i += 4, k++) {
                const t = s[i + 3], col = t === BLOCK.GRASS ? 0x4caf50 : BASE_COLORS[t] ?? 0x7a6a58;
                if (k < 8) this._throwRock(b, _v.set(s[i], s[i + 1], s[i + 2]), col, 0.7 + Math.random() * 1.8);
                else debris.push({ x: s[i], y: s[i + 1], z: s[i + 2], color: col });
            }
            s.length = 0;
            if (debris.length) g.fx?.debrisFrom?.(debris, c, 24);
            if (j.dug && !b.dugDone) { b.dugDone = true; this._dug(b); }
            if (j.done && j.filled) { g.seaSurface?.refresh?.(); g.sound?.playSplashAt?.(c, 0.6); } // (the sea in the crater: the waving surface drawn over it now)
        }
        // the shock wave (it throws and hurts; what is built round the crater stands — the burst was inside the mountain)
        b.front = boomFront(b.t);
        // me (every computer its own player — the caster too)
        if (!b.meDone && g.character) {
            const me = g.character.group.position;
            const dist = _v.set(me.x - c.x, me.y - 1 - c.y, me.z - c.z).length();
            if (dist > BOOM.HARM_R) { if (b.front >= BOOM.HARM_R) b.meDone = true; }
            else if (dist <= b.front) { b.meDone = true; this._hurtMe(b, dist, me); }
        }
        // the creatures (the host)
        b.harmT -= dt;
        if (g.authority && (b.harmT <= 0 || b.front >= BOOM.HARM_R) && b.t < BOOM.SHOCK_T + 3) {
            b.harmT = 0.05;
            let quota = 3; // (a few a frame: a death — a body, its things, its cry — is a lot of work; the wave takes a few frames anyway)
            eachBody(g, (kind, cr, q) => {
                if (quota <= 0 || b.hit.has(cr)) return;
                const dist = q.distanceTo(c);
                if (dist > b.front || dist > BOOM.HARM_R) return;
                b.hit.add(cr);
                quota--;
                if (g.temple?.wards?.(q, 0)) return; // (in the gods' temple: nobody flies, nobody is hurt)
                if (dist > R && g.wards?.shields?.(c, q)) return; // (a sphere that still stands — never inside the mountain torn apart)
                const dir = new THREE.Vector3(q.x - c.x, 0, q.z - c.z);
                if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
                dir.normalize();
                hitBody(g, kind, cr, q, boomDamage(dist), dir, BOOM.NAME, b.by, BOOM.NAME);
                const th = boomThrow(dist);
                throwBody(g, kind, cr, dir.clone().multiplyScalar(th.speed), th.toss, BOOM.NAME, b.by, c);
            });
            for (const w of g.weapons?.weapons || []) {
                if (w.holder || w._boom === b) continue;
                const dist = w.position.distanceTo(c);
                if (dist > b.front || dist > BOOM.HARM_R || g.temple?.wards?.(w.position, 0)) continue;
                w._boom = b;
                w.hover = null;
                w.wake?.();
                if (!w.remoteTarget) w.velocity.add(_a.subVectors(w.position, c).setY(0).normalize().multiplyScalar(18 * (1 - dist / BOOM.HARM_R) + 4).setY(10 + Math.random() * 8));
            }
        }
        this._afterLook(b, dt);
        if (b.t > 9 && (!b.job || b.job.done)) this._end(b);
    }

    /** The front of the water pouring in: spray and foam where it runs, the roar of it now and then. */
    _spray(b) {
        const g = this.game, fx = g.fx, sp = b.job.spray;
        if (!sp.length) return;
        for (let i = 0; i + 2 < sp.length; i += 3) {
            const x = sp[i], z = sp[i + 2], y = 0.2;
            fx?.smoke?.spawn(x, y, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3, Math.random() < 0.5 ? 0xe8f4ff : 0xbfdcef, 1.2 + Math.random() * 1.6, 1.2 + Math.random(), { shrink: -0.6, spin: 1 });
            fx?.debris?.spawn(x, y, z, (Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4, 0x9fd0f0, 0.12 + Math.random() * 0.15, 1, { shrink: 0.2, fade: true, spin: 2 });
        }
        if ((b.splashT = (b.splashT || 0) - 1) <= 0) { b.splashT = 20; g.sound?.playSplashAt?.(_v.set(sp[0], 0, sp[2]), 0.8); }
        sp.length = 0;
    }

    /** The crater is dug: what was left hanging falls, the castle's people learn of it, the doors and things fall. */
    _dug(b) {
        const g = this.game, j = b.job;
        for (const f of j.falls) g.falling?.add(f);
        g.wreck?.afterBlast?.(b.c, WALL, 99);
        if (g.authority && (j.castle > 0)) g.castleLife?.damaged(b.c, b.by, j.castle, true, { r: R, kind: 'boom' });
        g.netLog?.(`💥 «Бум»: вырвано ${j.removed} блоков`);
    }

    _hurtMe(b, dist, me) {
        const g = this.game;
        if (g.isDeadLocal) return;
        if (g.temple?.wards?.(me, 0)) return; // (inside the gods' temple: its golden ward)
        if (dist > R && g.wards?.shields?.(b.c, me)) return;
        const c = g.combat, s = c?.shield;
        // the gods' shield («Protection Gods», ProtectionGods.js): a spell of the gods — it holds, for half of «Бум»'s
        // price × the share of the blow that reaches here (all of it in the bowl, less towards the edge); out of
        // mana it breaks — the rest of the blow goes on
        const full = boomDamage(0) || 1, gods = s?.gods ? c.godsHit(BOOM.NAME, null, boomDamage(dist) / full) : 1;
        if (gods <= 0) return;
        // an ordinary dome («Protection Maxima»): proof against a blast outside the mountain — for half of «Бум»'s price
        // (out of mana: it shatters — all of it); inside the mountain no shield holds
        if (s && !s.gods && s.type === 2 && s.left > 0 && dist > R && c._payHit(BOOM.NAME)) { c._blastFx?.(b.c); return; }
        const th = boomThrow(dist);
        if (!g.flight?.active) {
            _v.set(me.x - b.c.x, 0, me.z - b.c.z);
            if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
            g.impact?.apply({ v: _v.normalize().multiplyScalar(th.speed * gods), from: b.c.clone(), by: b.by, spell: BOOM.NAME, always: gods >= 0.5 ? { down: 6 } : null, toss: th.toss * gods, jolt: 6 * gods, down: 6 });
        }
        let dmg = boomDamage(dist) * gods;
        if (s && s.left > 0 && dist > R && !s.gods) dmg *= s.type === 2 ? 0.25 : 0.5; // (inside the mountain no shield holds)
        dmg = Math.round(dmg);
        if (dmg <= 0 || g.config?.mode === 'creative') return;
        if (c?.enabled) c.damage(dmg, b.by === g.localId ? null : b.by, BOOM.NAME);
        else g.damageLocalPlayer?.(dmg);
    }

    _end(b) {
        if (b.ringMesh) b.ringMesh.visible = false;
        const i = this.list.indexOf(b);
        if (i >= 0) this.list.splice(i, 1);
    }

    // =========================================================== the look
    /** The rocks: one instanced mesh, made once (compiled at loading — Game.prewarm via sampleModels). */
    _rocksReady() {
        if (this.rocks) return this.rocks;
        const g = this.game;
        if (!g.scene) return null;
        const geo = new THREE.DodecahedronGeometry(1, 0);
        geo.scale(1, 0.7, 0.85); // (a slab of rock, not a ball)
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const mesh = new THREE.InstancedMesh(geo, mat, BOOM.ROCKS);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.name = 'boom-rocks';
        _m.makeScale(0, 0, 0);
        for (let i = 0; i < BOOM.ROCKS; i++) { mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _col.set(0x777777)); }
        mesh.count = 0;
        g.scene.add(mesh);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        ring.name = 'boom-ring';
        g.scene.add(ring);
        this.rocks = { mesh, list: [], free: [], ring, ringMat };
        for (let i = BOOM.ROCKS - 1; i >= 0; i--) this.rocks.free.push(i);
        return this.rocks;
    }

    /** One rock torn out at `p`, thrown outwards and up on an arc. */
    _throwRock(b, p, color, size) {
        const P = this.rocks;
        if (!P || !P.free.length) return;
        const i = P.free.pop();
        const c = b.c;
        _a.set(p.x - c.x, 0, p.z - c.z);
        if (_a.lengthSq() < 1e-4) _a.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        _a.normalize();
        const near = Math.max(0, 1 - Math.hypot(p.x - c.x, p.z - c.z) / R);
        const sp = 14 + Math.random() * 26 + 16 * near;
        const r = {
            i, x: p.x, y: p.y, z: p.z,
            vx: _a.x * sp + (Math.random() - 0.5) * 8, vy: 16 + Math.random() * 26 + 14 * near, vz: _a.z * sp + (Math.random() - 0.5) * 8,
            ax: Math.random() - 0.5, ay: Math.random() - 0.5, az: Math.random() - 0.5, spin: 2 + Math.random() * 6, ang: Math.random() * 6,
            s: size, t: 0, landed: -1, base: b.base,
        };
        P.mesh.setColorAt(i, _col.set(color).multiplyScalar(0.8 + Math.random() * 0.25));
        if (P.mesh.instanceColor) P.mesh.instanceColor.needsUpdate = true;
        P.list.push(r);
        P.mesh.count = BOOM.ROCKS;
    }

    _rocksUpdate(dt) {
        const P = this.rocks;
        if (!P || !P.list.length) return;
        const g = this.game, data = g.world?.terrain?.data, fx = g.fx;
        for (let k = P.list.length - 1; k >= 0; k--) {
            const r = P.list[k];
            r.t += dt;
            let sc = r.s;
            if (r.landed < 0) {
                r.vy -= 20 * dt;
                r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
                r.ang += r.spin * dt;
                const gy = data ? groundAt(data, r.x, r.z, r.base) : -Infinity;
                if ((r.vy < 0 && r.y - r.s * 0.5 < gy) || r.t > 9) {
                    // it crashes down and breaks: a puff of dust, a few chips
                    r.landed = r.t;
                    r.y = Math.max(r.y, gy + r.s * 0.3);
                    if (fx && r.s > 1) {
                        fx.smoke?.spawn(r.x, gy + 0.6, r.z, 0, 1.5, 0, 0x8a7d6c, r.s * 1.8, 2.2, { shrink: -0.5, spin: 1 });
                        fx.debris?.spawn(r.x, gy + 0.6, r.z, (Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 6, 0x6b5f52, 0.3, 1.2, { shrink: 0.1, fade: false, spin: 8 });
                    }
                }
            } else {
                // broken where it fell: it crumbles away
                const u = (r.t - r.landed) / 2.5;
                sc = r.s * Math.max(0, 1 - u * u);
                r.y -= dt * 0.4;
                if (u >= 1) { _m.makeScale(0, 0, 0); P.mesh.setMatrixAt(r.i, _m); P.free.push(r.i); P.list.splice(k, 1); continue; }
            }
            _q.setFromAxisAngle(_a.set(r.ax, r.ay, r.az).normalize(), r.ang);
            _m.compose(_v.set(r.x, r.y, r.z), _q, _s.set(sc, sc, sc));
            P.mesh.setMatrixAt(r.i, _m);
        }
        P.mesh.instanceMatrix.needsUpdate = true;
        if (!P.list.length) P.mesh.count = 0;
    }

    _ring(b) {
        const P = this._rocksReady();
        if (!P) return;
        P.ring.position.set(b.c.x, b.base + 1.2, b.c.z);
        P.ring.visible = true;
        P.ring.scale.setScalar(R);
        P.ringMat.opacity = 0.9;
        b.ringMesh = P.ring;
    }

    _afterLook(b, dt) {
        const g = this.game, c = b.c, fx = g.fx, t = b.t;
        if (b.ringMesh) {
            b.ringMesh.scale.setScalar(Math.max(R * 0.6, b.front * 1.04));
            this.rocks.ringMat.opacity = Math.max(0, 0.9 * (1 - t / (BOOM.SHOCK_T + 0.6)));
            if (t > BOOM.SHOCK_T + 0.6) b.ringMesh.visible = false;
        }
        if (t < 2) g.fx?.lightFlash?.(_a.set(c.x, c.y + 8, c.z), ORANGE, 50 * (1 - t / 2), 0.15, 400);
        if (!fx) return;
        const data = g.world?.terrain?.data;
        // the dust rolling out along the ground behind the shock wave
        if (b.front < BOOM.HARM_R && b.front > R * 0.6) {
            for (let i = 0; i < 20; i++) {
                const a = Math.random() * Math.PI * 2, r = b.front;
                const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
                const y = data ? groundAt(data, x, z, b.base) : b.base;
                if (Math.abs(y - b.base) > 50) continue;
                fx.smoke?.spawn(x, y + 0.8, z, Math.cos(a) * 8, 1 + Math.random() * 3, Math.sin(a) * 8, 0x8a7d6c, 2 + Math.random() * 3, 2.5 + Math.random() * 1.5, { shrink: -0.4, spin: 1 });
            }
        }
        // the cloud of dust over the crater, rising
        if (t < 6 && Math.random() < dt * 30) {
            for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2, r = Math.random() * R * 0.8;
                fx.smoke?.spawn(c.x + Math.cos(a) * r, b.base + 2 + Math.random() * 30, c.z + Math.sin(a) * r, Math.cos(a) * 1.5, 3 + Math.random() * 5, Math.sin(a) * 1.5, [0x6e6660, 0x7d7268, 0x5a524c][i], 6 + Math.random() * 6, 5 + Math.random() * 3, { shrink: -0.3, spin: 1 });
            }
        }
    }

    /** Made on the loading screen (Game.warmUp): the crater's columns in their order (a sort of 30 000 — never in a frame). */
    warm() { boomColumns(R); }

    /** Its look, compiled at loading (Game.prewarm): the rocks' mesh and the ring. */
    sampleModels() {
        const P = this._rocksReady();
        if (!P) return [];
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), P.mesh.material);
        const inst = new THREE.InstancedMesh(P.mesh.geometry, P.mesh.material, 1);
        inst.setColorAt(0, _col.set(0x777777));
        return [m, inst, new THREE.Mesh(P.ring.geometry, P.ringMat)];
    }

    /** Everything going on ends now (a new world, the game ends). */
    clear() {
        for (const b of [...this.list]) this._end(b);
        BOOM_SWELL.k.value.set(0, 0, 0);
        const P = this.rocks;
        if (P) {
            for (const r of P.list) { _m.makeScale(0, 0, 0); P.mesh.setMatrixAt(r.i, _m); P.free.push(r.i); }
            P.list.length = 0;
            P.mesh.count = 0;
            P.ring.visible = false;
        }
    }

    dispose() {
        this.clear();
        const P = this.rocks;
        if (!P) return;
        this.game.scene?.remove(P.mesh);
        this.game.scene?.remove(P.ring);
        P.mesh.geometry.dispose(); P.mesh.material.dispose(); P.mesh.dispose?.();
        P.ring.geometry.dispose(); P.ringMat.dispose();
        this.rocks = null;
    }
}
