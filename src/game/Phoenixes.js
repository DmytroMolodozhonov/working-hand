/**
 * Phoenixes.js — phoenixes: rare, beautiful fire birds that heal the wounded.
 *
 * The bird: half a hero tall (~2.4 m standing; the hero is ~4.8 m), crimson and gold plumage, a
 * crest, a long flowing tail of fiery streamers with golden «eyes», embers trailing behind it in
 * flight and a soft warm light (stronger at night). Real wing beats and glides, it banks into
 * turns, lands with braking beats, stands, walks, turns its head, preens.
 *
 * Loners: one phoenix at a time in an area (PHOENIX.AREA round a player); mostly in the sky,
 * soaring high in wide circles (by day and by night), now and then perching on the highest place
 * around (a mountain top, a tall crown), then off again.
 *   Spawn: the host, every SPAWN_MIN…SPAWN_MAX s, with SPAWN_CHANCE, makes one far out (60–110 m)
 *   round a player who has none within FORGET (at most MAX in the world; never in the «test» mode). Farther than FORGET from
 *   every player it is gone (streamed out) — a wild bird: phoenixes are not saved with the world
 *   (like book-birds and the spider); its feather is a thing and is saved like any thing.
 *
 * HEALING. The rule of a wound (each computer watches its own player — `woundEvent`):
 *   a real wound = (a) HP went down after WOUND_GAP s with no loss (a burst of blows, or a bleed
 *   that goes on dripping, is ONE wound); (b) bleeding began; (c) a limb was cut off. Never per
 *   frame. On each such wound, while the player is still hurt, the host rolls ONCE: if a free
 *   phoenix is within CALL_RANGE, with CALL_CHANCE (9%) it comes. (It never comes to one who
 *   attacked a phoenix in the last GRUDGE_T s, nor twice to the same player within HEAL_COOL.)
 *   It flies over, lands LAND_AHEAD m in front of him and watches. If he stays calm for CALM_T s
 *   (no big move of the body, no fast hand — a swing of a weapon is one — no hand raised above
 *   the shoulders to cast) it walks up and touches him with its head while its wing opens over
 *   him: golden light, a soft song — and he is FULLY healed: full HP, bleeding stopped, blades in
 *   him out, light cuts gone, every lost arm / leg grown back, ice / stun / «Даст» slowness /
 *   dizziness gone. A threat makes it start back (wings half open); SCARES of them, or waiting
 *   PATIENCE s, or being attacked — it flies off. The host decides everything; the healed
 *   player's own computer applies the healing ('phx' heal), everybody sees the light.
 *
 * ATTACKED: it mostly flies away, high. Attacked RAGE_ATTACKS times by the same player within
 *   RAGE_WINDOW s, each further attack has RAGE_CHANCE to turn it on him: it bursts into flame,
 *   climbs and dives at him (DIVES times), striking with fire (STRIKE_DMG, the ground there
 *   catches fire like any fire); a raised «Protection» facing it blocks the strike, a house's
 *   sphere keeps it out, water douses its flame (it gives up), it won't dive into water.
 * KILLED: it bursts into flames and leaves a phoenix feather (an item for potions later).
 *
 * ON WHOM AND ON WHAT (CLAUDE.md «На кого и на что») — TARGETS below, in code: every blow,
 * spell and thing, and what the phoenix itself does to creatures and the world.
 *
 * Multiplayer: the host flies the phoenixes ('phx' s, ~8×/s); guests follow smoothly and animate
 * them themselves; a guest's blows go to the host ('phx' hit), a guest's wounds too ('phx' wound);
 * heals, strikes and deaths are events everybody plays.
 */

import * as THREE from 'three';
import { newUid } from './ItemTypes.js';
import { registerKind } from './CreatureImpact.js';
import { creditKill } from './Mana.js';
import { earthly } from '../world/Planets.js';
import { mergeInto } from '../core/MergeGeometry.js';

export const PHOENIX = {
    HP: 30,
    HEIGHT: 2.4, // m standing (half a hero)
    CALL_CHANCE: 0.09, // per real wound, with a phoenix near
    CALL_RANGE: 140, // m: «a phoenix nearby»
    WOUND_GAP: 3, // s with no loss of HP before a new loss is a new wound
    LAND_AHEAD: 7, // m in front of the wounded
    CALM_T: 2.5, // s of calm before it comes up
    PATIENCE: 22, // s it waits on the ground at most
    SCARES: 3, // threats → it flies off
    TOUCH_D: 2.5, // m from the player's axis when it touches him
    HEAL_COOL: 90, // s: not twice to the same player sooner
    GRUDGE_T: 300, // s: it doesn't come to one who attacked a phoenix
    RAGE_ATTACKS: 3, RAGE_WINDOW: 40, RAGE_CHANCE: 0.35,
    DIVES: 3, STRIKE_DMG: 5, STRIKE_R: 2.6, // (a hero has 20 HP)
    AREA: 300, FORGET: 420, MAX: 2,
    // (4 times rarer than before, as the author asked: a check every 40–120 s brings one with 15%
    //  — about one in 9 minutes round a player who has none; the first not before 2 minutes)
    SPAWN_MIN: 40, SPAWN_MAX: 120, SPAWN_CHANCE: 0.15, FIRST: [120, 300],
    ALT: [40, 62], RADIUS: [28, 46], // soaring: m above the ground, circle radius
    SPEED: 11, FAST: 22, DIVE: 30, WALK: 1.3, // m/s
    REGEN: 0.2, // HP/s while it is left alone
    STUN_T: 6, // s on the ground after «Остолбеней»
};

/** Kinds of harm that are FIRE (a phoenix is born of fire: no harm, but it is an attack). */
const FIRE = new Set(['fire', 'Fire', 'Inferno', 'Hellfire', 'FireMaxima']);
/** Kinds that are ICE / cold (its own heat melts them at once). */
const ICE = new Set(['ice', 'Ice', 'IceDuel', 'Frozen', 'cold']);

/**
 * ON WHOM AND ON WHAT (the phoenix). For each thing that can reach it: what it does (`does`)
 * and why; and what the phoenix itself does (`by*`). «Не действует» is a decision too.
 */
export const TARGETS = {
    // ---- blows and things
    blade: { does: 'hit', why: 'меч, топор: урон как по существу; не отрубает (маленькое, в перьях), не застревает в ней; клинок упирается в тело' },
    fist: { does: 'hit', why: 'кулак, толчок рукой (BodyStrikes): урон кулака, толчок; это нападение' },
    arrow: { does: 'hit', why: 'стрела (Gear): урон стрелы, застревает' },
    cauldron: { does: 'hit', why: 'упавший котёл (только если феникс на земле)' },
    // ---- spells (rays, blasts, charges, gusts, water)
    AvadaKedavra: { does: 'hit', why: '−25 HP, как у всех существ' },
    Accentric: { does: 'hit', why: '«Акцентрик»: −40 за 8 с и минуту летает растерянно (StrongMagic)' },
    Pilbidrio: { does: 'hit', why: '«Пилбидрио»: −80 — почти всегда разрывает в искры' },
    Electrum: { does: 'hit', why: '«Электром»: −25, потом −20/с' },
    Die: { does: 'hit', why: '«Дай»: испепеляет — даже пера не остаётся' },
    Stupefy: { does: 'down', why: 'падает на землю и лежит STUN_T с, потом улетает' },
    IceDuel: { does: 'none', why: '«Айс»: лёд тает на нём сразу (огненная птица) — но это нападение' },
    LevitateDuel: { does: 'push', why: 'подбрасывает вверх, без урона; нападение' },
    Expelliarmus: { does: 'push', why: 'в когтях ничего нет — только толчок; нападение' },
    Disarmor: { does: 'push', why: '«Disarmor»: перья не снимешь — только толчок; нападение' },
    Jolt: { does: 'push', why: '«Джолт»: лёгкую птицу отбрасывает по воздуху, кувырком, без урона; нападение' },
    Firefighting: { does: 'push', why: '«Firefighting»: лёгкий толчок, пылающий феникс гаснет и бросает атаку; без урона' },
    SapiraDuel: { does: 'hit', why: '−10' },
    SandsDuel: { does: 'hit', why: '«Даст»: −4, песок с перьев слетает' },
    Sapira: { does: 'hit', why: 'луч «Сапира»: −5' },
    Thunderwave: { does: 'hit', why: 'громовая волна: −8' },
    Ice: { does: 'none', why: 'ледяной луч / «Frozen»: тает (огненная птица); нападение' },
    Inferno: { does: 'none', why: 'огонь «Инферно» его не берёт (рождён из огня) — но это нападение' },
    Hellfire: { does: 'none', why: '«Let the Hellfire Come»: огонь не берёт; нападение' },
    FireMaxima: { does: 'none', why: '«Fire Maxima»: огонь не берёт; нападение' },
    Bombardo: { does: 'hit', why: 'взрывы (Бомбардо, пушки, Total Destruction): урон 10 × сила, отбрасывает' },
    Lightning: { does: 'hit', why: 'молния: −20 (это не огонь)' },
    CircleAttack: { does: 'hit', why: '«Circle Attack» (и Максима): волна света — урон по зоне, отбрасывает (это не огонь)' },
    Inspirius: { does: 'hit', why: '«Inspirius»: сама магия, не огонь — −100 / −50 / −25, отбрасывает' },
    Boom: { does: 'hit', why: '«Бум»: разрыв горы изнутри, не огонь — в кратере −1000, дальше −150 / −40, отбрасывает' },
    Wind: { does: 'push', why: '«Вайнд», «Вайнд Максима»: лёгкую птицу сдувает далеко (CreatureImpact, масса 0.4), без урона; нападение' },
    Earthquake: { does: 'push', why: 'землетрясение: только если стоит на земле — шатается и взлетает' },
    Levitation: { does: 'hold', why: '«Вингардиум Левиоса»: поймана, висит и бьёт крыльями, где держит рука; отпустили — улетает' },
    WaterVortex: { does: 'push', why: '«Water Vortex», «Bubble»: толкает / держит в пузыре без урона; холод льда его не берёт; вода гасит его пламя' },
    WaterStorm: { does: 'push', why: 'водяная буря, волна, водяной шар: толкает, гасит пламя, без урона' },
    Brainrot: { does: 'none', why: '«Брейнрот»: феникс никому не подчиняется' },
    WindImpulse: { does: 'push', why: '«Wind Impulse»: лёгкую птицу отбрасывает волной воздуха (CreatureImpact), без урона; нападение' },
    Liquidation: { does: 'hit', why: '«Liquidation»: живое — −3, не рассыпается' },
    Drawdown: { does: 'none', why: '«Drawdown»: в воздухе не касается; на земле — опускается с ней' },
    Stitching: { does: 'none', why: '«Stitching»: не касается' },
    CreateBridge: { does: 'none', why: '«Create a Bridge»: не касается' },
    Groundprud: { does: 'none', why: '«Groundprud»: земля поднимается вдалеке от птицы — не касается' },
    Fireworks: { does: 'none', why: '«Fireworks»: искры высоко и гаснут в воздухе — феникс не обращает внимания' },
    Invisibility: { does: 'none', why: 'невидимого игрока не видит: не лечит и не нападает' },
    Alohomora: { does: 'none', why: 'живое существо без замков' },
    Lock: { does: 'none', why: '«Lock» запирает только двери' },
    Accio: { does: 'none', why: 'живое существо не притянуть; его ПЕРО — обычная вещь, «Акцио» его притягивает' },
    Rescue: { does: 'none', why: '«Rescue»: у него нет ран, которые надо останавливать' },
    ProtectionHouse: { does: 'push', why: 'сфера защиты дома не пускает его внутрь (вытесняет), не ранит — он улетает' },
    Protection: { does: 'block', why: 'поднятый «Protection» к нему лицом и купол держат его огненный удар' },
    // ---- creatures it meets
    players: { does: 'heal', why: 'раненого исцеляет (шанс 9%), напавшего — улетает / может напасть сам (огонь, пике)' },
    zombies: { does: 'none', why: 'зомби его не трогают и он их — летает высоко' },
    castlePeople: { does: 'none', why: 'жители, рыцари, король, волшебники его не трогают; он лечит только игроков' },
    animals: { does: 'none', why: 'звери его не замечают' },
    sailors: { does: 'none', why: 'моряки его не трогают' },
    spider: { does: 'none', why: 'паучиха охотится на игроков, не на птиц' },
    livingTrees: { does: 'none', why: 'живые деревья его не достают (летает)' },
    bookBirds: { does: 'none', why: 'книги-птицы — другие птицы, не мешают' },
    // ---- the world
    world: { does: 'fire', why: 'его огненный удар поджигает траву и деревья там, куда он ударил (как другой огонь); в воду не ныряет' },
    ships: { does: 'none', why: 'на корабли не садится; над палубой — как над землёй' },
};

const MODES = ['glide', 'flap', 'stand', 'walk', 'touch', 'down', 'held', 'dive', 'startle'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ======================================================================= rules (pure)
/**
 * Is this a new real wound? `st` keeps the last state {hp, bleed, lost, dropAt}; `s` is now
 * {hp, max, bleed, lost}. True once per wound (see the header), only while still hurt.
 */
export function woundEvent(st, s, now) {
    let ev = null;
    if (st.hp != null && s.hp < st.hp - 0.01) {
        if (!(now - (st.dropAt ?? -1e9) < PHOENIX.WOUND_GAP * 1000)) ev = 'hit';
        st.dropAt = now;
    }
    if (s.bleed > 0 && !(st.bleed > 0)) ev = 'bleed';
    if (s.lost > (st.lost || 0)) ev = 'limb';
    st.hp = s.hp; st.bleed = s.bleed; st.lost = s.lost;
    const hurt = s.hp < s.max - 0.5 || s.bleed > 0 || s.lost > 0;
    return hurt ? ev : null;
}

/** Calm or a threat, from how the player moves: body speed, the fastest hand, a hand held raised. */
export function threatOf(m) {
    return m.body > 1.6 || m.hand > 4.5 || m.raisedT > 0.4;
}

/** Does it turn on the attacker now? (attack times of that player, ms) */
export function rageRoll(times, now, r = Math.random, chance = PHOENIX.RAGE_CHANCE) {
    const recent = times.filter((t) => now - t < PHOENIX.RAGE_WINDOW * 1000).length;
    return recent >= PHOENIX.RAGE_ATTACKS && r() < chance;
}

// ======================================================================= the model
/** A feather lying in the XZ plane, pointing along −Z from its root (vertex colours base → tip). */
function featherGeo(len, w, c0, c1, droop = 0, tip = null) {
    const pos = [], col = [], idx = [];
    const N = 7, a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color(), t2 = tip != null ? new THREE.Color(tip) : null;
    for (let i = 0; i <= N; i++) {
        const t = i / N, z = -t * len, y = -droop * t * t;
        const hw = w * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * t)), 0.7) * (1 - 0.35 * t);
        c.copy(a).lerp(b, t);
        if (t2 && t > 0.8) c.lerp(t2, (t - 0.8) / 0.2);
        pos.push(-hw, y, z, 0, y + w * 0.06, z, hw, y, z);
        const e = c.clone().multiplyScalar(0.82); // (the edges a little darker)
        col.push(e.r, e.g, e.b, c.r, c.g, c.b, e.r, e.g, e.b);
        if (i) { const p = (i - 1) * 3, q = i * 3; idx.push(p, q, p + 1, p + 1, q, q + 1, p + 1, q + 1, p + 2, p + 2, q + 1, q + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

let _haloTex = null;
function haloTexture() {
    if (_haloTex || typeof document === 'undefined') return _haloTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    if (!x) return null;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,220,140,0.9)');
    gr.addColorStop(0.35, 'rgba(255,140,40,0.45)');
    gr.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    _haloTex = new THREE.CanvasTexture(c);
    return _haloTex;
}

/**
 * The phoenix (forward +Z, its feet at the origin). userData: the joints the animation moves
 * (tilt: the body's pitch / roll; neck, head; wings {sh, el, sec[], pri[]}; tail streamers; legs)
 * and the materials whose glow the fire and the night raise.
 */
export function phoenixModel() {
    const g = new THREE.Group();
    g.name = 'phoenix';
    const glowMats = [];
    const lam = (color, emissive, extra = {}) => { const m = new THREE.MeshLambertMaterial({ color, emissive, ...extra }); m.userData.baseEm = new THREE.Color(emissive); glowMats.push(m); return m; };
    const crimson = lam(0xb3132a, 0x2a0306);
    const breast = lam(0xff7424, 0x3a1200);
    const plume = lam(0xffffff, 0x2a0a00, { vertexColors: true, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.6, roughness: 0.35, emissive: 0x3a2000 });
    gold.userData.baseEm = new THREE.Color(0x3a2000); glowMats.push(gold);
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a0d08 });
    const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

    // the body (its middle 1.25 m above the feet): pitch and roll turn it all
    const tilt = new THREE.Group();
    tilt.position.y = 1.25;
    g.add(tilt);
    const torso = mesh(new THREE.SphereGeometry(1, 16, 12), crimson, tilt);
    torso.scale.set(0.4, 0.42, 0.78);
    const chest = mesh(new THREE.SphereGeometry(1, 14, 10), breast, tilt, 0, -0.06, 0.36);
    chest.scale.set(0.34, 0.36, 0.42);
    // (pieces that never move apart — the same material on the same joint — become one shape at the end:
    // a phoenix drew 131 pieces)
    const one = [];
    const back = [];
    // the back's small feathers (a mantle of orange tips over the crimson)
    for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(featherGeo(0.5, 0.11, 0xa8102a, 0xff8a2a), plume);
        f.position.set((i % 2 ? 1 : -1) * 0.12, 0.36 - i * 0.02, 0.35 - i * 0.16);
        f.rotation.set(-0.12, (i % 2 ? -1 : 1) * 0.25, 0);
        tilt.add(f);
        back.push(f);
    }
    one.push([tilt, back]);

    // neck and head
    const neck = new THREE.Group();
    neck.position.set(0, 0.2, 0.55);
    tilt.add(neck);
    const neckMesh = mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.5, 10), crimson, neck, 0, 0.25, 0);
    neckMesh.castShadow = true;
    // a golden ruff where the neck meets the breast
    const ruff = [];
    for (let i = 0; i < 8; i++) {
        const f = new THREE.Mesh(featherGeo(0.28, 0.07, 0xff9a2a, 0xffd860), plume);
        const a = (i / 8) * Math.PI * 2;
        f.position.set(Math.sin(a) * 0.15, 0.12, Math.cos(a) * 0.15);
        f.rotation.set(1.9, a, 0);
        neck.add(f);
        ruff.push(f);
    }
    one.push([neck, ruff]);
    const head = new THREE.Group();
    head.position.y = 0.48;
    neck.add(head);
    const skull = mesh(new THREE.SphereGeometry(0.2, 14, 10), crimson, head);
    skull.scale.set(1, 0.95, 1.15);
    const cheek = mesh(new THREE.SphereGeometry(0.13, 10, 8), breast, head, 0, -0.06, 0.08);
    cheek.scale.set(1.25, 0.8, 1);
    const beak = mesh(new THREE.ConeGeometry(0.07, 0.3, 10), gold, head, 0, -0.03, 0.33);
    beak.rotation.x = Math.PI / 2;
    const hook = mesh(new THREE.ConeGeometry(0.035, 0.1, 8), gold, head, 0, -0.09, 0.44);
    hook.rotation.x = Math.PI * 0.85;
    one.push([head, [beak, hook]]);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    const eyes = [], pupils = [];
    for (const s of [-1, 1]) {
        eyes.push(mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat, head, s * 0.15, 0.04, 0.12));
        pupils.push(mesh(new THREE.SphereGeometry(0.024, 6, 5), dark, head, s * 0.175, 0.045, 0.14));
    }
    one.push([head, eyes], [head, pupils]);
    // the crest: a fan of plumes rising back from the crown, gold-tipped
    const crest = new THREE.Group();
    crest.position.set(0, 0.16, -0.02);
    head.add(crest);
    const plumes = [];
    for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(featherGeo(0.36 + (i === 2 ? 0.1 : 0) - Math.abs(i - 2) * 0.04, 0.06, 0xc81a2a, 0xffb02a, -0.05, 0xfff0a0), plume);
        f.rotation.set(0.5 + Math.abs(i - 2) * 0.1, (i - 2) * 0.2, 0); // (swept back over the nape)
        crest.add(f);
        plumes.push(f);
    }
    one.push([crest, plumes]);

    // the wings (the left one is the right one mirrored)
    const wings = [];
    for (const s of [1, -1]) {
        const root = new THREE.Group();
        root.position.set(s * 0.3, 0.22, 0.22);
        root.scale.x = s;
        tilt.add(root);
        const sh = new THREE.Group();
        root.add(sh);
        const arm = mesh(new THREE.BoxGeometry(1.05, 0.09, 0.2), crimson, sh, 0.52, 0, 0);
        arm.scale.z = 1;
        const sec = [];
        for (let i = 0; i < 7; i++) {
            const p = new THREE.Group();
            p.position.set(0.1 + i * 0.15, -0.01, 0.06);
            const f = new THREE.Mesh(featherGeo(0.62 + i * 0.04, 0.13, 0xa50f26, 0xff6a1e, 0.04), plume);
            p.add(f);
            sh.add(p);
            sec.push(p);
        }
        // coverts: short crimson feathers over the arm (fuller)
        const coverts = [];
        for (let i = 0; i < 6; i++) {
            const f = new THREE.Mesh(featherGeo(0.32, 0.1, 0x8e0b20, 0xd8302a), plume);
            f.position.set(0.12 + i * 0.16, 0.035, 0.08);
            sh.add(f);
            coverts.push(f);
        }
        one.push([sh, coverts]);
        const el = new THREE.Group();
        el.position.x = 1.05;
        sh.add(el);
        mesh(new THREE.BoxGeometry(0.85, 0.07, 0.14), crimson, el, 0.42, 0, 0);
        const pri = [];
        for (let i = 0; i < 8; i++) {
            const p = new THREE.Group();
            p.position.set(i * 0.11, -0.01, 0.04);
            const f = new THREE.Mesh(featherGeo(0.95 + i * 0.07, 0.12, 0xe0401c, 0xffc23a, 0.06, 0xfff2b0), plume);
            p.add(f);
            p.userData.fan = 0.12 + i * 0.16; // (spread: the tip feathers point outward)
            el.add(p);
            pri.push(p);
        }
        wings.push({ root, sh, el, sec, pri, side: s });
    }

    // the tail: long streamers of three joints each, ending in a golden eye
    const tail = new THREE.Group();
    tail.position.set(0, 0.04, -0.7);
    tilt.add(tail);
    const streamers = [];
    const eyeGold = new THREE.MeshBasicMaterial({ color: 0xffd84a, side: THREE.DoubleSide });
    const eyeRed = new THREE.MeshBasicMaterial({ color: 0xc0102a, side: THREE.DoubleSide });
    for (let k = 0; k < 7; k++) {
        const L = 2.7 - Math.abs(k - 3) * 0.28;
        const segs = [];
        let parent = new THREE.Group();
        parent.rotation.y = (k - 3) * 0.12;
        tail.add(parent);
        const cols = [[0xa0101e, 0xe0361c], [0xe0361c, 0xff8a22], [0xff8a22, 0xffcf4a]];
        for (let i = 0; i < 3; i++) {
            const seg = new THREE.Group();
            if (i) seg.position.z = -L / 3;
            parent.add(seg);
            seg.add(new THREE.Mesh(featherGeo(L / 3 + 0.02, 0.1 - i * 0.015 + (k === 3 ? 0.02 : 0), cols[i][0], cols[i][1]), plume));
            segs.push(seg);
            parent = seg;
        }
        const eye = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), eyeGold);
        eye.rotation.x = -Math.PI / 2;
        eye.position.z = -L / 3 - 0.06;
        const iris = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), eyeRed);
        iris.position.z = 0.003;
        eye.add(iris);
        parent.add(eye);
        streamers.push({ segs, k, tip: eye });
    }

    // the legs: a feathered thigh, a golden shin, golden toes with dark talons
    const legs = [];
    for (const s of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(s * 0.17, -0.3, 0.05);
        tilt.add(hip);
        const thigh = mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.42, 8), crimson, hip, 0, -0.21, 0);
        thigh.castShadow = true;
        const knee = new THREE.Group();
        knee.position.y = -0.42;
        hip.add(knee);
        mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.5, 6), gold, knee, 0, -0.25, 0);
        const foot = new THREE.Group();
        foot.position.y = -0.5;
        knee.add(foot);
        const toes = [], claws = [];
        for (const [a, l] of [[-0.45, 0.24], [0, 0.28], [0.45, 0.24], [Math.PI, 0.16]]) {
            const toe = new THREE.Group();
            toe.rotation.y = a;
            foot.add(toe);
            toes.push(mesh(new THREE.BoxGeometry(0.05, 0.04, l), gold, toe, 0, 0, l / 2));
            const claw = mesh(new THREE.ConeGeometry(0.025, 0.08, 5), dark, toe, 0, -0.02, l + 0.03);
            claw.rotation.x = Math.PI / 2 + 0.6;
            claws.push(claw);
        }
        one.push([foot, toes], [foot, claws]);
        legs.push({ hip, knee, foot });
    }

    // a soft halo of warm light round the body
    const tex = haloTexture();
    let halo = null;
    if (tex) {
        halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffa040, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(4);
        tilt.add(halo);
    }
    for (const [parent, list] of one) mergeInto(parent, list);
    g.userData = { tilt, neck, head, crest, wings, tail, streamers, legs, halo, glowMats, torso };
    return g;
}

/** The body as a capsule (world): from the tail's root to the breast. */
export function phoenixBody(f, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const t = f.model.userData.tilt;
    t.updateWorldMatrix(true, false);
    out.a.set(0, 0, -0.65).applyMatrix4(t.matrixWorld);
    out.b.set(0, 0.15, 0.6).applyMatrix4(t.matrixWorld);
    out.r = 0.5;
    return out;
}

/** Its middle (where spells and arrows are aimed). */
export function phoenixCenter(f, out = new THREE.Vector3()) {
    f.model.userData.tilt.updateWorldMatrix(true, false);
    return out.set(0, 0, 0).applyMatrix4(f.model.userData.tilt.matrixWorld);
}

/** How far a point is from its body (≤ 0: inside). */
export function phoenixDist(f, p) {
    const c = phoenixBody(f, _cap);
    const ab = _v2.subVectors(c.b, c.a);
    const t = Math.max(0, Math.min(1, _v.subVectors(p, c.a).dot(ab) / ab.lengthSq()));
    return _v.copy(c.a).addScaledVector(ab, t).distanceTo(p) - c.r;
}

// ------------------------------------------------------------------ animation
/**
 * One pose of the bird from its mode (every computer: the host's and the guests' birds alike).
 * a: {mode, t, flap (phase), walk, pitch, roll, head (yaw), flame, touchK}
 */
export function posePhoenix(model, a, dt) {
    const U = model.userData;
    const m = a.mode;
    a.t = (a.t || 0) + dt;
    // the wings
    const flapping = m === 'flap' || m === 'held' || m === 'startle';
    const rate = m === 'held' ? 9 : m === 'startle' ? 7 : 5.2;
    if (flapping) a.flap = (a.flap || 0) + dt * rate;
    else if (m === 'glide' || m === 'dive') a.flap = (a.flap || 0) + dt * 0.8;
    const fold = m === 'stand' || m === 'walk' ? 1 : m === 'dive' ? 0.65 : m === 'down' ? 0.25 : m === 'touch' ? 1 : m === 'startle' ? 0.35 : 0;
    a.fold = (a.fold ?? fold) + (fold - (a.fold ?? fold)) * Math.min(1, dt * 5);
    const F = a.fold;
    for (const w of U.wings) {
        let z, elz, y = 0;
        if (flapping) { const s = Math.sin(a.flap); z = 0.22 + 0.78 * s; elz = 0.4 * Math.sin(a.flap - 0.9); y = -0.12 + 0.18 * Math.cos(a.flap); }
        else if (m === 'down') { z = -0.35; elz = -0.1; }
        else if (m === 'dive') { z = 0.25; elz = -0.1; }
        else { z = 0.12 + 0.04 * Math.sin(a.t * 1.3 + w.side); elz = -0.06 + 0.03 * Math.sin(a.t * 1.7); }
        // touching: the wing nearer the one it heals opens forward over him
        if (m === 'touch' && w.side === 1) { const k = a.touchK || 0; z = 0.35 * k; y = -0.55 * k; elz = 0.1 * k; }
        const open = m === 'touch' && w.side === 1 ? 1 - 0.85 * (a.touchK || 0) : F;
        w.root.rotation.x = 0.4 * open; // (folded, the wing lies along the back — not trailing on the ground)
        w.sh.rotation.set(0, y * (1 - open) + 1.25 * open, z * (1 - open) + 0.05 * open);
        w.el.rotation.set(0, -0.3 * open, elz * (1 - open));
        for (const p of w.sec) p.rotation.y = -1.25 * open;
        for (const p of w.pri) p.rotation.y = -p.userData.fan * (1 - open) - 0.95 * open;
    }
    // the body: pitch / roll; standing it holds itself up (nose up), the legs straight down
    const stand = m === 'stand' || m === 'walk' || m === 'touch' || m === 'startle';
    const pitch = stand ? -0.45 : m === 'down' ? 0 : (a.pitch || 0);
    const roll = m === 'down' ? 1.35 : stand ? 0 : (a.roll || 0);
    U.tilt.rotation.x += (pitch - U.tilt.rotation.x) * Math.min(1, dt * 6);
    U.tilt.rotation.z += (roll - U.tilt.rotation.z) * Math.min(1, dt * 6);
    U.tilt.position.y = m === 'down' ? 0.45 : 1.25;
    // the neck: up when it stands, stretched forward in flight; the head kept level
    const touchK = m === 'touch' ? a.touchK || 0 : 0;
    const neckX = stand ? 0.6 + 0.9 * touchK : m === 'down' ? 1.3 : 1.25;
    U.neck.rotation.x += (neckX - U.neck.rotation.x) * Math.min(1, dt * 6);
    U.head.rotation.x = -(U.tilt.rotation.x + U.neck.rotation.x) + (stand ? 0.1 + 0.5 * touchK : 0);
    U.head.rotation.y = a.head || 0;
    U.head.rotation.z = stand ? 0.12 * Math.sin(a.t * 0.9) : 0; // (a curious tilt)
    U.crest.rotation.x = 0.1 * Math.sin(a.t * 2.3);
    // the legs: tucked back in flight, walking on the ground
    if (stand) a.walk = (a.walk || 0) + dt * (m === 'walk' ? 6 : 0);
    U.legs.forEach((L, i) => {
        if (stand) {
            const s = m === 'walk' ? Math.sin(a.walk + i * Math.PI) : 0;
            L.hip.rotation.x = 0.45 + 0.4 * s;
            L.knee.rotation.x = m === 'walk' ? 0.35 * Math.max(0, -s) : 0;
            L.foot.rotation.x = -(U.tilt.rotation.x + L.hip.rotation.x + L.knee.rotation.x); // (flat on the ground)
        } else { L.hip.rotation.x = 1.35; L.knee.rotation.x = -0.7; L.foot.rotation.x = 0.6; }
    });
    // the tail: flowing in the air, lying back standing
    U.tail.rotation.x = stand ? 0.34 : m === 'dive' ? 0.05 : 0.02;
    const amp = stand ? 0.05 : m === 'flap' ? 0.18 : 0.12, sp = stand ? 1.2 : 3.2;
    for (const s of U.streamers) {
        s.segs.forEach((seg, i) => {
            seg.rotation.x = (stand ? -0.05 : 0.02) + amp * Math.sin(a.t * sp - i * 0.9 - s.k * 0.45);
            seg.rotation.y = 0.04 * Math.sin(a.t * sp * 0.7 - i - s.k);
        });
    }
    // the glow: the night, the fire
    const night = a.night || 0, flame = a.flame || 0;
    for (const mt of U.glowMats) {
        mt.emissive.copy(mt.userData.baseEm).multiplyScalar(1 + 1.2 * night);
        if (flame > 0.01) mt.emissive.lerp(_flameCol, Math.min(1, flame * 0.8));
    }
    if (U.halo) {
        U.halo.material.opacity = 0.18 + 0.3 * night + 0.5 * flame + 0.05 * Math.sin(a.t * 3);
        U.halo.scale.setScalar(3.6 + 2.5 * flame);
    }
}
const _flameCol = new THREE.Color(0xff7a14);

// ======================================================================= manager
export class Phoenixes {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.enabled = game.config?.mode !== 'test';
        this.callChance = PHOENIX.CALL_CHANCE;
        this.rageChance = PHOENIX.RAGE_CHANCE;
        this._spawnT = rnd(...PHOENIX.FIRST);
        this._netT = 0;
        this._me = {}; // my wound watch
        this._motion = new Map(); // player id → how they move (calm / threat)
        this.healCool = new Map(); // player id → when healed (ms)
        this.grudge = new Map(); // player id → [attack times] (ms)
        this._woundAt = new Map();
        this.clock = 0; // ms of game time (the waits and memories below: one clock, steady in a test as in the game)
        this.log = []; // (tests) what happened
        // ONE light for the nearest phoenix: made now, before the shaders are compiled
        this.light = typeof THREE.PointLight === 'function' ? new THREE.PointLight(0xff8a3a, 0, 22, 2) : null;
        if (this.light && game.scene) { this.light.castShadow = false; game.scene.add(this.light); }
    }

    get auth() { return this.game.authority !== false; }

    _note(e) { this.log.push({ t: Math.round(this.clock), ...e }); if (this.log.length > 60) this.log.shift(); }

    // ------------------------------------------------------------ life
    spawn(pos, id = null) {
        const g = this.game;
        const model = phoenixModel();
        model.position.copy(pos);
        g.scene?.add(model);
        const f = {
            id: id ?? 'ph' + Math.floor(Math.random() * 1e9).toString(36), ck: 'F', isPhoenix: true, model, group: model, hp: PHOENIX.HP, dead: false,
            get isDead() { return this.dead; }, get position() { return this.model.position; },
            bodyCapsule: (out) => phoenixBody(f, out),
            damageCooldown: 0, stunT: 0, state: 'soar', t: 0, vel: new THREE.Vector3(), yaw: 0,
            centre: pos.clone(), ang: Math.random() * Math.PI * 2, radius: rnd(...PHOENIX.RADIUS), alt: rnd(...PHOENIX.ALT), dir: Math.random() < 0.5 ? 1 : -1,
            perchT: rnd(50, 120), flapT: rnd(4, 9), a: { mode: 'glide', head: 0 }, flame: 0, call: null, rage: null,
        };
        // its parts for the hands' blows (BodyStrikes): the body and the head, in its own frame
        const parts = [['body', () => model.userData.tilt, [0, 0, 0], [0.45, 0.45, 0.8]], ['head', () => model.userData.head, [0, 0, 0.05], [0.22, 0.22, 0.3]]];
        parts.model = model;
        f._strikeParts = parts;
        this.list.push(f);
        return f;
    }

    _remove(f) {
        this.game.scene?.remove(f.model);
        f.model.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } });
        const i = this.list.indexOf(f);
        if (i >= 0) this.list.splice(i, 1);
    }

    targets() { return this.list.filter((f) => !f.dead); }
    byId(id) { return this.list.find((f) => f.id === id && !f.dead) || null; }

    // ------------------------------------------------------------ players
    /** A player's body (feet ~2 m below it), facing and state. null: gone / dead. */
    _player(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') {
            if (g.isDeadLocal || g.combat?.dead) return null;
            const ch = g.character;
            const pos = g.invis ? g.invis.aiPos(g.localId, ch.group.position) : ch.group.position; // (an invisible player: only where they were last noticed, for a few seconds — Invisibility.aiPos)
            return pos ? { pos, yaw: ch.group.rotation.y, swim: ch.swimY != null } : null;
        }
        const r = g.remotes?.get(id);
        if (!r || r.dead) return null;
        const pos = g.invis ? g.invis.aiPos(id, r.position) : r.position;
        return pos ? { pos, yaw: r.character?.group.rotation.y ?? 0, swim: false } : null;
    }

    _players() {
        const g = this.game, out = [];
        const me = this._player(g.localId);
        if (me) out.push({ id: g.localId, ...me });
        for (const [id] of g.remotes || []) { const p = this._player(id); if (p) out.push({ id, ...p }); }
        return out.filter((P) => earthly(P.pos)); // (phoenixes only round players on the Earth: Planets.earthly)
    }

    _ground(x, z) { const y = this.game.collision?.groundY?.(x, z); return Number.isFinite(y) ? y : 0; }

    _isWater(x, z) {
        const t = this.game.terrain?.data;
        const y = this._ground(x, z);
        return !!t?.isWaterAt?.(x, y + 0.6, z);
    }

    // ------------------------------------------------------------ the wound watch (my own player)
    _watchMe() {
        const g = this.game, c = g.combat;
        if (g.isDeadLocal || c?.dead || g.config?.mode === 'creative') { this._me = {}; return; }
        const on = !!c?.enabled;
        const s = {
            hp: on ? c.hp : g.playerHP ?? 0, max: on ? c.maxHp || 20 : g.maxHP ?? 20,
            bleed: g.bleeding?.rate || 0,
            lost: Object.values(g.character?.limbs || {}).filter((v) => v != null && v !== false).length,
        };
        const ev = woundEvent(this._me, s, this.clock);
        if (!ev) return;
        this._note({ ev: 'wound', kind: ev });
        if (this.auth) this._wound(g.localId);
        else this._send({ op: 'wound' });
    }

    /** (host) A player got a real wound: the one roll of CALL_CHANCE, if a free phoenix is near. */
    _wound(id) {
        const now = this.clock;
        if (now - (this._woundAt.get(id) ?? -1e9) < 1000) return; // (one roll a second at most)
        this._woundAt.set(id, now);
        const P = this._player(id);
        if (!P) return;
        if (now - (this.healCool.get(id) ?? -1e9) < PHOENIX.HEAL_COOL * 1000) return;
        if ((this.grudge.get(id) || []).some((t) => now - t < PHOENIX.GRUDGE_T * 1000)) return;
        let best = null;
        for (const f of this.list) {
            if (f.dead || f.call || f.rage || !['soar', 'perch', 'perchGo', 'takeoff'].includes(f.state)) continue;
            const d = hdist(f.model.position, P.pos);
            if (d < PHOENIX.CALL_RANGE && (!best || d < best.d)) best = { f, d };
        }
        if (!best) { this._note({ ev: 'roll', id, near: false }); return; }
        const ok = Math.random() < this.callChance;
        this._note({ ev: 'roll', id, near: true, ok });
        if (!ok) return;
        const f = best.f;
        f.call = { to: id, phase: 'fly', calmT: 0, scares: 0, waitT: 0, scareAt: -1e9, land: this._landPoint(P) };
        this._setState(f, 'come');
        this._tell(id, '🔥 Феникс заметил вашу рану и летит к вам. Когда он сядет — стойте спокойно, не поднимайте руки');
    }

    /** Where it lands: LAND_AHEAD m in front of the player, on the ground. */
    _landPoint(P) {
        const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
        const x = P.pos.x + fx * PHOENIX.LAND_AHEAD, z = P.pos.z + fz * PHOENIX.LAND_AHEAD;
        return new THREE.Vector3(x, this._ground(x, z), z);
    }

    /** How the called player moves now: calm, or a threat. */
    _threat(id, dt) {
        const g = this.game;
        const P = this._player(id);
        if (!P) return null;
        let m = this._motion.get(id);
        if (!m) { m = { body: 0, hand: 0, raisedT: 0, prev: null, hands: [new THREE.Vector3(), new THREE.Vector3()], has: false }; this._motion.set(id, m); }
        const hp = [new THREE.Vector3(), new THREE.Vector3()];
        let hands = 0;
        ['left', 'right'].forEach((s, i) => { if (g.duel?._handOf?.(id, s, hp[i], _v3)) hands++; else hp[i].copy(P.pos); });
        if (this.clock - (m.at ?? -1e9) > 500) { m.has = false; m.body = m.hand = m.raisedT = 0; } // (not watched for a while: a fresh look)
        m.at = this.clock;
        if (m.has && dt > 0) {
            const bv = Math.hypot(P.pos.x - m.prev.x, P.pos.z - m.prev.z) / dt;
            const hv = Math.max(hp[0].distanceTo(m.hands[0]), hp[1].distanceTo(m.hands[1])) / dt;
            const k = Math.min(1, dt * 6);
            m.body += (Math.min(bv, 30) - m.body) * k;
            m.hand += (Math.min(hv, 30) - m.hand) * k;
        }
        const raised = hands && Math.max(hp[0].y, hp[1].y) > P.pos.y + 1.25; // (at the shoulders or above: a hand raised to cast)
        m.raisedT = raised ? m.raisedT + dt : 0;
        m.prev = (m.prev || new THREE.Vector3()).copy(P.pos);
        m.hands[0].copy(hp[0]); m.hands[1].copy(hp[1]);
        m.has = true;
        return { P, threat: threatOf(m), m };
    }

    // ------------------------------------------------------------ states
    _setState(f, s) {
        f.state = s; f.t = 0;
        if (s !== 'come' && s !== 'watch' && s !== 'approach' && s !== 'touch') f.call = null;
    }

    /** Off and away, high: from a threat / an attack (`from`: whom it flees). */
    _flee(f, from = null) {
        const p = f.model.position;
        const away = from ? _v.set(p.x - from.x, 0, p.z - from.z) : _v.set(Math.cos(f.ang), 0, Math.sin(f.ang));
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
        away.normalize();
        f.flee = new THREE.Vector3(p.x + away.x * 90, 0, p.z + away.z * 90);
        f.flee.y = this._ground(f.flee.x, f.flee.z) + 55;
        f.flame = Math.min(f.flame, 1);
        this._setState(f, f.model.position.y - this._ground(p.x, p.z) < 2.5 ? 'takeoff' : 'leave');
        f.after = 'leave';
    }

    _rage(f, by) {
        f.rage = { by, dives: 0, phase: 'climb', t: 0 };
        this._setState(f, 'rage');
        this._cry(f, 0.8);
        this._note({ ev: 'rage', id: f.id, by });
        this._tell(by, '🔥 Феникс вспыхнул огнём и бросается на вас! Поднимите «Protection» или уйдите в воду');
    }

    /** (host) Something struck it / was cast at it by `by`. */
    _attacked(f, by, kind = null) {
        if (!this.auth || !f || f.dead || f.state === 'dying') return;
        const g = this.game;
        if (by === 'local' || by === 'H') by = g.localId;
        if (by != null && by !== g.localId && !g.remotes?.has(by)) by = null; // (not a player: a knight's arrow, a blast)
        const now = this.clock;
        if (f._lastAtk && now - f._lastAtk.t < 400 && f._lastAtk.by === by) return; // (one blow, one count)
        f._lastAtk = { by, t: now };
        if (by != null) {
            const ts = (this.grudge.get(by) || []).filter((t) => now - t < PHOENIX.GRUDGE_T * 1000);
            ts.push(now);
            this.grudge.set(by, ts.slice(-12));
        }
        this._note({ ev: 'attacked', id: f.id, by, kind });
        if (f.state === 'rage') return; // (already fighting)
        if (f.call) this._tell(f.call.to, '🔥 Феникса спугнули — он улетел');
        if (by != null && rageRoll(this.grudge.get(by), now, Math.random, this.rageChance)) { this._rage(f, by); return; }
        this._cry(f, 1.1);
        const P = by != null ? this._player(by) : null;
        if (f.state !== 'down' && f.state !== 'held') this._flee(f, P?.pos || null);
    }

    // ------------------------------------------------------------ harm
    /** A blow / a spell on it (any computer: a guest's goes to the host). */
    hit(f, dmg, kind = null, by = undefined) {
        if (!f || f.dead) return;
        const g = this.game;
        if (by === undefined) by = g.localId;
        if (!this.auth) { this._send({ op: 'hit', id: f.id, dmg: Math.round(dmg * 10) / 10, kind }); this._sparkBurst(f, 0xff6a1a, 8); return; }
        const c = phoenixCenter(f, _v3);
        if (FIRE.has(kind)) {
            // born of fire: the flame swirls round it and is gone (no harm — but it was an attack)
            for (let i = 0; i < 14; i++) g.fx?.spark?.(c, i % 2 ? 0xffd25a : 0xff7a14, 0.14, _v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3), 0.7);
            this._attacked(f, by, kind);
            return;
        }
        if (ICE.has(kind)) {
            for (let i = 0; i < 14; i++) g.fx?.spark?.(c, 0xeef6ff, 0.16, _v.set((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2), 1.0); // (steam: the ice melts on it)
            this._attacked(f, by, kind);
            return;
        }
        if (/^Wind/.test(kind || '')) { this._attacked(f, by, kind); return; } // (a gust: CreatureImpact throws it, no harm)
        f.hp = Math.max(0, f.hp - Math.max(0, dmg));
        this._sparkBurst(f, 0xff4a1a, 12);
        this._note({ ev: 'hit', id: f.id, dmg, kind, by });
        if (f.hp <= 0) { this._die(f, by); return; }
        this._attacked(f, by, kind);
    }

    /** A blast at p (Bombardo, lightning, a cauldron…): it hurts if it reaches the body. */
    hitAt(p, radius, dmg, kind, by = null) {
        if (!this.auth) return;
        for (const f of this.targets()) if (phoenixDist(f, p) < radius) this.hit(f, dmg, kind, by ?? this._nearestTo(p));
    }

    /** A beam / a cone (fire, ice, thunder…) along o + d·t. */
    hitRay(o, d, len, width, dmg, kind, by = null) {
        if (!this.auth) return false;
        let any = false;
        for (const f of this.targets()) {
            const b = phoenixBody(f, _cap);
            let hit = false;
            for (let k = 0; k <= 3 && !hit; k++) {
                const q = _v2.lerpVectors(b.a, b.b, k / 3);
                const along = _v.subVectors(q, o).dot(d);
                if (along < -b.r || along > len + b.r) continue;
                hit = _v.addScaledVector(d, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit) { this.hit(f, dmg, kind, by ?? this._nearestTo(o)); any = true; }
        }
        return any;
    }

    /** A duel charge touched it (the host decides) — see TARGETS. */
    boltHit(f, spell, by) {
        const g = this.game;
        if (!f || f.dead) return;
        if (!this.auth) { this._send({ op: 'hit', id: f.id, dmg: 0, kind: spell }); return; }
        if (spell === 'AvadaKedavra') { g.fx?.lightFlash?.(phoenixCenter(f, _v3), 0x2bff00, 6, 0.55, 28); this.hit(f, 25, spell, by); }
        else if (spell === 'SapiraDuel') this.hit(f, 10, spell, by);
        else if (spell === 'SandsDuel') this.hit(f, 4, spell, by);
        else if (spell === 'Stupefy') { this.hit(f, 2, spell, by); if (!f.dead) this._down(f); }
        else if (spell === 'IceDuel' || spell === 'IceDuelMaxima') this.hit(f, 0, 'IceDuel', by); // («Айс» / «Frozen» and its Maxima: the ice melts on it)
        else if (spell === 'LevitateDuel') { f.vel.y += 9; this._attacked(f, by, spell); }
        else if (spell === 'Jolt' || spell === 'JoltMaxima') { f.vel.add(_v.subVectors(f.model.position, this._player(by)?.pos || f.model.position).setY(0).setLength(spell === 'Jolt' ? 14 : 24)).setY(4); f.stunT = 1.2; this._attacked(f, by, spell); }
        else if (spell === 'Expelliarmus' || spell === 'Disarmor') { f.vel.add(_v.subVectors(f.model.position, this._player(by)?.pos || f.model.position).setY(0).setLength(6)); this._attacked(f, by, spell); }
        else this.hit(f, 4, spell, by);
    }

    /** «Остолбеней»: it drops to the ground and lies a while. */
    _down(f) {
        if (f.lev) return;
        this._setState(f, 'down');
        f.rage = null;
    }

    /** Water reached it (a vortex, a storm, a wave, a water ball): pushed, its flame put out. */
    watered(f, push = null, by = null) {
        if (!this.auth || !f || f.dead) return;
        if (push) f.vel.add(push);
        if (f.flame > 0.2 || f.state === 'rage') {
            for (let i = 0; i < 24; i++) this.game.fx?.spark?.(phoenixCenter(f, _v3), 0xeef6ff, 0.2, _v.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3), 1.2);
            f.flame = 0;
            f.rage = null;
            this._note({ ev: 'doused', id: f.id });
        }
        this._attacked(f, by, 'water');
        if (f.state === 'rage') this._flee(f);
    }

    /** A house's sphere of protection turned it away (no harm). */
    shooed(f) { if (this.auth && f && !f.dead && f.state !== 'leave') { this._tell(f.call?.to, '🔥 Феникс не может пройти сквозь защиту дома'); this._flee(f, null); } }

    /** The vortex's bubble let it go. */
    freed(f) { if (this.auth && f && !f.dead) this._flee(f); }

    _die(f, by) {
        if (f.dead) return;
        f.dead = true;
        const g = this.game;
        const p = phoenixCenter(f, new THREE.Vector3());
        this._note({ ev: 'die', id: f.id, by });
        this._burst(p);
        f.model.visible = false;
        if (this.auth) {
            // its feather: it drifts down from where the bird burnt
            if (!f.annihilated) g.items?.spawnLoose?.({ kind: 'phoenixFeather', uid: newUid(), count: 1 }, p.clone(), { vel: _v.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2) });
            this._send({ op: 'die', id: f.id, p: [p.x, p.y, p.z].map(r2) });
            creditKill(g, by, { kind: 'phoenix' }); // (mana: a magical creature — the killer's maximum grows, once per kind)
            if (by === g.localId) g.hud?.setVoice?.('🔥 Феникс сгорел в собственном пламени. Осталось перо феникса', true);
            else if (by) this._tell(by, '🔥 Феникс сгорел в собственном пламени. Осталось перо феникса');
        }
        setTimeout(() => this._remove(f), 50);
    }

    /** It bursts into flames (everybody sees it). */
    _burst(p) {
        const fx = this.game.fx;
        fx?.lightFlash?.(p, 0xff8a2a, 6, 0.8, 40);
        for (let i = 0; i < 90; i++) {
            const c = i % 3 === 0 ? 0xffe08a : i % 3 === 1 ? 0xff6a14 : 0xd8201a;
            fx?.spark?.(p, c, 0.15 + Math.random() * 0.2, _v.set((Math.random() - 0.5) * 9, Math.random() * 9, (Math.random() - 0.5) * 9), 1 + Math.random());
        }
        this.game.sound?.playPhoenixCry?.(p, 0.7);
    }

    _sparkBurst(f, color, n) {
        const c = phoenixCenter(f, _v3);
        for (let i = 0; i < n; i++) this.game.fx?.spark?.(c, i % 2 ? color : 0xffc23a, 0.1, _v.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.6);
    }

    _cry(f, rate = 1) { this.game.sound?.playPhoenixCry?.(f.model.position, rate); }

    /** The player nearest to a point (who cast a ray / a blast there), within 12 m. */
    _nearestTo(p) {
        let best = null;
        for (const P of this._players()) { const d = P.pos.distanceTo(p); if (d < 12 && (!best || d < best.d)) best = { id: P.id, d }; }
        return best?.id ?? null;
    }

    // ------------------------------------------------------------ healing
    /** (host) The touch: the player is healed (on his own computer); everybody sees the light. */
    _heal(f, id) {
        const g = this.game;
        this.healCool.set(id, this.clock);
        this._note({ ev: 'heal', id: f.id, to: id });
        const P = this._player(id);
        if (P) this._healFx(P.pos);
        this._send({ op: 'heal', to: id, id: f.id, p: P ? [P.pos.x, P.pos.y, P.pos.z].map(r2) : null });
        if (id === g.localId) this.healMe();
    }

    _healFx(pos) {
        const fx = this.game.fx;
        fx?.lightFlash?.(_v.copy(pos).add(_v2.set(0, 1, 0)), 0xffd27a, 5, 1.4, 30);
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 6;
            fx?.spark?.(_v.set(pos.x + Math.cos(a) * 1.2, pos.y - 1.6 + i * 0.07, pos.z + Math.sin(a) * 1.2), i % 2 ? 0xffe9a0 : 0xffb43a, 0.12, _v2.set(-Math.sin(a) * 1.5, 1.8, Math.cos(a) * 1.5), 1.4);
        }
        this.game.sound?.playPhoenixSong?.(pos);
    }

    /** (the healed player's own computer) Whole again: HP, blood, blades, cuts, limbs, ice, stun, slowness, dizziness. */
    healMe() {
        const g = this.game, c = g.combat, ch = g.character;
        if (g.isDeadLocal || c?.dead) return false;
        if (c) {
            c.hp = c.maxHp || 20;
            c.frozenLeft = 0; c.frozenBy = null; c.chill = 0; c.stunLeft = 0; c.slowLeft = 0;
            c._hudKey = '';
        }
        if (ch) ch.slowScale = 1;
        if (g.maxHP != null) { g.playerHP = g.maxHP; g.hud?.update?.(g.playerHP, g.maxHP, g.killCount, g.punchCount); }
        const B = g.bleeding;
        if (B) {
            for (const wid of B._bladesInMe?.() || []) B.pullOut(wid);
            B.rate = 0; B._acc = 0;
            g.sync?.bleed?.(0);
            B.clearCuts?.(ch);
        }
        g.dismember?.healLocal?.();
        if (g.knock) g.knock.dizzyLeft = 0;
        g.hud?.setFrozenOverlay?.(0);
        g.hud?.flashColor?.('rgba(255, 200, 90, 0.55)');
        g.hud?.setVoice?.('🔥 Феникс коснулся вас — вы исцелены полностью', true);
        this._me = {};
        this._note({ ev: 'healed' });
        return true;
    }

    // ------------------------------------------------------------ the host's mind
    /** Flying towards `goal` at `speed`: steering, banking, pitching, keeping off the ground. */
    _fly(f, goal, speed, dt, { low = false, k = 2.2 } = {}) {
        const p = f.model.position;
        const to = _v.subVectors(goal, p);
        const d = to.length();
        const want = d > 1e-3 ? to.multiplyScalar(Math.min(speed, d * 1.4 + 0.3) / d) : to.set(0, 0, 0);
        f.vel.lerp(want, 1 - Math.exp(-dt * k));
        p.addScaledVector(f.vel, dt);
        const gy = this._ground(p.x, p.z);
        if (!low && p.y < gy + 3) { p.y = gy + 3; f.vel.y = Math.max(0, f.vel.y); }
        if (p.y < gy) p.y = gy;
        const hs = Math.hypot(f.vel.x, f.vel.z);
        let turn = 0;
        if (hs > 0.4) { const yw = Math.atan2(f.vel.x, f.vel.z); turn = angDiff(f.yaw, yw); f.yaw += turn * Math.min(1, dt * 4); }
        f.model.rotation.y = f.yaw;
        f.a.roll = Math.max(-0.7, Math.min(0.7, (f.a.roll || 0) * 0.9 + (-turn * 1.6) * 0.1));
        f.a.pitch = Math.max(-0.6, Math.min(0.6, -Math.atan2(f.vel.y, Math.max(hs, 1)) * 0.8));
        // beats: climbing, slow, or now and then; otherwise it glides
        f.flapT -= dt;
        if (f.flapT < -1.4) f.flapT = rnd(4, 9);
        f.a.mode = f.vel.y > 0.8 || hs < speed * 0.5 || f.flapT < 0 ? 'flap' : 'glide';
        return d;
    }

    _walk(f, goal, dt) {
        const p = f.model.position;
        const to = _v.set(goal.x - p.x, 0, goal.z - p.z);
        const d = to.length();
        if (d > 0.05) {
            const yw = Math.atan2(to.x, to.z);
            f.yaw += angDiff(f.yaw, yw) * Math.min(1, dt * 5);
            p.addScaledVector(to.normalize(), Math.min(d, PHOENIX.WALK * dt));
        }
        p.y = this._ground(p.x, p.z);
        f.model.rotation.y = f.yaw;
        f.vel.set(0, 0, 0);
        f.a.mode = d > 0.05 ? 'walk' : 'stand';
        return d;
    }

    _face(f, at, dt) {
        const p = f.model.position;
        const yw = Math.atan2(at.x - p.x, at.z - p.z);
        f.yaw += angDiff(f.yaw, yw) * Math.min(1, dt * 4);
        f.model.rotation.y = f.yaw;
    }

    /** Landing on `goal`: in from above, braking beats at the end. True when it stands there. */
    _land(f, goal, dt) {
        const p = f.model.position;
        const hd = hdist(p, goal);
        const water = this._isWater(goal.x, goal.z);
        const gy = water ? goal.y + 1.2 : goal.y; // (over water it hovers, beating its wings)
        if (hd > 6) { this._fly(f, _v2.set(goal.x, gy + Math.min(14, 3 + hd * 0.3), goal.z), Math.min(PHOENIX.SPEED * 1.2, 4 + hd * 0.6), dt, { low: true }); return false; }
        this._fly(f, _v2.set(goal.x, gy, goal.z), Math.max(2.5, hd * 1.2), dt, { low: true, k: 3.5 });
        f.a.mode = 'flap';
        if (p.distanceTo(_v2.set(goal.x, gy, goal.z)) < 0.5) {
            if (!water) p.y = goal.y;
            f.vel.set(0, 0, 0);
            f.a.pitch = 0; f.a.roll = 0;
            return true;
        }
        return false;
    }

    _think(f, dt) {
        const g = this.game;
        f.t += dt;
        const p = f.model.position;
        if (f.lev) { f.a.mode = 'held'; return; } // (held in a vortex's bubble: the water holds it)
        if (f.state === 'held') { f.a.mode = 'held'; if (f.heldBy && f.heldBy !== g.localId && this.clock - (f.heldSeen || 0) > 3000) this.hold(f, false, f.heldBy); return; }
        if (f.stunT > 0) { f.stunT -= dt; p.addScaledVector(f.vel, dt); f.vel.multiplyScalar(Math.exp(-dt * 1.5)); f.a.mode = 'flap'; const gy = this._ground(p.x, p.z); if (p.y < gy) p.y = gy; return; }
        if (f.state !== 'rage') f.flame = Math.max(0, f.flame - dt * 0.5);
        if (f.state === 'soar' || f.state === 'perch') f.hp = Math.min(PHOENIX.HP, f.hp + PHOENIX.REGEN * dt);
        switch (f.state) {
            case 'soar': {
                // wide circles high up round a centre that drifts near the players
                f.ang += f.dir * (PHOENIX.SPEED * 0.85 / f.radius) * dt;
                f.reCentreT = (f.reCentreT ?? 0) - dt;
                if (f.reCentreT <= 0) {
                    f.reCentreT = rnd(18, 35);
                    const near = this._nearestPlayer(p);
                    if (near) { const a = Math.random() * Math.PI * 2, r = rnd(40, 95); f.centreGoal = new THREE.Vector3(near.pos.x + Math.cos(a) * r, 0, near.pos.z + Math.sin(a) * r); }
                }
                if (f.centreGoal) f.centre.lerp(f.centreGoal, Math.min(1, dt * 0.05));
                const gx = f.centre.x + Math.cos(f.ang) * f.radius, gz = f.centre.z + Math.sin(f.ang) * f.radius;
                this._fly(f, _v3.set(gx, this._ground(gx, gz) + f.alt, gz), PHOENIX.SPEED, dt);
                f.perchT -= dt;
                if (f.perchT <= 0) { f.perchT = rnd(60, 140); const at = this._perchSpot(f.centre); if (at) { f.perch = at; this._setState(f, 'perchGo'); } }
                break;
            }
            case 'perchGo':
                if (this._land(f, f.perch, dt)) { this._setState(f, 'perch'); f.stay = rnd(25, 70); }
                break;
            case 'perch': {
                f.a.mode = 'stand';
                // looks round, now and then
                f.lookT = (f.lookT ?? 0) - dt;
                if (f.lookT <= 0) { f.lookT = rnd(1.2, 3.5); f.headGoal = rnd(-1.1, 1.1); }
                f.a.head += ((f.headGoal || 0) - f.a.head) * Math.min(1, dt * 3);
                if (f.t > f.stay) { this._setState(f, 'takeoff'); f.after = 'soar'; }
                break;
            }
            case 'takeoff':
                f.vel.y = Math.max(f.vel.y, 6);
                f.vel.x += Math.sin(f.yaw) * dt * 6; f.vel.z += Math.cos(f.yaw) * dt * 6;
                p.addScaledVector(f.vel, dt);
                f.a.mode = 'flap'; f.a.pitch = -0.4;
                if (f.t > 1.4) this._setState(f, f.after === 'leave' ? 'leave' : 'soar');
                break;
            case 'leave': {
                const goal = f.flee || _v3.set(p.x + 50, p.y + 30, p.z);
                const d = this._fly(f, goal, PHOENIX.FAST, dt);
                if (f.t < 2) f.a.mode = 'flap';
                if (d < 6 || f.t > 20) { f.centre.copy(p); f.centreGoal = null; f.alt = rnd(...PHOENIX.ALT); this._setState(f, 'soar'); }
                break;
            }
            case 'come': this._come(f, dt); break;
            case 'watch': case 'approach': case 'touch': this._visit(f, dt); break;
            case 'rage': this._rageStep(f, dt); break;
            case 'down': {
                const gy = this._ground(p.x, p.z);
                if (p.y > gy + 0.05) { f.vel.y -= 15 * dt; f.vel.x *= Math.exp(-dt); f.vel.z *= Math.exp(-dt); p.addScaledVector(f.vel, dt); if (p.y < gy) { p.y = gy; f.vel.set(0, 0, 0); } f.a.mode = 'flap'; }
                else { p.y = gy; f.a.mode = 'down'; f.vel.set(0, 0, 0); }
                if (f.t > PHOENIX.STUN_T) { this._setState(f, 'takeoff'); f.after = 'leave'; }
                break;
            }
        }
    }

    _nearestPlayer(p) {
        let best = null;
        for (const P of this._players()) { const d = hdist(P.pos, p); if (!best || d < best.d) best = { ...P, d }; }
        return best;
    }

    /** The highest place round `c` (a mountain top, a tall crown) — or null. */
    _perchSpot(c) {
        const data = this.game.terrain?.data;
        let best = null;
        for (let i = 0; i < 36; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 70;
            const x = Math.round(c.x + Math.cos(a) * r), z = Math.round(c.z + Math.sin(a) * r);
            const y = data?.topLayer ? data.topLayer(x, z) - 0.5 : this._ground(x, z);
            if (!Number.isFinite(y) || this._isWater(x, z)) continue;
            if (!best || y > best.y) best = new THREE.Vector3(x, y, z);
        }
        return best;
    }

    /** Called: flying to the wounded and landing in front of him. */
    _come(f, dt) {
        const C = f.call;
        const P = this._player(C.to);
        if (!P) { this._flee(f); return; }
        // he went far from where it was to land: a new place in front of him
        if (hdist(C.land, P.pos) > PHOENIX.LAND_AHEAD + 10) C.land = this._landPoint(P);
        if (f.t > 60) { this._flee(f); return; }
        if (this._land(f, C.land, dt)) { this._setState(f, 'watch'); C.calmT = 0; C.waitT = 0; this._tell(C.to, '🔥 Феникс сел перед вами. Стойте спокойно — не двигайтесь и не поднимайте руки'); }
    }

    /** On the ground by the wounded: watch, come up, touch. */
    _visit(f, dt) {
        const C = f.call;
        const T = C && this._threat(C.to, dt);
        const p = f.model.position;
        if (!T) { this._flee(f); return; }
        const { P, threat } = T;
        const target = _v3.set(P.pos.x, 0, P.pos.z);
        if (hdist(p, P.pos) > 30 || f.t > PHOENIX.PATIENCE + 10) { this._tell(C.to, '🔥 Феникс не дождался и улетел'); this._flee(f, P.pos); return; }
        if (!(this._isWater(p.x, p.z))) p.y = this._ground(p.x, p.z);
        f.a.head += (0 - f.a.head) * Math.min(1, dt * 3);
        const now = this.clock;
        if (f.state !== 'touch' && threat) {
            C.calmT = 0;
            if (now - C.scareAt > 1000) {
                C.scareAt = now;
                C.scares++;
                f.startle = 0.8;
                this._cry(f, 1.3);
                this._note({ ev: 'startle', id: f.id, n: C.scares });
                if (C.scares >= PHOENIX.SCARES) { this._tell(C.to, '🔥 Феникс испугался и улетел'); this._flee(f, P.pos); return; }
                this._tell(C.to, '🔥 Феникс насторожился — не двигайтесь');
                if (f.state === 'approach') this._setState(f, 'watch');
            }
        }
        if (f.startle > 0) {
            // it starts back a step, wings half open
            f.startle -= dt;
            const away = _v.set(p.x - P.pos.x, 0, p.z - P.pos.z);
            if (away.lengthSq() > 1e-4 && hdist(p, P.pos) < PHOENIX.LAND_AHEAD + 3) p.addScaledVector(away.normalize(), 2 * dt);
            this._face(f, P.pos, dt);
            f.a.mode = 'startle';
            return;
        }
        if (f.state === 'watch') {
            this._face(f, P.pos, dt);
            f.a.mode = 'stand';
            C.waitT += dt;
            if (!threat) C.calmT += dt;
            if (C.waitT > PHOENIX.PATIENCE) { this._tell(C.to, '🔥 Феникс не дождался и улетел'); this._flee(f, P.pos); return; }
            if (C.calmT >= PHOENIX.CALM_T) this._setState(f, 'approach');
        } else if (f.state === 'approach') {
            const d = hdist(p, P.pos);
            const goal = _v2.copy(P.pos).addScaledVector(_v.set(p.x - P.pos.x, 0, p.z - P.pos.z).normalize(), PHOENIX.TOUCH_D);
            this._walk(f, goal, dt);
            if (d <= PHOENIX.TOUCH_D + 0.15) { this._setState(f, 'touch'); this._face(f, P.pos, 1); }
        } else if (f.state === 'touch') {
            this._face(f, target, dt);
            f.a.mode = 'touch';
            f.a.touchK = Math.min(1, f.t / 0.7) * (f.t > 1.8 ? Math.max(0, 1 - (f.t - 1.8) / 0.5) : 1);
            if (!C.healed && f.t > 0.8) { C.healed = true; this._heal(f, C.to); }
            if (f.t > 2.5) { f.after = 'soar'; f.call = null; this._setState(f, 'takeoff'); }
        }
    }

    /** Fighting: aflame, it climbs and dives at the attacker, striking with fire. */
    _rageStep(f, dt) {
        const R = f.rage;
        const P = R && this._player(R.by);
        const p = f.model.position;
        f.flame = Math.min(1, f.flame + dt * 1.5);
        if (Math.random() < 0.8) this._flames(f);
        if (!P || hdist(p, P.pos) > 140) { f.rage = null; this._flee(f); return; }
        R.t += dt;
        const tgt = _v3.set(P.pos.x, P.pos.y, P.pos.z);
        if (R.phase === 'climb') {
            if (!R.from) { const a = Math.random() * Math.PI * 2; R.from = new THREE.Vector3(P.pos.x + Math.cos(a) * 16, P.pos.y + 18, P.pos.z + Math.sin(a) * 16); }
            const d = this._fly(f, R.from, PHOENIX.FAST, dt, { k: 3 });
            f.a.mode = 'flap';
            if (d < 4 || R.t > 5) { R.phase = 'dive'; R.t = 0; this._cry(f, 0.9); }
        } else if (R.phase === 'dive') {
            // it won't dive into water: over a swimmer it pulls up with a hiss of steam
            if (P.swim && p.y < P.pos.y + 6) { for (let i = 0; i < 16; i++) this.game.fx?.spark?.(p, 0xeef6ff, 0.18, _v.set((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3), 1); this._pull(R); return; }
            this._fly(f, tgt, PHOENIX.DIVE, dt, { low: true, k: 5 });
            f.a.mode = 'dive';
            if (phoenixDist(f, tgt) < PHOENIX.STRIKE_R) { this._strike(f, R.by, P); this._pull(R); }
            else if (R.t > 4 || p.y < this._ground(p.x, p.z) + 0.8) this._pull(R);
        } else {
            const d = this._fly(f, R.from, PHOENIX.FAST, dt, { k: 3 });
            f.a.mode = 'flap';
            if (d < 5 || R.t > 3) {
                if (R.dives >= PHOENIX.DIVES) { f.rage = null; this._note({ ev: 'calm', id: f.id }); this._flee(f, P.pos); return; }
                R.phase = 'climb'; R.t = 0; R.from = null;
            }
        }
    }

    _pull(R) {
        R.dives++;
        R.phase = 'pull'; R.t = 0;
        const P = this._player(R.by);
        const a = Math.random() * Math.PI * 2;
        R.from = new THREE.Vector3((P?.pos.x ?? 0) + Math.cos(a) * 20, (P?.pos.y ?? 0) + 16, (P?.pos.z ?? 0) + Math.sin(a) * 20);
    }

    /** Its flames while it fights (every computer). */
    _flames(f) {
        const c = phoenixCenter(f, _v3);
        for (let i = 0; i < 3; i++) this.game.fx?.spark?.(_v.set(c.x + (Math.random() - 0.5) * 1.2, c.y + (Math.random() - 0.5) * 0.8, c.z + (Math.random() - 0.5) * 1.2), Math.random() < 0.5 ? 0xff7a14 : 0xffd25a, 0.2 + Math.random() * 0.15, _v2.set((Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5), 0.5);
    }

    /** (host) The dive struck: fire on the player (his own computer takes it) and on the ground there. */
    _strike(f, to, P) {
        const p = f.model.position;
        const m = { op: 'strike', id: f.id, to, p: [p.x, p.y, p.z].map(r2), at: [P.pos.x, P.pos.y, P.pos.z].map(r2), dmg: PHOENIX.STRIKE_DMG };
        this._note({ ev: 'strike', id: f.id, to });
        this._send(m);
        this._struck(m);
    }

    /** A fire strike (every computer): the ground there burns; the one struck is hurt and thrown. */
    _struck(m) {
        const g = this.game;
        const from = new THREE.Vector3(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0);
        const at = new THREE.Vector3(+m.at[0] || 0, +m.at[1] || 0, +m.at[2] || 0);
        g.fx?.lightFlash?.(at, 0xff7a14, 4, 0.5, 25);
        for (let i = 0; i < 30; i++) g.fx?.spark?.(at, i % 2 ? 0xff6a14 : 0xffd25a, 0.2, _v.set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6), 0.8);
        const feet = _v2.set(at.x, this._ground(at.x, at.z), at.z);
        if (!g.wards?.shields?.(from, feet)) g.fire?.ignite?.(feet, 2); // (grass and trees there catch fire, as from any fire)
        if (m.to !== g.localId || g.isDeadLocal || g.combat?.dead) return;
        const c = g.combat;
        if (g.wards?.shields?.(from, c.center(_v3))) return; // (in a protected house: the sphere holds it)
        if (c.shieldFactor?.(from) >= 1) { c._blocked?.(from, 'phoenixFire'); g.hud?.setVoice?.('🛡️ Щит удержал огонь феникса', true); return; }
        if (g.character?.swimY != null) return; // (in the water: the fire goes out)
        const dmg = Math.min(10, +m.dmg || PHOENIX.STRIKE_DMG);
        if (c.frozen) c.frozenLeft = 0; // (its fire melts the ice)
        if (c.enabled) c.damage(dmg, null, 'Inferno'); else g.damageLocalPlayer?.(dmg);
        g.burning?.ignite('p', g.localId, null); // (its fire sets me alight)
        const dir = _v.subVectors(at, from).setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
        g.impact?.apply?.({ v: dir.normalize().multiplyScalar(9).setY(4), from, by: null, kind: 'phoenix' });
        g.hud?.setVoice?.(`🔥 Феникс ударил вас огнём: −${dmg}`, true);
    }

    // ------------------------------------------------------------ «Вингардиум Левиоса»
    /** Caught (on) — it hangs and beats its wings where the hand holds it — or let go: it flies off. */
    hold(f, on, by = null) {
        if (!f || f.dead) return;
        const g = this.game;
        if (!this.auth && !by) { this._send({ op: 'hold', id: f.id, on: on ? 1 : 0 }); f.localHeld = on; }
        if (on) {
            this._attacked(f, by ?? g.localId, 'Levitation'); // (caught by magic: that is an attack too)
            f.rage = null;
            this._setState(f, 'held');
            f.heldBy = by ?? g.localId; f.heldSeen = this.clock; f.vel.set(0, 0, 0);
            return;
        }
        if (f.state !== 'held') return;
        f.heldBy = null;
        if (this.auth) this._flee(f);
    }

    /** (the levitating hand) where it is held now. */
    heldAt(f, pos) {
        if (this.auth) { f.heldSeen = this.clock; return; }
        this._heldNetT = (this._heldNetT || 0) - 1;
        if (this._heldNetT <= 0) { this._heldNetT = 6; this._send({ op: 'at', id: f.id, p: [pos.x, pos.y, pos.z].map(r2) }); }
    }

    // ------------------------------------------------------------ spawning
    _spawnTick(dt) {
        if (!this.enabled) return;
        this._spawnT -= dt;
        if (this._spawnT > 0) return;
        this._spawnT = rnd(PHOENIX.SPAWN_MIN, PHOENIX.SPAWN_MAX);
        const players = this._players();
        // (a phoenix still in the world round a player — even one that flew off out of his AREA — keeps
        //  him from getting another: they never pile up as he walks on)
        const lonely = players.filter((P) => !this.list.some((f) => !f.dead && hdist(f.model.position, P.pos) < PHOENIX.FORGET));
        if (!lonely.length || this.list.length >= PHOENIX.MAX || Math.random() > PHOENIX.SPAWN_CHANCE) return;
        const P = lonely[Math.floor(Math.random() * lonely.length)];
        const a = Math.random() * Math.PI * 2, r = rnd(60, 110);
        const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        const f = this.spawn(new THREE.Vector3(x, this._ground(x, z) + rnd(...PHOENIX.ALT), z));
        f.centre.set(x, 0, z);
        this._note({ ev: 'spawn', id: f.id });
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        if (dt <= 0) return;
        this.clock += dt * 1000;
        this._watchMe();
        if (this.auth) {
            this._spawnTick(dt);
            for (const f of [...this.list]) {
                if (f.dead) continue;
                // streamed out: far from everybody (a calm bird only)
                if (['soar', 'perch', 'leave'].includes(f.state) && !this._players().some((P) => hdist(P.pos, f.model.position) < PHOENIX.FORGET)) { this._remove(f); continue; }
                this._think(f, dt);
            }
        } else {
            for (const f of this.list) if (f.net && !f.dead && !f.localHeld) this._follow(f, dt);
        }
        const night = g.isNight ? 1 : 0;
        let nearest = null;
        const me = g.character?.group.position;
        for (const f of this.list) {
            if (f.dead) continue;
            f.a.night = night;
            f.a.flame = f.flame;
            posePhoenix(f.model, f.a, dt);
            this._embers(f, dt);
            if (f.flame > 0.3 && !this.auth) this._flames(f);
            if (me) { const d = f.model.position.distanceTo(me); if (!nearest || d < nearest.d) nearest = { f, d }; }
        }
        // the one warm light on the nearest phoenix
        if (this.light) {
            if (nearest && nearest.d < 90) {
                phoenixCenter(nearest.f, this.light.position);
                this.light.intensity = (night ? 2.2 : 0.6) + 4 * nearest.f.flame;
            } else this.light.intensity = 0;
        }
        this._featherGlow(dt);
        this._netSend(dt);
    }

    /** Glowing embers trail behind it in flight (from the tail's eyes and the wing tips). */
    _embers(f, dt) {
        const m = f.a.mode;
        if (m === 'stand' || m === 'walk' || m === 'touch' || m === 'down') { if (Math.random() < dt * 2) this.game.fx?.spark?.(phoenixCenter(f, _v3), 0xffc860, 0.06, _v.set(0, 0.6, 0), 0.8); return; }
        const s = f.model.userData.streamers;
        if (Math.random() < 0.7) {
            const tip = s[Math.floor(Math.random() * s.length)].tip;
            tip.getWorldPosition(_v3);
            this.game.fx?.spark?.(_v3, Math.random() < 0.5 ? 0xffb43a : 0xff5a14, 0.08 + Math.random() * 0.06, _v.set((Math.random() - 0.5) * 0.6, -0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6), 0.9);
        }
    }

    /** A phoenix feather lying about sparkles now and then (it glows). */
    _featherGlow(dt) {
        this._fgT = (this._fgT || 0) - dt;
        if (this._fgT > 0) return;
        this._fgT = 0.25;
        for (const L of this.game.items?.loose?.values() || []) {
            if (L.item?.kind !== 'phoenixFeather' || Math.random() > 0.6) continue;
            this.game.fx?.spark?.(L.model.position, Math.random() < 0.5 ? 0xffd25a : 0xff7a2a, 0.05, _v.set(0, 0.4, 0), 0.7);
        }
    }

    // ------------------------------------------------------------ network
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'phx', ...m }, !!m.to || m.op === 'heal' || m.op === 'strike' || m.op === 'die'); }

    /** A line for a player (mine: on my screen; another's: sent to him). */
    _tell(id, text) {
        const g = this.game;
        if (id == null) return;
        if (id === g.localId) g.hud?.setVoice?.(text, true);
        else this._send({ op: 'note', to: id, text });
    }

    _netSend(dt) {
        if (!this.auth || !this.game.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.12;
        this._send({ op: 's', l: this.list.filter((f) => !f.dead).map((f) => [f.id, r2(f.model.position.x), r2(f.model.position.y), r2(f.model.position.z), r2(f.yaw), r2(f.a.pitch || 0), r2(f.a.roll || 0), MODES.indexOf(f.a.mode), r2(f.flame), Math.round(f.hp), r2(f.a.head || 0), r2(f.a.touchK || 0)]) });
    }

    _follow(f, dt) {
        const n = f.net;
        f.model.position.lerp(n.p, Math.min(1, dt * 8));
        f.yaw += angDiff(f.yaw, n.yaw) * Math.min(1, dt * 8);
        f.model.rotation.y = f.yaw;
        f.a.pitch = n.pitch; f.a.roll = n.roll; f.a.mode = n.mode; f.a.head = n.head; f.a.touchK = n.touch;
        f.flame = n.flame;
    }

    onNet(m, isHost) {
        const g = this.game;
        if (!m || typeof m.op !== 'string') return;
        const vec = (a) => (Array.isArray(a) ? new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0) : null);
        switch (m.op) {
            case 's': {
                if (isHost) return;
                const seen = new Set();
                for (const e of (m.l || []).slice(0, 16)) {
                    const [id, x, y, z, yaw, pitch, roll, mode, flame, hp, head, touch] = e;
                    seen.add(id);
                    let f = this.list.find((q) => q.id === id);
                    if (!f) { f = this.spawn(new THREE.Vector3(x, y, z), id); f.yaw = yaw; }
                    f.net = { p: new THREE.Vector3(x, y, z), yaw, pitch, roll, mode: MODES[mode] || 'glide', flame, head, touch };
                    f.hp = hp;
                }
                for (const f of [...this.list]) if (!seen.has(f.id) && !f.dead) this._remove(f);
                break;
            }
            case 'hit': if (isHost) { const f = this.byId(m.id); if (f) { if (DUEL_KINDS.has(m.kind) && !m.dmg) this.boltHit(f, m.kind, m.from); else this.hit(f, Math.min(40, Math.max(0, +m.dmg || 0)), typeof m.kind === 'string' ? m.kind.slice(0, 20) : null, m.from); } } break;
            case 'wound': if (isHost && m.from) this._wound(m.from); break;
            case 'hold': if (isHost) { const f = this.byId(m.id); if (f) this.hold(f, !!m.on, m.from); } break;
            case 'at': if (isHost) { const f = this.byId(m.id); const p = vec(m.p); if (f && p && f.state === 'held') { f.model.position.copy(p); f.heldSeen = this.clock; } } break;
            case 'heal': { const p = vec(m.p); if (p) this._healFx(p); if (m.to === g.localId) this.healMe(); break; }
            case 'strike': if (!isHost) this._struck(m); break;
            case 'die': { const f = this.list.find((q) => q.id === m.id); const p = vec(m.p); if (p) this._burst(p); if (f) { f.dead = true; f.model.visible = false; setTimeout(() => this._remove(f), 50); } break; }
            case 'note': if (m.to === g.localId && typeof m.text === 'string') g.hud?.setVoice?.(m.text.slice(0, 200), true); break;
        }
    }

    dispose() {
        for (const f of [...this.list]) this._remove(f);
        if (this.light) this.game.scene?.remove(this.light);
    }
}

const DUEL_KINDS = new Set(['AvadaKedavra', 'Stupefy', 'IceDuel', 'LevitateDuel', 'SapiraDuel', 'SandsDuel', 'Expelliarmus', 'Disarmor', 'Jolt', 'JoltMaxima']);
const r2 = (v) => Math.round(v * 100) / 100;

// pushes, gusts, knockdowns (CreatureImpact): a light bird thrown through the air — it never falls over
registerKind('F', {
    name: 'phoenix', faces: 1,
    list: (g) => g.phoenixes?.list || [],
    get: (g, id) => g.phoenixes?.byId(id),
    alive: (c) => !c.dead,
    body: () => 'phoenix',
    centre: (c, out) => phoenixCenter(c, out),
    pivot: () => ({ obj: null, base: 0, lie: 0 }), // (its own pitch and roll show the reel: posePhoenix)
    head: (c) => c.model.userData.head, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { c.model.position.x += dx; c.model.position.z += dz; },
    toss(g, c, vy) { c.vel.y = Math.max(c.vel.y, vy); },
    hold(g, c, t) { c.stunT = Math.max(c.stunT || 0, Math.min(t, 1.2)); }, // (a bird rights itself in the air quickly)
    frozen: () => false,
    noKnock: () => true,
    // an earthquake shakes only the ground: a phoenix in the air doesn't feel it
    immune: (g, c, o) => /^Earthquake/.test(o.spell || '') && c.model.position.y > (g.collision?.groundY?.(c.model.position.x, c.model.position.z) ?? 0) + 1,
    struck(g, c, o) { if (o.kind !== 'fall' && o.spell !== 'Ward') g.phoenixes?._attacked(c, o.by ?? null, o.spell || o.kind); },
});
