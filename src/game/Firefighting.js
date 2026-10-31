/**
 * Firefighting.js — «Firefighting» and «Firefighting Maxima»: the air is taken from the fire, and it goes out.
 *
 *   The idea    (the author) no water — where would it come from? The spell works the air: for a split
 *                second there is no air where the hand points, and without air no fire can burn. Seen as
 *                the air collapsing (pale haze rushing in, a shudder where it implodes, the smoke sinking),
 *                heard as a suck of air and a hollow clap (SpellMusic fxVacuum). How far and how wide — as before.
 *
 *   Words        «Firefighting» as the Russian recognizer writes it: «файрфайтинг», «фаерфайтинг»,
 *                «файр файтинг», «фаер файтинг», «файрфайтин», «firefighting», «fire fighting»…
 *                (the fire word AND the fighting word: «Fire», «Fire Maxima», «Инферно» and «Let the
 *                Hellfire Come» never contain «файтинг»); with «Максима» — «Firefighting Maxima».
 *   Casting      a raised hand (or the wand), like «Вайнд»: the cone starts at the hand / the wand's tip.
 *   Plain        5 mana: one collapse of the air — a cone up to 15 m (it stops at
 *                walls). Whatever fire it reaches goes out at once: campfires, burning trees, grass,
 *                houses, a burning living tree, ships' fires, an «Инферно» stream, a «Fire Maxima»
 *                flying or blooming. «Let the Hellfire Come» is stronger: a burst only knocks its blaze
 *                back (smaller, and it can't grow for a moment) and puts out the small fires it left on
 *                the ground (the ring's sections) — only «Firefighting Maxima» drowns the blaze.
 *   Maxima       20 mana: the air kept away for 5 s along a cone that follows the hand (aim it round), wider and up to
 *                25 m; it puts out everything it sweeps over, and held on the Hellfire (the blaze, the
 *                ring, what is left burning) it smothers it — the blaze shrinks while the cone is on it
 *                and goes out; the smoke sinks where a fire died. «Стоп» ends it early.
 *   Mana         counted (+1, Maxima: the first time +3 more) only when it really put a fire out.
 *   Network      the spray is an ordinary spell ('spell' / 'stopSpells'): every computer runs it from the
 *                caster's live hand. Trees and blocks go out on every computer (Fire.js is the same
 *                everywhere); campfires, living trees, ships' fires and the push on creatures — the host
 *                (it sends them on); the Hellfire — its caster's computer (it sends the smaller fire on;
 *                the fires left on the ground — every computer, as they are kept); my own player — mine.
 */

import * as THREE from 'three';
import { FIRE_MAXIMA } from './WaterVortex.js';
import { BURN } from './Burning.js';

const BURN_CFG = () => BURN;

export const FIREFIGHT = {
    REACH: 15, // m: the plain burst…
    HALF: 0.3, // …a cone this wide (radians each side; ~17°)
    MAX_REACH: 25, // m: «Firefighting Maxima»…
    MAX_HALF: 0.4, // …wider
    BURST: 0.7, // s the plain burst is seen
    AT: 0.12, // s after the words the plain burst reaches its fires (the air collapses)
    MAX_LIFE: 5, // s «Firefighting Maxima» is held
    GROW: 0.35, // s the hose takes to reach its full length
    TICK: 0.15, // s between the hose's dousing of the world
    PUSH: 1.5, // m/s: the plain burst on a creature (a light shove, no damage)
    MAX_PUSH: 3, // m/s: the hose on a creature
    PUSH_EVERY: 1, // s: a creature is shoved by one hose at most this often
    WET: 4, // s a player soaked by it is not burnt by the Hellfire
    SPREAD: 1.73, // (the author: three times stronger) the airless cone puts out fire on √3× the radius — three times the area
};

/**
 * На КОГО и на ЧТО действует «Firefighting» (CLAUDE.md). `does`: what happens; «не действует» with why.
 * (Урона нет никому: воздух лишь на миг исчезает и возвращается — огню этого хватает, живым нет.)
 */
export const FIREFIGHT_TARGETS = {
    // ---- creatures
    burning: { does: 'горящие (игрок, зомби, жители, звери, моряки; Burning.js) гаснут: в конусе вперёд — все, кто в нём; палочка ВВЕРХ / на себя — все в радиусе 3 м вокруг колдующего (Maxima — 6 м), включая его самого', why: 'без воздуха огонь на теле не горит' },
    me: { does: 'воздух вокруг на миг исчез: 4 с адский огонь меня не жжёт; если я горю — гасну; не толкает (своё заклинание — никогда)', why: 'без воздуха огонь на теле гаснет' },
    players: { does: 'облиты: 4 с не горят в адском огне; не толкает и не ранит (решает компьютер самого игрока)', why: 'это воздух на миг, не удар' },
    zombies: { does: 'лёгкий толчок (Maxima — сильнее, может пошатнуть), без урона', why: 'толчок схлопнувшегося воздуха' },
    castlePeople: { does: 'рыцари, король, волшебники, торговцы: лёгкий толчок, без урона', why: 'толчок схлопнувшегося воздуха' },
    animals: { does: 'лёгкий толчок, без урона', why: 'толчок схлопнувшегося воздуха' },
    sailors: { does: 'лёгкий толчок в координатах корабля (CreatureImpact), без урона; пожар на корабле гаснет', why: 'толчок схлопнувшегося воздуха' },
    spider: { does: 'не действует', why: 'огромную паучиху мгновение без воздуха не сдвигает' },
    livingTrees: { does: 'горящее живое дерево гаснет (перестаёт гореть); не толкает', why: 'оно укоренено, а огонь на нём без воздуха гаснет' },
    bookBirds: { does: 'Maxima сбивает книгу-птицу (ей не на что опереться страницами); обычное — нет; книга защиты отскакивает', why: 'без воздуха страницам-крыльям не на что опереться; защиту берёт только огонь и лёд' },
    servants: { does: 'как их вид (живое дерево, Брейнрот-зомби)', why: 'слуги — те же существа' },
    iceCastle: { does: 'лёгкий толчок воздуха (снеговика сбивает, королеву и монстров только качает); не ранит', why: 'это воздух — им, ледяным, он не вредит' },
    blackship: { does: 'лёгкий толчок воздуха капитану и скелетам, без урона; огонь на чёрном корабле и так гаснет сам (проклятие)', why: 'это воздух, не удар' },
    dragon: { does: 'гасит огонь, которым дракон дышит (конус на пламени или на пасти): пламя обрывается, дракон 2 с не может дохнуть снова и злится на того, кто колдовал; сам дракон не ранен и не сдвинут', why: 'без воздуха огонь гаснет, а такого великана не сдвинуть' },
    phoenix: { does: 'лёгкий толчок; пылающий феникс гаснет и бросает свою огненную атаку (улетает); без урона', why: 'без воздуха его огонь гаснет (Phoenixes.watered)' },
    owl: { does: 'не действует (не со свитка): сова чует, как уходит воздух, увёртывается и улетает', why: 'на умную сову действуют только заклинания со свитка (Owls.TARGETS)' },
    canary: { does: 'толчок водой, без урона; пламя на нём гаснет', why: 'канарик — обычное живое существо: вода и ветер его отталкивают, лагерь сердится на того, кто облил (Canaries.hit)' },
    taron: { does: 'вода и ветер почти не двигают великана; пламя на нём гаснет', why: 'Тарон — тяжёлое живое существо: вода гасит огонь на нём, но не сдвигает (устойчивость 85)' },
    spencer: { does: 'не действует: птичка Спенсера вспугивается водой и улетает', why: 'вода птичку лишь вспугивает (SpencerRules.SPENCER_TARGETS.water)' },
    ghost: { does: 'не действует: призрак бестелесный — вода проходит сквозь него', why: 'вода призрака не берёт (GhostRules.GHOST_SPELLS.Water)' },
    custom: { does: 'толчок водой, без урона; пламя на нём гаснет', why: 'созданное существо — живое: вода его не ранит' },
    gargoyle: { does: 'none', why: 'вода и ветер только отталкивают горгулью, урона нет' },
    // ---- things and the world
    campfires: { does: 'костёр («Fire») гаснет совсем', why: 'без воздуха огонь не горит' },
    trees: { does: 'горящие деревья гаснут (что сгорело — сгорело)', why: 'без воздуха огонь не горит' },
    blocks: { does: 'горящая трава, листья, дерево, дома и стены замков гаснут', why: 'без воздуха огонь не горит' },
    inferno: { does: 'поток «Инферно», попавший в конус, гаснет сразу (у любого волшебника)', why: 'без воздуха пламя гаснет' },
    fireMaxima: { does: 'огненная спираль «Fire Maxima» гаснет в полёте и не распускается; цветок гаснет', why: 'без воздуха огонь не горит' },
    hellfire: { does: 'обычный всплеск только сбивает его (меньше и не растёт пару секунд); Maxima, пока на нём, заливает: он уменьшается и гаснет (и кольцо тоже)', why: 'адский огонь сильнее: мгновения без воздуха ему мало' },
    hellfireLeft: { does: 'брошенные огни адского огня: маленькие (части кольца) гаснут от всплеска, большой — уменьшается; Maxima гасит все', why: 'без воздуха огонь не горит' },
    carts: { does: 'горящая повозка путников гаснет (Carriages.douse); на людей и коней на ней — как на всех', why: 'без воздуха пламя на досках гаснет' },
    ships: { does: 'пожар на палубе и на парусах гаснет; корпус, паруса и палуба не ломаются', why: 'без воздуха огонь не горит' },
    items: { does: 'вещи на земле и в руках не двигаются и не портятся', why: 'струя мягкая' },
    water: { does: 'не действует', why: 'в воде и так ничего не горит' },
    ground: { does: 'не действует (земля не мокнет и не размывается)', why: 'исчезает только воздух' },
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
        if (sp.self) return this._air(sp, dt);
        const max = sp.max;
        const half = max ? FIREFIGHT.MAX_HALF : FIREFIGHT.HALF;
        const full = max ? FIREFIGHT.MAX_REACH : FIREFIGHT.REACH;
        const reach = this._reach(sp.o, sp.d, max ? full * Math.min(1, sp.t / FIREFIGHT.GROW) : full);
        sp.reach = reach;
        this._draw(sp, dt, reach, half);
        const hit = (c, r) => inCone(sp.o, sp.d, reach + 1, half, c, r);
        let did = false;
        if (!max) {
            // the burst: everything once, when the air collapses there
            if (sp.done || sp.t < FIREFIGHT.AT) return false;
            sp.done = true;
            if (this._douse(sp, reach, half, hit)) did = true;
            if (g.hellfire?.douse?.(hit, 0)) { did = true; this._steamOn(sp, reach, hit); }
            return did;
        }
        // the hose: the Hellfire every frame (it smothers while the cone is on it), the rest every tick
        if (g.hellfire?.douse?.(hit, dt)) { did = true; if (Math.random() < dt * 6) this._steamOn(sp, reach, hit); }
        sp.tickT = (sp.tickT ?? 0) - dt;
        if (sp.tickT <= 0) {
            sp.tickT = FIREFIGHT.TICK;
            if (this._douse(sp, reach, half, hit)) did = true;
        }
        return did;
    }

    /**
     * «Firefighting» with the wand raised UP (or at oneself): the air round the CASTER vanishes for an instant —
     * whoever burns within BURN.UP_R (UP_R_MAX for «Maxima») stops burning: the caster, a neighbour, a beast; the fires
     * of blocks round them go out too. Seen: the air collapsing onto the caster; heard: the suck of air.
     * Not burning, nobody near burning: only the mana is spent (nothing to count).
     */
    _air(sp, dt) {
        if (sp.done || sp.t < FIREFIGHT.AT) return false;
        sp.done = true;
        const g = this.game, B = BURN_CFG();
        const R = sp.max ? B.UP_R_MAX : B.UP_R;
        let did = (g.burning?.douseAround?.(sp.o, R) || 0) > 0;
        if ((g.fire?.douse?.(sp.o, R) || 0) > 0) did = true;
        this._implode(sp.o, Math.min(R, 2.2));
        g.sound?.playSpellFx?.('fxVacuum', sp.o, 1, 1);
        if (did) this._steam(_c.copy(sp.o), 1.2);
        this._note({ ev: 'air', max: !!sp.max, did, by: sp.by });
        return did;
    }

    /** How far the cone goes: `want` m, or to the first wall / the ground (on through water). */
    _reach(o, d, want) {
        const g = this.game;
        for (let k = 0.6; k < want; k += 0.5) {
            const x = o.x + d.x * k, y = o.y + d.y * k, z = o.z + d.z * k;
            if (g._flameBlock?.(x, y, z) === 'solid') return k + 0.5; // (it splashes onto what burns there)
            // (the floor under this point — in a cave, a tunnel, a house it is not the hill's top over them:
            // the cone stopped at the hand there and never reached a campfire)
            const gy = g.collision?.groundAt ? g.collision.groundAt(x, z, y) : g.collision?.groundY ? g.collision.groundY(x, z) : -Infinity;
            if (y < gy - 0.3) return k;
        }
        return want;
    }

    /** Fires, the «Инферно», «Fire Maxima», burning living trees, creatures, me. @returns true: a fire went out */
    _douse(sp, reach, half, hit) {
        const g = this.game, o = sp.o, d = sp.d;
        const auth = !!g.authority;
        let did = false;
        const tan = Math.tan(half);
        // trees, grass, leaves, wood, houses (every computer: Fire.js is the same everywhere); ships' fires (the host)
        for (let k = 1; k <= reach + 1; k += 1.5) {
            _a.copy(o).addScaledVector(d, k);
            const r = (0.6 + k * tan) * FIREFIGHT.SPREAD;
            if ((g.fire?.douse?.(_a, r) || 0) > 0) did = true;
            if (auth && (g.ships?.douse?.(_a, r + 0.5) || 0) > 0) did = true;
            if (auth && (g.carriages?.douse?.(_a, r + 0.5) || 0) > 0) did = true; // (a burning cart on the road)
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
        // «Инферно» streams (anyone's): no air round the flame puts it out
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
            if (s.by === g.localId || s.by === 'local') g.hud?.setVoice?.('💨 Ваше пламя «Инферно» задохнулось — у него забрали воздух', true);
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
        if (g.burning?.douseWhere?.(hit)) { did = true; this._steam(_b.copy(o).addScaledVector(d, Math.min(reach, 3)), 1); } // (whoever burns in the cone stops burning)
        this._creatures(sp, hit);
        this._me(sp, hit);
        if (sp.max && !sp.birds && auth) { sp.birds = true; g.books?.hitRay?.(o, d, reach, 0.9, 'water'); } // (the hose: wet pages, the bird falls)
        if (did) this._note({ ev: 'out', max: !!sp.max, by: sp.by });
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
            if (b.kind === 'G') { g.ghosts?.hit?.(body, 0, 'Water', sp.by); continue; } // (a ghost: water passes through it — GhostRules)
            const v = _a.subVectors(b.mid, sp.o).setY(0);
            if (v.lengthSq() < 1e-4) v.set(sp.d.x, 0, sp.d.z);
            v.normalize().multiplyScalar(sp.max ? FIREFIGHT.MAX_PUSH : FIREFIGHT.PUSH);
            g.creatureImpact.apply(body, { v: v.clone(), by: sp.by, spell: 'Firefighting', kind: 'Firefighting', from: sp.o.clone() });
            if (b.kind === 'f') g.phoenixes?.watered?.(body, null, sp.by); // (a phoenix: its fire goes out — it gives up its attack)
            if (b.kind === 'g') g.gargoyles?.watered?.(body, null, sp.by); // (an infernal gargoyle: water only pushes it)
            if (b.kind === 'C') g.customCreatures?.watered?.(body, null, sp.by); // (a creature of one's own: water shoves it)
            if (b.kind === 'N') g.canaries?.hit?.(body, 0, 'Water', sp.by); // (a canary: water puts its flame out, shoves it, angers the camp)
            if (b.kind === 'T') g.tarons?.hit?.(body, 0, 'Water', sp.by); // (a Taron: water puts his flame out, hardly shoves him)
            if (b.kind === 'S') g.spencers?.hit?.(body, 0, 'Water', sp.by); // (the invisible bird: water startles it)
            if (b.kind === 'o') g.owls?.watered?.(body, null, sp.by); // (an owl: not a scroll's — it darts away)
        }
        if (this._pushed.size > 200) this._pushed.clear();
    }

    /** My own player in someone else's spray: soaked (the Hellfire doesn't burn me for a while). */
    _me(sp, hit) {
        const g = this.game, c = g.combat;
        if (sp.by === g.localId || sp.by === 'local' || !c || c.dead) return;
        const me = c.center ? c.center(_c) : _c.copy(g.character.group.position);
        if (!hit(me, 0.45)) return;
        if (!this.wetMe()) g.hud?.setVoice?.('💨 Воздух вокруг вас на миг исчез — адский огонь пока не жжёт', true);
        this.wetUntil = performance.now() + FIREFIGHT.WET * 1000;
    }

    // ============================================================= drawing
    /**
     * No water (the author: «where would the water come from?»): the spell takes the air away — for a
     * split second there is none in the cone, and without air no fire can burn. Seen as the air itself
     * collapsing: rings of pale haze along the cone rushing in to its axis, a shudder at its far end where
     * the air implodes, the flames dying in a puff of smoke that sinks. Heard: a suck of air and a hollow clap.
     */
    _draw(sp, dt, reach, half) {
        const fx = this.game.fx;
        if (!fx?.smoke) return;
        const o = sp.o, d = sp.d;
        const side = _a.set(-d.z, 0, d.x);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize();
        const up = _b.crossVectors(side, d).normalize();
        const live = sp.max || sp.t < 0.2; // (the burst: one collapse)
        const tan = Math.tan(half);
        // rings of air rushing in to the cone's axis (the hose: again and again along it)
        sp.acc = (sp.acc || 0) + (live ? (sp.max ? 18 : 80) * dt : 0);
        let rings = Math.min(12, Math.floor(sp.acc));
        sp.acc -= rings;
        while (rings-- > 0) {
            const k = 0.8 + Math.random() * reach;
            const R = (0.5 + k * tan) * 1.15;
            const cx = o.x + d.x * k, cy = o.y + d.y * k, cz = o.z + d.z * k;
            const n = 12, a0 = Math.random() * 6.28, T = 0.22 + Math.random() * 0.08;
            for (let i = 0; i < n; i++) {
                const a = a0 + (i / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
                const rx = (side.x * c + up.x * sn) * R, ry = (side.y * c + up.y * sn) * R, rz = (side.z * c + up.z * sn) * R;
                fx.smoke.spawn(cx + rx, cy + ry, cz + rz, -rx / T, -ry / T, -rz / T, HAZE[(Math.random() * HAZE.length) | 0],
                    0.16 + Math.random() * 0.12, T, { gravity: 0, shrink: 0.5, spin: 1 });
            }
        }
        // the far end: the air implodes there (a shudder of haze into one point) — once for the burst
        if (!sp.max && !sp.imploded && sp.t >= FIREFIGHT.AT * 0.5) { sp.imploded = true; this._implode(_c.copy(o).addScaledVector(d, Math.max(1, reach - 1)), 1.6); }
        if (sp.max) {
            sp.impT = (sp.impT ?? 0) - dt;
            if (sp.impT <= 0) { sp.impT = 0.25; this._implode(_c.copy(o).addScaledVector(d, Math.max(1, reach - 1)), 1.2); }
        }
        // the sound: a suck of air and a hollow clap (the hose: again as it goes on)
        sp.soundT = (sp.soundT ?? 0) - dt;
        if (sp.soundT <= 0 && live) {
            sp.soundT = sp.max ? 0.7 : 9;
            const g = this.game;
            g.sound?.playSpellFx?.('fxVacuum', _c.copy(o).addScaledVector(d, Math.min(4, reach * 0.4)), sp.max ? 0.8 : 1, sp.max ? 0.9 + Math.random() * 0.2 : 1);
        }
    }

    /** The air rushing in from every side to one point (r: how far round it). */
    _implode(p, r) {
        const fx = this.game.fx;
        if (!fx?.smoke) return;
        const T = 0.24;
        for (let i = 0; i < 44; i++) {
            const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
            const rr = r * (0.7 + Math.random() * 0.4);
            const x = Math.cos(a) * q * rr, y = u * rr * 0.7, z = Math.sin(a) * q * rr;
            fx.smoke.spawn(p.x + x, p.y + y, p.z + z, -x / T, -y / T, -z / T, HAZE[(Math.random() * HAZE.length) | 0],
                0.2 + Math.random() * 0.16, T, { gravity: 0, shrink: 0.6, spin: 2 });
        }
    }

    /** Where the Hellfire was smothered (a few points along the cone that reach a fire). */
    _steamOn(sp, reach, hit) {
        const H = this.game.hellfire;
        const fires = [];
        if (H?.state) fires.push(H.state.c);
        for (const f of H?.remote?.values() || []) fires.push(f.c);
        for (const f of H?.left || []) fires.push(f.c);
        for (const c of fires) if (hit(c, 3)) this._steam(c, 2);
    }

    /** A fire smothered at p (size k): the flames die in a last flicker, the smoke sinks and spreads low (no air to lift it). */
    _steam(p, k = 1) {
        const fx = this.game.fx;
        if (!fx?.smoke) return;
        for (let i = 0; i < 18 * k; i++) {
            const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 1.4;
            const gr = 55 + ((Math.random() * 45) | 0);
            fx.smoke.spawn(p.x + (Math.random() - 0.5) * k * 0.6, p.y + 0.2 + Math.random() * k * 0.5, p.z + (Math.random() - 0.5) * k * 0.6,
                Math.cos(a) * v, -0.2 - Math.random() * 0.3, Math.sin(a) * v, (gr << 16) | (gr << 8) | gr, 0.35 + Math.random() * 0.35 * k, 1.8 + Math.random() * 1, { gravity: -0.3, shrink: -0.35, spin: 1 });
        }
        for (let i = 0; i < 5 * k; i++) {
            fx.glow?.spawn(p.x + (Math.random() - 0.5) * k * 0.5, p.y + 0.3 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * k * 0.5,
                0, 0.3, 0, Math.random() < 0.5 ? 0xff7a20 : 0xffb040, 0.12 + Math.random() * 0.1, 0.25, { shrink: 0.8, spin: 2 });
        }
    }
}

const HAZE = [0xe6edf3, 0xd4dde5, 0xf2f6f9, 0xc3ccd5]; // (the air seen as it collapses: a pale shimmering haze)
