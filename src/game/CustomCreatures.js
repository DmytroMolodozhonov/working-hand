/**
 * CustomCreatures.js — creatures of one's own, made by «Да пусть создастся существо …» (DivineCreation.js).
 *
 * Each is born where the wand pointed, out of a cocoon of light (CREATION.BIRTH_T s, growing from nothing), as described:
 * its body (CreatureForge / CustomCreatureModel — one of nine skeletons, its own proportions, skin and pattern), its way to
 * walk (one of ten) and, if it flies, its way to fly (one of ten), its size, health (20 unless said), speed, temper,
 * abilities and flaws. Then it lives in the world:
 *   - it walks round everybody and everything (the crowd — crowdStep, Pilot.js; walls — resolveCylinder; never off a cliff,
 *     into water only if it swims), flies over the land (never through it: the ground under it and ahead decides its height),
 *     lands and takes off again; it stays near its home (where it was born), in its habitat if it has one (water, forest…);
 *   - its temper: friendly — keeps near its maker, comes up to people; neutral — goes about its business, fights back when
 *     struck (a small one runs); shy — runs from anybody close; hostile — hunts players (never its maker), villagers and,
 *     a meat-eater, animals — but only faced: it turns to its prey first (CLAUDE.md «Лицом к цели»), then bites (≤ CAPS.DMG_MAX);
 *   - its abilities act on the world (CreationRules.ABILITIES): fire (sets alight, burns — not a fire creature, not a dragon),
 *     water (puts fires out, shoves), ice (slows — never the Ice Queen's folk), poison, lightning, a glow at night, vanishing
 *     when threatened, a leap away, healing friends, a song that stills zombies and hostile creatures;
 *   - its flaws: slow, half-blind, fragile, clumsy (it trips), timid, afraid of water, sleepy by day, loud;
 *   - it breeds when its kind may (`breed`), up to CREATION.MAX_CREATURES in the world.
 *
 * «На кого и на что» — TARGETS below: every blow, charge, blast, beam, push touches it (its own immunities: a fire-breather
 * does not burn, an ice-breather does not freeze, a water-spitter does not mind water); «Империус» takes it (a creature made
 * by the gods' spell — only «Империус Максима», Imperius.IMPERIUS_TARGETS.custom).
 *
 * Multiplayer: the host lives them ('ccr' s, ~8×/s), guests draw them from their recipe (the same body: its seed); a guest's
 * blow goes to the host; the host hurts a guest by a message. Saved with the world (the kinds and the ones alive).
 */

import * as THREE from 'three';
import { registerKind } from './CreatureImpact.js';
import { crowdStep } from './CrowdSources.js';
import { CREATION, CAPS, ABILITIES, recipeKey, sanitizeRecipe } from './CreationRules.js';
import { buildCreature, poseCreature, sampleCreature } from '../entities/CustomCreatureModel.js';
import { creatureSpeed } from './CreatureForge.js';
import { eachBody, hitBody } from './MagicWave.js';
import { SCROLL_KINDS } from './IceQueen.js';
import { isDivine } from './ProtectionGods.js';
import { realmAt } from '../world/Planets.js';
import { BLOCK } from '../world/Terrain.js';

const r2 = (v) => Math.round(v * 100) / 100;
const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };
const turn = (from, to, max) => { const d = wrap(to - from); return from + Math.max(-max, Math.min(max, d)); };
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rnd = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const MODES = ['idle', 'walk', 'fly', 'swim', 'dead', 'trip'];

const FIRE = /^(Inferno|Fire|FireMaxima|Hellfire|InfernoMaxima|fire|burn|Boom)$/i;
const COLD = /^(Ice|IceDuel|IceMaxima|IceDuelMaxima|Frozen|RodFrozen|RodIce|snow|ice|iceBite)$/;
const WATER = /^(water|Waterball|WaterVortex|WaterVortexSuperMaxima|WaveAttack|WaveAttackMaxima|LetItRain|Firefighting|FirefightingMaxima|Liquidation)$/;

/**
 * ON WHOM AND ON WHAT (CLAUDE.md): what reaches a creature of one's own, what it does to the world.
 */
export const TARGETS = {
    blade: 'меч, топор, кулак, стрела — ранят (у каменной и кристальной кожи — вдвое меньше)',
    duel: '«Авада Кедавра» убивает (живое существо); «Остолбеней» — оглушает на 3 с; остальные заряды — −6',
    plainSpells: 'Бомбардо, Инферно, Сапира, Айс, Даст, Вайнд, вода — ранят и толкают как зверя (CreatureImpact)',
    fire: 'огонь: горит, если само не дышит огнём (fireBreath — огонь ему нипочём)',
    cold: 'холод, «Frozen», лёд: замедляет и ранит, если само не дышит холодом',
    water: 'водяные заклинания: толкают; тому, кто плюётся водой, — ничего',
    scrollSpells: 'молния, «Total Destruction», «Inspirius», «Circle Attack» — ранят полностью',
    gods: 'заклинания богов — убивают сразу («Бум», «Дай», «Planet Liquidation»…)',
    Levitation: '«Вингардиум Левиоса» поднимает, если оно не больше 4 м',
    Brainrot: '«Брейнрот»: злое успокаивается на минуту',
    Imperius: 'вселиться можно только «Империус Максима» — это творение богов',
    DivineCreation: 'само заклинание его не трогает',
    // what it does
    itsFire: 'дышит огнём: поджигает землю, деревья, дома (FireSystem.ignite), ранит тех, на кого дышит (−6)',
    itsWater: 'плюётся водой: гасит огонь (FireSystem.douse), толкает',
    itsIce: 'дышит холодом: −3 и замедляет (на Королеву, снеговиков и ледяных монстров не действует)',
    itsPoison: 'яд: −4',
    itsLightning: 'молния: −7',
    itsHeal: 'лечит существ своего вида и своего создателя рядом (+2)',
    itsSong: 'песня: зомби и злые созданные существа рядом замирают на 2 с',
    villagers: 'злое существо пугает жителей (Danger «beast»), рыцари выходят и бьются с ним (knightStep)',
};

export class CustomCreatures {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.species = new Map(); // key → {key, recipe, owner, name, made}
        this.clock = 0;
        this._netT = 0;
        this._breedT = 30;
        this.log = [];
    }

    get auth() { return this.game.authority !== false; }
    get fx() { return this.game.divine?.fx2 || null; }
    _note(e) { this.log.push({ t: Math.round(this.clock), ...e }); if (this.log.length > 60) this.log.shift(); }

    /** One of each look (Game.prewarm). */
    sampleModels() { return [sampleCreature()]; }

    targets() { return this.list.filter((c) => !c.dead && c.born >= 1); }
    byId(id) { return this.list.find((c) => c.id === id && !c.dead) || null; }

    // ============================================================ birth
    /**
     * (host) The gods make a creature (or a few, as said) at `at`. @returns {true|string} — why not.
     */
    create(recipe, at, by, opts = {}) {
        const g = this.game;
        if (!recipe || recipe.type !== 'creature') return 'Боги не поняли, какое это существо';
        const alive = this.list.filter((c) => !c.dead);
        if (alive.length >= CREATION.MAX_CREATURES) return 'В мире уже слишком много созданных существ';
        if (recipe.temper === 'hostile' && alive.filter((c) => c.recipe.temper === 'hostile').length >= CREATION.MAX_HOSTILE) return 'Злых созданных существ уже слишком много';
        if (realmAt(at.x, at.y, at.z, g.space?.planets) === 'space') return 'В космосе существо не выживет';
        const key = recipeKey(recipe);
        if (!this.species.has(key)) {
            if (this.species.size >= CREATION.MAX_SPECIES) this._forgetSpecies();
            if (this.species.size >= CREATION.MAX_SPECIES) return 'В мире уже слишком много видов созданных существ';
            this.species.set(key, { key, recipe, owner: opts.key || this._key(by), name: recipe.name, made: Date.now() });
            this._send({ op: 'sp', sp: [this._spNet(this.species.get(key))] });
        }
        const n = Math.min(recipe.count || 1, CREATION.MAX_CREATURES - alive.length);
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU, rr = n > 1 ? 1.5 + recipe.size * 0.6 : 0;
            const x = at.x + Math.cos(a) * rr, z = at.z + Math.sin(a) * rr;
            const y = this._floor(x, z, at.y + 3);
            const c = this.spawn(key, new THREE.Vector3(x, y, z), { born: 0, owner: opts.key || this._key(by) });
            if (c && opts.dir) c.yaw = Math.atan2(opts.dir[0], opts.dir[1]); // (its face to the one who made it)
        }
        this._note({ ev: 'create', key, n, by });
        if (recipe.temper === 'hostile') g.castleLife?.alarm?.({ x: at.x, y: at.y, z: at.z }, 'beast', by, 20);
        return true;
    }

    /** The kind with nobody of it left (the oldest first) is forgotten — room for a new one. */
    _forgetSpecies() {
        const used = new Set(this.list.filter((c) => !c.dead).map((c) => c.sp));
        const free = [...this.species.values()].filter((s) => !used.has(s.key)).sort((a, b) => a.made - b.made);
        if (free.length) this.species.delete(free[0].key);
    }

    /** A creature of kind `key` at pos (every computer: a guest from the host's snapshot). */
    spawn(key, pos, o = {}) {
        const g = this.game, S = this.species.get(key);
        if (!S) return null;
        const recipe = S.recipe;
        const seed = o.seed ?? ((Math.random() * 1e9) | 0);
        const model = buildCreature(recipe, key, seed);
        model.position.copy(pos);
        g.scene?.add(model);
        const D = model.userData.dims;
        const hp = Math.max(1, Math.round(recipe.hp || CAPS.HP_DEFAULT));
        const c = {
            id: o.id ?? 'cc' + Math.floor(Math.random() * 1e9).toString(36), ck: 'C', isCustom: true, sp: key, recipe, seed, model, group: model,
            hp: o.hp ?? hp, maxHp: hp, dead: false, born: o.born ?? 1, scale: o.scale ?? 1, owner: o.owner ?? S.owner,
            get isDead() { return this.dead; }, get position() { return this.model.position; },
            yaw: o.yaw ?? Math.random() * TAU, vel: new THREE.Vector3(), vy: 0, home: o.home ? new THREE.Vector3(o.home[0], 0, o.home[1]) : pos.clone(),
            state: 'idle', t: rnd(1, 4), goal: null, foe: null, foeT: 0, flying: false, alt: 0, flyT: rnd(10, 30), a: { mode: 'idle', walk: recipe.walk, fly: recipe.fly, speed: 0, k: 0 },
            cd: {}, invisT: 0, stunT: 0, slowT: 0, sleepT: 0, calmT: 0, tripT: 0, D, r: Math.max(0.25, D.radius * (o.scale ?? 1)), h: D.top * (o.scale ?? 1),
            speeds: creatureSpeed(recipe), canFly: !!recipe.fly, swim: !!recipe.swim,
        };
        c.bodyCapsule = (out) => this._capsule(c, out);
        c._strikeParts = Object.assign([['body', () => model.userData.rig?.body, [0, 0, 0], [D.torso.rx, D.torso.ry, D.torso.rz]], ['head', () => model.userData.head, [0, 0, 0], [D.head.r || 0.2, D.head.r || 0.2, D.head.r || 0.2]]], { model });
        model.rotation.y = c.yaw;
        this.list.push(c);
        return c;
    }

    _remove(c) {
        this.game.scene?.remove(c.model);
        // (every shape is shared, the materials kept by the kind: nothing of its own to dispose)
        const i = this.list.indexOf(c);
        if (i >= 0) this.list.splice(i, 1);
    }

    /** Its body for hits: a capsule (world). */
    _capsule(c, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.5 }) {
        const H = c.D.hit, k = c.scale * (c.born >= 1 ? 1 : Math.max(0.05, c.born));
        const cy = Math.cos(c.model.rotation.y), sy = Math.sin(c.model.rotation.y), p = c.model.position;
        const tr = (v, o) => o.set(p.x + (v[0] * cy + v[2] * sy) * k, p.y + v[1] * k, p.z + (-v[0] * sy + v[2] * cy) * k);
        out.a = out.a || new THREE.Vector3(); out.b = out.b || new THREE.Vector3();
        tr(H.a, out.a); tr(H.b, out.b); out.r = H.r * k;
        return out;
    }

    centre(c, out = new THREE.Vector3()) { const b = this._capsule(c, { a: _v, b: _v2 }); return out.copy(b.a).add(b.b).multiplyScalar(0.5); }

    // ============================================================ players
    _player(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') {
            if (g.isDeadLocal || g.combat?.dead) return null;
            const ch = g.character;
            const pos = g.invis ? g.invis.aiPos(g.localId, ch.group.position) : ch.group.position;
            return pos ? { id: g.localId, pos, key: this._key(g.localId) } : null;
        }
        const r = g.remotes?.get(id);
        if (!r || r.dead || !r.position) return null;
        return { id, pos: g.invis ? g.invis.aiPos(id, r.position) : r.position, key: this._key(id) };
    }

    _players() {
        if (this._pl) return this._pl;
        const g = this.game, out = [];
        const me = this._player(g.localId);
        if (me) out.push(me);
        for (const [id] of g.remotes || []) { const p = this._player(id); if (p) out.push(p); }
        if (this._inFrame) this._pl = out;
        return out;
    }

    _key(id) { return this.game.divine?._key?.(id) ?? String(id); }

    _floor(x, z, reach) { const col = this.game.collision; const y = col?.groundAt ? col.groundAt(x, z, reach) : col?.groundY?.(x, z); return Number.isFinite(y) ? y : 0; }

    _water(x, y, z) {
        const t = this.game.terrain?.data || this.game.world?.terrain?.data;
        return !!t && t.get?.(Math.round(x), Math.floor(y + 0.6), Math.round(z)) === BLOCK.WATER;
    }

    // ============================================================ harm
    /**
     * A blow / a spell on it (a guest's goes to the host). Its own immunities first; then the hurt, the anger or the flight.
     */
    hit(c, dmg, kind = null, by = undefined, dir = null) {
        if (!c || c.dead) return;
        const g = this.game;
        if (by === undefined) by = g.localId;
        if (!this.auth) { this._send({ op: 'hit', id: c.id, dmg: r2(+dmg || 0), kind: typeof kind === 'string' ? kind.slice(0, 24) : null }); this._puff(c, 6); return; }
        if (by === 'local' || by === 'H') by = g.localId;
        const R = c.recipe, k = String(kind || '');
        if (isDivine(k)) dmg = Math.max(dmg, c.hp + 1); // (the gods' spells: no creature of theirs stands against them)
        else if (FIRE.test(k) && R.abilities.includes('fireBreath')) { this._puff(c, 4); return; }
        else if (COLD.test(k) && R.abilities.includes('iceBreath')) { this._puff(c, 4); return; }
        else if (WATER.test(k) && R.abilities.includes('waterSpit')) return;
        if ((k === 'melee' || k === 'blade' || k === 'punch' || k === 'arrow') && (R.skin === 'stone' || R.skin === 'crystal' || R.skin === 'shell')) dmg *= 0.5;
        if (COLD.test(k)) c.slowT = Math.max(c.slowT, 4);
        if (!(dmg > 0)) { this._startle(c, by); return; }
        c.hp = Math.max(0, c.hp - dmg);
        this._puff(c, 10);
        this._note({ ev: 'hit', id: c.id, dmg, kind, by });
        if (c.hp <= 0) { this._die(c, by); return; }
        // invisible / a leap away when threatened (its own abilities)
        if (R.abilities.includes('invisible') && this._ready(c, 'invisible')) { c.invisT = 5; this._send({ op: 'fx', id: c.id, k: 'invisible' }); }
        if (R.abilities.includes('teleport') && c.hp < c.maxHp * 0.5 && this._ready(c, 'teleport')) this._teleport(c);
        this._startle(c, by);
    }

    /** Struck or threatened by `by`: the angry fight, the timid run. */
    _startle(c, by) {
        const R = c.recipe;
        if (c.calmT > 0) return;
        const fights = R.temper === 'hostile' || (R.temper === 'neutral' && (c.D.H >= 1.2 || R.abilities.some((a) => ABILITIES[a].dmg > 0)));
        const pl = by != null ? this._player(by) : null;
        if (fights && by != null && (pl || this.game.castleLife?.byId?.get?.(by))) { c.foe = by; c.foeT = 25; c.state = 'hunt'; }
        else { c.state = 'flee'; c.t = rnd(4, 7); c.fleeFrom = pl ? pl.pos.clone() : c.model.position.clone().add(_v.set(rnd(-1, 1), 0, rnd(-1, 1))); }
    }

    hitAt(p, radius, dmg, kind, by = null) {
        if (!this.auth) return;
        for (const c of this.targets()) { const q = this.centre(c, _v3); if (q.distanceTo(p) < radius + c.r) this.hit(c, dmg * Math.max(0.3, 1 - q.distanceTo(p) / (radius + c.r)), kind, by); }
    }

    hitRay(org, d, len, width, dmg, kind, by = null) {
        if (!this.auth) return false;
        let any = false;
        for (const c of this.targets()) {
            const b = this._capsule(c, { a: new THREE.Vector3(), b: new THREE.Vector3() });
            let hit = false;
            for (let k = 0; k <= 2 && !hit; k++) {
                const q = _v2.lerpVectors(b.a, b.b, k / 2);
                const along = _v.subVectors(q, org).dot(d);
                if (along < -b.r || along > len + b.r) continue;
                hit = _v.addScaledVector(d, -Math.max(0, Math.min(len, along))).length() < width + b.r;
            }
            if (hit) { this.hit(c, dmg, kind, by); any = true; }
        }
        return any;
    }

    /** A duel charge touched it. */
    boltHit(c, spell, by) {
        if (!c || c.dead) return;
        if (spell === 'AvadaKedavra') { this.game.fx?.lightFlash?.(this.centre(c, _v3), 0x2bff00, 5, 0.5, 24); this.hit(c, c.hp + 1, spell, by); return; }
        if (spell === 'Stupefy') { if (this.auth) c.stunT = 3; this.hit(c, 1, spell, by); return; }
        if (spell === 'Expelliarmus' || spell === 'Disarmor') { this.hit(c, 2, spell, by); return; }
        this.hit(c, 6, spell, by);
    }

    /** Water reached it (a vortex, a storm, a wave). */
    watered(c, push = null, by = null) { if (c && !c.dead) this.hit(c, c.recipe.abilities.includes('waterSpit') ? 0 : 2, 'water', by); }

    /** A house's sphere turned it away. */
    shooed(c) { if (this.auth && c && !c.dead) { c.state = 'flee'; c.t = 3; c.fleeFrom = c.model.position.clone().add(_v.set(rnd(-1, 1), 0, rnd(-1, 1))); } }

    /** «Брейнрот»: a hostile one is calm a minute. */
    calm(c, s = 60) { if (c && !c.dead) { c.calmT = s; c.foe = null; c.state = 'idle'; } }

    _die(c, by) {
        if (c.dead) return;
        c.dead = true;
        c.a.mode = 'dead'; c.a.deadT = 0;
        const p = this.centre(c, new THREE.Vector3());
        this._burst(p, c);
        this._note({ ev: 'die', id: c.id, by });
        if (this.auth) {
            this._send({ op: 'die', id: c.id });
            if (by === this.game.localId) this.game.hud?.setVoice?.(`💀 «${c.recipe.name}» погибло`, true);
        }
        c.deadAt = this.clock;
    }

    _burst(p, c) {
        const pal = c.model.userData.mats?.pal || [0xffd98a];
        for (let i = 0; i < 40; i++) this.game.fx?.spark?.(p, pal[i % pal.length], 0.12, _v.set(rnd(-3, 3), rnd(0, 3), rnd(-3, 3)), rnd(0.8, 1.6));
    }

    _puff(c, n) {
        const p = this.centre(c, _v3), pal = c.model.userData.mats?.pal || [0xffffff];
        for (let i = 0; i < n; i++) this.game.fx?.spark?.(p, pal[i % pal.length], 0.07, _v.set(rnd(-1.5, 1.5), rnd(0, 2), rnd(-1.5, 1.5)), 0.6);
    }

    _ready(c, k) {
        const A = ABILITIES[k];
        if ((c.cd[k] || 0) > this.clock) return false;
        c.cd[k] = this.clock + (A?.cd || 5) * 1000;
        return true;
    }

    _teleport(c) {
        const p = c.model.position;
        for (let k = 0; k < 8; k++) {
            const a = Math.random() * TAU, d = rnd(8, ABILITIES.teleport.range);
            const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
            const y = this._floor(x, z, p.y + 6);
            if (Math.abs(y - p.y) > 6 || this._water(x, y, z)) continue;
            this._burst(this.centre(c, _v3), c);
            p.set(x, y, z);
            this._send({ op: 'fx', id: c.id, k: 'teleport' });
            return;
        }
    }

    // ============================================================ frame
    update(dt) {
        const g = this.game;
        if (dt <= 0) return;
        dt = Math.min(dt, 0.1);
        this.clock += dt * 1000;
        this._pl = null; this._inFrame = true;
        const me = g.character?.group?.position;
        const night = g.isNight ? 1 : 0;
        for (const c of [...this.list]) {
            // the birth: a cocoon of light, the body growing out of it
            if (c.born < 1 && !c.dead) {
                c.born = Math.min(1, c.born + dt / CREATION.BIRTH_T);
                const p = c.model.position;
                this.fx?.birth?.(p, c.born, c.D.H * c.scale, dt, c.model.userData.mats?.pal?.[0] ?? 0xffd98a);
                if (c.born >= 1) { this.fx?.born?.(p, c.D.H * c.scale, c.model.userData.mats?.pal?.[0] ?? 0xffd98a); this._voice(c, 'born'); }
            }
            if (c.dead) { c.a.deadT = (c.a.deadT || 0) + dt; if (this.clock - (c.deadAt || 0) > 6000) this._remove(c); }
            else if (this.auth) {
                if (c.imp && g.imperius?.step('C', c, dt)) { /* (a mind in it: «Империус Максима» — ImperiusControl.step) */ }
                else if (c.born >= 1) this._think(c, dt);
            } else if (c.imp?.mine && g.imperius?.step('C', c, dt)) { /* (my mind in it: my computer moves it) */ } else if (c.net) this._follow(c, dt);
            // drawn: near only; posed each frame near, less often far
            const far = me ? c.model.position.distanceTo(me) : 0;
            c.model.visible = far < 220 && !(c.invisT > 0 && !c.dead);
            if (!c.model.visible) continue;
            c._poseT = (c._poseT || 0) - dt;
            if (far > 70 && c._poseT > 0) continue;
            const step = far > 70 ? 0.1 : dt;
            if (far > 70) c._poseT = 0.1;
            c.a.k = c.born >= 1 ? 1 : Math.max(0.02, c.born * c.born);
            c.a.scale = c.scale;
            c.a.sleep = c.sleepT > 0 ? 1 : 0;
            poseCreature(c.model, c.a, step);
            const mats = c.model.userData.mats;
            if (mats?.body?.emissive) mats.body.emissiveIntensity = 0.15 + 0.55 * night;
            if (c.recipe.abilities.includes('glow') && Math.random() < dt * (night ? 6 : 1.5)) this.game.fx?.spark?.(this.centre(c, _v3), c.recipe.glow ?? 0x9ef0ff, 0.06, _v.set(rnd(-0.4, 0.4), 0.6, rnd(-0.4, 0.4)), 1);
        }
        if (this.auth) this._breed(dt);
        this._netSend(dt);
        this._inFrame = false; this._pl = null;
    }

    /** (host) One creature's mind this frame. */
    _think(c, dt) {
        const R = c.recipe, p = c.model.position;
        c.t -= dt;
        for (const k of ['invisT', 'stunT', 'slowT', 'calmT', 'tripT']) if (c[k] > 0) c[k] = Math.max(0, c[k] - dt);
        if (c.foeT > 0 && (c.foeT -= dt) <= 0) c.foe = null;
        if (c.stunT > 0) { this._stand(c, dt); return; }
        // sleepy by day
        if (R.flaws.includes('sleepy') && !this.game.isNight && c.state !== 'hunt') {
            if (c.sleepT > 0) { c.sleepT -= dt; this._stand(c, dt); return; }
            if (Math.random() < dt / 60) { c.sleepT = rnd(15, 40); return; }
        }
        // clumsy: trips now and then on the run
        if (c.tripT > 0) { c.a.mode = 'trip'; c.a.tripT = 1 - c.tripT; c.a.speed = 0; return; }
        if (R.flaws.includes('clumsy') && c.a.speed > 1.5 && Math.random() < dt / 25) { c.tripT = 1; return; }
        const sight = (R.flaws.includes('blind') ? 7 : 24) * Math.max(1, Math.sqrt(c.D.H / 1.6));
        const players = this._players();
        const mine = players.find((q) => q.key === c.owner);
        // its abilities that help (a friend's: water on a fire near, healing)
        this._helpers(c, players);
        // hostile: the hunt
        if (R.temper === 'hostile' && c.calmT <= 0 && !c.foe) {
            const prey = this._prey(c, players, sight);
            if (prey) { c.foe = prey.id; c.foeT = 20; c.state = 'hunt'; }
        }
        if (c.foe && c.state === 'hunt') { if (this._hunt(c, dt, players)) return; c.foe = null; c.state = 'idle'; }
        // shy / timid: away from anybody close
        if ((R.temper === 'shy' || R.flaws.includes('timid')) && c.state !== 'flee') {
            const near = players.find((q) => hd(q.pos, p) < 9 && q.key !== c.owner);
            if (near) { c.state = 'flee'; c.t = rnd(4, 7); c.fleeFrom = near.pos.clone(); }
        }
        if (c.state === 'flee') {
            if (c.t <= 0 || !c.fleeFrom) { c.state = 'idle'; c.fleeFrom = null; }
            else { const ax = p.x - c.fleeFrom.x, az = p.z - c.fleeFrom.z, al = Math.hypot(ax, az) || 1; this._go(c, p.x + ax / al * 12, p.z + az / al * 12, c.speeds.ground * 1.4, dt, 0.5); return; }
        }
        // friendly: keeps near its maker
        if (R.temper === 'friendly' && mine) {
            const d = hd(mine.pos, p);
            if (d < 70 && d > 13) { this._go(c, mine.pos.x, mine.pos.z, c.speeds.ground * (d > 25 ? 1.4 : 1), dt, 8); return; }
        }
        // flight: now and then it takes off, flies about and lands
        if (c.canFly) {
            c.flyT -= dt;
            if (c.flyT <= 0) { c.flying = !c.flying; c.flyT = c.flying ? rnd(14, 35) : rnd(10, 30); c.goal = null; }
            if (c.flying) { this._fly(c, dt); return; }
        }
        // wander round its home
        if (!c.goal || c.t <= 0 || hd(c.goal, p) < 1) {
            if (c.t <= 0 && Math.random() < 0.4) { c.goal = null; c.t = rnd(2, 6); this._stand(c, dt); return; }
            c.goal = this._wanderGoal(c);
            c.t = rnd(5, 12);
        }
        if (c.goal) this._go(c, c.goal.x, c.goal.z, c.speeds.ground * 0.55, dt, 0.8);
        else this._stand(c, dt);
        if (R.flaws.includes('loud') && Math.random() < dt / 8) this._voice(c, 'call');
    }

    /** A point to go to near its home (in its habitat: water — the water; otherwise dry land). */
    _wanderGoal(c) {
        const h = c.home;
        for (let k = 0; k < 6; k++) {
            const a = Math.random() * TAU, d = rnd(4, 22);
            const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
            const y = this._floor(x, z, c.model.position.y + 8);
            const wet = this._water(x, y, z);
            if (c.recipe.habitat === 'water' && c.swim ? wet : !wet || c.swim) return new THREE.Vector3(x, y, z);
        }
        return null;
    }

    /** Stand where it is (the ground under its feet, gravity). */
    _stand(c, dt) {
        c.a.speed = Math.max(0, (c.a.speed || 0) - dt * 6);
        c.a.mode = this._water(c.model.position.x, c.model.position.y, c.model.position.z) && c.swim ? 'swim' : 'idle';
        this._ground(c, dt);
    }

    _ground(c, dt) {
        const p = c.model.position;
        const floor = this._floor(p.x, p.z, p.y + 1.05);
        if (c.swim && this._water(p.x, floor, p.z)) { // (afloat: at the water's top)
            let top = floor;
            while (top < floor + 30 && this._water(p.x, top + 1, p.z)) top++;
            p.y += (top + 0.4 - c.D.torso.y * c.scale - p.y) * Math.min(1, dt * 3);
            c.vy = 0;
            return;
        }
        if (p.y > floor + 0.02 || c.vy > 0) {
            c.vy -= 24 * dt;
            p.y += c.vy * dt;
            if (p.y <= floor) { p.y = floor; c.vy = 0; }
        } else { p.y = floor; c.vy = 0; }
    }

    /** One step towards (tx, tz), round everybody (Crowd), never through a wall, off a cliff, into water it fears. */
    _go(c, tx, tz, speed, dt, stop = 0.5) {
        const g = this.game, p = c.model.position;
        if (c.flying) { c.flying = false; c.flyT = rnd(8, 20); }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        const sp = speed * (c.slowT > 0 ? 0.45 : 1);
        if (d <= stop) { this._stand(c, dt); return false; }
        const want = Math.atan2(-dx, -dz);
        c.yaw = turn(c.yaw, want, 4 * dt);
        c.model.rotation.y = c.yaw;
        const a = crowdStep(g, c, p, dx / d, dz / d, d - stop, { r: c.r, speed: sp, dt, look: 2 + c.r * 2, dy: Math.max(1, c.h * 0.6), id: c.id });
        if (!a) { this._stand(c, dt); return true; }
        const nx = p.x + a.x * sp * dt, nz = p.z + a.z * sp * dt;
        const ny = this._floor(nx + a.x * c.r, nz + a.z * c.r, p.y + 1.25);
        if (p.y - ny > 3.2 && !c.canFly) { c.goal = null; this._stand(c, dt); return true; } // (no leap off a cliff)
        const wet = this._water(nx, ny, nz);
        if (wet && (!c.swim || c.recipe.flaws.includes('hatesWater'))) { c.goal = null; this._stand(c, dt); return true; }
        p.x = nx; p.z = nz;
        g.collision?.resolveCylinder?.(p, c.r, p.y, Math.max(0.5, c.h), 1.05);
        this._ground(c, dt);
        c.a.mode = wet && c.swim ? 'swim' : 'walk';
        c.a.speed = sp;
        return true;
    }

    /** In the air: circles round its home, the land under it and ahead always below. */
    _fly(c, dt) {
        const p = c.model.position, R = c.recipe;
        if (!c.goal || hd(c.goal, p) < 3 || c.t <= 0) {
            const a = Math.random() * TAU, d = rnd(8, 30);
            const x = c.home.x + Math.cos(a) * d, z = c.home.z + Math.sin(a) * d;
            c.goal = new THREE.Vector3(x, 0, z);
            c.alt = rnd(4, 14) + c.D.H;
            c.t = rnd(4, 9);
        }
        let sp = c.speeds.air * (c.slowT > 0 ? 0.45 : 1);
        const dx = c.goal.x - p.x, dz = c.goal.z - p.z, d = Math.hypot(dx, dz) || 1;
        // the flight's own manner of the path
        const f = R.fly;
        let wob = 0;
        if (f === 'bat') wob = Math.sin(this.clock * 0.009) * 1.2;
        if (f === 'hover' && d < 6) sp *= 0.2;
        if (f === 'pulse') sp *= 0.4 + 0.6 * Math.max(0, Math.sin(this.clock * 0.003));
        c.yaw = turn(c.yaw, Math.atan2(-dx, -dz) + wob * 0.3, 2.2 * dt);
        c.model.rotation.y = c.yaw;
        const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
        const nx = p.x + fx * sp * dt, nz = p.z + fz * sp * dt;
        // the ground here and ahead (roofs, hills): never into it
        const gHere = this._floor(nx, nz, p.y + 30), gAhead = this._floor(nx + fx * 6, nz + fz * 6, p.y + 30);
        let want = Math.max(gHere, gAhead) + c.alt;
        if (f === 'swoop') want -= Math.max(0, Math.sin(this.clock * 0.0012)) * (c.alt - 1.5);
        const vy = Math.max(-6, Math.min(5, (want - p.y) * 1.4));
        p.x = nx; p.z = nz; p.y += vy * dt;
        if (p.y < gHere + 0.3) p.y = gHere + 0.3;
        this.game.collision?.resolveCylinder?.(p, c.r, p.y, Math.max(0.5, c.h), 1.05);
        c.a.mode = 'fly'; c.a.speed = sp; c.a.vy = vy; c.a.pitch = Math.atan2(vy, Math.max(1, sp)) * 0.7;
        c.a.roll = Math.max(-0.5, Math.min(0.5, -wrap(Math.atan2(-dx, -dz) - c.yaw)));
    }

    /** The one a hostile creature goes for: a player (never its maker), a villager; a meat-eater an animal too. */
    _prey(c, players, sight) {
        const p = c.model.position, g = this.game;
        let best = null;
        for (const q of players) { if (q.key === c.owner) continue; const d = hd(q.pos, p); if (d < sight && (!best || d < best.d)) best = { id: q.id, d }; }
        for (const v of g.castleLife?.byId?.values?.() || []) { if (v.dead) continue; const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < sight * 0.8 && (!best || d < best.d)) best = { id: v.id, d, v: true }; }
        if (c.recipe.diet === 'meat') for (const a of g.animals?.list || []) { if (a.dead || !a.group) continue; const d = hd(a.group.position, p); if (d < sight * 0.7 && (!best || d < best.d)) best = { id: a.id, d, a: true }; }
        return best;
    }

    /** Where the foe is now: {pos, kind, obj}. */
    _foeOf(c) {
        const g = this.game, id = c.foe;
        const pl = this._player(id);
        if (pl) return { pos: pl.pos, kind: 'player', id };
        const v = g.castleLife?.byId?.get?.(id);
        if (v && !v.dead) return { pos: _v3.set(v.x, v.y, v.z).clone(), kind: 'villager', obj: v };
        const a = g.animals?.byId?.get?.(id) || g.animals?.list?.find?.((q) => q.id === id);
        if (a && !a.dead && a.group) return { pos: a.group.position, kind: 'animal', obj: a };
        return null;
    }

    /** The hunt: face the foe, then a breath / a spit from afar, a bite close. → still hunting. */
    _hunt(c, dt, players) {
        const f = this._foeOf(c);
        if (!f) return false;
        const p = c.model.position, R = c.recipe;
        const d = hd(f.pos, p);
        if (d > 60) return false;
        const reach = c.r + 1.4 + c.D.H * 0.25;
        const want = Math.atan2(-(f.pos.x - p.x), -(f.pos.z - p.z));
        const facing = Math.abs(wrap(want - c.yaw)) < 0.35; // (the author: facing it first, then the blow)
        // a ranged ability
        const ranged = R.abilities.filter((a) => ABILITIES[a].dmg > 0 && ABILITIES[a].range >= d);
        if (ranged.length && facing && d > reach) { const k = ranged[(Math.random() * ranged.length) | 0]; if (this._ready(c, k)) { this._ability(c, k, f); } }
        if (d > reach) { this._go(c, f.pos.x, f.pos.z, c.speeds.ground * 1.3, dt, reach * 0.8); return true; }
        c.yaw = turn(c.yaw, want, 5 * dt); c.model.rotation.y = c.yaw;
        this._stand(c, dt);
        c.biteT = (c.biteT || 0) - dt;
        c.a.bite = Math.max(0, (c.a.bite || 0) - dt * 3);
        if (facing && c.biteT <= 0) {
            c.biteT = 1.4;
            c.a.bite = 1;
            const dmg = Math.max(1, Math.min(CAPS.DMG_MAX, Math.round(2 + c.D.H * 1.2)));
            this._harm(f, dmg, 'bite', c);
            this._voice(c, 'growl');
        }
        // near a castle: the people are afraid of it (and the knights come)
        c.alarmT = (c.alarmT || 0) - dt;
        if (c.alarmT <= 0) { c.alarmT = 3; this.game.castleLife?.alarm?.({ x: p.x, y: p.y, z: p.z }, 'beast', null, 12); }
        void players;
        return true;
    }

    /** Hurt what it attacks (a player — on his own computer; a villager, an animal — the host). */
    _harm(f, dmg, kind, c) {
        const g = this.game;
        if (f.kind === 'player') {
            if (f.id === g.localId) this._hurtMe(dmg, kind, c);
            else this._send({ op: 'hurt', to: f.id, dmg, kind, by: c.id });
            return;
        }
        const dir = _v.subVectors(f.pos, c.model.position).setY(0).normalize();
        if (f.kind === 'villager') g.castleLife?.hit?.(f.obj, dmg, dir.clone(), null, { creature: true });
        else if (f.kind === 'animal') g.animals?.hit?.(f.obj, dmg, dir.clone(), null);
    }

    _hurtMe(dmg, kind, c) {
        const g = this.game, cb = g.combat;
        if (!cb || g.isDeadLocal || cb.dead) return;
        const from = c ? this.centre(c, new THREE.Vector3()) : null;
        if (from && cb.shieldFactor?.(from) >= 1 && cb._blocked?.(from, 'punch')) return; // (my «Protection» takes it)
        if (cb.enabled) cb.damage(dmg, null, 'creature'); else g.damageLocalPlayer?.(dmg);
        g.hud?.setVoice?.(`🐾 ${c?.recipe?.name ? `«${c.recipe.name}»` : 'Существо'}: −${dmg} HP`, true);
    }

    /** One of its abilities used at `f` (its effect on the world, its look on every computer). */
    _ability(c, k, f) {
        const g = this.game, A = ABILITIES[k];
        const from = this.centre(c, new THREE.Vector3());
        if (c.model.userData.head) c.model.userData.head.getWorldPosition(from);
        const to = f.pos.clone ? f.pos.clone() : new THREE.Vector3(f.pos.x, f.pos.y, f.pos.z);
        to.y += 1;
        this._abilityFx(k, from, to);
        this._send({ op: 'ab', id: c.id, k, f: [r2(from.x), r2(from.y), r2(from.z)], t: [r2(to.x), r2(to.y), r2(to.z)] });
        c.a.breath = 1;
        setTimeout(() => { c.a.breath = 0; }, 600);
        if (k === 'fireBreath') g.fire?.ignite?.(to, 1.2);
        if (k === 'waterSpit') g.fire?.douse?.(to, 3);
        const dmg = A.dmg;
        if (dmg > 0) {
            if (f.kind === 'player') this._harm(f, dmg, k, c);
            else if (f.obj) {
                if (k === 'iceBreath' && f.obj.isIce) return; // (the Ice Queen's folk: cold is nothing to them)
                this._harm(f, dmg, k, c);
            }
        }
    }

    /** How an ability looks (every computer). */
    _abilityFx(k, from, to) {
        const fx = this.game.fx;
        if (!fx) return;
        const col = { fireBreath: [0xff7a1a, 0xffd04a], waterSpit: [0x4ab0ff, 0xbfe8ff], iceBreath: [0xbfefff, 0xffffff], poison: [0x7adc3a, 0x3a8a1a], lightning: [0xfff6a0, 0x9fd8ff], heal: [0x8aff9a, 0xffffff], sing: [0xffb8ff, 0xfff0a0] }[k] || [0xffffff, 0xffd98a];
        const dir = _v.subVectors(to, from);
        const L = dir.length() || 1;
        dir.multiplyScalar(1 / L);
        if (k === 'lightning') { fx.straightBeam?.(from.clone(), to.clone(), 0.08, col[0], 0.9, 0.25); fx.lightFlash?.(to, col[1], 4, 0.3, 30); }
        for (let i = 0; i < 26; i++) {
            const sp = 9 + Math.random() * 6;
            fx.spark?.(from, col[i % 2], k === 'fireBreath' ? 0.22 : 0.14, _v2.set(dir.x * sp + rnd(-1.2, 1.2), dir.y * sp + rnd(-0.6, 1), dir.z * sp + rnd(-1.2, 1.2)), Math.min(1.6, L / sp + 0.2));
        }
        if (k === 'fireBreath') fx.lightFlash?.(from, 0xff8a2a, 3, 0.4, 25);
        this.game.sound?.playSpellFxAt?.(k === 'fireBreath' ? 'fxFire' : k === 'lightning' ? 'fxElectrum' : k === 'iceBreath' ? 'fxIce' : 'fxCreatureCall', from, 0.7, 1, 10);
    }

    /** The helpful abilities: water on a fire near, healing its kind and its maker, a song stilling the hostile. */
    _helpers(c, players) {
        const R = c.recipe, p = c.model.position, g = this.game;
        if (R.abilities.includes('waterSpit') && R.temper !== 'hostile' && g.fire?.burningAt && (c.cd.look || 0) < this.clock) {
            c.cd.look = this.clock + 1500;
            const at = new THREE.Vector3(p.x + rnd(-8, 8), p.y + 1, p.z + rnd(-8, 8));
            if (g.fire.burningAt(at, 6) && this._ready(c, 'waterSpit')) this._ability(c, 'waterSpit', { pos: at, kind: 'place' });
        }
        if (R.abilities.includes('heal') && this._ready(c, 'heal')) {
            for (const o of this.list) if (!o.dead && o !== c && o.sp === c.sp && o.hp < o.maxHp && hd(o.model.position, p) < ABILITIES.heal.range) { o.hp = Math.min(o.maxHp, o.hp + 2); this._abilityFx('heal', this.centre(c, new THREE.Vector3()), this.centre(o, new THREE.Vector3())); }
            const mine = players.find((q) => q.key === c.owner && hd(q.pos, p) < ABILITIES.heal.range);
            if (mine?.id === g.localId && g.combat?.heal && g.combat.hp < (g.combat.maxHp || 100)) g.combat.heal(2);
        }
        if (R.abilities.includes('sing') && R.temper !== 'hostile' && this._ready(c, 'sing')) {
            let any = false;
            for (const o of this.list) if (!o.dead && o.recipe.temper === 'hostile' && hd(o.model.position, p) < ABILITIES.sing.range) { o.stunT = 2; any = true; }
            for (const z of g.zombies || []) if (!z.isDead && z.group && hd(z.group.position, p) < ABILITIES.sing.range) { z.stunT = Math.max(z.stunT || 0, 2); z.stunned = true; setTimeout(() => { z.stunned = false; }, 2000); any = true; }
            if (any) { this._abilityFx('sing', this.centre(c, new THREE.Vector3()), new THREE.Vector3(p.x, p.y + 4, p.z)); this._voice(c, 'song'); }
        }
    }

    /** Its voice: a call, a growl, a song (pitched by its size). */
    _voice(c, kind) {
        const p = this.centre(c, _v3), rate = Math.max(0.5, Math.min(1.8, 1.4 / Math.sqrt(Math.max(0.3, c.D.H))));
        this.game.sound?.playSpellFxAt?.(kind === 'growl' ? 'fxCreatureGrowl' : kind === 'song' ? 'fxCreatureSong' : 'fxCreatureCall', p, kind === 'growl' ? 0.9 : 0.6, rate, 12);
        if (this.auth && this.game.sync && kind !== 'born') this._send({ op: 'v', id: c.id, k: kind });
    }

    /** (host) Its kind breeds: two (or one, if its kind breeds alone fast) near — a little one, now and then. */
    _breed(dt) {
        this._breedT -= dt;
        if (this._breedT > 0) return;
        this._breedT = 40;
        const alive = this.list.filter((c) => !c.dead && c.born >= 1);
        if (alive.length >= CREATION.MAX_CREATURES) return;
        for (const S of this.species.values()) {
            const R = S.recipe;
            if (!(R.breed > 0)) continue;
            const kin = alive.filter((c) => c.sp === S.key);
            if (!kin.length || (kin.length < 2 && R.breed < 2)) continue;
            if (Math.random() > (R.breed >= 2 ? 0.5 : 0.2)) continue;
            const m = kin[(Math.random() * kin.length) | 0];
            const p = m.model.position;
            const baby = this.spawn(S.key, new THREE.Vector3(p.x + rnd(-2, 2), p.y, p.z + rnd(-2, 2)), { born: 0, scale: 0.5, owner: m.owner, home: [m.home.x, m.home.z] });
            if (baby) { baby.growT = 0; this._note({ ev: 'baby', key: S.key }); }
            return;
        }
    }

    // ============================================================ network
    _send(m) { const net = this.game.sync?.net; if (net) net.send({ t: 'ccr', ...m }, m.op !== 's'); }
    _spNet(S) { return { key: S.key, recipe: S.recipe, owner: S.owner, name: S.name, made: S.made }; }

    _netSend(dt) {
        if (!this.auth || !this.game.sync) return;
        // the little ones grow (half to whole in two minutes)
        for (const c of this.list) if (c.scale < 1 && !c.dead) { c.scale = Math.min(1, c.scale + dt / 240); c.r = Math.max(0.25, c.D.radius * c.scale); c.h = c.D.top * c.scale; }
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.12;
        this._send({ op: 's', l: this.list.filter((c) => !c.dead).map((c) => [c.id, c.sp, r2(c.model.position.x), r2(c.model.position.y), r2(c.model.position.z), r2(c.yaw), MODES.indexOf(c.a.mode), r2(c.a.speed || 0), Math.round(c.hp), r2(c.born), r2(c.scale), c.invisT > 0 ? 1 : 0, c.seed, r2(c.a.pitch || 0), r2(c.a.roll || 0)]) });
    }

    _follow(c, dt) {
        const n = c.net, p = c.model.position;
        p.lerp(n.p, Math.min(1, dt * 8));
        c.yaw = turn(c.yaw, n.yaw, dt * 8);
        c.model.rotation.y = c.yaw;
        c.a.mode = n.mode; c.a.speed = n.speed; c.a.pitch = n.pitch; c.a.roll = n.roll;
    }

    onNet(m, isHost) {
        const g = this.game;
        if (!m || typeof m.op !== 'string') return;
        switch (m.op) {
            case 'sp': if (!isHost) for (const s of (m.sp || []).slice(0, CREATION.MAX_SPECIES)) this._acceptSpecies(s); break;
            case 's': {
                if (isHost) return;
                const seen = new Set();
                for (const e of (m.l || []).slice(0, CREATION.MAX_CREATURES + 8)) {
                    const [id, sp, x, y, z, yaw, mode, speed, hp, born, scale, invis, seed, pitch, roll] = e;
                    if (!this.species.has(sp)) continue;
                    seen.add(id);
                    let c = this.list.find((q) => q.id === id);
                    if (!c) { c = this.spawn(sp, new THREE.Vector3(x, y, z), { id, born, scale, seed, yaw }); if (!c) continue; }
                    c.net = { p: new THREE.Vector3(x, y, z), yaw, mode: MODES[mode] || 'idle', speed, pitch: pitch || 0, roll: roll || 0 };
                    c.hp = hp; c.born = Math.max(c.born, born); c.scale = scale; c.invisT = invis ? 1 : 0;
                }
                for (const c of [...this.list]) if (!seen.has(c.id) && !c.dead) this._remove(c);
                break;
            }
            case 'hit': if (isHost) { const c = this.byId(m.id); if (c) this.hit(c, Math.min(60, Math.max(0, +m.dmg || 0)), typeof m.kind === 'string' ? m.kind.slice(0, 24) : null, m.from); } break;
            case 'die': { const c = this.list.find((q) => q.id === m.id); if (c && !c.dead) this._die(c, null); break; }
            case 'hurt': if (m.to === g.localId) { const c = this.list.find((q) => q.id === m.by); this._hurtMe(Math.min(CAPS.DMG_MAX, Math.max(0, +m.dmg || 0)), String(m.kind || ''), c); } break;
            case 'ab': if (!isHost && Array.isArray(m.f) && Array.isArray(m.t) && ABILITIES[m.k]) this._abilityFx(m.k, new THREE.Vector3(...m.f), new THREE.Vector3(...m.t)); break;
            case 'fx': if (!isHost) { const c = this.list.find((q) => q.id === m.id); if (c) { if (m.k === 'teleport') this._burst(this.centre(c, _v3), c); if (m.k === 'invisible') c.invisT = 5; } } break;
            case 'v': if (!isHost) { const c = this.list.find((q) => q.id === m.id); if (c) this._voice(c, m.k); } break;
        }
    }

    _acceptSpecies(s) {
        if (!s || typeof s.key !== 'string' || !s.recipe) return;
        const recipe = sanitizeRecipe({ ...s.recipe, type: 'creature', creature: s.recipe }, '', 1);
        recipe.name = String(s.recipe.name || s.name || recipe.name).slice(0, 40);
        this.species.set(s.key, { key: s.key, recipe, owner: s.owner, name: recipe.name, made: s.made || Date.now() });
    }

    netList() { return { species: [...this.species.values()].map((S) => this._spNet(S)) }; }
    applyNet(d) { for (const s of d?.species || []) this._acceptSpecies(s); }

    // ============================================================ save
    snapshot() {
        return {
            species: [...this.species.values()].map((S) => this._spNet(S)),
            list: this.list.filter((c) => !c.dead).map((c) => ({ id: c.id, sp: c.sp, p: [r2(c.model.position.x), r2(c.model.position.y), r2(c.model.position.z)], hp: Math.round(c.hp), home: [r2(c.home.x), r2(c.home.z)], owner: c.owner, scale: r2(c.scale), seed: c.seed, yaw: r2(c.yaw) })),
        };
    }

    restore(s) {
        if (!s) return;
        for (const sp of s.species || []) this._acceptSpecies(sp);
        if (!this.auth) return;
        for (const e of (s.list || []).slice(0, CREATION.MAX_CREATURES)) {
            if (!this.species.has(e.sp) || !Array.isArray(e.p)) continue;
            this.spawn(e.sp, new THREE.Vector3(+e.p[0] || 0, (+e.p[1] || 0) + 0.5, +e.p[2] || 0), { id: e.id, hp: e.hp, home: e.home, owner: e.owner, scale: e.scale, seed: e.seed, yaw: e.yaw, born: 1 });
        }
    }

    // ============================================================ the knights
    /**
     * (host, CastleLife) A knight sees a hostile creature of one's own within 90 m: he runs to it and strikes it
     * (the author: «рыцари всегда реагируют на любую опасность»). → true while he is busy with one.
     */
    knightStep(v, dt) {
        if (!this.auth || v.role !== 'knight' || v.sleep || v.stunT > 0) return false;
        let best = null, bd = 1e9;
        for (const c of this.list) {
            if (c.dead || c.born < 1 || c.recipe.temper !== 'hostile' || c.calmT > 0) continue;
            const p = c.model.position, d = Math.hypot(p.x - v.x, p.z - v.z);
            if (d > 90) continue;
            const score = d - (c.foe ? 30 : 0);
            if (score < bd) { bd = score; best = c; }
        }
        if (!best) return false;
        const L = this.game.castleLife, p = best.model.position;
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        v.foe = null; v.seated = false; v.path = null;
        v.ccd = Math.max(0, (v.ccd || 0) - dt);
        L._steer?.(v, p.x, p.z, d > best.r + 3 ? 5.6 : 0, dt, best.r + 2);
        v.mode = d > best.r + 3 ? 'run' : 'attack';
        if (d < best.r + 3.4 && v.ccd <= 0) { v.ccd = 1.1; this.hit(best, 4 + Math.random() * 3, 'blade', v.id); }
        L._ground?.(v);
        return true;
    }

    dispose() { for (const c of [...this.list]) this._remove(c); }
}

// pushes, gusts, knockdowns (CreatureImpact): a creature of one's own is thrown like a beast of its size
registerKind('C', {
    name: 'custom', faces: -1,
    list: (g) => g.customCreatures?.list || [],
    get: (g, id) => g.customCreatures?.byId(id),
    alive: (c) => !c.dead && c.born >= 1,
    body: () => 'custom',
    centre: (c, out) => c ? c.bodyCapsule ? (() => { const b = c.bodyCapsule({ a: new THREE.Vector3(), b: new THREE.Vector3() }); return out.copy(b.a).add(b.b).multiplyScalar(0.5); })() : out.copy(c.model.position) : out,
    pivot: (c) => ({ obj: c.model.userData.rig?.bob || null, base: 0, lie: 0 }),
    head: (c) => c.model.userData.head, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { const p = c.model.position; p.x += dx; p.z += dz; g.collision?.resolveCylinder?.(p, c.r, p.y, Math.max(0.5, c.h), 1.05); },
    toss(g, c, vy) { c.vy = Math.max(c.vy || 0, vy); },
    hold() {},
    frozen: (c) => c.slowT > 3,
    noKnock: (c) => c.D.H > 6, // (a beast over a house is not knocked down)
    immune(g, c, o) {
        const k = o.spell || o.kind || '';
        if (WATER.test(k) && c.recipe.abilities.includes('waterSpit')) return true;
        return false;
    },
    struck(g, c, o) {
        if (o.spell === 'Ward' || o.kind === 'fall') return;
        g.customCreatures?._startle(c, o.by ?? null);
    },
});

/** The creatures the gods made as the castle's dangers (eachBody / hitBody): their centre for a wave. */
export const customCentre = (c, out = new THREE.Vector3()) => (c.bodyCapsule ? (() => { const b = c.bodyCapsule({ a: new THREE.Vector3(), b: new THREE.Vector3() }); return out.copy(b.a).add(b.b).multiplyScalar(0.5); })() : out.copy(c.model.position));

/** The spells a scroll teaches hurt fully; everything else too (a creature of one's own is no magic beast of the world). */
export const hurtsFully = (kind) => SCROLL_KINDS.has(kind) || true;
void eachBody; void hitBody;
