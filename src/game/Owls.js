/**
 * Owls.js — clever magic owls: curious, fearless of people; fed with meat, one loves you and shows
 * you the way to a boss you name — once.
 *
 * The bird: a quarter of a hero tall (~1.2 m; the hero is ~4.8 m), big round amber eyes in a pale
 * facial disc, ear tufts, plumage that shimmers through the colours of a soap bubble as the light and
 * the angle change (one shared material — Owls.irMaterial — no light of its own). It turns its head
 * almost all the way round (±135° — 270°), cocks it to one side when curious, blinks, beats its wings,
 * lands with its wings spread wide and its talons forward, hops about on the ground.
 *
 * Where: twice as often as phoenixes (OWL.SPAWN_CHANCE = 2 × PHOENIX.SPAWN_CHANCE, the same checks),
 *   at most NEAR_MAX round a player, MAX in the world; never in space or on other planets (realmAt).
 *   They fly low over the land and often land — on the ground, a rock, a tree's crown, a roof — near
 *   people (they are not afraid of them). Farther than FORGET from every player a calm owl is gone
 *   (streamed out — a wild bird: owls are not saved with the world, like phoenixes; what one feels —
 *   whom it loves, where it leads — lives on that owl while it is in the world).
 *
 * Curious: come up to a sitting owl — it doesn't fly off: it turns its head (then its body) and looks
 *   at you 5–10 s (OWL.STARE, random), its head cocked, then goes about its own business.
 * Meat: throw (or drop) any meat — raw or fried, of any animal (ItemTypes 'meat' / 'steak') — near it:
 *   it comes (hops, or flies over), eats it (a contented trill), and looks at the one who threw it
 *   ADORE_T s with hearts rising over it (a soft chime): it loves that player now (`o.love`). It
 *   keeps by him a while (FOLLOW_T), landing near him as he goes.
 * The request: while it loves you and is near (ASK_R), say whom you want to find — «я хочу найти
 *   паучиху», «покажи, где дракон», «Ледяная королева»… (OwlBosses.bossOfWords; the bosses are the
 *   achievements' list). The phrase is the owl's: no spell, no word to a villager (main.js asks the
 *   owls first; only with a loving owl near). It thinks a moment (the castles far off are planned in the
 *   workers), then flies off ahead to the nearest LIVING boss of that kind: it waits when you fall
 *   behind, circles over the place when you are close, then flies away. ONCE: the request is spent
 *   (`love.asked`) — another name is not heard, it goes on to the first. None alive (all killed, none
 *   in this world, the spider by day): it shakes its head with a sad hoot and stays — the request is
 *   not spent. It never goes up into space and leads only on the Earth (the bosses are there).
 *
 * Magic: no simple spell (any spell known without a scroll — IceQueen.SCROLL_KINDS) touches it at
 *   all: it darts away fast. A scroll's spell (lightning, «Авада Кедавра», «Total Destruction»,
 *   «Inspirius», «Бомбардо Максима»…) hurts it (HP small); killed, it falls and leaves an owl feather
 *   (ItemTypes 'owlFeather' — shimmering; just a thing for now: the author will decide its use). Blows, arrows, a falling thing:
 *   it is quicker — it dodges and flies off. Whoever attacked it (anything aimed at it) it no longer
 *   loves, and it never comes to him again (`o.hated`). The villagers and the animals leave it alone.
 *   TARGETS below says it all («не действует» is a decision too).
 *
 * Multiplayer: the host flies the owls ('owl' s, ~8×/s), decides the meat, the love, the search and
 *   the way; guests animate them; a guest's blow or request goes to the host ('owl' hit / ask); the
 *   lines are sent to the player they are for.
 */

import * as THREE from 'three';
import { newUid } from './ItemTypes.js';
import { registerKind } from './CreatureImpact.js';
import { creditKill } from './Mana.js';
import { SCROLL_KINDS } from './IceQueen.js';
import { PHOENIX } from './Phoenixes.js';
import { realmAt } from '../world/Planets.js';
import { crowdStep } from './CrowdSources.js';
import { bossOfWords, bossTo, BOSS_FINDERS } from './OwlBosses.js';
import { irMaterial, IR } from '../fx/Iridescent.js';
import { mergeInto } from '../core/MergeGeometry.js';

export const OWL = {
    SHED_CHANCE: 0.06, // a startled owl loses a feather (a dead one always leaves one)
    HP: 12, // (a scroll's lightning −20, «Авада» −25: one is enough; «Тандервейв» −8 two)
    HEIGHT: 1.2, // m standing: a quarter of a hero
    // twice as often as phoenixes: the same checks, twice the chance; the first sooner
    SPAWN_MIN: PHOENIX.SPAWN_MIN, SPAWN_MAX: PHOENIX.SPAWN_MAX, SPAWN_CHANCE: Math.min(1, PHOENIX.SPAWN_CHANCE * 2), FIRST: [60, 150],
    MAX: 4, NEAR_MAX: 2, FORGET: 320,
    ALT: [9, 20], SPEED: 8, FAST: 19, HOP: 1.3, // m above the ground, m/s
    CURIOUS_R: 9, STARE: [5, 10], STARE_COOL: 25, // m, s
    MEAT_R: 14, EAT_T: 2.6, ADORE_T: 10, FOLLOW_T: 300, KEEP_D: 9, // m, s
    ASK_R: 16, // m: a loving owl hears this far
    AHEAD: 24, WAIT_D: 40, NEAR: 70, CIRCLE_T: 16, GUIDE_T: 1500, GUIDE_ALT: 12, // the way
    FLY_T: [10, 26], PERCH_T: [20, 45],
};

/** The spells «уровня свитка» (only a scroll teaches them): they hurt an owl. Every other kind — it darts away. */
export const isStrong = (kind) => SCROLL_KINDS.has(kind);

/**
 * ON WHOM AND ON WHAT (CLAUDE.md «На кого и на что»): every blow, spell and thing that can reach an
 * owl — what it does (`does`) and why; and what the owl itself does.
 */
export const TARGETS = {
    // ---- blows and things: quicker than any hand — it dodges and flies off (and stops loving the one who struck)
    blade: { does: 'dodge', why: 'меч, топор: сова увёртывается — быстрее руки; улетает и больше не любит ударившего' },
    fist: { does: 'dodge', why: 'кулак, толчок рукой: увёртывается и улетает (это нападение)' },
    arrow: { does: 'dodge', why: 'стрела: волшебная сова чует её и уходит в сторону; улетает' },
    cauldron: { does: 'dodge', why: 'упавший котёл, падающая вещь («crush»): успевает вспорхнуть' },
    // ---- the simple spells (known without a scroll): no effect at all, it only darts away fast
    plainSpells: { does: 'dodge', why: 'любое заклинание без свитка (Бомбардо, Инферно, Айс, Сапира, Даст, Вайнд, вода, Circle Attack…) на неё не действует вообще: она быстро улетает' },
    Stupefy: { does: 'dodge', why: '«Остолбеней» — простое: не действует, улетает' },
    IceDuel: { does: 'dodge', why: '«Айс» — простое: не действует, улетает' },
    LevitateDuel: { does: 'dodge', why: 'простое: не действует, улетает' },
    Expelliarmus: { does: 'dodge', why: 'в когтях ничего нет; простое — улетает' },
    Disarmor: { does: 'dodge', why: 'перья не снимешь; простое — улетает' },
    Jolt: { does: 'dodge', why: '«Джолт» — простое: не действует, улетает' },
    SapiraDuel: { does: 'dodge', why: 'простое: не действует, улетает' },
    SandsDuel: { does: 'dodge', why: 'простое: не действует, улетает' },
    Bombardo: { does: 'dodge', why: '«Бомбардо», пушки: простое — улетает целой (а «Бомбардо Максима» со свитка — ранит)' },
    Inferno: { does: 'dodge', why: 'огонь «Инферно», «Fire», «Fire Maxima», адский огонь — без свитка: не берёт, улетает' },
    Hellfire: { does: 'dodge', why: '«Let the Hellfire Come»: не со свитка — не берёт, улетает' },
    FireMaxima: { does: 'dodge', why: 'не со свитка — не берёт, улетает' },
    Ice: { does: 'dodge', why: 'ледяной луч / «Frozen»: не действует, улетает' },
    Wind: { does: 'dodge', why: '«Вайнд», «Вайнд Максима»: не действует (CreatureImpact.immune) — улетает' },
    Earthquake: { does: 'dodge', why: 'землетрясение: вспархивает с земли, в воздухе не чувствует' },
    Levitation: { does: 'dodge', why: '«Вингардиум Левиоса» её не ловит: выскальзывает и улетает' },
    WaterVortex: { does: 'dodge', why: '«Water Vortex», «Bubble»: не действует, улетает' },
    WaterStorm: { does: 'dodge', why: 'водяная буря, волна, водяной шар: не действует, улетает' },
    CircleAttack: { does: 'dodge', why: '«Circle Attack» (и Максима) без свитка: не действует, улетает' },
    Firefighting: { does: 'dodge', why: '«Firefighting»: чует, как уходит воздух, — не действует, улетает' },
    Liquidation: { does: 'dodge', why: '«Liquidation» (без свитка): не действует, улетает' },
    Brainrot: { does: 'none', why: '«Брейнрот»: сова никому не подчиняется — она слишком умна' },
    Drawdown: { does: 'none', why: '«Drawdown»: в воздухе не касается; на земле — вспархивает' },
    Stitching: { does: 'none', why: '«Stitching»: не касается' },
    CreateBridge: { does: 'none', why: '«Create a Bridge»: не касается' },
    Groundprud: { does: 'none', why: '«Groundprud»: не касается' },
    GroundVortex: { does: 'dodge', why: '«Ground Vortex»: летящие блоки — сова улетает, не касается' },
    Pentagranium: { does: 'none', why: '«Пентаграниум»: рисунок на земле — сова его не замечает и не пугается' },
    VisibleGodi: { does: 'none', why: '«Visible Godi»: тучка только на моём экране — сова ничего не замечает' },
    Fireworks: { does: 'none', why: '«Fireworks»: искры высоко над головой — сова не обращает внимания' },
    Invisibility: { does: 'none', why: 'невидимого игрока не видит: не смотрит на него и не слышит просьбу' },
    Alohomora: { does: 'none', why: 'живая птица без замков' },
    Lock: { does: 'none', why: '«Lock» запирает только двери' },
    Accio: { does: 'none', why: 'живое существо не притянуть; её ПЕРО — обычная вещь, «Акцио» его притягивает' },
    Rescue: { does: 'none', why: '«Rescue»: у неё нет ран, которые надо останавливать' },
    ProtectionHouse: { does: 'push', why: 'сфера защиты дома не пускает её внутрь, не ранит — она улетает' },
    Protection: { does: 'none', why: 'сова не нападает — щиту нечего держать' },
    // ---- the scroll's spells: they hurt (a small bird: one or two are enough)
    scrollSpells: { does: 'hit', why: 'заклинания со свитка (IceQueen.SCROLL_KINDS): ранят и убивают; убитая падает, остаётся перо совы' },
    AvadaKedavra: { does: 'hit', why: 'со свитка: −25 — насмерть' },
    Accentric: { does: 'hit', why: '«Акцентрик» (со свитка): −40 за 8 с — насмерть' },
    Pilbidrio: { does: 'hit', why: '«Пилбидрио» (со свитка): −80 — разрывает' },
    Electrum: { does: 'hit', why: '«Электром» (со свитка): насмерть' },
    Die: { does: 'hit', why: '«Дай»: испепеляет, пера не остаётся' },
    Lightning: { does: 'hit', why: 'молния (со свитка): −20 — насмерть' },
    Thunderwave: { does: 'hit', why: 'громовая волна (со свитка): −8' },
    TotalDestruction: { does: 'hit', why: '«Total Destruction»: взрыв со свитка — насмерть' },
    Inspirius: { does: 'hit', why: '«Inspirius»: −100 / −50 / −25 — насмерть' },
    Boom: { does: 'hit', why: '«Бум» (свиток храма богов): гора или замок разорваны изнутри — в зоне насмерть' },
    BombardoMaxima: { does: 'hit', why: '«Бомбардо Максима» (со свитка): урон взрыва' },
    WindImpulse: { does: 'push', why: '«Wind Impulse» (со свитка): отбрасывает волной воздуха, без урона — и она улетает обиженной' },
    LevitationMaxima: { does: 'none', why: '«Левиоса Максима» поднимает тех, кто стоит; сова вспархивает раньше (как феникс)' },
    // ---- creatures it meets
    players: { does: 'love', why: 'не боится; любопытно смотрит 5–10 с; кто накормит мясом — того полюбит и один раз отведёт к боссу; кто обидит — того больше не любит' },
    zombies: { does: 'none', why: 'зомби её не трогают и она их — взлетает выше' },
    castlePeople: { does: 'none', why: 'жители, рыцари, король, волшебники её не трогают и не боятся' },
    animals: { does: 'none', why: 'звери её не трогают' },
    sailors: { does: 'none', why: 'моряки, скелеты Чёрных Усов её не трогают (летает над морем к кораблю, на палубу не садится)' },
    spider: { does: 'none', why: 'паучиха охотится на игроков, не на птиц' },
    dragon: { does: 'none', why: 'драконы её не замечают; к логову ведёт, не залетая внутрь' },
    livingTrees: { does: 'none', why: 'живые деревья её не достают (летает)' },
    bookBirds: { does: 'none', why: 'книги-птицы — другие птицы, не мешают' },
    phoenix: { does: 'none', why: 'фениксы и совы друг друга не трогают' },
    iceCastle: { does: 'none', why: 'Ледяная Королева и её существа её не трогают; к дворцу ведёт' },
    // ---- the world
    world: { does: 'none', why: 'садится на землю, камни, кроны деревьев, крыши; не садится в воду; ничего не ломает' },
    ships: { does: 'none', why: 'на корабли не садится; к чёрному кораблю ведёт и кружит над ним' },
    space: { does: 'none', why: 'в космос не летает (граница атмосферы); на другие планеты не ведёт — боссы на Земле' },
};

const MODES = ['glide', 'flap', 'stand', 'hop', 'eat', 'land', 'shake', 'fall'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const MEAT = new Set(['meat', 'steak']);
const HEAD_MAX = 2.35; // rad: the head round to either side (≈ 135°: 270° in all)

// ======================================================================= the look (shared)
/** A feather lying in the XZ plane, along −Z from its root, 1 m long (vertex colours: darker root). */
function featherGeo(w) {
    const pos = [], col = [], idx = [];
    const N = 6;
    for (let i = 0; i <= N; i++) {
        const t = i / N, z = -t;
        const hw = w * Math.pow(Math.sin(Math.PI * (0.12 + 0.82 * t)), 0.7) * (1 - 0.3 * t);
        const c = 0.55 + 0.45 * t;
        pos.push(-hw, 0, z, 0, w * 0.08, z, hw, 0, z);
        col.push(c * 0.85, c * 0.85, c * 0.9, c, c, c, c * 0.85, c * 0.85, c * 0.9);
        if (i) { const p = (i - 1) * 3, q = i * 3; idx.push(p, q, p + 1, p + 1, q, q + 1, p + 1, q + 1, p + 2, p + 2, q + 1, q + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

let _S = null;
/** The shapes and the materials every owl shares (made once; never disposed — userData.shared). */
function shared() {
    if (_S) return _S;
    const G = {
        ball: new THREE.SphereGeometry(1, 16, 12),
        small: new THREE.SphereGeometry(1, 10, 8),
        lid: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        cone: new THREE.ConeGeometry(1, 1, 8),
        feather: featherGeo(0.22),
        heart: null,
    };
    for (const k in G) if (G[k]) G[k].userData.shared = true;
    const M = {
        body: irMaterial(0x8c86b8, 0.55), // (a soft grey-violet under the shimmer)
        plume: irMaterial(0xb6aee0, 0.9, { vertexColors: true, side: THREE.DoubleSide }),
        face: irMaterial(0xece6f4, 0.22),
        eye: new THREE.MeshBasicMaterial({ color: 0xffb52e }),
        pupil: new THREE.MeshBasicMaterial({ color: 0x08070a }),
        glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        horn: new THREE.MeshLambertMaterial({ color: 0x3b3428 }),
    };
    for (const k in M) M[k].userData.shared = true;
    _S = { G, M };
    return _S;
}

let _heartTex = null;
function heartTexture() {
    if (_heartTex || typeof document === 'undefined') return _heartTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    if (!x) return null;
    x.fillStyle = '#ff5d8f';
    x.shadowColor = 'rgba(255,170,210,0.9)'; x.shadowBlur = 8;
    x.beginPath();
    x.moveTo(32, 54);
    x.bezierCurveTo(4, 34, 8, 8, 32, 20);
    x.bezierCurveTo(56, 8, 60, 34, 32, 54);
    x.fill();
    _heartTex = new THREE.CanvasTexture(c);
    return _heartTex;
}

/**
 * The owl (forward +Z, its feet at the origin, ~1.2 m to its ear tufts). userData: the joints the
 * animation moves (tilt: the body; head; lids; tufts; wings {root, sh, el, sec[], pri[]}; tail; legs).
 */
const _merged = {}; // (owlModel's merged pieces: the same for every owl)
export function owlModel() {
    const { G, M } = shared();
    const g = new THREE.Group();
    g.name = 'owl';
    const mesh = (geo, m, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    const feather = (parent, len, w, x, y, z, rx = 0, ry = 0, rz = 0) => { const f = mesh(G.feather, M.plume, parent, x, y, z, w, 1, len); f.rotation.set(rx, ry, rz); f.castShadow = false; return f; };
    // (pieces of one material that never move apart become one shape — the same for every owl: made once)
    const one = [];

    // the body: a round barrel, a little forward-leaning (the middle 0.52 m above the feet)
    const tilt = new THREE.Group();
    tilt.position.y = 0.52;
    g.add(tilt);
    mesh(G.ball, M.body, tilt, 0, 0, 0, 0.29, 0.38, 0.27);
    mesh(G.ball, M.face, tilt, 0, -0.04, 0.15, 0.23, 0.3, 0.13); // (the pale breast)
    const mantle = [];
    for (let i = 0; i < 5; i++) mantle.push(feather(tilt, 0.26, 0.55, (i % 2 ? 1 : -1) * 0.07, 0.2 - i * 0.07, -0.18, -0.35, (i % 2 ? -1 : 1) * 0.2, 0)); // (the back's mantle)
    one.push(['mantle', tilt, mantle]);

    // the head: big and round, set straight on the body (it turns, not the neck)
    const head = new THREE.Group();
    head.position.set(0, 0.4, 0.02);
    tilt.add(head);
    mesh(G.ball, M.body, head, 0, 0, 0, 0.25, 0.22, 0.22);
    const lids = [];
    const face = { disc: [], eye: [], pupil: [], glint: [] };
    for (const s of [-1, 1]) {
        face.disc.push(mesh(G.ball, M.face, head, s * 0.095, -0.005, 0.15, 0.125, 0.135, 0.06)); // (the facial disc)
        face.eye.push(mesh(G.small, M.eye, head, s * 0.093, 0.01, 0.195, 0.062));
        face.pupil.push(mesh(G.small, M.pupil, head, s * 0.093, 0.01, 0.238, 0.036));
        face.glint.push(mesh(G.small, M.glint, head, s * 0.08, 0.028, 0.252, 0.011));
        const lid = new THREE.Group();
        lid.position.set(s * 0.093, 0.01, 0.195);
        head.add(lid);
        mesh(G.lid, M.body, lid, 0, 0, 0, 0.068).castShadow = false;
        lid.rotation.x = -1.2;
        lids.push(lid);
    }
    for (const k in face) one.push(['face:' + k, head, face[k]]);
    const beak = mesh(G.cone, M.horn, head, 0, -0.06, 0.215, 0.032, 0.085, 0.032);
    beak.rotation.x = Math.PI / 2 + 0.55;
    const tufts = [];
    for (const s of [-1, 1]) {
        const t = new THREE.Group();
        t.position.set(s * 0.12, 0.16, 0.02);
        head.add(t);
        one.push(['tuft' + s, t, [feather(t, 0.17, 0.5, 0, 0, 0, 1.2, 0, -s * 0.3), feather(t, 0.13, 0.4, s * 0.03, -0.01, -0.02, 1.0, 0, -s * 0.45)]]);
        tufts.push(t);
    }

    // the wings (the left one is the right one mirrored): an arm, coverts, secondaries, a hand, primaries
    const wings = [];
    for (const s of [1, -1]) {
        const root = new THREE.Group();
        root.position.set(s * 0.26, 0.13, 0.0);
        root.scale.x = s;
        tilt.add(root);
        const sh = new THREE.Group();
        root.add(sh);
        mesh(G.ball, M.body, sh, 0.17, 0, 0, 0.19, 0.04, 0.1);
        const sec = [];
        for (let i = 0; i < 5; i++) {
            const p = new THREE.Group();
            p.position.set(0.04 + i * 0.07, -0.01, 0.06);
            feather(p, 0.36 + i * 0.01, 0.75, 0, 0, 0);
            sh.add(p);
            sec.push(p);
        }
        const coverts = [];
        for (let i = 0; i < 4; i++) coverts.push(feather(sh, 0.17, 0.6, 0.05 + i * 0.08, 0.02, 0.08));
        one.push(['coverts', sh, coverts]); // (in the wing's own space: the same for both, the left one mirrored by its root)
        const el = new THREE.Group();
        el.position.x = 0.35;
        sh.add(el);
        mesh(G.ball, M.body, el, 0.14, 0, 0, 0.16, 0.03, 0.07);
        const pri = [];
        for (let i = 0; i < 6; i++) {
            const p = new THREE.Group();
            p.position.set(i * 0.055, -0.01, 0.04);
            feather(p, 0.4 + i * 0.025, 0.65, 0, 0, 0);
            p.userData.fan = 0.1 + i * 0.17;
            el.add(p);
            pri.push(p);
        }
        wings.push({ root, sh, el, sec, pri, side: s });
    }

    // the tail: a short fan
    const tail = new THREE.Group();
    tail.position.set(0, -0.26, -0.2);
    tilt.add(tail);
    const fan = [];
    for (let k = 0; k < 5; k++) fan.push(feather(tail, 0.28 - Math.abs(k - 2) * 0.025, 0.7, (k - 2) * 0.035, 0, 0, 0.1, (k - 2) * 0.16, 0));
    one.push(['tail', tail, fan]);

    // the legs: short and feathered, dark talons (three forward, one back)
    const legs = [];
    for (const s of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(s * 0.09, -0.33, 0.05);
        tilt.add(hip);
        mesh(G.small, M.face, hip, 0, -0.07, 0, 0.065, 0.1, 0.065);
        const foot = new THREE.Group();
        foot.position.y = -0.19;
        hip.add(foot);
        const talons = [];
        for (const a of [-0.4, 0, 0.4, Math.PI]) {
            const toe = new THREE.Group();
            toe.rotation.y = a;
            foot.add(toe);
            const c = mesh(G.cone, M.horn, toe, 0, 0.01, 0.055, 0.016, 0.09, 0.016);
            c.rotation.x = Math.PI / 2 + 0.25;
            talons.push(c);
        }
        one.push(['talons', foot, talons]);
        legs.push({ hip, foot });
    }
    for (const [key, parent, list] of one) mergeInto(parent, list, _merged, key);
    g.userData = { tilt, head, lids, tufts, wings, tail, legs, model: 'owl' };
    return g;
}

/** The body as a capsule (world): from the tail's root to the head. */
export function owlBody(o, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const t = o.model.userData.tilt;
    t.updateWorldMatrix(true, false);
    out.a.set(0, -0.2, -0.05).applyMatrix4(t.matrixWorld);
    out.b.set(0, 0.42, 0.03).applyMatrix4(t.matrixWorld);
    out.r = 0.3;
    return out;
}

/** Its middle (where spells and arrows are aimed). */
export function owlCenter(o, out = new THREE.Vector3()) {
    o.model.userData.tilt.updateWorldMatrix(true, false);
    return out.set(0, 0.1, 0).applyMatrix4(o.model.userData.tilt.matrixWorld);
}

/** How far a point is from its body (≤ 0: inside). */
export function owlDist(o, p) {
    const c = owlBody(o, _cap);
    const ab = _v2.subVectors(c.b, c.a);
    const t = Math.max(0, Math.min(1, _v.subVectors(p, c.a).dot(ab) / ab.lengthSq()));
    return _v.copy(c.a).addScaledVector(ab, t).distanceTo(p) - c.r;
}

// ------------------------------------------------------------------ animation
/**
 * One pose from the bird's mode (every computer alike).
 * a: {mode, t, flap, hop, pitch, roll, head (yaw), cock (the head's tilt), blink…}
 */
export function poseOwl(model, a, dt) {
    const U = model.userData;
    const m = a.mode;
    a.t = (a.t || 0) + dt;
    const ground = m === 'stand' || m === 'hop' || m === 'eat' || m === 'shake';
    // the wings
    const flapping = m === 'flap' || m === 'land';
    if (flapping) a.flap = (a.flap || 0) + dt * (m === 'land' ? 7.5 : 6.2);
    else if (m === 'glide') a.flap = (a.flap || 0) + dt * 0.7;
    const fold = ground ? (m === 'hop' ? 0.8 : 1) : m === 'fall' ? 0.3 : 0;
    a.fold = (a.fold ?? fold) + (fold - (a.fold ?? fold)) * Math.min(1, dt * 6);
    const F = a.fold;
    for (const w of U.wings) {
        let z, elz, y = 0;
        if (m === 'land') { const s = Math.sin(a.flap); z = 0.35 + 0.35 * s; elz = 0.15 + 0.2 * Math.sin(a.flap - 0.8); y = -0.35; } // (spread wide, braking, cupped forward)
        else if (flapping) { const s = Math.sin(a.flap); z = 0.2 + 0.8 * s; elz = 0.45 * Math.sin(a.flap - 0.9); y = -0.1 + 0.18 * Math.cos(a.flap); }
        else if (m === 'fall') { z = -0.3 + 0.5 * Math.sin(a.t * 9); elz = -0.2; }
        else { z = 0.1 + 0.04 * Math.sin(a.t * 1.3 + w.side); elz = -0.05; }
        w.root.rotation.x = 0.35 * F;
        w.root.rotation.z = -1.3 * F * w.side; // (folded: the wing's flat lies against its side, not out like a plank)
        w.sh.rotation.set(0, y * (1 - F) + 1.3 * F, z * (1 - F) + 0.05 * F);
        w.el.rotation.set(0, -0.3 * F, elz * (1 - F));
        for (const p of w.sec) p.rotation.y = -0.4 * F; // (folded: the feathers lie down its side, the primaries over them — no longer than the tail)
        for (const p of w.pri) p.rotation.y = -p.userData.fan * (1 - F) + 1.5 * F;
    }
    // the body: upright on the ground, level in the air; landing it sits back, the talons forward
    const pitch = ground ? -0.15 + (m === 'eat' ? 0.5 * Math.max(0, Math.sin(a.t * 7)) : 0) : m === 'land' ? -0.7 : m === 'fall' ? 0.9 : (a.pitch || 0) + 0.85;
    const roll = ground || m === 'land' ? 0 : (a.roll || 0);
    U.tilt.rotation.x += (pitch - U.tilt.rotation.x) * Math.min(1, dt * 7);
    U.tilt.rotation.z += (roll - U.tilt.rotation.z) * Math.min(1, dt * 7);
    if (m === 'hop') a.hop = (a.hop || 0) + dt * 9;
    U.tilt.position.y = 0.52 + (m === 'hop' ? 0.12 * Math.abs(Math.sin(a.hop)) : 0);
    // the head: level whatever the body does; turned (±135°), cocked; shaken «no»; pecking
    const shake = m === 'shake' ? 0.65 * Math.sin(a.t * 13) : 0;
    const yaw = Math.max(-HEAD_MAX, Math.min(HEAD_MAX, a.head || 0)) + shake;
    U.head.rotation.order = 'YXZ';
    U.head.rotation.y = yaw;
    U.head.rotation.x = -U.tilt.rotation.x + (m === 'eat' ? 0.9 * Math.max(0, Math.sin(a.t * 7)) : 0) + (m === 'shake' ? 0.25 : 0);
    a.cockNow = (a.cockNow || 0) + ((a.cock || 0) - (a.cockNow || 0)) * Math.min(1, dt * 5);
    U.head.rotation.z = a.cockNow;
    for (const t of U.tufts) t.rotation.x = m === 'shake' ? -0.3 : (a.cock ? -0.15 : 0) + 0.06 * Math.sin(a.t * 2.1);
    // the eyes: a blink now and then (a slow one when it is content)
    a.blinkT = (a.blinkT ?? rnd(1, 4)) - dt;
    if (a.blinkT < 0) { a.blink = 0.18; a.blinkT = rnd(2, 6); }
    a.blink = Math.max(0, (a.blink || 0) - dt);
    const shut = a.blink > 0 ? Math.sin(Math.PI * a.blink / 0.18) : 0;
    const content = a.content ? 0.45 : 0;
    for (const L of U.lids) L.rotation.x = -1.2 + (1.2 + 1.5) * Math.max(shut, content);
    // the legs: on the ground under it; in the air tucked back; landing reached forward
    U.legs.forEach((L, i) => {
        if (ground) { const s = m === 'hop' ? Math.sin(a.hop + i * 0.4) : 0; L.hip.rotation.x = 0.15 + 0.2 * s; L.foot.rotation.x = -(U.tilt.rotation.x + L.hip.rotation.x); }
        else if (m === 'land') { L.hip.rotation.x = -0.9; L.foot.rotation.x = 0.6; }
        else { L.hip.rotation.x = 1.2; L.foot.rotation.x = 0.4; }
    });
    U.tail.rotation.x = ground ? 0.5 : m === 'land' ? -0.2 : 0.05 * Math.sin(a.t * 3);
}

// ======================================================================= manager
export class Owls {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.enabled = game.config?.mode !== 'test';
        this._spawnT = rnd(...OWL.FIRST);
        this._netT = 0;
        this.clock = 0; // ms of game time
        this.log = []; // (tests) what happened
        // the hearts over a loving owl: a small pool, made now (their shader compiled with the rest)
        this.hearts = [];
        const tex = heartTexture();
        if (tex && game.scene) {
            for (let i = 0; i < 10; i++) {
                const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
                s.visible = false;
                s.scale.setScalar(0.28);
                game.scene.add(s);
                this.hearts.push({ s, t: 0, life: 0, vx: 0, vz: 0 });
            }
        }
    }

    get auth() { return this.game.authority !== false; }

    _note(e) { this.log.push({ t: Math.round(this.clock), ...e }); if (this.log.length > 60) this.log.shift(); }

    /** One of each look (Game.prewarm): the shimmering plumage, the eyes, the hearts. */
    sampleModels() { return [owlModel()]; }

    // ------------------------------------------------------------ life
    spawn(pos, id = null) {
        const g = this.game;
        const model = owlModel();
        model.position.copy(pos);
        g.scene?.add(model);
        const o = {
            id: id ?? 'ow' + Math.floor(Math.random() * 1e9).toString(36), ck: 'O', isOwl: true, model, group: model, hp: OWL.HP, dead: false,
            get isDead() { return this.dead; }, get position() { return this.model.position; },
            bodyCapsule: (out) => owlBody(o, out),
            state: 'fly', t: 0, vel: new THREE.Vector3(), yaw: Math.random() * Math.PI * 2,
            centre: pos.clone(), ang: Math.random() * Math.PI * 2, alt: rnd(...OWL.ALT), flyT: rnd(...OWL.FLY_T), flapT: rnd(2, 5),
            a: { mode: 'glide', head: 0, cock: 0 }, love: null, hated: new Set(), stare: null, stareCool: new Map(), guide: null, search: null,
        };
        // its parts for the hands' blows (BodyStrikes): the body and the head
        const parts = [['body', () => model.userData.tilt, [0, 0, 0], [0.3, 0.38, 0.28]], ['head', () => model.userData.head, [0, 0, 0], [0.25, 0.22, 0.22]]];
        parts.model = model;
        o._strikeParts = parts;
        this.list.push(o);
        return o;
    }

    _remove(o) {
        this.game.scene?.remove(o.model);
        // (every shape and material of an owl is shared: nothing of its own to dispose)
        const i = this.list.indexOf(o);
        if (i >= 0) this.list.splice(i, 1);
    }

    targets() { return this.list.filter((o) => !o.dead); }
    byId(id) { return this.list.find((o) => o.id === id && !o.dead) || null; }

    // ------------------------------------------------------------ players
    /** A player's body (feet ~1.95 m below it) and facing. null: gone / dead. */
    _player(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') {
            if (g.isDeadLocal || g.combat?.dead) return null;
            const ch = g.character;
            const pos = g.invis ? g.invis.aiPos(g.localId, ch.group.position) : ch.group.position; // (an invisible player: unseen — Invisibility.aiPos)
            return pos ? { pos, yaw: ch.group.rotation.y } : null;
        }
        const r = g.remotes?.get(id);
        if (!r || r.dead) return null;
        const pos = g.invis ? g.invis.aiPos(id, r.position) : r.position;
        return pos ? { pos, yaw: r.character?.group.rotation.y ?? 0 } : null;
    }

    _players() {
        if (this._pl) return this._pl; // (once a frame: update() clears it)
        const g = this.game, out = [];
        const me = this._player(g.localId);
        if (me) out.push({ id: g.localId, ...me });
        for (const [id] of g.remotes || []) { const p = this._player(id); if (p) out.push({ id, ...p }); }
        if (this._inFrame) this._pl = out;
        return out;
    }

    _nearestPlayer(p, skip = null) {
        let best = null;
        for (const P of this._players()) { if (skip?.has(P.id)) continue; const d = hdist(P.pos, p); if (!best || d < best.d) best = { ...P, d }; }
        return best;
    }

    _earth(p) { return realmAt(p.x, p.y, p.z, this.game.space?.planets) === 'earth'; }

    _ground(x, z) { const y = this.game.collision?.groundY?.(x, z); return Number.isFinite(y) ? y : 0; }

    _isWater(x, z) {
        const t = this.game.terrain?.data;
        return !!t?.isWaterAt?.(x, this._ground(x, z) + 0.6, z);
    }

    // ------------------------------------------------------------ harm
    /**
     * A blow / a spell on it (any computer: a guest's goes to the host). A scroll's spell hurts; any
     * other harm — a blow, an arrow, a simple spell — it dodges and darts away. Either way the one who
     * did it is no longer loved.
     */
    hit(o, dmg, kind = null, by = undefined) {
        if (!o || o.dead) return;
        const g = this.game;
        if (by === undefined) by = g.localId;
        if (!this.auth) { this._send({ op: 'hit', id: o.id, dmg: Math.round((+dmg || 0) * 10) / 10, kind }); this._puff(o, 6); return; }
        if (by === 'local' || by === 'H') by = g.localId;
        if (by != null && by !== g.localId && !g.remotes?.has(by)) by = null; // (not a player: a knight's arrow, a cannon)
        this._offended(o, by);
        if (!isStrong(kind) || !(dmg > 0)) { this._dodge(o, by, kind); return; }
        o.hp = Math.max(0, o.hp - dmg);
        this._puff(o, 14);
        this._note({ ev: 'hit', id: o.id, dmg, kind, by });
        if (o.hp <= 0) { this._die(o, by); return; }
        this._flee(o, by != null ? this._player(by)?.pos : null);
    }

    /** A blast at p: if it reaches the body. */
    hitAt(p, radius, dmg, kind, by = null) {
        if (!this.auth) return;
        for (const o of this.targets()) if (owlDist(o, p) < radius) this.hit(o, dmg, kind, by ?? this._nearestTo(p));
    }

    /** A beam / a cone along o + d·t. */
    hitRay(org, d, len, width, dmg, kind, by = null) {
        if (!this.auth) return false;
        let any = false;
        for (const o of this.targets()) {
            const b = owlBody(o, _cap);
            let hit = false;
            for (let k = 0; k <= 2 && !hit; k++) {
                const q = _v2.lerpVectors(b.a, b.b, k / 2);
                const along = _v.subVectors(q, org).dot(d);
                if (along < -b.r || along > len + b.r) continue;
                hit = _v.addScaledVector(d, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit) { this.hit(o, dmg, kind, by ?? this._nearestTo(org)); any = true; }
        }
        return any;
    }

    /** A duel charge touched it: «Авада Кедавра» (a scroll's) −25; every other charge — it darts away. */
    boltHit(o, spell, by) {
        if (!o || o.dead) return;
        if (spell === 'AvadaKedavra') this.game.fx?.lightFlash?.(owlCenter(o, _v3), 0x2bff00, 5, 0.5, 24);
        this.hit(o, spell === 'AvadaKedavra' ? 25 : 0, spell, by);
    }

    /** Water reached it (a vortex, a storm, a wave): a simple spell — it darts away. */
    watered(o, push = null, by = null) { if (o && !o.dead) this.hit(o, 0, 'water', by); }

    /** A house's sphere of protection turned it away (no harm, no offence). */
    shooed(o) { if (this.auth && o && !o.dead && o.state !== 'flee') this._flee(o, null); }

    /** Whoever attacked it: no love, and never again. */
    _offended(o, by) {
        if (by == null) return;
        o.hated.add(by);
        if (o.love?.by === by) {
            this._tell(by, '🦉 Сова обиделась и больше вас не любит');
            this._note({ ev: 'unloved', id: o.id, by });
            o.love = null; o.guide = null; o.search = null;
        }
        if (o.stare?.id === by) o.stare = null;
    }

    /** It darts aside and away, fast (feathers in the air, a startled hoot). */
    _dodge(o, by, kind) {
        this._note({ ev: 'dodge', id: o.id, by, kind });
        this._puff(o, 5);
        this._sound(o, 'wings');
        // (rarely a startled owl loses a feather in its dart: an ingredient of «Зелье светлого ума», Potions.js)
        if (this.auth && !o.annihilated && Math.random() < OWL.SHED_CHANCE) {
            const p = owlCenter(o, new THREE.Vector3());
            this.game.items?.spawnLoose?.({ kind: 'owlFeather', uid: newUid(), count: 1 }, p, { vel: _v.set((Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5) });
        }
        this._flee(o, by != null ? this._player(by)?.pos : null);
    }

    /** Off and away, fast, high (from `from`). */
    _flee(o, from) {
        const p = o.model.position;
        const away = from ? _v.set(p.x - from.x, 0, p.z - from.z) : _v.set(Math.cos(o.ang), 0, Math.sin(o.ang));
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
        away.normalize();
        o.flee = new THREE.Vector3(p.x + away.x * 70, 0, p.z + away.z * 70);
        o.flee.y = this._ground(o.flee.x, o.flee.z) + 28;
        o.stare = null;
        if (o.guide || o.search) { this._tell(o.love?.by, '🦉 Сову спугнули — она улетела'); o.guide = null; o.search = null; }
        this._setState(o, 'flee');
    }

    _die(o, by) {
        if (o.dead) return;
        o.dead = true;
        const g = this.game;
        const p = owlCenter(o, new THREE.Vector3());
        this._note({ ev: 'die', id: o.id, by });
        this._fall(p);
        o.model.visible = false;
        if (this.auth) {
            // its feather drifts down where it fell
            if (!o.annihilated) g.items?.spawnLoose?.({ kind: 'owlFeather', uid: newUid(), count: 1 }, p.clone(), { vel: _v.set((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5) });
            this._send({ op: 'die', id: o.id, p: [p.x, p.y, p.z].map(r2) });
            creditKill(g, by, { kind: 'owl' });
            this._tell(by, '🦉 Сова упала замертво. Осталось перо совы');
        }
        setTimeout(() => this._remove(o), 50);
    }

    /** Its feathers burst into the air (everybody sees it). */
    _fall(p) {
        const fx = this.game.fx;
        for (let i = 0; i < 40; i++) fx?.spark?.(p, IRIS[i % IRIS.length], 0.09 + Math.random() * 0.1, _v.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 1.2 + Math.random());
        this.game.sound?.playOwl?.(p, 'sad');
    }

    _puff(o, n) {
        const c = owlCenter(o, _v3);
        for (let i = 0; i < n; i++) this.game.fx?.spark?.(c, IRIS[i % IRIS.length], 0.07, _v.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.7);
    }

    _nearestTo(p) {
        let best = null;
        for (const P of this._players()) { const d = P.pos.distanceTo(p); if (d < 12 && (!best || d < best.d)) best = { id: P.id, d }; }
        return best?.id ?? null;
    }

    // ------------------------------------------------------------ the voice: «я хочу найти паучиху»
    /** A loving owl of mine near me, or null (each computer knows its own player's). */
    _myOwl() {
        const g = this.game, me = g.character?.group?.position;
        if (!me || g.isDeadLocal || !this._player(g.localId)) return null; // (invisible: it doesn't see me — Owls.TARGETS)
        let best = null;
        for (const o of this.list) {
            if (o.dead || o.love?.by !== g.localId) continue;
            const d = o.model.position.distanceTo(me);
            if (d < OWL.ASK_R && (!best || d < best.d)) best = { o, d };
        }
        return best?.o || null;
    }

    /** Are these words the owl's (a loving owl of mine is near and they name a boss)? Then they are no spell and no talk. */
    claims(text) { return !!this._myOwl() && !!bossOfWords(text); }

    /** The words heard: the owl near me that loves me is asked. True: they were the owl's. */
    hear(text) {
        const o = this._myOwl();
        const boss = o && bossOfWords(text);
        if (!boss) return false;
        if (this.auth) this.ask(o, boss, this.game.localId);
        else this._send({ op: 'ask', id: o.id, boss });
        return true;
    }

    /** (host) `by` asks the owl that loves him for `boss`: it searches, then leads — once. */
    ask(o, boss, by) {
        if (!this.auth || !o || o.dead || o.love?.by !== by) return false;
        if (o.love.asked) { this._tell(by, `🦉 Сова уже ведёт вас ${bossTo(o.love.asked)} — второй раз не просят`); this._sound(o, 'hoot'); return false; }
        if (o.search) return false;
        const P = this._player(by);
        if (!P) return false;
        if (!this._earth(P.pos)) { this._shake(o, by, '🦉 Сова качает головой: она ведёт только по Земле'); return false; }
        o.search = { boss, by, from: P.pos.clone(), job: {}, t: 0 };
        this._note({ ev: 'ask', id: o.id, by, boss });
        this._setState(o, 'think');
        return true;
    }

    /** No such boss alive: it shakes its head, hoots sadly — and stays (the request not spent). */
    _shake(o, by, text) {
        this._tell(by, text);
        this._sound(o, 'sad');
        this._note({ ev: 'none', id: o.id, by });
        this._setState(o, 'shake');
    }

    // ------------------------------------------------------------ the host's mind
    _setState(o, s) { o.state = s; o.t = 0; }

    /** Flying towards `goal` at `speed`: steering, banking, keeping off the ground. */
    _fly(o, goal, speed, dt, { low = false, k = 2.4 } = {}) {
        const p = o.model.position;
        const to = _v.subVectors(goal, p);
        const d = to.length();
        const want = d > 1e-3 ? to.multiplyScalar(Math.min(speed, d * 1.4 + 0.3) / d) : to.set(0, 0, 0);
        o.vel.lerp(want, 1 - Math.exp(-dt * k));
        p.addScaledVector(o.vel, dt);
        const gy = this._ground(p.x, p.z);
        if (!low && p.y < gy + 2.5) { p.y = gy + 2.5; o.vel.y = Math.max(0, o.vel.y); }
        if (p.y < gy) p.y = gy;
        const hs = Math.hypot(o.vel.x, o.vel.z);
        let turn = 0;
        if (hs > 0.4) { const yw = Math.atan2(o.vel.x, o.vel.z); turn = angDiff(o.yaw, yw); o.yaw += turn * Math.min(1, dt * 4); }
        o.model.rotation.y = o.yaw;
        o.a.roll = Math.max(-0.6, Math.min(0.6, (o.a.roll || 0) * 0.9 + (-turn * 1.5) * 0.1));
        o.a.pitch = Math.max(-0.5, Math.min(0.5, -Math.atan2(o.vel.y, Math.max(hs, 1)) * 0.8));
        o.flapT -= dt;
        if (o.flapT < -1.2) o.flapT = rnd(2, 5);
        o.a.mode = o.vel.y > 0.6 || hs < speed * 0.5 || o.flapT < 0 ? 'flap' : 'glide';
        o.a.head += (0 - o.a.head) * Math.min(1, dt * 3);
        o.a.cock = 0;
        return d;
    }

    /** Landing on `goal`: in from above, its wings spread wide, braking, the talons forward. True when it sits there. */
    _land(o, goal, dt) {
        const p = o.model.position;
        const hd = hdist(p, goal);
        if (hd > 5) { this._fly(o, _v2.set(goal.x, goal.y + Math.min(10, 2 + hd * 0.3), goal.z), Math.min(OWL.SPEED * 1.2, 3 + hd * 0.6), dt, { low: true }); return false; }
        this._fly(o, _v2.set(goal.x, goal.y, goal.z), Math.max(2, hd * 1.2), dt, { low: true, k: 3.5 });
        o.a.mode = 'land';
        if (p.distanceTo(_v2.set(goal.x, goal.y, goal.z)) < 0.35) {
            p.y = goal.y;
            o.vel.set(0, 0, 0);
            o.a.pitch = 0; o.a.roll = 0;
            this._sound(o, 'wings');
            return true;
        }
        return false;
    }

    /** A few hops on the ground towards `goal` (round anybody in the way — Crowd). Distance left. */
    _hop(o, goal, dt) {
        const p = o.model.position;
        const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { o.a.mode = 'stand'; return d; }
        const st = crowdStep(this.game, o, p, dx / d, dz / d, d, { r: 0.3, speed: OWL.HOP, dt, id: o.id });
        if (!st) { o.a.mode = 'stand'; return d; }
        const nx = p.x + st.x * OWL.HOP * dt, nz = p.z + st.z * OWL.HOP * dt;
        const ny = this._ground(nx, nz);
        if (ny - p.y > 0.6 || this._isWater(nx, nz)) { o.a.mode = 'stand'; return d; } // (a step too high, or water: not on foot)
        p.set(nx, ny, nz);
        o.yaw += angDiff(o.yaw, Math.atan2(st.x, st.z)) * Math.min(1, dt * 6);
        o.model.rotation.y = o.yaw;
        o.a.mode = 'hop';
        return d;
    }

    /** Look at a point: the head first (up to ±135°), the body follows when the head is turned far. */
    _look(o, at, dt, cock = 0) {
        const p = o.model.position;
        const want = Math.atan2(at.x - p.x, at.z - p.z);
        const rel = angDiff(o.yaw, want);
        if (Math.abs(rel) > 1.9) { o.yaw += rel * Math.min(1, dt * 1.5); o.model.rotation.y = o.yaw; }
        o.a.head += (angDiff(o.yaw, want) - o.a.head) * Math.min(1, dt * 6);
        o.a.cock = cock;
    }

    /** A place to land near `c`: the ground, a rock, a tree's crown, a roof — dry, free, ≥ `min` from it. */
    _spot(c, min, max) {
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, r = rnd(min, max);
            const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
            if (this._isWater(x, z)) continue;
            const y = this._ground(x, z);
            if (!Number.isFinite(y) || (Number.isFinite(c.y) && Math.abs(y - c.y) > 14)) continue;
            if (this._players().some((P) => hdist(P.pos, _v.set(x, 0, z)) < 1.5)) continue;
            return new THREE.Vector3(x, y, z);
        }
        return null;
    }

    /** (host) Meat lying near it that nobody holds: the nearest. */
    _meatNear(o) {
        const p = o.model.position;
        let best = null;
        for (const L of this.game.items?.loose?.values() || []) {
            if (!MEAT.has(L.item?.kind) || L.lev || L.accio) continue;
            if (L.thrower && o.hated.has(L.thrower)) continue; // (from one it doesn't love: no)
            const d = L.model.position.distanceTo(p);
            if (d < OWL.MEAT_R && (!best || d < best.d)) best = { L, d };
        }
        return best?.L || null;
    }

    _think(o, dt) {
        const p = o.model.position;
        o.t += dt;
        o.a.content = false;
        switch (o.state) {
            case 'fly': {
                // low over the land round a centre near the people, now and then down to sit
                o.ang += (OWL.SPEED * 0.8 / 22) * dt;
                const near = this._nearestPlayer(p, o.hated);
                if (near && hdist(o.centre, near.pos) > 60) o.centre.lerp(_v.set(near.pos.x, 0, near.pos.z), Math.min(1, dt * 0.08));
                const gx = o.centre.x + Math.cos(o.ang) * 22, gz = o.centre.z + Math.sin(o.ang) * 22;
                this._fly(o, _v3.set(gx, this._ground(gx, gz) + o.alt, gz), OWL.SPEED, dt);
                o.flyT -= dt;
                if (this._meatNear(o)) { this._setState(o, 'toMeat'); break; }
                if (o.flyT <= 0) {
                    o.flyT = rnd(...OWL.FLY_T);
                    const c = near && near.d < 120 ? near.pos : o.centre;
                    const at = this._spot(c, near && near.d < 120 ? 10 : 0, near && near.d < 120 ? 30 : 25);
                    if (at) { o.perch = at; this._setState(o, 'land'); }
                }
                break;
            }
            case 'land':
                if (this._land(o, o.perch, dt)) { this._setState(o, o.love && !o.love.asked ? 'follow' : 'perch'); o.stay = rnd(...OWL.PERCH_T); }
                if (o.t > 25) this._setState(o, 'fly');
                break;
            case 'perch': this._perch(o, dt); break;
            case 'toMeat': this._toMeat(o, dt); break;
            case 'eat': this._eat(o, dt); break;
            case 'adore': {
                const P = this._player(o.love?.by);
                if (!P) { this._setState(o, 'perch'); break; }
                this._look(o, P.pos, dt, 0.35 * Math.sin(o.t * 0.8));
                o.a.mode = 'stand'; o.a.content = true;
                if (o.t > OWL.ADORE_T) { this._setState(o, 'follow'); o.love.keepT = OWL.FOLLOW_T; }
                break;
            }
            case 'follow': this._follow(o, dt); break;
            case 'think': this._search(o, dt); break;
            case 'shake':
                o.a.mode = 'shake';
                if (o.t > 2.2) this._setState(o, o.love ? 'follow' : 'perch');
                break;
            case 'guide': this._guide(o, dt); break;
            case 'flee': {
                const goal = o.flee || _v3.set(p.x + 50, p.y + 20, p.z);
                const d = this._fly(o, goal, OWL.FAST, dt);
                if (o.t < 1.5) o.a.mode = 'flap';
                if (d < 5 || o.t > 14) { o.centre.copy(p); o.alt = rnd(...OWL.ALT); o.flyT = rnd(...OWL.FLY_T); this._setState(o, 'fly'); }
                break;
            }
        }
    }

    /** Sitting: looking about, a hop now and then; curious about a player who comes up; meat. */
    _perch(o, dt) {
        const p = o.model.position;
        p.y = this._ground(p.x, p.z);
        if (o.love && !o.love.asked && this._player(o.love.by)) { this._setState(o, 'follow'); return; }
        if (this._meatNear(o)) { this._setState(o, 'toMeat'); return; }
        // somebody came up: it looks at him 5–10 s, its head cocked (not afraid)
        if (!o.stare) {
            for (const P of this._players()) {
                if (o.hated.has(P.id) || hdist(P.pos, p) > OWL.CURIOUS_R) continue;
                if (this.clock - (o.stareCool.get(P.id) ?? -1e9) < OWL.STARE_COOL * 1000) continue;
                o.stare = { id: P.id, t: rnd(...OWL.STARE), cock: (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.45) };
                this._note({ ev: 'stare', id: o.id, to: P.id, t: o.stare.t });
                if (Math.random() < 0.5) this._sound(o, 'hoot');
                break;
            }
        }
        if (o.stare) {
            const P = this._player(o.stare.id);
            o.stare.t -= dt;
            if (!P || o.stare.t <= 0) { o.stareCool.set(o.stare.id, this.clock); o.stare = null; }
            else {
                // (the head tilts one way, then the other — curious)
                if (Math.random() < dt * 0.3) o.stare.cock = -o.stare.cock;
                this._look(o, P.pos, dt, o.stare.cock);
                o.a.mode = 'stand';
                return;
            }
        }
        // its own business: looks round (the head far round), a few hops, then off again
        o.lookT = (o.lookT ?? 0) - dt;
        if (o.lookT <= 0) { o.lookT = rnd(1.2, 3.5); o.headGoal = rnd(-HEAD_MAX, HEAD_MAX); o.a.cock = Math.random() < 0.3 ? rnd(-0.3, 0.3) : 0; if (Math.random() < 0.3) o.hopTo = this._spot(p, 0.6, 2); }
        if (o.hopTo) { if (this._hop(o, o.hopTo, dt) < 0.1 || o.a.mode === 'stand') o.hopTo = null; }
        else o.a.mode = 'stand';
        o.a.head += ((o.headGoal || 0) - o.a.head) * Math.min(1, dt * 3);
        if (o.t > o.stay) { o.flyT = rnd(...OWL.FLY_T); this._takeoff(o); }
    }

    _takeoff(o) { o.vel.set(Math.sin(o.yaw) * 2, 5, Math.cos(o.yaw) * 2); o.centre.copy(o.model.position); this._sound(o, 'wings'); this._setState(o, 'fly'); }

    /** To the meat: hops if it is near, flies over if not. */
    _toMeat(o, dt) {
        const L = this._meatNear(o);
        if (!L) { this._setState(o, o.model.position.y - this._ground(o.model.position.x, o.model.position.z) > 1 ? 'fly' : 'perch'); return; }
        o.meat = L.item.uid;
        const p = o.model.position, m = L.model.position;
        const air = p.y - this._ground(p.x, p.z) > 0.5;
        const d = hdist(p, m);
        if (air || d > 3) {
            const side = _v3.set(p.x - m.x, 0, p.z - m.z);
            if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
            side.setLength(0.35);
            const at = (o.meatAt || (o.meatAt = new THREE.Vector3())).set(m.x + side.x, this._ground(m.x + side.x, m.z + side.z), m.z + side.z);
            if (!air && d > 3) { o.vel.set(0, 4, 0); p.y += 0.3; } // (a short flight)
            this._land(o, at, dt);
        } else if (d > 0.4) this._hop(o, m, dt);
        if (hdist(p, m) <= 0.45 && p.y - this._ground(p.x, p.z) < 0.3) { this._look(o, m, 1); this._setState(o, 'eat'); }
        if (o.t > 30) this._setState(o, 'perch');
    }

    /** Pecking at the meat; it is gone; the one who threw it is loved. */
    _eat(o, dt) {
        const g = this.game;
        o.a.mode = 'eat';
        const L = g.items?.loose?.get(o.meat);
        if (!o.ate && !L) { this._setState(o, 'perch'); return; } // (somebody took it)
        if (!o.ate && L) this._look(o, L.model.position, dt);
        if (!o.ate && o.t > OWL.EAT_T * 0.5) {
            o.ate = true;
            o.feeder = L.thrower && L.thrower !== 'H' ? L.thrower : this._nearestTo(L.model.position) ?? this._nearestPlayer(o.model.position)?.id;
            if (o.feeder === 'local') o.feeder = g.localId;
            g.items.removeLoose(o.meat);
            g.sync?.itemGone?.(o.meat, null, null);
            this._sound(o, 'coo');
            this._note({ ev: 'eat', id: o.id, by: o.feeder });
        }
        if (o.t > OWL.EAT_T) {
            o.ate = false;
            const by = o.feeder;
            o.feeder = null;
            if (by == null || o.hated.has(by) || !this._player(by)) { this._setState(o, 'perch'); return; }
            if (o.love?.asked && o.love.by === by) { this._setState(o, 'follow'); return; } // (already spent on him)
            o.love = { by, at: this.clock, asked: null, keepT: OWL.FOLLOW_T };
            this._note({ ev: 'love', id: o.id, by });
            this._sound(o, 'chime');
            this._tell(by, '🦉 Сова съела мясо и полюбила вас ❤ Скажите, кого хотите найти: «я хочу найти дракона», «где паучиха»…');
            this._setState(o, 'adore');
        }
    }

    /** Loved: keeps near the one it loves (lands by him as he goes), looking at him — waiting to be asked. */
    _follow(o, dt) {
        const L = o.love;
        const P = L && this._player(L.by);
        const p = o.model.position;
        if (!P) { this._setState(o, 'perch'); return; }
        L.keepT = (L.keepT ?? OWL.FOLLOW_T) - dt;
        if (L.keepT <= 0 || !this._earth(P.pos)) { o.flyT = rnd(...OWL.FLY_T); this._takeoff(o); return; } // (it goes about its business — it still loves him)
        if (this._meatNear(o)) { this._setState(o, 'toMeat'); return; }
        const air = p.y - this._ground(p.x, p.z) > 0.5;
        if (air || hdist(p, P.pos) > OWL.KEEP_D) {
            if (!o.perch || hdist(o.perch, P.pos) > OWL.KEEP_D - 2) o.perch = this._spot(_v3.set(P.pos.x, P.pos.y - 1.95, P.pos.z), 2.5, 4.5);
            if (o.perch && this._land(o, o.perch, dt)) o.perch = null;
            else if (!o.perch) this._fly(o, _v3.set(P.pos.x, P.pos.y + 3, P.pos.z), OWL.SPEED, dt);
            return;
        }
        p.y = this._ground(p.x, p.z);
        this._look(o, P.pos, dt, 0.2 * Math.sin(o.t * 0.6));
        o.a.mode = 'stand';
        o.a.content = (o.t % 7) < 1.5;
    }

    /** Thinking where (a few frames: the far castles planned in the workers), then off — or a shake of the head. */
    _search(o, dt) {
        const S = o.search;
        const P = S && this._player(S.by);
        if (!S || !P) { o.search = null; this._setState(o, 'perch'); return; }
        o.a.mode = 'stand';
        this._look(o, P.pos, dt, 0.4 * Math.sin(o.t * 2.5)); // (its head this way and that: it thinks)
        S.t += dt;
        const find = BOSS_FINDERS[S.boss];
        let at = find ? find(this.game, S.from, S.job) : null;
        if (at === undefined && S.t < 30) return;
        if (at === undefined) at = null;
        o.search = null;
        if (!at) { this._shake(o, S.by, `🦉 Сова грустно качает головой: живых — ${bossTo(S.boss).replace(/^к /, '')} — она не знает. Назовите другого`); return; }
        o.love.asked = S.boss; // (once: the request is spent)
        o.guide = { boss: S.boss, by: S.by, at: new THREE.Vector3(at.x, 0, at.z), live: at.live || null, liveT: 0, circleT: 0, t: 0 };
        this._note({ ev: 'guide', id: o.id, by: S.by, boss: S.boss, x: Math.round(at.x), z: Math.round(at.z) });
        this._sound(o, 'hoot');
        this._tell(S.by, `🦉 Сова взлетела и ведёт вас ${bossTo(S.boss)} — следуйте за ней`);
        o.vel.set(0, 5, 0);
        this._setState(o, 'guide');
    }

    /** Leading: ahead of him towards the boss; waits when he falls behind; circles over the place, then leaves. */
    _guide(o, dt) {
        const G = o.guide;
        const P = G && this._player(G.by);
        const p = o.model.position;
        if (!G || !P || G.t > OWL.GUIDE_T) { o.guide = null; this._flee(o, null); return; }
        G.t += dt;
        // a moving boss (a dragon in the air, the black ship on its round, the spider): where it is now
        G.liveT -= dt;
        if (G.live && G.liveT <= 0) {
            G.liveT = 2;
            const now = G.live();
            if (now) G.at.set(now.x, 0, now.z);
            else if (G.boss !== 'king' && G.boss !== 'tower' && G.boss !== 'iceQueen') { this._tell(G.by, '🦉 Сова покружила и улетела: того, к кому она вела, больше нет'); o.guide = null; this._flee(o, null); return; }
        }
        const toBoss = hdist(P.pos, G.at);
        const alt = OWL.GUIDE_ALT;
        if (toBoss < OWL.NEAR || G.circleT > 0) {
            // there: it circles over the place, hooting, then flies off (its work done)
            if (G.circleT === 0) { this._tell(G.by, `🦉 Сова кружит над местом — ${bossTo(G.boss).replace(/^к /, '')} здесь`); this._sound(o, 'hoot'); this._note({ ev: 'arrive', id: o.id }); }
            G.circleT += dt;
            const a = G.circleT * 0.55;
            const x = G.at.x + Math.cos(a) * 14, z = G.at.z + Math.sin(a) * 14;
            this._fly(o, _v3.set(x, this._ground(x, z) + alt + 10, z), OWL.SPEED, dt);
            if (G.circleT > OWL.CIRCLE_T) { o.guide = null; o.love.keepT = 0; this._flee(o, G.at); }
            return;
        }
        const dir = _v2.set(G.at.x - P.pos.x, 0, G.at.z - P.pos.z).normalize();
        const behind = hdist(p, P.pos) > OWL.WAIT_D;
        // (in space, or on another planet: it stays under the sky over the place he left)
        const up = this._earth(P.pos) ? P.pos : G.left || P.pos;
        if (!this._earth(P.pos)) G.left = G.left || P.pos.clone(); else G.left = null;
        let gx, gz;
        if (behind) { const a = G.t * 0.9; gx = up.x + dir.x * 10 + Math.cos(a) * 6; gz = up.z + dir.z * 10 + Math.sin(a) * 6; } // (waits for him, circling a little ahead)
        else { const ahead = Math.min(OWL.AHEAD, toBoss); gx = up.x + dir.x * ahead; gz = up.z + dir.z * ahead; }
        const gy = Math.max(this._ground(gx, gz), Math.min(up.y, this._ground(up.x, up.z) + 300)) + alt; // (never up towards space)
        this._fly(o, _v3.set(gx, gy, gz), behind ? OWL.SPEED : OWL.FAST, dt);
        if (Math.random() < dt * 0.08) this._sound(o, 'hoot');
    }

    // ------------------------------------------------------------ spawning
    _spawnTick(dt) {
        if (!this.enabled) return;
        this._spawnT -= dt;
        if (this._spawnT > 0) return;
        this._spawnT = rnd(OWL.SPAWN_MIN, OWL.SPAWN_MAX);
        // (owls still in the world round a player — even ones that flew off — keep more from coming)
        const players = this._players().filter((P) => this._earth(P.pos) && this.list.filter((o) => !o.dead && hdist(o.model.position, P.pos) < OWL.FORGET).length < OWL.NEAR_MAX);
        if (!players.length || this.list.length >= OWL.MAX || Math.random() > OWL.SPAWN_CHANCE) return;
        const P = players[Math.floor(Math.random() * players.length)];
        const a = Math.random() * Math.PI * 2, r = rnd(45, 90);
        const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        const o = this.spawn(new THREE.Vector3(x, this._ground(x, z) + rnd(...OWL.ALT), z));
        o.centre.set(x, 0, z);
        this._note({ ev: 'spawn', id: o.id });
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        if (dt <= 0) return;
        this.clock += dt * 1000;
        this._pl = null; this._inFrame = true;
        IR.uIrTime.value = (IR.uIrTime.value + dt) % 1000;
        IR.uIrGlow.value = g.isNight ? 0.35 : 0.1;
        if (this.auth) {
            this._spawnTick(dt);
            const players = this._players();
            for (const o of [...this.list]) {
                if (o.dead) continue;
                // streamed out: far from everybody (a calm owl only — not one leading the way)
                if (o.imp && g.imperius?.step('o', o, dt)) continue; // («Империус Максима»: a mind in it — ImperiusControl.step)
                if (!o.guide && !o.search && !players.some((P) => hdist(P.pos, o.model.position) < OWL.FORGET)) { this._remove(o); continue; }
                this._think(o, dt);
            }
        } else {
            for (const o of this.list) if (o.imp?.mine && !o.dead && g.imperius?.step('o', o, dt)) { /* (my mind in it: my computer flies it) */ } else if (o.net && !o.dead) this._follow2(o, dt);
        }
        const me = g.character?.group?.position;
        for (const o of this.list) {
            if (o.dead) continue;
            // (far off: not drawn; not posed every frame)
            const far = me ? o.model.position.distanceTo(me) > 160 : false;
            o.model.visible = !far;
            if (far) continue;
            poseOwl(o.model, o.a, dt);
            if (o.state === 'adore' || o.hearts) this._heartsFrom(o, dt);
        }
        this._heartsStep(dt);
        this._featherGlow(dt);
        this._netSend(dt);
        this._inFrame = false; this._pl = null;
    }

    /** Hearts rise over a loving owl (one every half a second). */
    _heartsFrom(o, dt) {
        o._hT = (o._hT || 0) - dt;
        if (o._hT > 0) return;
        o._hT = 0.5;
        const h = this.hearts.find((q) => q.life <= 0);
        if (!h) return;
        o.model.userData.head.getWorldPosition(h.s.position);
        h.s.position.y += 0.35;
        h.life = h.t = 1.8; h.vx = (Math.random() - 0.5) * 0.3; h.vz = (Math.random() - 0.5) * 0.3;
        h.s.visible = true;
    }

    _heartsStep(dt) {
        for (const h of this.hearts) {
            if (h.life <= 0) continue;
            h.life -= dt;
            if (h.life <= 0) { h.s.visible = false; h.s.material.opacity = 0; continue; }
            const k = h.life / h.t;
            h.s.position.x += (h.vx + 0.2 * Math.sin(h.life * 5)) * dt;
            h.s.position.z += h.vz * dt;
            h.s.position.y += 0.55 * dt;
            h.s.material.opacity = Math.min(1, k * 2) * Math.min(1, (1 - k) * 6);
            h.s.scale.setScalar(0.2 + 0.12 * (1 - k));
        }
    }

    /** An owl feather lying about glints now and then (its colours shift). */
    _featherGlow(dt) {
        this._fgT = (this._fgT || 0) - dt;
        if (this._fgT > 0) return;
        this._fgT = 0.35;
        for (const L of this.game.items?.loose?.values() || []) {
            if (L.item?.kind !== 'owlFeather' || Math.random() > 0.5) continue;
            this.game.fx?.spark?.(L.model.position, IRIS[Math.floor(Math.random() * IRIS.length)], 0.04, _v.set(0, 0.3, 0), 0.6);
        }
    }

    _sound(o, kind) {
        this.game.sound?.playOwl?.(o.model.position, kind);
        if (this.auth && this.game.sync) this._send({ op: 'snd', id: o.id, k: kind });
    }

    // ------------------------------------------------------------ network
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'owl', ...m }, m.op !== 's'); }

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
        this._send({ op: 's', l: this.list.filter((o) => !o.dead).map((o) => [o.id, r2(o.model.position.x), r2(o.model.position.y), r2(o.model.position.z), r2(o.yaw), r2(o.a.pitch || 0), r2(o.a.roll || 0), MODES.indexOf(o.a.mode), r2(o.a.head || 0), r2(o.a.cock || 0), Math.round(o.hp), o.love?.by ?? 0, o.state === 'adore' ? 1 : 0, o.a.content ? 1 : 0]) });
    }

    /** (a guest) following the host's owl smoothly. */
    _follow2(o, dt) {
        const n = o.net;
        o.model.position.lerp(n.p, Math.min(1, dt * 8));
        o.yaw += angDiff(o.yaw, n.yaw) * Math.min(1, dt * 8);
        o.model.rotation.y = o.yaw;
        o.a.pitch = n.pitch; o.a.roll = n.roll; o.a.mode = n.mode; o.a.head = n.head; o.a.cock = n.cock; o.a.content = n.content;
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
                    const [id, x, y, z, yaw, pitch, roll, mode, head, cock, hp, love, hearts, content] = e;
                    seen.add(id);
                    let o = this.list.find((q) => q.id === id);
                    if (!o) { o = this.spawn(new THREE.Vector3(x, y, z), id); o.yaw = yaw; }
                    o.net = { p: new THREE.Vector3(x, y, z), yaw, pitch, roll, mode: MODES[mode] || 'glide', head, cock, content: !!content };
                    o.hp = hp;
                    o.love = love ? { by: love } : null;
                    o.hearts = !!hearts;
                }
                for (const o of [...this.list]) if (!seen.has(o.id) && !o.dead) this._remove(o);
                break;
            }
            case 'hit': if (isHost) { const o = this.byId(m.id); if (o) { if (DUEL_KINDS.has(m.kind) && !m.dmg) this.boltHit(o, m.kind, m.from); else this.hit(o, Math.min(40, Math.max(0, +m.dmg || 0)), typeof m.kind === 'string' ? m.kind.slice(0, 24) : null, m.from); } } break;
            case 'ask': if (isHost && typeof m.boss === 'string') { const o = this.byId(m.id); if (o) this.ask(o, m.boss.slice(0, 20), m.from); } break;
            case 'snd': if (!isHost) { const o = this.byId(m.id); if (o && typeof m.k === 'string') g.sound?.playOwl?.(o.model.position, m.k); } break;
            case 'die': { const o = this.list.find((q) => q.id === m.id); const p = vec(m.p); if (p) this._fall(p); if (o) { o.dead = true; o.model.visible = false; setTimeout(() => this._remove(o), 50); } break; }
            case 'note': if (m.to === g.localId && typeof m.text === 'string') g.hud?.setVoice?.(m.text.slice(0, 200), true); break;
        }
    }

    dispose() {
        for (const o of [...this.list]) this._remove(o);
        for (const h of this.hearts) { this.game.scene?.remove(h.s); h.s.material.dispose(); }
        this.hearts = [];
    }
}

/** The shimmer's colours for sparks (its feathers in the air). */
const IRIS = [0x9be7ff, 0xc7a6ff, 0xff9fe0, 0xa6ffd8, 0xfff0a6];
const DUEL_KINDS = new Set(['AvadaKedavra', 'Stupefy', 'IceDuel', 'LevitateDuel', 'SapiraDuel', 'SandsDuel', 'Expelliarmus', 'Disarmor', 'Jolt', 'JoltMaxima']);

// pushes, gusts, knockdowns (CreatureImpact): a simple spell's push — it darts away untouched; a scroll's
// («Wind Impulse») throws it through the air (and it flies off offended)
registerKind('O', {
    name: 'owl', faces: 1,
    list: (g) => g.owls?.list || [],
    get: (g, id) => g.owls?.byId(id),
    alive: (c) => !c.dead,
    body: () => 'owl',
    centre: (c, out) => owlCenter(c, out),
    pivot: () => ({ obj: null, base: 0, lie: 0 }),
    head: (c) => c.model.userData.head, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { c.model.position.x += dx; c.model.position.z += dz; },
    toss(g, c, vy) { c.vel.y = Math.max(c.vel.y, vy); },
    hold() {},
    frozen: () => false,
    noKnock: () => true,
    // (not a scroll's: no effect at all — it is already away; a fall or a house's sphere: nothing to dodge)
    immune(g, c, o) {
        const k = o.spell || o.kind;
        if (isStrong(k) || k === 'Ward') return false;
        if (k !== 'fall') g.owls?.hit(c, 0, k, o.by ?? null);
        return true;
    },
    struck(g, c, o) {
        if (o.spell === 'Ward' || o.kind === 'fall') return;
        g.owls?._offended(c, o.by ?? null);
        g.owls?._flee(c, null);
    },
});
