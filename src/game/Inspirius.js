/**
 * Inspirius.js — «Inspirius» («Инспириус»): the mightiest spell of all.
 *
 * The author: only with a wand (in Creative — without it too); 500 mana at once; its scroll
 * turns up only for one whose mana maximum is already 500 (ItemTypes.rollKeyItem). Out of the
 * wand flies a ball of magic light — not Lumos: electric, alive, crackling — for about five
 * seconds, neither fast nor slow, where the wand sends it (the hand steers it while the wand
 * points). When it touches anything it bursts with enormous force and leaves a huge pit — the
 * closer to the blast, the deeper — and everything around it is thrown off its feet:
 * −100 HP near (20 m), −50 in the middle (40 m), −25 far (60 m). Ten times «Total
 * Destruction Maxima»: a crater ~22 m across the top and ~11 m deep, every house and wall out
 * to 45 m comes down band after band as the shock wave runs, fires burn round the rim.
 *
 *   Who / what it touches: INSPIRIUS_TARGETS below (CLAUDE.md «на кого и на что»).
 *   Network: the caster flies the ball ('insp' go/at, 10×/s) and says where it burst
 *   ('insp' boom); every computer digs the same crater and brings down the same bands
 *   (saved in g.explosions too); the host hurts and throws the creatures, each computer its
 *   own player. Performance: the crater is one sphere of blocks, the ruin goes one band a
 *   frame, the falling blocks and particles are capped (Total Destruction's machinery).
 */

import * as THREE from 'three';
import { keepIn } from './HouseWards.js';
import { isCastleBlock, BLOCK, BASE_COLORS } from '../world/Terrain.js';
import { eachBody, hitBody, throwBody, ruinBand } from './MagicWave.js';
import { segmentToSegment } from './Duel.js';

export const INSP = {
    NAME: 'Inspirius',
    COST: 500, // mana, at once
    MIN_MAX_MANA: 500, // (one cannot have 500 without a maximum of 500)
    SPEED: 14, // m/s: ~5 s to where it is sent
    LIFE: 7, // s: then it bursts wherever it is
    STEER: 0.8, // rad/s: how fast the wand turns it
    CRATER_R: 22, // m: the pit across the top (radius)
    CRATER_DEPTH: 11, // m at the middle
    RUIN_R: 45, // m: everything built comes down
    HARM_R: 60, // m
    ZONES: [[20, 100], [40, 50], [60, 25]], // [up to m, harm]
    SHOCK_T: 1.6, // s the shock wave takes to reach HARM_R
    BAND: 3, // m: the ruin goes in bands this wide (one a frame: a thin band — a light frame)
    SCROLL_MANA: 500, // its scroll is found only by one with this mana maximum
    ORB_R: 0.55, // m: the ball touches a body this far from it (its glowing skin)
};

/**
 * Every body the ball can touch (the caster `skip` never): players, zombies, castle people,
 * sailors, animals, living trees, book-birds, the spider, dragons, phoenixes — the duel's
 * capsules (Duel._bodies), the same bodies every spell charge hits.
 */
export function inspiriusBodies(g, skip = null) {
    return g.duel?._bodies ? g.duel._bodies(skip) : [];
}

/** Who and what it touches — and how (CLAUDE.md). «Не действует» is written too, with why. */
export const INSPIRIUS_TARGETS = {
    body: 'шар НЕ проходит сквозь существ: коснувшись тела (игрока, зомби, жителя, моряка, животного, паука, дракона, феникса, ожившего дерева, книги-птицы — их капсулы из Duel._bodies) он взрывается прямо на нём: этому существу −100 и самый сильный отброс',
    me: 'сам волшебник — тоже: взорвать шар рядом с собой — получить −100 (щиты уменьшают, как у других)',
    players: 'все игроки: −100 / −50 / −25 по расстоянию (20 / 40 / 60 м), сбивает с ног и отбрасывает (ближе — дальше); щит «Protection» — половина, купол «Protection Maxima» — четверть; каждый компьютер решает за своего игрока',
    zombies: '−100 / −50 / −25, отбрасывает',
    castlePeople: 'жители, рыцари, король, волшебники: −100 / −50 / −25, отбрасывает; самая сильная опасность — все бегут и прячутся (castleLife.alarm «inspirius»)',
    animals: '−100 / −50 / −25, отбрасывает',
    sailors: 'моряки (ships.crew): −100 / −50 / −25, сбивает с ног, отбрасывает, за борт (в координатах корабля — CreatureImpact)',
    spider: 'гигантский паук: −100 / −50 / −25; слишком тяжёлый, чтобы улететь',
    dragons: 'дракон: −100 / −50 / −25 (это не огонь, а сама магия); только качается',
    iceCastle: 'со свитка: королеве, монстрам и снеговикам −100 / −50 / −25 как всем; снеговиков разбрасывает, большие только качаются',
    blackship: 'со свитка: капитану Чёрные Усы и скелетам −100 / −50 / −25 (скелетов такая сила ломает, как живое дерево); не сбивает и не сбрасывает за борт — держатся на палубе (Sailors.BRACE); сам чёрный корабль — единственное заклинание, против которого его проклятие не держит: пробоины, сломанные мачты, рваные паруса, вред, как любому кораблю (огонь на нём всё равно гаснет — Ships._cursed)',
    phoenixes: 'феникс: −100 / −50 / −25 (не огонь), отбрасывает',
    owls: 'сова: со свитка — убивает; падает перо совы',
    livingTrees: 'ожившее дерево: −100 / −50 / −25 — такая сила ломает и живое дерево (не только огонь)',
    bookBirds: 'книги-птицы сбивает на землю',
    ground: 'огромная яма (глубже к середине), всё построенное до 45 м рушится кольцами вслед за ударной волной, пещеры под ним обваливаются',
    houseSphere: 'сферу «Protection House» ломает сразу (сильнее «Total Destruction»)',
    fire: 'по краю ямы загораются деревья и дома',
    water: 'яма у реки, озера или моря заливается водой; шар, коснувшись воды, взрывается',
    ships: 'шар не пролетает сквозь корабль: взрывается о корпус, палубу, мачту или открытый парус (Ships.segmentHit). Прямое попадание (шар коснулся корабля — и когда корабль сам налетел на шар) — корабль расколот и разнесён в щепки: доски и щепки летят с обоих бортов по всей длине, пробоины на обоих бортах ниже ватерлинии и в палубе, все мачты ломаются и падают за борт, паруса в клочья, пожар — и он сразу идёт ко дну (Ships._inspSplit); паруса вокруг — в клочья; палуба горит; летят доски, щепки, дым. Дальше (до 40 м) — урон, крен и толчок от взрыва, рваные паруса. Решает хост (shipev), видят все',
    items: 'вещи на земле разлетаются',
    shield: 'щит «Protection» шар не останавливает — взрыв за ним всё равно',
};

/** The harm at distance `d` from the blast (0: out of reach). */
export function inspiriusDamage(d) {
    for (const [r, h] of INSP.ZONES) if (d <= r) return h;
    return 0;
}

/** How hard it throws at distance `d`. */
export function inspiriusThrow(d) {
    const k = Math.max(0, 1 - d / INSP.HARM_R);
    return { speed: 6 + 30 * k, toss: 4 + 16 * k };
}

/** How far the shock wave has gone at `t` s. */
export function inspiriusFront(t) {
    return INSP.HARM_R * Math.pow(Math.min(1, Math.max(0, t) / INSP.SHOCK_T), 0.7);
}

/** The sphere of blocks that makes the pit: its centre above the place, its radius. */
export function craterSphere(p) {
    const R = INSP.CRATER_R, D = INSP.CRATER_DEPTH;
    const r = (R * R + D * D) / (2 * D); // (a cap of this sphere: R across, D deep)
    return { x: p.x, y: p.y + r - D, z: p.z, r };
}

/** Why it can't be cast now (null: it can). */
export function inspiriusBlock({ enabled, max, mana, wand, creative }) {
    if (!wand && !creative) return 'wand';
    if (!enabled) return null; // (Creative: no mana rules)
    if ((max || 30) < INSP.MIN_MAX_MANA) return 'max';
    if ((mana ?? 0) < INSP.COST) return 'mana';
    return null;
}

const BLUE = 0x8fd8ff;
const WHITE = 0xf2fbff;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const r3 = (v) => Math.round(v * 1000) / 1000;

const ORB_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
}`;
// an alive, crackling light: veins of lightning run over it
const ORB_FS = `
uniform float uT; uniform float uA; uniform vec3 uC; uniform vec3 uC2;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    vec3 q = normalize(vP) * 3.0;
    float n = n3(q + vec3(uT * 2.1, -uT * 1.3, uT * 1.7)) * 0.6 + n3(q * 2.3 - vec3(uT * 3.0)) * 0.4;
    float veins = pow(1.0 - abs(n - 0.5) * 2.0, 14.0);
    float k = rim * 0.8 + veins * 1.4;
    gl_FragColor = vec4(mix(uC, uC2, veins) * (0.7 + k), clamp(k, 0.0, 1.0) * uA);
}`;

/** A jagged bolt from `a` to `b` (into a Float32Array of n+1 points). */
function bolt(arr, a, b, n, jag) {
    for (let i = 0; i <= n; i++) {
        const s = i / n, j = i === 0 || i === n ? 0 : jag;
        arr[i * 3] = a.x + (b.x - a.x) * s + (Math.random() - 0.5) * j;
        arr[i * 3 + 1] = a.y + (b.y - a.y) * s + (Math.random() - 0.5) * j;
        arr[i * 3 + 2] = a.z + (b.z - a.z) * s + (Math.random() - 0.5) * j;
    }
}

export class Inspirius {
    constructor(game) {
        this.game = game;
        this.orbs = []; // balls flying (mine and others')
        this.blasts = []; // bursts going on
        this._sendT = 0;
    }

    /** Is a ball of mine still flying (one at a time)? */
    get busy() { return this.orbs.some((o) => o.mine); }

    /** The hand with the wand (in Creative also the raised hand). */
    _castSide() {
        const g = this.game;
        const w = g.items?.heldOf?.('wand');
        if (w) return w.side;
        if (!this._creative()) return null;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        for (const s of [pref, pref === 'right' ? 'left' : 'right']) if (ch.isArmRaised?.(s)) return s;
        return pref;
    }

    _creative() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    /**
     * The words heard (the whole phrase): the ball flies out of the wand.
     * @returns {string|null}
     */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        const hint = (t) => { if (isFinal) g.hud?.setVoice(t, true); return null; };
        if (this.busy || !isFinal) return null; // (500 mana: only the whole, final phrase)
        const c = g.combat;
        const side = this._castSide();
        const why = inspiriusBlock({ enabled: !!c?.enabled, max: c?.maxFatigue, mana: c?.fatigue, wand: !!side, creative: this._creative() });
        if (why === 'wand') return hint('🪄 «Inspirius» вызывается только <b>волшебной палочкой в руке</b> — направьте на неё всю силу');
        if (why === 'max') return hint(`⚡ «Inspirius» подвластен только величайшим магам: нужен <b>максимум маны ${INSP.MIN_MAX_MANA}</b> (у вас ${Math.floor(c.maxFatigue || 30)})`);
        const tired = c?.check(INSP.NAME);
        if (tired) { g.hud?.setVoice(tired, true); return null; }
        c?.pay(INSP.NAME);
        const o = g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side);
        const d = (ch.getPointingDirection ? ch.getPointingDirection(side) : ch.getHandDirection(side)).clone().normalize();
        const orb = this._launch(o, d, g.localId, true, side);
        g.sync?.inspirius?.({ e: 'go', o: [r3(o.x), r3(o.y), r3(o.z)], d: [r3(d.x), r3(d.y), r3(d.z)] });
        g.hud?.setVoice('⚡ <b>Inspirius!</b> Шар летит, куда смотрит палочка — ведите его рукой', true);
        return orb ? INSP.NAME : null;
    }

    _launch(o, d, by, mine, side = null) {
        const g = this.game;
        const orb = { by, mine, side, p: o.clone(), d: d.clone().normalize(), t: 0, net: null, gone: false };
        this._buildOrb(orb);
        this.orbs.push(orb);
        g.fx?.lightFlash?.(o, BLUE, 12, 0.6, 60);
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, mine ? 0.7 : 0.2);
        g.sound?.playInspiriusCast?.(o, g.character?.group.position);
        if (g.authority) g.castleLife?.alarm(o, 'inspirius', by, 20); // (something terrible is coming)
        return orb;
    }

    // =========================================================== the network
    /** Another player's ball: launched, where it is, where it burst. */
    onNet(m) {
        const g = this.game;
        if (m.by === g.localId) return;
        const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
        if (m.e === 'go') { g.voiceGate?.noteRemote?.(INSP.NAME, performance.now()); this._launch(v(m.o), v(m.d), m.by, false); return; }
        const orb = this.orbs.find((o) => o.by === m.by && !o.mine);
        if (m.e === 'at') { if (orb) orb.net = { p: v(m.p), d: v(m.d), t: 0 }; return; }
        if (m.e === 'boom') { if (orb) this._dropOrb(orb); this.explode(v(m.p), m.by); }
    }

    // =========================================================== every frame
    update(dt) {
        dt = Math.min(dt, 0.05);
        this._warmT = (this._warmT || 0) + dt;
        if (!this._warmed && this._warmT > 1.5) this._warm();
        else if (this._warmed && !this._soundsReady && this._warmT > 3) this._soundsReady = this.game.sound?.prepareInspirius?.() ?? true; // (its sounds made early too, one a frame)
        for (const o of [...this.orbs]) this._fly(o, dt);
        for (const b of [...this.blasts]) this._blast(b, dt);
    }

    _fly(o, dt) {
        const g = this.game;
        o.t += dt;
        const prev = _a.copy(o.p);
        if (o.mine) {
            // the wand steers it: while it points, the ball turns towards where it points
            const w = g.items?.heldOf?.('wand');
            const side = w?.side || (this._creative() ? o.side : null);
            if (side && g.character) {
                const want = (g.character.getPointingDirection ? g.character.getPointingDirection(side) : g.character.getHandDirection(side)).clone().normalize();
                const ang = o.d.angleTo(want);
                if (ang > 1e-3) o.d.lerp(want, Math.min(1, INSP.STEER * dt / ang)).normalize();
            }
            o.p.addScaledVector(o.d, INSP.SPEED * dt);
            const hit = this._touch(prev, o.p, o);
            this._sendT -= dt;
            if (this._sendT <= 0 && !hit) { this._sendT = 0.1; g.sync?.inspirius?.({ e: 'at', p: [r3(o.p.x), r3(o.p.y), r3(o.p.z)], d: [r3(o.d.x), r3(o.d.y), r3(o.d.z)] }); }
            if (hit || o.t >= INSP.LIFE) {
                const at = hit || o.p.clone();
                this._dropOrb(o);
                g.sync?.inspirius?.({ e: 'boom', p: [r3(at.x), r3(at.y), r3(at.z)] });
                this.explode(at, o.by);
                return;
            }
        } else {
            // another player's: where he says it is (and on along its way between his messages)
            if (o.net) {
                o.net.t += dt;
                _b.copy(o.net.p).addScaledVector(o.net.d, INSP.SPEED * o.net.t);
                o.p.lerp(_b, Math.min(1, dt * 10));
                o.d.copy(o.net.d);
            } else o.p.addScaledVector(o.d, INSP.SPEED * dt);
            if (o.t > INSP.LIFE + 3) this._dropOrb(o); // (its burst never came: gone)
        }
        this._orbLook(o, dt, prev);
    }

    /**
     * Did the ball touch anything between `a` and `b`? The first thing on its way: the ground, a
     * wall, a tree, water, a ship (its hull, deck, a mast or a sail — Ships.segmentHit) or a body
     * (every creature and player as its capsule — Duel._bodies; never through one: it bursts on it).
     * @returns the point, or null
     */
    _touch(a, b, o) {
        const g = this.game;
        const seg = _v.subVectors(b, a), len = seg.length();
        if (len < 1e-6) return null;
        const dir = seg.clone().divideScalar(len);
        // a house's sphere of protection: it bursts on it
        const ward = g.wards?.segmentHit?.(a, b);
        if (ward) return ward;
        let best = 2; // (0…1 along a→b)
        // the ground, a wall, a tree, a roof
        const T = g.world?.terrain;
        const hit = T?.raycast?.(a, dir, len + 0.3);
        if (hit) best = Math.min(1, Math.hypot(hit.x - a.x, hit.y - a.y, hit.z - a.z) / len);
        // water
        const data = T?.data;
        if (best > 1 && data && data.get(Math.round(b.x), Math.round(b.y + 1), Math.round(b.z)) === BLOCK.WATER) best = 1;
        // a ship: hull, deck, mast, sail
        const sh = g.ships?.segmentHit?.(a, b);
        if (sh && sh.s < best) best = sh.s;
        // a creature or a player: it does not go through a body — it bursts on it
        const bodies = inspiriusBodies(g, o?.mine ? g.duel?.me : o?.by);
        const c = {};
        for (const body of bodies) {
            segmentToSegment(a, b, body.a, body.b, c);
            const R = body.r + INSP.ORB_R;
            if (c.dist > R) continue;
            const s0 = Math.max(0, c.s - Math.sqrt(R * R - c.dist * c.dist) / len); // (where it first touches it)
            if (s0 < best) best = s0;
        }
        if (best <= 1) return new THREE.Vector3().copy(a).addScaledVector(seg, best);
        // the ground under it as the flat world knows it (no terrain: a map)
        const gy = g.collision?.surfaceY?.(b.x, b.z);
        if (!T && gy != null && b.y <= gy + 0.2) return new THREE.Vector3(b.x, gy, b.z);
        return null;
    }

    // =========================================================== the burst
    /** The ball burst at `p` (mine, or another player's from the network). Every computer. */
    explode(p, by) {
        const g = this.game;
        p = p.clone();
        // (the Gods' temple: the blast stops on its golden ward — seen and heard, nothing breaks, nobody flies)
        if (g.temple?.wards?.(p, INSP.RUIN_R)) { g.temple.wardHit(p, INSP.RUIN_R); g.sound?.playExplosion?.(p, g.character?.group.position, 1); return; }
        const me = g.character?.group.position;
        // a house's sphere of protection breaks at once (the host decides)
        g.wards?.struck?.(p, INSP.RUIN_R, INSP.NAME, by);
        // the pit
        let blocks = [];
        if (g.world?.destructible) {
            const S = craterSphere(p);
            const c = new THREE.Vector3(S.x, S.y, S.z);
            const keep = g.wards?.keepFor(c, S.r) || [];
            const out = g.world.explode(c, S.r, keepIn(keep));
            g.explosions?.push({ p: [r3(c.x), r3(c.y), r3(c.z)], r: S.r, ...(keep.length ? { k: keep } : {}) }); // (saves, late joiners)
            for (const f of out.falls || []) g.falling?.add(f);
            g.wreck?.afterBlast?.(p, INSP.CRATER_R, 99);
            blocks = out.blocks || [];
            if (g.authority) {
                let wrecked = 0;
                for (const b of blocks) if (isCastleBlock(b.type)) wrecked++;
                g.castleLife?.damaged(p, by, wrecked, true, { r: INSP.RUIN_R, kind: 'inspirius' });
            }
            const debris = [];
            for (const b of blocks) debris.push({ x: b.x, y: b.y, z: b.z, color: b.type === BLOCK.GRASS ? 0x4caf50 : BASE_COLORS[b.type] ?? 0x7a6a58 });
            for (const q of out.props || []) debris.push(q);
            g.fx?.debrisFrom?.(debris, p, 260); // (capped: the pool and the frame)
        }
        g.water?.explode?.(p, INSP.CRATER_R);
        // fires round the rim (the same places on every computer)
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2 + ((Math.abs(Math.round(p.x * 7 + p.z * 13)) % 97) / 97);
            const r = INSP.CRATER_R + 2 + (i % 4) * 5;
            g.fire?.ignite?.(_v.set(p.x + Math.cos(a) * r, p.y + 1, p.z + Math.sin(a) * r), 3);
        }
        if (g.authority) {
            g.castleLife?.alarm(p, 'inspirius', by, INSP.HARM_R); // (the strongest danger there is)
            g.dragons?.noise?.(p, by);
        }
        g.ships?.shock?.(p, by); // (every computer: rocked, the wood torn out; the host — holes, masts, sails)
        g.books?.hitAt?.(p, INSP.RUIN_R, by);
        g.crystals?.hitAt?.(p, INSP.RUIN_R, by, INSP.NAME); // (mana crystals crack: their power to the caster — the host decides)
        g.houses?.hitAt?.(p, INSP.RUIN_R);
        g.boards?.blast?.(p, INSP.RUIN_R * 0.5, 9);
        g.cauldrons?.blast?.(p, INSP.RUIN_R * 0.5, 9);
        const b = { p, by, t: 0, front: 0, band: INSP.CRATER_R * 0.8, hit: new Set(), meDone: false, harmT: 0 };
        this._buildBlast(b);
        this.blasts.push(b);
        g.sound?.playInspiriusBlast?.(p, me);
        if (by === g.localId) g.mana?.success?.(INSP.NAME);
        return b;
    }

    _blast(b, dt) {
        const g = this.game, p = b.p;
        b.t += dt;
        b.front = inspiriusFront(b.t);
        // the ground: band after band behind the shock wave (one a frame)
        if (b.band < INSP.RUIN_R && b.front >= Math.min(INSP.RUIN_R, b.band + INSP.BAND)) {
            const r1 = Math.min(INSP.RUIN_R, b.band + INSP.BAND);
            ruinBand(g, p, b.band, r1, INSP.RUIN_R, b.by, 'inspirius');
            b.band = r1;
        }
        // me (every computer its own player — the caster too)
        if (!b.meDone && g.character) {
            const me = g.character.group.position;
            const dist = _v.set(me.x - p.x, me.y - 1 - p.y, me.z - p.z).length();
            if (dist > INSP.HARM_R) { if (b.front >= INSP.HARM_R) b.meDone = true; }
            else if (dist <= b.front) { b.meDone = true; this._hurtMe(b, dist, me); }
        }
        // the creatures (the host)
        b.harmT -= dt;
        if (g.authority && (b.harmT <= 0 || b.front >= INSP.HARM_R) && b.t < INSP.SHOCK_T + 0.5) {
            b.harmT = 0.05;
            eachBody(g, (kind, c, q) => {
                if (b.hit.has(c)) return;
                const dist = q.distanceTo(p);
                if (dist > b.front || dist > INSP.HARM_R) return;
                b.hit.add(c);
                if (g.wards?.shields?.(p, q)) return; // (a sphere that still stands)
                const dir = new THREE.Vector3(q.x - p.x, 0, q.z - p.z);
                if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
                dir.normalize();
                hitBody(g, kind, c, q, inspiriusDamage(dist), dir, INSP.NAME, b.by, INSP.NAME);
                const th = inspiriusThrow(dist);
                throwBody(g, kind, c, dir.clone().multiplyScalar(th.speed), th.toss, INSP.NAME, b.by, p);
            });
            for (const w of g.weapons?.weapons || []) {
                if (w.holder || w._insp === b) continue;
                const dist = w.position.distanceTo(p);
                if (dist > b.front || dist > INSP.HARM_R) continue;
                w._insp = b;
                w.hover = null;
                w.wake?.();
                if (!w.remoteTarget) w.velocity.add(_b.subVectors(w.position, p).setY(0).normalize().multiplyScalar(14 * (1 - dist / INSP.HARM_R) + 3).setY(8 + Math.random() * 6));
            }
        }
        this._blastLook(b, dt);
        if (b.t > 6) this._endBlast(b);
    }

    _hurtMe(b, dist, me) {
        const g = this.game;
        if (g.isDeadLocal) return;
        if (g.wards?.shields?.(b.p, me)) return;
        const th = inspiriusThrow(dist);
        if (!g.flight?.active) {
            _v.set(me.x - b.p.x, 0, me.z - b.p.z);
            if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
            g.impact?.apply({ v: _v.normalize().multiplyScalar(th.speed), from: b.p.clone(), by: b.by, spell: INSP.NAME, always: { down: 5 }, toss: th.toss, jolt: 5, down: 5 });
        }
        let dmg = inspiriusDamage(dist);
        const c = g.combat, s = c?.shield;
        if (s && s.left > 0) dmg *= s.type === 2 ? 0.25 : 0.5;
        dmg = Math.round(dmg);
        if (dmg <= 0 || g.config?.mode === 'creative') return;
        if (c?.enabled) c.damage(dmg, b.by === g.localId ? null : b.by, INSP.NAME);
        else g.damageLocalPlayer?.(dmg);
    }

    /**
     * Its looks are built once early in the game, off screen, and their shaders compiled then —
     * the first cast must not stop the game for a moment while they compile. (They are kept, so
     * the compiled programs stay for every cast after.)
     */
    _warm() {
        const g = this.game;
        this._warmed = true;
        if (!g.renderer?.compile || !g.camera || !g.scene) return;
        const scene = g.scene, fx = g.fx, tmp = new THREE.Scene();
        tmp.fog = scene.fog; // (the same programs as in the world: with its fog)
        try {
            g.scene = tmp; g.fx = null;
            this._buildOrb({ p: new THREE.Vector3(), t: 0 });
            this._buildBlast({ p: new THREE.Vector3(), t: 0, front: 0 });
            g.renderer.compile(tmp, g.camera);
        } catch (e) { /* (only a head start) */ } finally { g.scene = scene; g.fx = fx; }
        this._warmKeep = tmp;
    }

    // =========================================================== the look of the ball
    _buildOrb(o) {
        const g = this.game;
        if (!g.scene) return;
        const grp = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
        grp.add(core);
        const skinMat = new THREE.ShaderMaterial({
            vertexShader: ORB_VS, fragmentShader: ORB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { uT: { value: 0 }, uA: { value: 1 }, uC: { value: new THREE.Color(0x3d7dff) }, uC2: { value: new THREE.Color(0xe8fbff) } },
        });
        const skin = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 20), skinMat);
        grp.add(skin);
        const haloMat = new THREE.ShaderMaterial({
            vertexShader: ORB_VS, fragmentShader: ORB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
            uniforms: { uT: { value: 0 }, uA: { value: 0.45 }, uC: { value: new THREE.Color(0x6a5cff) }, uC2: { value: new THREE.Color(BLUE) } },
        });
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), haloMat);
        grp.add(halo);
        // little lightnings jumping off it
        const arcs = [];
        const arcMat = new THREE.LineBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        for (let i = 0; i < 6; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
            const line = new THREE.Line(geo, arcMat);
            line.frustumCulled = false;
            grp.add(line);
            arcs.push(line);
        }
        grp.position.copy(o.p);
        g.scene.add(grp);
        o.look = { grp, core, skin, skinMat, halo, haloMat, arcs, arcMat, arcT: 0 }; // (its light: the game's one flash light — a new light makes every material rebuild)
    }

    _orbLook(o, dt, prev) {
        const g = this.game, L = o.look;
        if (!L) return;
        L.grp.position.copy(o.p);
        L.skinMat.uniforms.uT.value = o.t;
        L.haloMat.uniforms.uT.value = o.t * 0.7;
        const pulse = 1 + 0.12 * Math.sin(o.t * 23) + 0.06 * Math.sin(o.t * 37);
        L.skin.scale.setScalar(pulse);
        L.halo.scale.setScalar(1 + 0.2 * Math.sin(o.t * 5));
        L.core.scale.setScalar(0.85 + Math.random() * 0.3);
        g.fx?.lightFlash?.(o.p, BLUE, 4 + Math.random() * 3, 0.15, 30);
        L.arcT -= dt;
        if (L.arcT <= 0) {
            L.arcT = 0.045;
            for (const line of L.arcs) {
                const arr = line.geometry.attributes.position.array;
                _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                const a = _v.copy(_b).multiplyScalar(0.3);
                const e = _b.multiplyScalar(0.9 + Math.random() * 1.4).add(_v.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
                bolt(arr, a.clone(), e, 8, 0.35);
                line.geometry.attributes.position.needsUpdate = true;
                line.visible = Math.random() < 0.8;
            }
        }
        // its trail: sparks of light left behind
        const fx = g.fx;
        if (fx?.glow) for (let i = 0; i < 3; i++) {
            const s = Math.random();
            fx.glow.spawn(prev.x + (o.p.x - prev.x) * s + (Math.random() - 0.5) * 0.5, prev.y + (o.p.y - prev.y) * s + (Math.random() - 0.5) * 0.5, prev.z + (o.p.z - prev.z) * s + (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, Math.random() < 0.5 ? BLUE : WHITE, 0.15 + Math.random() * 0.25, 0.4 + Math.random() * 0.4, { shrink: 1 });
        }
        // the hum and crackle as it goes by
        if (o.t > (o.zapT || 0)) { o.zapT = o.t + 0.25 + Math.random() * 0.3; g.sound?.playInspiriusZap?.(o.p); }
    }

    _dropOrb(o) {
        if (o.gone) return;
        o.gone = true;
        const L = o.look;
        if (L) {
            this.game.scene?.remove(L.grp);
            L.grp.traverse((x) => { if (x.geometry) x.geometry.dispose(); });
            for (const m of [L.core.material, L.skinMat, L.haloMat, L.arcMat]) m.dispose();
            o.look = null;
        }
        const i = this.orbs.indexOf(o);
        if (i >= 0) this.orbs.splice(i, 1);
    }

    // =========================================================== the look of the burst
    _buildBlast(b) {
        const g = this.game, p = b.p;
        const fx = g.fx;
        if (fx) {
            fx.lightFlash?.(p, WHITE, 40, 1.4, 500);
            fx.explosion?.(p, 14, 9);
            const me = g.character?.group.position;
            const dist = me ? me.distanceTo(p) : 0;
            fx.shake = Math.max(fx.shake || 0, Math.max(0.4, 3.2 - dist / 70));
            // a burst of electric sparks every way
            for (let i = 0; i < 160; i++) {
                const a = Math.random() * Math.PI * 2, c = Math.acos(2 * Math.random() - 1), sp = 10 + Math.random() * 40;
                fx.glow?.spawn(p.x, p.y + 1, p.z, Math.sin(c) * Math.cos(a) * sp, Math.abs(Math.cos(c)) * sp * 0.8 + 3, Math.sin(c) * Math.sin(a) * sp,
                    [WHITE, BLUE, 0x6a5cff, 0xffe9a0][i % 4], 0.5 + Math.random() * 1.2, 0.6 + Math.random() * 0.9, { shrink: 0.9, spin: 6 });
            }
        }
        if (!g.scene) return;
        const grp = new THREE.Group();
        grp.position.copy(p);
        // the core: a sun of white-blue light
        const coreMat = new THREE.ShaderMaterial({
            vertexShader: ORB_VS, fragmentShader: ORB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { uT: { value: 0 }, uA: { value: 1 }, uC: { value: new THREE.Color(0x9fd0ff) }, uC2: { value: new THREE.Color(0xffffff) } },
        });
        const core = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 28), coreMat);
        grp.add(core);
        const ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), ballMat);
        grp.add(ball);
        // the fireball after the light
        const fireMat = new THREE.ShaderMaterial({
            vertexShader: ORB_VS, fragmentShader: ORB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC: { value: new THREE.Color(0xff6a1a) }, uC2: { value: new THREE.Color(0xffe080) } },
        });
        const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), fireMat);
        grp.add(fire);
        // the shock wave: a ring along the ground and a thin shell of air
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 160), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.6;
        grp.add(ring);
        const shellMat = new THREE.ShaderMaterial({
            vertexShader: ORB_VS, fragmentShader: ORB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { uT: { value: 0 }, uA: { value: 0.5 }, uC: { value: new THREE.Color(0x4a7dff) }, uC2: { value: new THREE.Color(0xcff4ff) } },
        });
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), shellMat);
        grp.add(shell);
        // a pillar of light into the sky
        const pillarMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const pg = new THREE.CylinderGeometry(1, 1.6, 1, 24, 1, true);
        pg.translate(0, 0.5, 0);
        const pillar = new THREE.Mesh(pg, pillarMat);
        grp.add(pillar);
        // lightnings bursting out of it
        const arcMat = new THREE.LineBasicMaterial({ color: 0xd6f6ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
        const arcs = [];
        for (let i = 0; i < 16; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(13 * 3), 3));
            const line = new THREE.Line(geo, arcMat);
            line.frustumCulled = false;
            grp.add(line);
            arcs.push({ line, dir: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize(), len: 12 + Math.random() * 26 });
        }
        g.scene.add(grp);
        b.look = { grp, core, coreMat, ball, ballMat, fire, fireMat, ring, ringMat, shell, shellMat, pillar, pillarMat, arcs, arcMat, arcT: 0 };
    }

    _blastLook(b, dt) {
        const g = this.game, L = b.look, t = b.t, p = b.p;
        if (L) {
            // the light: blinding at once, then it swells and fades
            const kc = Math.min(1, t / 0.45);
            L.ball.scale.setScalar(2 + 20 * Math.sqrt(kc));
            L.ballMat.opacity = Math.max(0, 1 - t / 0.7);
            L.core.scale.setScalar(4 + 22 * Math.sqrt(Math.min(1, t / 0.8)));
            L.coreMat.uniforms.uT.value = t * 2;
            L.coreMat.uniforms.uA.value = Math.max(0, 1 - t / 1.8);
            // the fire after it: a great ball rising and cooling
            const kf = Math.min(1, t / 1.5);
            L.fire.scale.setScalar(6 + 24 * kf);
            L.fire.position.y = 4 + 18 * Math.max(0, t - 0.4) / 4;
            L.fireMat.uniforms.uT.value = t;
            L.fireMat.uniforms.uA.value = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 3.5);
            // the shock wave
            L.ring.scale.setScalar(Math.max(1, b.front * 1.05));
            L.ringMat.opacity = Math.max(0, 1 - t / (INSP.SHOCK_T + 0.8));
            L.shell.scale.setScalar(Math.max(1, b.front));
            L.shellMat.uniforms.uT.value = t * 3;
            L.shellMat.uniforms.uA.value = 0.55 * Math.max(0, 1 - t / (INSP.SHOCK_T + 0.3));
            // the pillar of light
            L.pillar.scale.set(3 + 6 * Math.min(1, t / 0.3) - 4 * Math.min(1, t / 3), 30 + 220 * Math.min(1, t / 0.5), 3 + 6 * Math.min(1, t / 0.3) - 4 * Math.min(1, t / 3));
            L.pillarMat.opacity = 0.9 * Math.max(0, 1 - t / 3.2);
            if (t < 2.5) g.fx?.lightFlash?.(_a.set(p.x, p.y + 6, p.z), 0xcfe8ff, 40 * (1 - t / 2.5) * (0.85 + Math.random() * 0.3), 0.15, 260); // (the one flash light)
            // the lightnings jump about while the light lasts
            L.arcT -= dt;
            if (L.arcT <= 0 && t < 2.2) {
                L.arcT = 0.05;
                for (const a of L.arcs) {
                    a.dir.add(_b.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4)).normalize();
                    const start = _v.copy(a.dir).multiplyScalar(2);
                    const end = a.dir.clone().multiplyScalar(a.len * (0.6 + 0.4 * Math.min(1, t / 0.5)));
                    bolt(a.line.geometry.attributes.position.array, start.clone(), end, 12, 3.2);
                    a.line.geometry.attributes.position.needsUpdate = true;
                    a.line.visible = Math.random() < 0.85;
                }
            }
            L.arcMat.opacity = Math.max(0, 1 - t / 2.2);
        }
        const fx = g.fx;
        if (!fx) return;
        // the dust and the earth thrown up where the shock wave runs
        if (b.front < INSP.HARM_R) {
            const data = g.world?.terrain?.data;
            for (let i = 0; i < 26; i++) {
                const a = Math.random() * Math.PI * 2, r = b.front;
                const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
                const y = data ? data.topLayer(Math.round(x), Math.round(z)) - 0.5 : p.y;
                if (Math.abs(y - p.y) > 40) continue;
                fx.smoke?.spawn(x, y + 0.5, z, Math.cos(a) * 6, 1.5 + Math.random() * 3, Math.sin(a) * 6, 0x8a7d6c, 1.6 + Math.random() * 2, 2 + Math.random() * 1.5, { shrink: -0.4, spin: 1 });
                if (i % 2) fx.debris?.spawn(x, y + 0.5, z, Math.cos(a) * 5, 6 + Math.random() * 8, Math.sin(a) * 5, 0x6b5f52, 0.25 + Math.random() * 0.3, 1.6, { shrink: 0.1, fade: false, spin: 8 });
            }
        }
        // the mushroom: smoke rising in a column and spreading at its top
        if (t > 0.3 && t < 4.5 && Math.random() < dt * 40) {
            const h = Math.min(45, 8 + t * 10);
            for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
                fx.smoke?.spawn(p.x + Math.cos(a) * r, p.y + 2 + Math.random() * h * 0.6, p.z + Math.sin(a) * r, Math.cos(a) * 0.8, 6 + Math.random() * 4, Math.sin(a) * 0.8, [0x5a524c, 0x6e6660, 0x4a4440][i], 3 + Math.random() * 3, 4 + Math.random() * 2, { shrink: -0.35, spin: 1 });
                fx.smoke?.spawn(p.x + Math.cos(a) * r, p.y + h, p.z + Math.sin(a) * r, Math.cos(a) * 5, 0.8, Math.sin(a) * 5, 0x77706a, 4 + Math.random() * 3, 4.5 + Math.random() * 2, { shrink: -0.3, spin: 1 });
            }
        }
    }

    _endBlast(b) {
        const L = b.look;
        if (L) {
            this.game.scene?.remove(L.grp);
            L.grp.traverse((x) => { if (x.geometry) x.geometry.dispose(); });
            for (const m of [L.coreMat, L.ballMat, L.fireMat, L.ringMat, L.shellMat, L.pillarMat, L.arcMat]) m.dispose();
            b.look = null;
        }
        const i = this.blasts.indexOf(b);
        if (i >= 0) this.blasts.splice(i, 1);
    }

    /** Everything going on ends now (a new world, the game ends). */
    clear() {
        for (const o of [...this.orbs]) this._dropOrb(o);
        for (const b of [...this.blasts]) this._endBlast(b);
    }
}
