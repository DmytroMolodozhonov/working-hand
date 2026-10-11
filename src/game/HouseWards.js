/**
 * HouseWards.js — the shield magic of a HOUSE (learned only from the book of protection, the
 * dark-blue book-bird — BookBirds.js; in Creative everybody knows it).
 *
 *   «Protection House»        point the hand (the wand) at a house and say it: −20 mana, a faint
 *                             sphere of protection appears round the house (2.5 m). Now every
 *                             «Максима» (−5 mana) makes it 1.5 m wider — the wizard watches it take
 *                             in the whole house and says «стоп» (free). No mana left: it stays as
 *                             big as it grew. One sphere per house; its owner is the caster.
 *   «Protection Invisible»    on a house that already has its sphere (aimed at it, −15 mana): from
 *                             farther than ~6 m the house and everything inside the sphere is not
 *                             seen — only the land going on, grass as round it; coming closer it
 *                             shows little by little and is all there from ~3 m. For every player.
 *   «Protection House Grant»  by (or in) your protected house, aim at a player (−5 mana): that player
 *                             may come in and go out freely, like the owner.
 *
 * What the sphere does — for EVERY kind (CLAUDE.md «на кого и на что»):
 *   - players: me (my computer pushes my body back out at the surface) and the others (theirs do)
 *     — except the owner and the granted ones, who pass both ways;
 *   - creatures (host): zombies, villagers / knights / the king / wizards, animals (pigs with wings
 *     too), sailors, living trees, the giant spider, servants (a servant of the owner or of a granted
 *     player comes in with its master) — softly pushed back out; book-birds fly over it as they like
 *     (they never come into houses);
 *   - spells from outside stop at it (a flash and the hex pattern where they touch): duel charges
 *     (Авада, Остолбеней, Сапира, Айс, Даст, Экспеллиармус…), rays (Сапира, Тандервейв, Вайнд,
 *     Overgrown, Бомбардо…), the Инферно flame, lightning, arrows, thrown water / ice balls bounce,
 *     pushes (Вайнд, waves, blasts) don't reach the bodies inside, blasts (Бомбардо, cannon balls)
 *     don't eat into the blocks inside, fire doesn't catch inside, «Total Destruction» leaves what
 *     is inside standing, an earthquake's crack stops at it;
 *   - what is cast from inside goes out freely (the defenders may shoot);
 *   - only very strong magic wears it down: «Бомбардо Максима» −15, «Lightning Strike» −20, «Total
 *     Destruction» −40 (Максима −60), «Let the Hellfire Come» −4 a burn. 100 strength: it breaks
 *     (the owner may cast it again). Nothing else breaks it.
 * Saved with the world (owner, centre, radius, invisible, granted, strength) and kept by the host:
 * every computer has the same list (the host sends it), guests ask the host to change it.
 */

import * as THREE from 'three';
import { BLOCK, BASE_COLORS, isCastleBlock } from '../world/Terrain.js';
import { applyVoxelDetail, WARD_HIDE } from '../world/VoxelShading.js';
import { KINDS } from './CreatureImpact.js';
import { refusal } from './Hints.js';

export const WARD = {
    COST: 20, // «Protection House»
    MAXIMA: 5, // each «Максима» while it is being set
    START_R: 2.5, // m
    STEP: 1.5, // m a «Максима»
    MAX_R: 24, // m
    AIM: 40, // m: how far a house may be aimed at
    SET_IDLE: 30, // s without «Максима»: it is set by itself
    INVIS_COST: 15,
    GRANT_COST: 5,
    GRANT_NEAR: 5, // m from the sphere: near enough to grant
    SEE_NEAR: 3.5, // m from the sphere: an invisible house is all there
    SEE_FAR: 6.5, // m: … and not seen at all from this far
    HP: 100,
    WEAR: { BombardoMaxima: 15, LightningStrike: 20, TotalDestruction: 40, TotalDestructionMaxima: 60, Hellfire: 4 },
    HIDE_MAX: 8, // invisible houses drawn hidden at once (the nearest)
};

/** The three spells of the book of protection. */
export const WARD_SPELLS = ['ProtectionHouse', 'ProtectionInvisible', 'ProtectionHouseGrant'];
export const WARD_NAMES = { ProtectionHouse: 'Protection House', ProtectionInvisible: 'Protection Invisible', ProtectionHouseGrant: 'Protection House Grant' };
export const isWardSpell = (n) => WARD_SPELLS.includes(n);

/** Mana of a sphere set with `n` «Максима». */
export const wardCost = (n) => WARD.COST + WARD.MAXIMA * Math.max(0, n);
/** Its radius after `n` «Максима». */
export const wardRadius = (n) => Math.min(WARD.MAX_R, WARD.START_R + WARD.STEP * Math.max(0, n));
/** «Максима» needed for a sphere of radius `r`. */
export const maximaFor = (r) => Math.max(0, Math.ceil((r - WARD.START_R) / WARD.STEP - 1e-9));

/** May the one with this key (lasting id) pass through the sphere? The owner and the granted. */
export const mayPass = (w, key) => !!key && (w.owner === key || (w.grant || []).includes(key));

/** Is the point inside the sphere? */
export function inWard(w, p, pad = 0) {
    const dx = p.x - w.c.x, dy = p.y - w.c.y, dz = p.z - w.c.z;
    return dx * dx + dy * dy + dz * dz < (w.r + pad) * (w.r + pad);
}

/**
 * The segment a→b goes INTO the sphere from outside (ends inside it or passes through): where it
 * touches (0..1 along it), else -1. (From inside out: -1 — what is cast inside goes out freely.)
 */
export function crossInto(w, a, b) {
    if (inWard(w, a)) return -1;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const fx = a.x - w.c.x, fy = a.y - w.c.y, fz = a.z - w.c.z;
    const A = dx * dx + dy * dy + dz * dz;
    if (A < 1e-12) return -1;
    const B = 2 * (fx * dx + fy * dy + fz * dz), C = fx * fx + fy * fy + fz * fz - w.r * w.r;
    const D = B * B - 4 * A * C;
    if (D < 0) return -1;
    const s = (-B - Math.sqrt(D)) / (2 * A);
    return s >= 0 && s <= 1 ? s : -1;
}

/**
 * A body (a vertical segment y0..y1 at x, z with radius `rad`) in the sphere: how far to move it
 * out to the surface ({x, y, z, depth}), else null.
 */
export function bodyPush(w, x, y0, y1, z, rad = 0.5) {
    const cy = Math.max(y0, Math.min(y1, w.c.y));
    let dx = x - w.c.x, dy = cy - w.c.y, dz = z - w.c.z;
    let d = Math.hypot(dx, dy, dz);
    const lim = w.r + rad;
    if (d >= lim) return null;
    if (d < 1e-4) { dx = 1; dy = 0; dz = 0; d = 1; }
    const k = (lim - d) / d;
    return { x: dx * k, y: dy * k, z: dz * k, depth: lim - d };
}

/** How much of an invisible house is seen from `p` (1: all of it, 0: nothing — only the land). */
export function seenK(w, p) {
    if (!w.inv) return 1;
    const d = Math.max(0, Math.hypot(p.x - w.c.x, p.y - w.c.y, p.z - w.c.z) - w.r);
    if (d <= WARD.SEE_NEAR) return 1;
    if (d >= WARD.SEE_FAR) return 0;
    const t = (WARD.SEE_FAR - d) / (WARD.SEE_FAR - WARD.SEE_NEAR);
    return t * t * (3 - 2 * t);
}

/** A house's centre and the radius that takes it in, from its blocks [x, L, z] (centre y = L − 1). */
export function houseBounds(cells) {
    if (!cells.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, L, z] of cells) {
        x0 = Math.min(x0, x - 0.5); x1 = Math.max(x1, x + 0.5);
        y0 = Math.min(y0, L - 1.5); y1 = Math.max(y1, L - 0.5);
        z0 = Math.min(z0, z - 0.5); z1 = Math.max(z1, z + 0.5);
    }
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    return { c, r: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 };
}

/** A block (centre x, y, z) inside one of the spheres [[x, y, z, r], …]? (y = null: the column x, z under / over it) */
export function keepIn(spheres) {
    if (!spheres || !spheres.length) return null;
    return (x, y, z) => spheres.some((s) => (x - s[0]) ** 2 + (y == null ? 0 : (y - s[1]) ** 2) + (z - s[2]) ** 2 < s[3] * s[3]);
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------------------ the look of the sphere
const DOME_VS = `
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DOME_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform vec4 uFlash; uniform float uSet;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.866)), p.x); }
float hexEdge(vec2 uv) {
    vec2 r = vec2(1.0, 1.732), h = r * 0.5;
    vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    return smoothstep(0.43, 0.5, hexDist(gv));
}
void main() {
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.5);
    vec3 n = normalize(vL);
    vec2 uv = vec2(atan(n.z, n.x) * 6.0, asin(clamp(n.y, -1.0, 1.0)) * 6.0);
    float hx = hexEdge(uv * 1.2);
    float shimmer = 0.5 + 0.5 * sin(uTime * 1.7 + vW.y * 1.3 + vW.x * 0.7);
    float f = 0.0;
    if (uFlash.w > 0.0) f = uFlash.w * smoothstep(3.0, 0.0, distance(vW, uFlash.xyz));
    float a = uAlpha * (0.05 + rim * 0.45 + shimmer * 0.04) + hx * (0.05 * uSet + 0.6 * f) + f * 0.25;
    gl_FragColor = vec4(uColor * (1.0 + f * 1.5), clamp(a, 0.0, 0.9));
}`;

export class HouseWards {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> ward {id, owner, ownerName, c, r, n, inv, grant, grantNames, hp, gy, setting, ids}
        this.looks = new Map(); // id -> {dome, disc, k, flash}
        this.setting = null; // my house being set: {id, idle}
        this._t = 0;
        this._scanT = 0;
        this._hidden = new Map(); // object -> its own visible before it was hidden
        this._nextId = 1;
        this._domeGeo = new THREE.SphereGeometry(1, 48, 24);
        this.log = []; // (tests) what happened
    }

    get auth() { return this.game.authority !== false; }

    // ------------------------------------------------------------ who is who
    /** A player's lasting key (their browser's id, else their name): the same in every session. */
    keyOf(peerId) {
        const g = this.game, net = g.net;
        if (!net || !net.active || peerId === g.localId || peerId === 'local') return net?.pid || 'local';
        const p = net.players?.get(peerId);
        return p?.pid || (p ? 'n:' + p.name : 'peer:' + peerId);
    }

    get myKey() { return this.keyOf(this.game.localId); }

    /** May I pass through this sphere? */
    mine(w) {
        const g = this.game;
        return mayPass(w, this.myKey) || (!!w.ids && w.ids.includes(g.localId));
    }

    /** The peers of this session that may pass (the host works it out: guests don't know the keys). */
    _ids(w) {
        const g = this.game, net = g.net;
        const out = [];
        if (mayPass(w, this.keyOf(g.localId))) out.push(g.localId);
        if (net?.active) for (const id of net.players?.keys() || []) if (id !== g.localId && mayPass(w, this.keyOf(id))) out.push(id);
        return out;
    }

    /** A creature's way in: a servant comes in with its master. */
    _creatureMay(w, c) {
        const m = c.servantOf ?? c.master ?? null;
        return m != null && mayPass(w, this.keyOf(m));
    }

    // ------------------------------------------------------------ aim
    _hand() {
        const g = this.game, ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = g.wandSide?.() || (ch.isArmRaised?.(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised?.(s))) || null;
        if (!side) return null;
        const o = g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side, new THREE.Vector3());
        return { side, o: o.clone ? o.clone() : o, d: ch.getHandDirection(side, new THREE.Vector3()) };
    }

    /** The first sphere the ray goes into (or the one I stand in): {w, t}. */
    _wardOnRay(o, d, max = WARD.AIM) {
        let best = null;
        for (const w of this.list.values()) {
            if (inWard(w, o)) return { w, t: 0 };
            const fx = o.x - w.c.x, fy = o.y - w.c.y, fz = o.z - w.c.z;
            const b = fx * d.x + fy * d.y + fz * d.z, c = fx * fx + fy * fy + fz * fz - w.r * w.r;
            const D = b * b - c;
            if (D < 0) continue;
            const t = -b - Math.sqrt(D);
            if (t < 0 || t > max || (best && t > best.t)) continue;
            best = { w, t };
        }
        return best;
    }

    /** The built blocks of the house the ray hits (≤ AIM m): its centre and size, or a reason why not. */
    _aimHouse(o, d) {
        const data = this.game.terrain?.data;
        if (!data) return { why: 'noHouse' };
        const hit = data.raycast(o, d, WARD.AIM);
        if (!hit) return { why: 'noHouse' };
        const p = _v1.set(hit.x + d.x * 0.05, hit.y + d.y * 0.05, hit.z + d.z * 0.05);
        const start = [Math.round(p.x), Math.floor(p.y + 1.5), Math.round(p.z)];
        const built = this._builtSet();
        const isBuilt = (x, L, z) => { const t = data.get(x, L, z); return t !== BLOCK.AIR && t !== BLOCK.WATER && (built.has(x + ',' + L + ',' + z) || isCastleBlock(t)); };
        if (!isBuilt(...start)) return { why: 'noHouse', at: hit };
        // the house: the built blocks joined to this one (not farther than the biggest sphere)
        const seen = new Set([start.join(',')]);
        const out = [start];
        for (let i = 0; i < out.length && out.length < 4000; i++) {
            const [x, L, z] = out[i];
            for (const [dx, dL, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const nx = x + dx, nL = L + dL, nz = z + dz, k = nx + ',' + nL + ',' + nz;
                if (seen.has(k)) continue;
                seen.add(k);
                if (Math.hypot(nx - start[0], nz - start[2]) > WARD.MAX_R * 1.6 || !isBuilt(nx, nL, nz)) continue;
                out.push([nx, nL, nz]);
            }
        }
        return { house: houseBounds(out), cells: out.length, at: hit };
    }

    /** Blocks the players built (the world's own houses count by their kind of stone). */
    _builtSet() {
        const s = new Set();
        for (const e of this.game.blockEdits || []) {
            const k = e[0] + ',' + e[1] + ',' + e[2];
            if (e[3]) s.add(k); else s.delete(k);
        }
        return s;
    }

    /** The natural ground round the sphere: the top of its blocks (the land the hidden house becomes). */
    _groundY(c, r) {
        const data = this.game.terrain?.data;
        if (!data) return c.y - r * 0.5;
        const ys = [], types = [];
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const x = Math.round(c.x + Math.cos(a) * (r + 1.5)), z = Math.round(c.z + Math.sin(a) * (r + 1.5));
            const L = data.topLayer(x, z);
            ys.push(L - 0.5);
            types.push(data.get(x, L, z));
        }
        ys.sort((a, b) => a - b);
        const count = new Map();
        for (const t of types) count.set(t, (count.get(t) || 0) + 1);
        this._groundType = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? BLOCK.GRASS;
        return ys[ys.length >> 1];
    }

    // ------------------------------------------------------------ casting
    /** A hint why it did not work (Hints.refusal code, or the text itself) — once in a while. */
    _no(code, d = {}) {
        const g = this.game;
        const text = refusal(code, d) || code;
        const gate = this._gate || (this._gate = new Map());
        const now = performance.now();
        if (now - (gate.get(text) || -1e9) < 2000) return null;
        gate.set(text, now);
        g.hud?.setVoice?.(text, true);
        this.log.push({ ev: 'no', text });
        return null;
    }

    /** Mana: enough? (and paid) */
    _pay(name) {
        const c = this.game.combat;
        if (!c) return true;
        const hint = c.check(name);
        if (hint) { this._no(hint); return false; }
        c.pay(name);
        return true;
    }

    /**
     * «Protection House» / «Protection Invisible» / «Protection House Grant».
     * @returns {string|null} the spell when it worked
     */
    cast(name, isFinal = true) {
        if (name === 'ProtectionHouse') return this._castHouse(isFinal);
        if (name === 'ProtectionInvisible') return this._castInvisible(isFinal);
        if (name === 'ProtectionHouseGrant') return this._castGrant(isFinal);
        return null;
    }

    _castHouse() {
        const g = this.game;
        const h = this._hand();
        if (!h) return this._no('wardNoHand', { name: 'Protection House' });
        // a house that already has its sphere: mine — go on making it bigger
        const on = this._wardOnRay(h.o, h.d);
        if (on) {
            if (on.w.owner !== this.myKey) return this._no('wardNotYours', { owner: on.w.ownerName });
            this.setting = { id: on.w.id, idle: 0 };
            this._op({ op: 'set', id: on.w.id, on: true });
            g.hud?.setVoice?.('🛡️ Дом уже под защитой. Кричите «Максима», чтобы расширить сферу, и «стоп», когда хватит', true);
            return 'ProtectionHouse';
        }
        const aim = this._aimHouse(h.o, h.d);
        if (!aim.house) return this._no('wardNoHouse');
        if (!this._pay('ProtectionHouse')) return null;
        const c = aim.house.c;
        const id = (g.localId || 'L') + '-' + Date.now().toString(36) + '-' + (this._nextId++);
        this._op({ op: 'new', id, c: [r2(c.x), r2(c.y), r2(c.z)], name: g.net?.name || 'Игрок' });
        this.setting = { id, idle: 0 };
        const need = maximaFor(aim.house.r);
        g.hud?.setVoice?.(`🛡️ Защита дома поставлена. Кричите «Максима» (−${WARD.MAXIMA} маны каждая), пока сфера не накроет весь дом${need ? ` (примерно ${need} ${need % 10 >= 2 && need % 10 <= 4 && (need % 100 < 12 || need % 100 > 14) ? 'раза' : 'раз'})` : ''}, потом скажите «стоп»`, true);
        g.fx?.lightFlash?.(_v1.set(c.x, c.y, c.z), 0x8fc8ff, 2, 0.5, 20);
        this.log.push({ ev: 'new', id, need });
        return 'ProtectionHouse';
    }

    /** «Максима» while my house's sphere is being set: −5 mana, 1.5 m wider. */
    maxima() {
        const s = this.setting;
        const w = s && this.list.get(s.id);
        if (!w) { this.setting = null; return null; }
        if (w.r >= WARD.MAX_R) return this._no('wardMax', { r: WARD.MAX_R });
        if (!this._pay('WardGrow')) {
            // no mana left: it stays as big as it is
            this._no('wardNoMana', { r: w.r.toFixed(1) });
            this.fix();
            return null;
        }
        s.idle = 0;
        this._op({ op: 'grow', id: w.id });
        this._pulse(w);
        this.log.push({ ev: 'grow', id: w.id });
        return 'WardGrow';
    }

    /** «стоп»: the sphere stays as it is now. */
    fix() {
        const s = this.setting;
        if (!s) return false;
        this.setting = null;
        const w = this.list.get(s.id);
        if (!w) return false;
        this._op({ op: 'set', id: w.id, on: false });
        this.game.hud?.toast?.(`🛡️ Защита дома готова: сфера ${w.r.toFixed(1)} м`, 3000);
        this.log.push({ ev: 'fix', id: w.id, r: w.r });
        return true;
    }

    _castInvisible() {
        const g = this.game;
        const h = this._hand();
        if (!h) return this._no('wardNoHand', { name: 'Protection Invisible' });
        const on = this._wardOnRay(h.o, h.d);
        if (!on) return this._no('wardInvNone');
        if (on.w.owner !== this.myKey) return this._no('wardNotYours', { owner: on.w.ownerName });
        if (on.w.inv) return this._no('wardInvDone');
        if (!this._pay('ProtectionInvisible')) return null;
        this._op({ op: 'inv', id: on.w.id });
        g.hud?.setVoice?.('🫥 Дом скрыт: издалека на его месте видна только земля. Ближе 3–4 м он проступает', true);
        this.log.push({ ev: 'inv', id: on.w.id });
        return 'ProtectionInvisible';
    }

    _castGrant() {
        const g = this.game;
        const me = g.character.group.position;
        const near = [...this.list.values()].filter((w) => w.owner === this.myKey && Math.hypot(me.x - w.c.x, me.y + 1 - w.c.y, me.z - w.c.z) < w.r + WARD.GRANT_NEAR);
        if (!near.length) return this._no('wardGrantFar');
        const h = this._hand();
        if (!h) return this._no('wardGrantAim');
        // the player the hand points at
        let best = null, bestA = 0.25;
        for (const [id, r] of g.remotes || []) {
            if (r.dead) continue;
            const p = _v2.copy(r.position).add(_v3.set(0, 1.4, 0)).sub(h.o);
            const dist = p.length();
            if (dist > WARD.AIM || dist < 0.3) continue;
            const off = p.normalize().angleTo(h.d);
            if (off < bestA) { bestA = off; best = id; }
        }
        if (!best) return this._no('wardGrantAim');
        const w = near[0];
        if (mayPass(w, this.keyOf(best)) || w.ids?.includes(best)) return this._no('wardGrantDone', { who: g.playerName?.(best) });
        if (!this._pay('ProtectionHouseGrant')) return null;
        this._op({ op: 'grant', id: w.id, to: best });
        g.hud?.setVoice?.(`🛡️ Игрок ${g.playerName?.(best) || ''} теперь может входить в ваш дом`, true);
        this.log.push({ ev: 'grant', id: w.id, to: best });
        return 'ProtectionHouseGrant';
    }

    // ------------------------------------------------------------ the list (the host decides)
    /** A change: the host makes it, a guest asks the host. */
    _op(op) {
        const g = this.game;
        if (this.auth) this.apply(op, g.localId);
        else {
            this._applyLocal(op, g.localId); // (seen at once; the host's list comes after)
            g.sync?.wardOp?.(op);
        }
    }

    /** (host) A change from `from` (a peer id). */
    apply(op, from) {
        if (!op || typeof op !== 'object') return;
        const key = this.keyOf(from);
        const w = op.id != null ? this.list.get(String(op.id)) : null;
        if (op.op === 'new') {
            if (w || !Array.isArray(op.c) || !op.c.every(Number.isFinite)) return;
            this._add({ id: String(op.id).slice(0, 60), owner: key, ownerName: String(op.name || this.game.playerName?.(from) || 'Игрок').slice(0, 16), c: { x: op.c[0], y: op.c[1], z: op.c[2] }, n: 0, inv: false, grant: [], grantNames: [], hp: WARD.HP, setting: true });
        } else if (!w) return;
        else if (op.op === 'grow') { if (w.owner === key && w.r < WARD.MAX_R) { w.n++; w.r = wardRadius(w.n); w.gy = this._groundY(w.c, w.r); this._rebuildDisc(w); } }
        else if (op.op === 'set') { if (w.owner === key) w.setting = !!op.on; }
        else if (op.op === 'inv') { if (w.owner === key) w.inv = true; }
        else if (op.op === 'grant') {
            if (w.owner !== key || !op.to) return;
            const k = this.keyOf(op.to);
            if (!w.grant.includes(k)) { w.grant.push(k); w.grantNames.push(String(this.game.playerName?.(op.to) || 'Игрок').slice(0, 16)); }
        } else return;
        this._changed();
    }

    /** (guest) Seen at once on my own computer. */
    _applyLocal(op, from) {
        if (op.op === 'new' && !this.list.has(op.id)) this._add({ id: op.id, owner: this.myKey, ownerName: op.name, c: { x: op.c[0], y: op.c[1], z: op.c[2] }, n: 0, inv: false, grant: [], grantNames: [], hp: WARD.HP, setting: true, ids: [from] });
        const w = this.list.get(op.id);
        if (!w) return;
        if (op.op === 'grow') { w.n++; w.r = wardRadius(w.n); w.gy = this._groundY(w.c, w.r); this._rebuildDisc(w); }
        if (op.op === 'set') w.setting = !!op.on;
        if (op.op === 'inv') w.inv = true;
    }

    _add(w) {
        w.r = wardRadius(w.n);
        w.gy = this._groundY(w.c, w.r);
        this.list.set(w.id, w);
        return w;
    }

    _remove(id) {
        this.list.delete(id);
        const L = this.looks.get(id);
        if (L) {
            this.game.scene?.remove(L.dome);
            if (L.disc) { this.game.scene?.remove(L.disc); L.disc.geometry.dispose(); }
            L.dome.material.dispose();
            this.looks.delete(id);
        }
        if (this.setting?.id === id) this.setting = null;
        WARD_HIDE.n.value = 0; // (filled again next frame)
    }

    /** (host) Tell everybody (and remember: the world save asks for it). */
    _changed() {
        const g = this.game;
        if (this.auth) g.sync?.wards?.(this.netList());
    }

    /** One sphere as it is sent and saved. */
    _rec(w, ids = false) {
        const o = { id: w.id, o: w.owner, on: w.ownerName, c: [r2(w.c.x), r2(w.c.y), r2(w.c.z)], n: w.n, inv: w.inv ? 1 : 0, g: w.grant.slice(), gn: w.grantNames.slice(), hp: Math.round(w.hp) };
        if (w.setting) o.s = 1;
        if (ids) o.ids = this._ids(w);
        return o;
    }

    _fromRec(o) {
        if (!o || !Array.isArray(o.c) || !o.c.every(Number.isFinite)) return null;
        return { id: String(o.id), owner: String(o.o || ''), ownerName: String(o.on || ''), c: { x: o.c[0], y: o.c[1], z: o.c[2] }, n: Math.max(0, o.n | 0), inv: !!o.inv, grant: Array.isArray(o.g) ? o.g.map(String) : [], grantNames: Array.isArray(o.gn) ? o.gn.map(String) : [], hp: Number.isFinite(o.hp) ? o.hp : WARD.HP, setting: !!o.s, ids: Array.isArray(o.ids) ? o.ids : null };
    }

    netList() { return [...this.list.values()].map((w) => this._rec(w, true)); }

    /** (guests) The host's list. */
    applyNet(list) {
        const seen = new Set();
        const meBefore = new Set([...this.list.values()].filter((w) => this.mine(w) && w.owner !== this.myKey).map((w) => w.id));
        for (const o of list || []) {
            const w = this._fromRec(o);
            if (!w) continue;
            seen.add(w.id);
            const old = this.list.get(w.id);
            if (old && old.n === w.n && old.c.x === w.c.x) { Object.assign(old, { ...w, r: old.r, gy: old.gy }); continue; }
            this._add(w);
            if (old) this._rebuildDisc(this.list.get(w.id));
        }
        for (const id of [...this.list.keys()]) if (!seen.has(id)) this._broken(id, false);
        // I was let into somebody's house
        for (const w of this.list.values()) {
            if (w.owner !== this.myKey && this.mine(w) && !meBefore.has(w.id)) this.game.hud?.setVoice?.(`🛡️ ${w.ownerName || 'Хозяин'} пустил вас в свой дом: вы можете входить и выходить`, true);
        }
    }

    snapshot() { return [...this.list.values()].map((w) => { const o = this._rec(w); delete o.s; return o; }); }

    restore(list) {
        for (const o of list || []) { const w = this._fromRec(o); if (w) { w.setting = false; this._add(w); } }
    }

    // ------------------------------------------------------------ what it stops
    /** The first sphere the segment a→b goes into from outside: {w, s} (s: 0..1 along), else null. */
    hitSegment(a, b) {
        let best = null;
        for (const w of this.list.values()) {
            const s = crossInto(w, a, b);
            if (s >= 0 && (!best || s < best.s)) best = { w, s };
        }
        return best;
    }

    /** The segment a→b goes into a sphere from outside: the point on its surface (it flashes there), else null. */
    segmentHit(a, b) {
        if (!this.list.size) return null;
        const hit = this.hitSegment(a, b);
        if (!hit) return null;
        const p = new THREE.Vector3().lerpVectors(a, b, hit.s);
        // (just outside: what bursts there stays outside)
        const out = _v1.set(p.x - hit.w.c.x, p.y - hit.w.c.y, p.z - hit.w.c.z);
        if (out.lengthSq() > 1e-8) p.addScaledVector(out.normalize(), 0.15);
        this.flash(hit.w, p);
        return p;
    }

    /** Where a caster stands (me, another player), or null. */
    casterAt(id) {
        const g = this.game;
        if (id == null) return null;
        if (id === 'local' || id === g.localId) return g.character?.group.position || null;
        return g.remotes?.get(id)?.position || null;
    }

    /** Is `to` inside a sphere that `from` is outside of (a blast / a push from outside can't reach it)? */
    shields(from, to) {
        if (!from || !to || !this.list.size) return false;
        for (const w of this.list.values()) if (inWard(w, to) && !inWard(w, from)) return true;
        return false;
    }

    /** Building / gathering at `p` from `from`: inside somebody else's sphere (I'm not let in) — no. */
    forbids(from, p) {
        for (const w of this.list.values()) if (inWard(w, p) && !inWard(w, from) && !this.mine(w)) { this.flash(w, p); return true; }
        return false;
    }

    /** A ray from `o` along `d`: how far it gets before a sphere stops it (flashing where it does). */
    clipRay(o, d, len) {
        if (!this.list.size) return len;
        const b = _v1.copy(o).addScaledVector(d, len);
        const hit = this.hitSegment(o, b);
        if (!hit) return len;
        const at = _v2.copy(o).addScaledVector(d, len * hit.s);
        this.flash(hit.w, at);
        return len * hit.s;
    }

    /** A block (centre x, y, z) inside any sphere: fire, cracks… don't touch it. */
    protects(x, y, z) {
        for (const w of this.list.values()) if (inWard(w, { x, y, z })) return true;
        return false;
    }

    /** A blast at `p` of radius `r`: the spheres it may not eat into ([[x, y, z, r], …] — saved with it). */
    keepFor(p, r) {
        const out = [];
        for (const w of this.list.values()) {
            if (inWard(w, p)) continue; // (from inside: the sphere doesn't hold it)
            if (Math.hypot(p.x - w.c.x, p.y - w.c.y, p.z - w.c.z) < w.r + r + 1) out.push([r2(w.c.x), r2(w.c.y), r2(w.c.z), r2(w.r)]);
        }
        return out;
    }

    /**
     * (host) Very strong magic at `p` (radius `r`) hit the spheres from outside: they wear down
     * (strength WARD.HP — at 0 it breaks). Other magic does nothing to them.
     */
    struck(p, r, spell) {
        const n = WARD.WEAR[spell];
        let any = false;
        for (const w of [...this.list.values()]) {
            if (inWard(w, p) || Math.hypot(p.x - w.c.x, p.y - w.c.y, p.z - w.c.z) > w.r + r + 0.5) continue;
            any = true;
            this.flash(w, _v1.set(p.x, p.y, p.z));
            if (!n || !this.auth) continue;
            w.hp -= n;
            this.log.push({ ev: 'wear', id: w.id, spell, hp: w.hp });
            if (w.hp <= 0) this._broken(w.id, true);
            else this._changed();
        }
        return any;
    }

    /** The sphere broke (strong magic) or the host says it is gone. */
    _broken(id, loud) {
        const w = this.list.get(id);
        if (!w) return;
        const g = this.game;
        if (loud || this.looks.has(id)) {
            const c = _v1.set(w.c.x, w.c.y, w.c.z);
            for (let i = 0; i < 60; i++) {
                const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
                const dir = _v2.set(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
                g.fx?.spark?.(_v3.copy(c).addScaledVector(dir, w.r), i % 2 ? 0x8fc8ff : 0xe8f6ff, 0.12, dir.multiplyScalar(3), 1);
            }
            if (w.owner === this.myKey) g.hud?.setVoice?.('💥🛡️ Защита вашего дома разбита сильной магией!', true);
        }
        this._remove(id);
        if (loud) { this.log.push({ ev: 'broken', id }); this._changed(); }
    }

    /** The hex pattern lights up where something touched the sphere. */
    flash(w, p) {
        const L = this.looks.get(w.id);
        if (L) { L.flash = 1; L.dome.material.uniforms.uFlash.value.set(p.x, p.y, p.z, 1); }
        if (Math.random() < 0.7) this.game.fx?.spark?.(p, 0x9fd8ff, 0.1, _v3.set(0, 1, 0), 0.4);
        this.game.sound?.playShieldHit?.(p);
    }

    _pulse(w) {
        const L = this.looks.get(w.id);
        if (L) L.pulse = 1;
    }

    // ------------------------------------------------------------ bodies
    /** My body may not come in (my computer moves me): pushed back out at the surface. */
    keepOut(pos, feet, height, dt) {
        for (const w of this.list.values()) {
            if (this.mine(w)) continue;
            const push = bodyPush(w, pos.x, feet, feet + height, pos.z, 0.5);
            if (!push) continue;
            // just walked in: back to the surface at once; deep inside (it was set over me): out softly
            const k = push.depth < 1.2 ? 1 : Math.min(1, (6 * dt) / push.depth);
            pos.x += push.x * k; pos.y += Math.max(0, push.y * k); pos.z += push.z * k;
            if (!this._bumpAt || performance.now() - this._bumpAt > 2500) {
                this._bumpAt = performance.now();
                this.flash(w, _v1.set(pos.x, feet + 1.5, pos.z));
                this.game.hud?.toast?.(`🛡️ Дом защищён — войти может только хозяин (${w.ownerName || '?'}) и те, кого он пустил`, 2500);
            }
        }
    }

    /** (host) Creatures of every kind are pushed back out softly. */
    _creatures(dt) {
        const g = this.game;
        for (const w of this.list.values()) {
            for (const ck of Object.keys(KINDS)) {
                const K = KINDS[ck];
                for (const c of K.list(g)) {
                    if (!K.alive(c) || this._creatureMay(w, c)) continue;
                    const p = K.centre(c, _v1);
                    const push = bodyPush(w, p.x, p.y - 1, p.y + 1, p.z, 0.6);
                    if (!push) continue;
                    const k = push.depth < 1.2 ? 1 : Math.min(1, (5 * dt) / push.depth);
                    K.move(g, c, push.x * k, push.z * k);
                }
            }
            for (const s of g.spiders?.list || []) {
                if (s.dead) continue;
                const p = s.model.position;
                const push = bodyPush(w, p.x, p.y, p.y + 3, p.z, 2.5);
                if (push) { const k = push.depth < 1.5 ? 1 : Math.min(1, (5 * dt) / push.depth); p.x += push.x * k; p.z += push.z * k; }
            }
        }
    }

    // ------------------------------------------------------------ the look
    _look(w) {
        let L = this.looks.get(w.id);
        if (L) return L;
        const mat = new THREE.ShaderMaterial({
            vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            uniforms: { uColor: { value: new THREE.Color(0x7fbfff) }, uAlpha: { value: 0.5 }, uTime: { value: 0 }, uFlash: { value: new THREE.Vector4(0, 0, 0, 0) }, uSet: { value: 0 } },
        });
        const dome = new THREE.Mesh(this._domeGeo, mat);
        dome.renderOrder = 3;
        dome.userData.noWardHide = true;
        dome.frustumCulled = true;
        this.game.scene?.add(dome);
        L = { dome, disc: null, k: 1, flash: 0, pulse: 0, discR: 0 };
        this.looks.set(w.id, L);
        return L;
    }

    /** The land drawn over the hidden house (its ground's own colour and look). */
    _rebuildDisc(w) {
        const L = this.looks.get(w?.id);
        if (!L || !L.disc) return;
        this.game.scene?.remove(L.disc);
        L.disc.geometry.dispose();
        L.disc = null;
    }

    _makeDisc(w, L) {
        const dy = w.gy - w.c.y;
        if (Math.abs(dy) >= w.r) return null;
        const rr = Math.sqrt(w.r * w.r - dy * dy);
        const geo = new THREE.CircleGeometry(rr, 40);
        geo.rotateX(-Math.PI / 2);
        const n = geo.attributes.position.count;
        const col = new THREE.Color(BASE_COLORS[this._groundType ?? BLOCK.GRASS] ?? 0x4caf50);
        const cols = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        geo.setAttribute('voxPat', new THREE.BufferAttribute(new Float32Array(n), 1));
        geo.setAttribute('voxSky', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
        if (!this._discMat) {
            this._discMat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        }
        const disc = new THREE.Mesh(geo, this._discMat.clone());
        disc.material.onBeforeCompile = this._discMat.onBeforeCompile;
        disc.material.customProgramCacheKey = this._discMat.customProgramCacheKey;
        disc.position.set(w.c.x, w.gy + 0.01, w.c.z);
        disc.receiveShadow = true;
        disc.userData.noWardHide = true;
        this.game.scene?.add(disc);
        L.disc = disc;
        return disc;
    }

    _updateLooks(dt) {
        const g = this.game;
        const eye = g.character?.group.position || _v3.set(0, 0, 0);
        const hidden = [];
        for (const w of this.list.values()) {
            const L = this._look(w);
            const k = seenK(w, _v1.set(eye.x, eye.y + 1, eye.z));
            L.k = k;
            const u = L.dome.material.uniforms;
            L.dome.position.set(w.c.x, w.c.y, w.c.z);
            L.pulse = Math.max(0, L.pulse - dt * 2);
            L.dome.scale.setScalar(w.r * (1 + 0.04 * L.pulse));
            u.uTime.value = this._t;
            u.uSet.value = w.setting ? 1 : 0;
            u.uAlpha.value = (w.setting ? 0.9 + L.pulse : 0.32) * k;
            L.flash = Math.max(0, L.flash - dt * 1.5);
            u.uFlash.value.w = L.flash;
            L.dome.visible = k > 0.01;
            if (w.inv && k < 0.999) hidden.push({ w, k, d: Math.hypot(eye.x - w.c.x, eye.z - w.c.z) });
            // the land over it, seen from far
            if (w.inv) {
                if (!L.disc) this._makeDisc(w, L);
                if (L.disc) { L.disc.visible = k < 0.995; L.disc.material.opacity = 1 - k; L.disc.material.depthWrite = k < 0.5; }
            } else if (L.disc) L.disc.visible = false;
        }
        // the terrain's shader hides the house's blocks (the nearest few)
        hidden.sort((a, b) => a.d - b.d);
        const H = WARD_HIDE;
        H.n.value = Math.min(WARD.HIDE_MAX, hidden.length);
        for (let i = 0; i < H.n.value; i++) {
            const { w, k } = hidden[i];
            H.s.value[i].set(w.c.x, w.c.y, w.c.z, w.r);
            H.g.value[i] = w.gy + 0.02;
            H.k.value[i] = k;
        }
        return hidden;
    }

    /** Everything else inside an invisible house (doors, beds, things, people) is not seen from far either. */
    _hideObjects(hidden) {
        const g = this.game;
        const scene = g.scene;
        if (!scene) return;
        const want = new Set();
        if (hidden.length) {
            for (const o of scene.children) {
                if (o.userData?.noWardHide || o === g.character?.group || o.isInstancedMesh || o.isPoints || o.isLight || o.name === 'terrain') continue;
                const p = o.position;
                if (p.x === 0 && p.y === 0 && p.z === 0) continue;
                for (const { w, k } of hidden) if (k < 0.5 && inWard(w, p)) { want.add(o); break; }
            }
        }
        for (const [o, vis] of [...this._hidden]) if (!want.has(o)) { o.visible = vis; this._hidden.delete(o); }
        for (const o of want) { if (!this._hidden.has(o)) this._hidden.set(o, o.visible); o.visible = false; }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        this._t += dt;
        // my sphere being set: set by itself when I keep quiet too long
        if (this.setting) {
            this.setting.idle += dt;
            if (!this.list.has(this.setting.id)) this.setting = null;
            else if (this.setting.idle > WARD.SET_IDLE) this.fix();
        }
        if (!this.list.size && !this.looks.size && !this._hidden.size) return;
        if (this.auth) this._creatures(dt);
        const hidden = this._updateLooks(dt);
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 0.25; if (this._hidden.size || hidden.length) this._hideObjects(hidden); }
        else for (const o of this._hidden.keys()) o.visible = false; // (others may have shown it again this frame)
        if (!hidden.length) WARD_HIDE.n.value = 0;
    }

    dispose() {
        for (const id of [...this.list.keys()]) this._remove(id);
        WARD_HIDE.n.value = 0;
        for (const [o, vis] of this._hidden) o.visible = vis;
        this._hidden.clear();
    }
}
