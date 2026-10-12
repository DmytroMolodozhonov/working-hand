/**
 * Firefighting.js — «Firefighting» and «Firefighting Maxima»: cold water from the hand puts fire out.
 *
 *   Words        «Firefighting» as the Russian recognizer writes it: «файрфайтинг», «фаерфайтинг»,
 *                «файр файтинг», «фаер файтинг», «файрфайтин», «firefighting», «fire fighting»…
 *                (the fire word AND the fighting word: «Fire», «Fire Maxima», «Inferno» and «Let the
 *                Hellfire Come» never contain «файтинг»); with «Maxima» — «Firefighting Maxima».
 *   Casting      a raised hand (or the wand), like «Wind»: the water comes from the hand / the wand's tip.
 *   Plain        5 mana: one burst — a cone of cold blue-white water and mist, up to 15 m (it stops at
 *                walls). Whatever fire it reaches goes out at once: campfires, burning trees, grass,
 *                houses, a burning living tree, ships' fires, an «Inferno» stream, a «Fire Maxima»
 *                flying or blooming. «Let the Hellfire Come» is stronger: a burst only knocks its blaze
 *                back (smaller, and it can't grow for a moment) and puts out the small fires it left on
 *                the ground (the ring's sections) — only «Firefighting Maxima» drowns the blaze.
 *   Maxima       20 mana: a hose of water for 5 s that follows the hand (aim it round), wider and up to
 *                25 m; it puts out everything it sweeps over, and held on the Hellfire (the blaze, the
 *                ring, what is left burning) it drowns it — the blaze shrinks while the water is on it
 *                and goes out. Steam hisses where the water meets fire. «Стоп» ends it early.
 *   Mana         counted (+1, Maxima: the first time +3 more) only when it really put a fire out.
 *   Network      the spray is an ordinary spell ('spell' / 'stopSpells'): every computer runs it from the
 *                caster's live hand. Trees and blocks go out on every computer (Fire.js is the same
 *                everywhere); campfires, living trees, ships' fires and the push on creatures — the host
 *                (it sends them on); the Hellfire — its caster's computer (it sends the smaller fire on;
 *                the fires left on the ground — every computer, as they are kept); my own player — mine.
 */

import * as THREE from 'three';
import { FIRE_MAXIMA } from './WaterVortex.js';

export const FIREFIGHT = {
    REACH: 15, // m: the plain burst…
    HALF: 0.3, // …a cone this wide (radians each side; ~17°)
    MAX_REACH: 25, // m: «Firefighting Maxima»…
    MAX_HALF: 0.4, // …wider
    BURST: 0.7, // s the plain burst is seen
    AT: 0.12, // s after the words the plain burst reaches its fires (the water flies)
    MAX_LIFE: 5, // s «Firefighting Maxima» is held
    GROW: 0.35, // s the hose takes to reach its full length
    TICK: 0.15, // s between the hose's dousing of the world
    PUSH: 1.5, // m/s: the plain burst on a creature (a light shove, no damage)
    MAX_PUSH: 3, // m/s: the hose on a creature
    PUSH_EVERY: 1, // s: a creature is shoved by one hose at most this often
    WET: 4, // s a player soaked by it is not burnt by the Hellfire
};

/**
 * На КОГО и на ЧТО действует «Firefighting» (CLAUDE.md). `does`: what happens; «не действует» with why.
 * (Урона нет никому: это только вода.)
 */
export const FIREFIGHT_TARGETS = {
    // ---- creatures
    me: { does: 'облит водой: 4 с адский огонь меня не жжёт; не толкает (своя струя из руки — никогда)', why: 'вода гасит огонь на теле' },
    players: { does: 'облиты: 4 с не горят в адском огне; не толкает и не ранит (решает компьютер самого игрока)', why: 'это вода, не удар' },
    zombies: { does: 'лёгкий толчок (Maxima — сильнее, может пошатнуть), без урона', why: 'напор воды' },
    castlePeople: { does: 'рыцари, король, волшебники, торговцы: лёгкий толчок, без урона', why: 'напор воды' },
    animals: { does: 'лёгкий толчок, без урона', why: 'напор воды' },
    sailors: { does: 'лёгкий толчок в координатах корабля (CreatureImpact), без урона; пожар на корабле гаснет', why: 'напор воды' },
    spider: { does: 'не действует', why: 'огромная паучиха — вода просто стекает с неё' },
    livingTrees: { does: 'горящее живое дерево гаснет (перестаёт гореть); не толкает', why: 'оно укоренено, а огонь на нём — вода гасит' },
    bookBirds: { does: 'струя Maxima сбивает книгу-птицу (мокрые страницы); обычный всплеск — нет; книга защиты отскакивает', why: 'бумага тяжелеет от воды; защиту берёт только огонь и лёд' },
    servants: { does: 'как их вид (живое дерево, Брейнрот-зомби)', why: 'слуги — те же существа' },
    dragon: { does: 'гасит огонь, которым дракон дышит (струя на пламени или на пасти): пламя обрывается, дракон 2 с не может дохнуть снова и злится на того, кто облил; сам дракон не ранен и не сдвинут', why: 'вода гасит огонь, а такого великана водой не сдвинуть' },
    phoenix: { does: 'лёгкий толчок; пылающий феникс гаснет и бросает свою огненную атаку (улетает); без урона', why: 'вода против его огня (Phoenixes.watered)' },
    // ---- things and the world
    campfires: { does: 'костёр («Fire») гаснет совсем', why: 'вода' },
    trees: { does: 'горящие деревья гаснут (что сгорело — сгорело)', why: 'вода' },
    blocks: { does: 'горящая трава, листья, дерево, дома и стены замков гаснут', why: 'вода' },
    inferno: { does: 'поток «Inferno», на который попала вода, гаснет сразу (у любого волшебника)', why: 'вода гасит пламя' },
    fireMaxima: { does: 'огненная спираль «Fire Maxima» гаснет в полёте и не распускается; цветок гаснет', why: 'вода' },
    hellfire: { does: 'обычный всплеск только сбивает его (меньше и не растёт пару секунд); Maxima, пока на нём, заливает: он уменьшается и гаснет (и кольцо тоже)', why: 'адский огонь сильнее обычной воды' },
    hellfireLeft: { does: 'брошенные огни адского огня: маленькие (части кольца) гаснут от всплеска, большой — уменьшается; Maxima гасит все', why: 'вода' },
    ships: { does: 'пожар на палубе и на парусах гаснет; корпус, паруса и палуба не ломаются', why: 'вода' },
    items: { does: 'вещи на земле и в руках не двигаются и не портятся', why: 'струя мягкая' },
    water: { does: 'не действует', why: 'вода в воду' },
    ground: { does: 'не действует (земля не мокнет и не размывается)', why: 'воды мало' },
    lava: { does: 'лавы в игре нет', why: 'появится — дописать сюда' },
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** «Firefighting» in a phrase? → 'Firefighting' | 'FirefightingMaxima' | null */
const FF_FLAT = /(fire|fier|fair|файр|фаер|фаир|фаэр|файер|фойр)(fight|faight|файт|фаит|файд)/;
export function firefightWords(s) {
    const t = String(s || '').toLowerCase().replace(/ё/g, 'е');
    if (!FF_FLAT.test(t.replace(/[\s\-–—.,!?]+/g, ''))) return null;
    return /(^|[^a-zа-я])(макс|max|мах|maks|мекс|мэкс)/.test(t) ? 'FirefightingMaxima' : 'Firefighting';
}

/**
 * Is a body (radius r) at p in the spray from o along d (unit), `len` m long, `half` wide (radians)?
 * (Pure: Node-testable.)
 */
export function inCone(o, d, len, half, p, r = 0) {
    const tx = p.x - o.x, ty = p.y - o.y, tz = p.z - o.z;
    const along = tx * d.x + ty * d.y + tz * d.z;
    if (along < -r || along > len + r) return false;
    const a = Math.max(0, along);
    const px = tx - d.x * a, py = ty - d.y * a, pz = tz - d.z * a;
    return Math.hypot(px, py, pz) <= 0.5 + a * Math.tan(half) + r;
}

export class Firefighting {
    constructor(game) {
        this.game = game;
        this.wetUntil = 0; // (my own player soaked: performance.now() ms)
        this.log = []; // events (tests / debugging)
        this._pushed = new Map(); // "kind:id" -> when a hose last shoved it
    }

    _note(e) {
        this.log.push({ t: Math.round(performance.now()) / 1000, ...e });
        if (this.log.length > 60) this.log.shift();
    }

    /** My own player is soaked (the Hellfire doesn't burn me). */
    wetMe() { return performance.now() < this.wetUntil; }

    /**
     * One frame of a spray (SpellManager.castFirefighting): it is drawn, and it puts fires out.
     * sp: {o, d, max, t, by, done, tickT}. @returns true when it put something out
     */
    act(sp, dt) {
        const g = this.game;
        const max = sp.max;
        const half = max ? FIREFIGHT.MAX_HALF : FIREFIGHT.HALF;
        const full = max ? FIREFIGHT.MAX_REACH : FIREFIGHT.REACH;
        const reach = this._reach(sp.o, sp.d, max ? full * Math.min(1, sp.t / FIREFIGHT.GROW) : full);
        sp.reach = reach;
        this._draw(sp, dt, reach, half);
        const hit = (c, r) => inCone(sp.o, sp.d, reach + 1, half, c, r);
        let did = false;
        if (!max) {
            // the burst: everything once, when the water gets there
            if (sp.done || sp.t < FIREFIGHT.AT) return false;
            sp.done = true;
            if (this._douse(sp, reach, half, hit)) did = true;
            if (g.hellfire?.douse?.(hit, 0)) { did = true; this._steamOn(sp, reach, hit); }
            return did;
        }
        // the hose: the Hellfire every frame (it drowns while the water is on it), the rest every tick
        if (g.hellfire?.douse?.(hit, dt)) { did = true; if (Math.random() < dt * 6) this._steamOn(sp, reach, hit); }
        sp.tickT = (sp.tickT ?? 0) - dt;
        if (sp.tickT <= 0) {
            sp.tickT = FIREFIGHT.TICK;
            if (this._douse(sp, reach, half, hit)) did = true;
        }
        return did;
    }

    /** How far the water goes: `want` m, or to the first wall / the ground (water flies on through water). */
    _reach(o, d, want) {
        const g = this.game;
        for (let k = 0.6; k < want; k += 0.5) {
            const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
            if (g._flameBlock?.(x, y, z) === 'solid') return k + 0.5; // (it splashes onto what burns there)
            const gy = g.collision?.groundY ? g.collision.groundY(x, z) : -Infinity;
            if (y < gy - 0.3) return k;
        }
        return want;
    }

    /** Fires, the «Inferno», «Fire Maxima», burning living trees, creatures, me. @returns true: a fire went out */
    _douse(sp, reach, half, hit) {
        const g = this.game, o = sp.o, d = sp.d;
        const auth = !!g.authority;
        let did = false;
        const tan = Math.tan(half);
        // trees, grass, leaves, wood, houses (every computer: Fire.js is the same everywhere); ships' fires (the host)
        for (let k = 1; k <= reach + 1; k += 1.5) {
            _a.copy(o).addScaledVector(d, k);
            const r = 0.6 + k * tan;
            if ((g.fire?.douse?.(_a, r) || 0) > 0) did = true;
            if (auth && (g.ships?.douse?.(_a, r + 0.5) || 0) > 0) did = true;
        }
        if (auth) {
            // campfires
            for (const cf of [...(g.campfires?.list?.values() || [])]) {
                if (!hit(_b.set(cf.x, cf.y + 0.4, cf.z), 0.8)) continue;
                g.campfires._out(cf);
                this._steam(_b, 1);
                did = true;
            }
            // a burning living tree stops burning
            for (const t of g.livingTrees?.list || []) {
                if (!(t.burnT > 0) || t.phase === 'burn' || t.isDead) continue;
                if (!hit(_b.copy(t.model.position).setY(t.model.position.y + 2), 1.5)) continue;
                t.burnT = 0;
                this._steam(_b, 1.5);
                did = true;
            }
        }
        // «Inferno» streams (anyone's): water on the flame puts it out
        for (const s of g.spells?.spells || []) {
            if (s.kind !== 'Inferno' || !s.flame || !(s.life > 0) || !(s.flame.len > 0)) continue;
            const f = s.flame;
            let on = false;
            for (let j = 0.5; j <= f.len && !on; j += 0.8) on = hit(_b.copy(f.o).addScaledVector(f.d, j), 0.4);
            if (!on) continue;
            s.life = 0;
            did = true;
            this._steam(_b, 1.2);
            this._note({ ev: 'inferno', by: s.by });
            if (s.by === g.localId || s.by === 'local') g.hud?.setVoice?.('💨 Ваше пламя «Inferno» залили водой', true);
        }
        // «Fire Maxima» (every computer keeps its own): in flight it goes out, the flower too
        const fx = g.vortex?.effects;
        if (fx) for (let i = fx.length - 1; i >= 0; i--) {
            const e = fx[i];
            if (e.kind !== 'fire') continue;
            const head = e.bloomed ? e.p : _b.copy(e.o).lerp(e.p, Math.min(1, e.t / e.travel));
            if (!hit(head, e.bloomed ? FIRE_MAXIMA.RADIUS * 0.6 : 0.6)) continue;
            this._steam(head, e.bloomed ? 2 : 1);
            fx.splice(i, 1);
            did = true;
            this._note({ ev: 'fireMaxima', by: e.by, bloomed: !!e.bloomed });
        }
        // dragons: their breath goes out (the water on the flame or on the mouth); the dragon itself is not hurt
        for (const dr of g.dragons?.list || []) {
            const b = dr.breath;
            if (!b || dr.dead || !g.dragons._mouth) continue;
            const m = g.dragons._mouth(dr, _b.clone());
            let on = hit(m, 1);
            for (let j = 1; j <= (b.len ?? 0) && !on; j += 1.5) on = hit(_c.copy(m).addScaledVector(b.dir, j), 0.8);
            if (!on) continue;
            dr.breath = null;
            dr.breathCd = Math.max(dr.breathCd || 0, 2);
            this._steam(m, 1.5);
            did = true;
            this._note({ ev: 'dragonFire', id: dr.id });
            if (auth) g.dragons.hit?.(dr, 0, 'Firefighting', sp.by); // (no harm — it only angers it: ON_DRAGON.Firefighting)
        }
        // creatures: no damage — a light shove (the host); my own player: soaked (every computer: its own)
        this._creatures(sp, hit);
        this._me(sp, hit);
        if (sp.max && !sp.birds && auth) { sp.birds = true; g.books?.hitRay?.(o, d, reach, 0.9, 'water'); } // (the hose: wet pages, the bird falls)
        if (did) { this._note({ ev: 'out', max: !!sp.max, by: sp.by }); g.sound?.playSplash?.(); }
        return did;
    }

    _creatures(sp, hit) {
        const g = this.game;
        if (!g.authority || !g.creatureImpact) return;
        const now = performance.now();
        const list = (g.duel?._bodies?.(null) || []).map((b) => ({ kind: b.kind, id: b.id, mid: _c.copy(b.a).add(b.b).multiplyScalar(0.5).clone(), r: b.r }));
        for (const b of list) {
            // (players: their own computer; book-birds: above; the spider: water runs off it; living trees: rooted)
            if (b.kind === 'p' || b.kind === 'b' || b.kind === 's' || b.kind === 't') continue;
            if (!hit(b.mid, b.r)) continue;
            const key = b.kind + ':' + b.id;
            if (sp.max && now - (this._pushed.get(key) ?? -1e9) < FIREFIGHT.PUSH_EVERY * 1000) continue;
            this._pushed.set(key, now);
            const body = b.kind === 'z' ? g.zombieById?.get(b.id) : g.duel?._creature?.(b.kind, b.id);
            if (!body) continue;
            const v = _a.subVectors(b.mid, sp.o).setY(0);
            if (v.lengthSq() < 1e-4) v.set(sp.d.x, 0, sp.d.z);
            v.normalize().multiplyScalar(sp.max ? FIREFIGHT.MAX_PUSH : FIREFIGHT.PUSH);
            g.creatureImpact.apply(body, { v: v.clone(), by: sp.by, spell: 'Firefighting', kind: 'Firefighting', from: sp.o.clone() });
            if (b.kind === 'f') g.phoenixes?.watered?.(body, null, sp.by); // (a phoenix: its fire goes out — it gives up its attack)
        }
        if (this._pushed.size > 200) this._pushed.clear();
    }

    /** My own player in someone else's spray: soaked (the Hellfire doesn't burn me for a while). */
    _me(sp, hit) {
        const g = this.game, c = g.combat;
        if (sp.by === g.localId || sp.by === 'local' || !c || c.dead) return;
        const me = c.center ? c.center(_c) : _c.copy(g.character.group.position);
        if (!hit(me, 0.45)) return;
        if (!this.wetMe()) g.hud?.setVoice?.('💧 Вас окатило холодной водой — адский огонь пока не жжёт', true);
        this.wetUntil = performance.now() + FIREFIGHT.WET * 1000;
    }

    // ============================================================= drawing
    /** The spray: cold blue-white water and mist flying out of the hand into the cone. */
    _draw(sp, dt, reach, half) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        const o = sp.o, d = sp.d;
        const side = _a.set(-d.z, 0, d.x);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize();
        const up = _b.crossVectors(side, d).normalize();
        const live = sp.max || sp.t < 0.35; // (the burst: a short gush)
        const rate = sp.max ? 260 : 420;
        sp.acc = (sp.acc || 0) + (live ? rate * dt : 0);
        let n = Math.min(80, Math.floor(sp.acc));
        sp.acc -= n;
        const speed = Math.max(8, reach / 0.55);
        const tan = Math.tan(half);
        while (n-- > 0) {
            const a = Math.random() * Math.PI * 2, s = Math.sqrt(Math.random()) * tan;
            const vx = d.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * s;
            const vy = d.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * s;
            const vz = d.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * s;
            const k = speed * (0.75 + Math.random() * 0.35);
            const mist = Math.random() < 0.3;
            const col = mist ? 0xf4fbff : COLORS[(Math.random() * COLORS.length) | 0];
            fx.sparks.spawn(o.x + d.x * 0.3, o.y + d.y * 0.3, o.z + d.z * 0.3, vx * k, vy * k + (mist ? 0.5 : 0), vz * k, col,
                mist ? 0.22 + Math.random() * 0.2 : 0.07 + Math.random() * 0.07, (reach / speed) * (0.8 + Math.random() * 0.3),
                { gravity: mist ? 0 : -5, shrink: mist ? -0.4 : 0.2, spin: 3 });
        }
        // the sound: a gush, and the hose's rush every second
        sp.soundT = (sp.soundT ?? 0) - dt;
        if (sp.soundT <= 0 && live) { sp.soundT = sp.max ? 1 : 9; this.game.sound?.playWaterRise?.(); }
    }

    /** Steam where the water meets the Hellfire (a few points along the cone that reach a fire). */
    _steamOn(sp, reach, hit) {
        const H = this.game.hellfire;
        const fires = [];
        if (H?.state) fires.push(H.state.c);
        for (const f of H?.remote?.values() || []) fires.push(f.c);
        for (const f of H?.left || []) fires.push(f.c);
        for (const c of fires) if (hit(c, 3)) this._steam(c, 2);
        this.game.sound?.playSplash?.();
    }

    /** A puff of white steam at p (size k). */
    _steam(p, k = 1) {
        const fx = this.game.fx;
        if (!fx?.sparks) return;
        for (let i = 0; i < 14 * k; i++) {
            fx.sparks.spawn(p.x + (Math.random() - 0.5) * k, p.y + Math.random() * k * 0.6, p.z + (Math.random() - 0.5) * k,
                (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2,
                Math.random() < 0.5 ? 0xe8eef2 : 0xcfd8de, 0.35 + Math.random() * 0.4, 1 + Math.random() * 0.8, { gravity: 1, shrink: -0.5, spin: 2 });
        }
    }
}

const COLORS = [0xbfe6ff, 0x9fd4ff, 0xdff4ff, 0x7cc4ff, 0xe8f7ff];
