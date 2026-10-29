/**
 * Burning.js — a creature ON FIRE («горит»): the fire sticks to the body and keeps burning it for a while.
 *
 *   Before    fire only hurt while a creature stood in it. Now whoever really caught fire (the «Инферно» stream,
 *             «Fire Maxima», «Let the Hellfire Come», a dragon's or a phoenix's flame, a campfire or a burning
 *             block/tree stood in for BURN.STAND s) goes on burning on their own: ~8 s, every new hit of fire
 *             renews it (never longer than 8 s), −2 HP a second (one damage for all — Damage.js), armour that
 *             resists fire cuts it (ArmorTypes: kind 'fire'), a shield does NOT stop it (fire goes round it).
 *   Put out   «Firefighting» with the wand raised UP (or at oneself): the air round the caster vanishes for an
 *             instant — whoever burns within BURN.UP_R (the caster, a neighbour) stops burning; «Firefighting» ahead
 *             puts out whoever is in the cone; water (swimming, a water ball / vortex / wave, rain-free: any
 *             `_flameWaters` sphere); «Wind Maxima» up (the wave); time; death; a wizard puts himself out.
 *   Panic     a burning villager / animal runs (to water when there is some close, else away from the fire) and
 *             shouts; the people round take fright (Danger 'fire'). A burning player runs and casts as usual.
 *   Network   each computer decides ITS player (burns, hurts, puts out) and tells the rest 'burn'; the host decides
 *             every other creature and lists the burning ones to the guests ('burnl'); all draw the flames.
 *   Cost      flames are pooled particles, no light per body; only BURN.FULL nearest bodies get the full flames.
 */

import * as THREE from 'three';
import { onFire, FIRE } from './WizardMind.js';

export const BURN = {
    TIME: 8, // s a creature burns after the last fire that touched it (also the most it can ever have left)
    DMG: 2, // HP a second (a player has 20; one damage for every creature)
    TICK: 1, // s between two burns
    STAND: 0.1, // s a creature must touch a campfire / a burning block / a burning tree to catch fire — whoever runs through a fire or brushes it burns (the author); the check is made 8 times a second while any fire burns (WizardMind.FIRE_TOUCH)
    EDGE: 0.5, // m beyond the flames that still count as «рядом» (the heat of an open fire)
    UP_R: 3, // m round the caster where «Firefighting» held up puts the burning out
    UP_R_MAX: 6, // … «Firefighting Maxima»
    WIZ_SELF: 1.5, // s a wizard needs to put himself out
    FULL: 16, // bodies drawn with the full flames (a crowd of wizards in a great fire must be seen burning)
    FULL_R: 45, // m: farther — a few puffs; beyond FAR nothing
    FAR: 90,
    TTL: 4, // s a guest believes the host's list without an update
    FLAME_RATE: 34, // flames a second on a nearby body
};

/** Kinds of bodies that can burn (Duel._bodies kinds). */
const BURNS = new Set(['p', 'z', 'v', 'a', 'c']);

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). `does`: 'burn' | 'none' | 'own'. Fire catches by `Burning.ignite` (the sources are listed in
 * `BURN_SOURCES`); it goes out by `douseWhere` / water / time.
 */
export const BURN_TARGETS = {
    me: { does: 'burn', why: 'я горю у себя на компьютере: −2 HP в секунду, броня с огнестойкостью режет, щит не держит; бегаю и колдую как обычно; смерть, вода, «Firefighting» вверх/в меня гасят' },
    players: { does: 'burn', why: 'другие игроки горят на своих компьютерах и сообщают об этом по сети (\'burn\'); у меня на них рисуется пламя' },
    zombies: { does: 'burn', why: 'горят (хост решает), бредут как шли; на солнце они и так дымятся — это то же пламя' },
    castlePeople: { does: 'burn', why: 'жители, рыцари, король, торговцы паникуют и бегут к воде (или прочь от огня) с криком; у 4 из 5 волшебников есть «Firefighting» — гасят себя за 1–2 с, платя 3 маны (WizardMind.onFire); у остальных или без маны — паника; кто пробежал через костёр или задел горящий блок — загорается сразу' },
    animals: { does: 'burn', why: 'бегут в панике (Animals.fear), горят и получают ожог каждую секунду' },
    sailors: { does: 'burn', why: 'моряки и скелеты чёрного корабля горят (скелет — как живое дерево: Sailors.pirateBoneDamage решает, сколько)' },
    spider: { does: 'none', why: 'гигантская паучиха слишком велика, чтобы загореться целиком: огонь её лишь ранит (Spider.hit), как раньше' },
    livingTrees: { does: 'own', why: 'ожившие деревья горят своим способом (LivingTrees.burnT/burnAlong) — это не дублируется' },
    bookBirds: { does: 'own', why: 'книга-птица от огня падает и сгорает своим способом (BookBirds)' },
    servants: { does: 'burn', why: 'слуга — как его вид (Брейнрот-зомби, зверь, житель)' },
    dragon: { does: 'none', why: 'огонь на драконов не действует (DragonKinds.FIRE_KINDS)' },
    iceCastle: { does: 'none', why: 'Ледяная Королева, снеговики и ледяные монстры не загораются: огонь их слабость — он их ТОПИТ сразу (IceQueen.iceDamage, FIRE_K), а не жжёт на теле' },
    blackship: { does: 'burn', why: 'капитан Чёрные Усы и скелеты горят как моряки; сам корабль заклинаниями не повреждается (Ships.isCursed)' },
    phoenix: { does: 'none', why: 'феникс рождён из огня' },
    owl: { does: 'none', why: 'сова не горит — слишком магическая (слова автора); чует огонь и улетает от него (Owls.TARGETS)' },
    canary: { does: 'own', why: 'канарик горит своим способом: Canaries.hit (огонь) — горит 6 с, −2 HP в секунду, бежит прочь; лагерь злится на того, кто поджёг' },
    custom: { does: 'own', why: 'созданное существо горит, если само не дышит огнём (CustomCreatures.hit «fire»): огненному огонь нипочём' },
    plant: { does: 'own', why: 'телевильпины и плотоядные головы горят своим способом, быстро: −12 HP/с (Plants.js, PlantLife.BURN); на теле существа не горят; Ярколето огнём не вредит и не злится — оно само из огня (PlantLife.BRIGHT_TARGETS)' },
    spencer: { does: 'none', why: 'птичка Спенсера факелом не горит: от огня она гибнет сразу («Инферно»), на ней огонь не держится' },
    ghost: { does: 'none', why: 'призрак не горит: огонь проходит сквозь него — не действует: призрак бестелесный' },
    gargoyle: { does: 'none', why: 'горгулья адская: огонь её не берёт и не поджигает (GargoyleRules.FIRE_KINDS)' },
    items: { does: 'none', why: 'свитки и книги в огне горят уже своим способом (Game.burnHeldBook/Items); горение на теле их не трогает' },
    ships: { does: 'none', why: 'горящий корабль и повозка сами поджигают тех, кто стоит в их огне (stand), но не горят «на теле»' },
    water: { does: 'out', why: 'вход в воду, плавание, водяной шар/вихрь/волна гасят сразу; в воде загореться нельзя' },
    ground: { does: 'none', why: 'земля не горит' },
    arena: { does: 'burn', why: 'на арене дуэлей ожог — обычный урон: его смягчает ArenaDuels.soften, он не убивает' },
    sleep: { does: 'out', why: 'горящий не засыпает: сон не начинается (Beds._beginSleep)' },
    godGifts: { does: 'none', why: 'дары богов не горят' },
    space: { does: 'out', why: 'в космосе и на планетах без воздуха гореть нечему — пламя гаснет (Space.spaceSpellBlock: нет воздуха); на Солнце смерть наступает и без ожога; на Венере воздуха нет — тоже гаснет' },
};

/** Where fire can catch someone (the table for the author: each source calls `Burning.ignite`). */
export const BURN_SOURCES = ['Inferno (поток)', 'Fire Maxima (спираль и цветок)', 'Let the Hellfire Come (в самом пламени)', 'огонь дракона', 'удар огнём феникса', 'костёр и горящий блок/дерево после BURN.STAND с'];

export const SHOUT_BURN = ['Я горю!', 'Горю! Воды!', 'Помогите, я горю!', 'Огонь! Тушите!'];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Vector3();
const FLAME = [0xff3a0a, 0xff6a14, 0xff9a2b, 0xffc24a, 0xffe08a];
const DARK = [0x2a2622, 0x3a342e, 0x4c453e];
const key = (k, id) => k + ':' + id;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Distance from p to the segment a-b. */
function segDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const L = abx * abx + aby * aby + abz * abz;
    let t = L > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class Burning {
    constructor(game) {
        this.game = game;
        this.me = null; // my own burning: {left, tickT, by}
        this.list = new Map(); // (the host) other creatures: "kind:id" -> {kind, id, left, tickT, by, stand, run, said}
        this.shown = new Map(); // (a guest: the host's list; everybody: other players) "kind:id" -> {kind, id, ttl}
        this.stand = new Map(); // "kind:id" -> s stood in a fire
        this.log = [];
        this._standT = 0;
        this._netT = 0;
        this._tmp = { kind: '', id: '', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
        this._hinted = false;
        this._vig = null;
        this._sentMe = false;
        this._sentList = '';
    }

    _note(e) {
        this.log.push({ t: Math.round(performance.now()) / 1000, ...e });
        if (this.log.length > 40) this.log.shift();
    }

    get burningMe() { return !!this.me; }

    /** Is this creature burning (for the host: every creature; me: mine; the others: as told)? */
    isBurning(kind, id) {
        const g = this.game;
        if (kind === 'p' && id === g.localId) return !!this.me;
        return this.list.has(key(kind, id)) || this.shown.has(key(kind, id));
    }

    // ============================================================= catching fire
    /**
     * Fire touched a creature. `time` s of burning at most (BURN.TIME); a burning one is renewed, never made longer than that.
     * Only the creature's own computer decides about a player (me: here; others: ignored); the host — about the rest.
     * @returns true if it burns now
     */
    ignite(kind, id, by = null, time = BURN.TIME, hell = false) {
        const g = this.game;
        if (!BURNS.has(kind)) return false;
        if (kind === 'p') { if (id !== g.localId && id !== 'local') return false; return this._igniteMe(by, time); }
        if (!g.authority) return false;
        const k = key(kind, id);
        let b = this.list.get(k);
        if (!b) {
            const e = g.duel?._bodyOf?.(kind, id, this._tmp);
            if (!e || this._wet(e)) return false;
            if (kind === 'z' && (g.zombieById?.get(id)?.isFrozen)) return false;
            b = { kind, id, left: 0, tickT: BURN.TICK, by, stand: 0, run: null, said: false, selfT: 0 };
            this.list.set(k, b);
            this._start(b, e);
        }
        b.left = Math.min(BURN.TIME, Math.max(b.left, time));
        if (by) b.by = by;
        b.hell = !!hell; // (the last fire to touch it: a death by the Hellfire's burn counts for the caster — HellKills.js)
        return true;
    }

    _igniteMe(by, time) {
        const g = this.game, c = g.combat;
        if (g.isDeadLocal || c?.dead) return false;
        if (g.config?.mode === 'creative' && !c?.enabled) return false; // (Творческий: no harm to burn)
        if (this._wetMe() || this._noAir()) return false;
        if (g.monster?.active) return false; // (the monster form: fire does not take it, as a dragon — MonsterForm.MONSTER_VS.fire)
        if (!this.me) {
            this.me = { left: 0, tickT: BURN.TICK, by };
            if (c?.frozen) c.frozenLeft = 0; // (the ice melts)
            this._note({ ev: 'igniteMe', by });
            if (!this._hinted) {
                this._hinted = true;
                g.hud?.setVoice?.('🔥 Вы горите! Скажите «Firefighting», подняв палочку вверх, или прыгните в воду', true);
            }
            g.hud?.damageFlash?.();
            this._sendMe(true);
        }
        this.me.left = Math.min(BURN.TIME, Math.max(this.me.left, time));
        if (by) this.me.by = by;
        return true;
    }

    _start(b, e) {
        const g = this.game;
        this._note({ ev: 'ignite', kind: b.kind, id: b.id, by: b.by });
        const mid = _m.copy(e.a).add(e.b).multiplyScalar(0.5);
        // the people round are frightened by a burning one; a burning villager / a beast runs
        if (b.kind === 'v' || b.kind === 'c') g.castleLife?.alarm?.({ x: mid.x, y: mid.y, z: mid.z }, 'fire', b.by, 6);
        if (b.kind === 'v' || b.kind === 'a') b.run = this._runTo(mid);
        g.sound?.playSpellFx?.('fxCrackle', mid, 0.9, 0.95 + Math.random() * 0.1);
    }

    /** Where a burning body runs: toward the nearest water (looked for round it, once), else a random way. */
    _runTo(p) {
        const g = this.game;
        let best = null, bd = Infinity;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
            const cx = Math.cos(a), cz = Math.sin(a);
            for (let d = 6; d <= 30; d += 6) {
                if (g._flameBlock?.(p.x + cx * d, p.y - 0.5, p.z + cz * d) === 'water') { if (d < bd) { bd = d; best = { x: cx, z: cz, water: true }; } break; }
            }
        }
        if (best) return best;
        const a = Math.random() * Math.PI * 2;
        return { x: Math.cos(a), z: Math.sin(a), water: false };
    }

    _wet(e) {
        const g = this.game;
        _a.set(e.a.x, e.a.y + 0.7, e.a.z);
        if (g._flameBlock?.(_a.x, _a.y, _a.z) === 'water') return true;
        for (const s of g._flameWaters?.() || []) if (Math.hypot(_a.x - s.x, _a.y - s.y, _a.z - s.z) < s.r) return true;
        return false;
    }

    _wetMe() {
        const g = this.game;
        if (g.swim?.swimming || g.character?.swimY != null) return true;
        const c = g.combat?.center ? g.combat.center(_a) : _a.copy(g.character.group.position);
        for (const s of g._flameWaters?.() || []) if (Math.hypot(c.x - s.x, c.y - s.y, c.z - s.z) < s.r) return true;
        return false;
    }

    /** No air, no fire: I am in space or on a planet without air (Space.spaceSpellBlock: the same reason as «Inferno» there). Creatures live on the Earth. */
    _noAir() {
        return !!this.game.space?.spellBlocked?.('Inferno');
    }

    // ============================================================= putting out
    /**
     * Put out whoever burns where `hit(centre, radius)` says (a cone, a ring front, a sphere): me, and — the host — the others.
     * (Other players put themselves out: the spell runs on their computer too.) @returns how many stopped burning
     */
    douseWhere(hit) {
        const g = this.game;
        let n = 0;
        if (this.me) {
            const c = g.combat?.center ? g.combat.center(_m) : _m.copy(g.character.group.position);
            if (hit(c, 0.6)) { this._outMe('spell'); n++; }
        }
        if (g.authority) {
            for (const [k, b] of [...this.list]) {
                const e = g.duel?._bodyOf?.(b.kind, b.id, this._tmp);
                if (!e) continue;
                const mid = _m.copy(e.a).add(e.b).multiplyScalar(0.5);
                if (!hit(mid, e.r + 0.5)) continue;
                this._out(k, b, 'spell');
                n++;
            }
        }
        return n;
    }

    /** «Firefighting» held up: whoever burns within `r` of `o` (3D) stops burning. */
    douseAround(o, r) {
        this.game.plants?.bright?.douse?.(o, r); // (water on a Brightflower: it falls asleep)
        return this.douseWhere((c, rr) => Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z) - rr <= r);
    }

    _outMe(why) {
        if (!this.me) return;
        this.me = null;
        this._note({ ev: 'outMe', why });
        this._sendMe(false);
        this._vigOff();
    }

    _out(k, b, why) {
        this.list.delete(k);
        const g = this.game;
        if (b.kind === 'z') { const z = g.zombieById?.get(b.id); if (z && !z.isDead) z.burning = 0; }
        this._note({ ev: 'out', kind: b.kind, id: b.id, why });
    }

    /** Death puts the fire out (Death.js / onLocalDeath). */
    onDeath() { this._outMe('death'); this.stand.clear(); }

    // ============================================================= each frame
    update(dt) {
        const g = this.game;
        this._standT -= dt;
        this._standAcc = (this._standAcc || 0) + dt;
        if (this._standT <= 0) {
            const fire = this._anyFire();
            this._standT = fire ? 0.12 : 0.5; // (a fire burns somewhere: looked at 8 times a second — a runner through it must not slip between two looks)
            const s = this._standAcc; this._standAcc = 0;
            if (fire || this.stand.size) this._standCheck(s);
        }
        if (this.me) this._tickMe(dt);
        if (g.authority) for (const [k, b] of [...this.list]) this._tickBody(k, b, dt);
        this._expire(dt);
        this._fx(dt);
        this._net(dt);
    }

    _tickMe(dt) {
        const g = this.game, c = g.combat, m = this.me;
        if (g.isDeadLocal || c?.dead) { this._outMe('death'); return; }
        if (this._wetMe()) { this._outMe('water'); g.hud?.setVoice?.('💦 Огонь погас', true); return; }
        if (this._noAir()) { this._outMe('noair'); return; }
        m.left -= dt;
        if (m.left <= 0) { this._outMe('time'); return; }
        m.tickT -= dt;
        if (m.tickT > 0) return;
        m.tickT += BURN.TICK;
        if (c?.frozen) c.frozenLeft = 0;
        // (the fire goes round a shield; worn armour resists it: Combat.damage → Armor.absorb with kind 'fire')
        if (c?.enabled) c.damage(BURN.DMG, m.by && m.by !== g.localId ? m.by : null, 'fire');
        else g.damageLocalPlayer?.(BURN.DMG);
        g.sound?.playSpellFx?.('fxCrackle', null, 0.6, 1);
    }

    _tickBody(k, b, dt) {
        const g = this.game;
        const e = g.duel?._bodyOf?.(b.kind, b.id, this._tmp);
        if (!e) { this.list.delete(k); return; }
        if (b.kind === 'z' && g.zombieById?.get(b.id)?.isFrozen) { this._out(k, b, 'frozen'); return; }
        const mid = _m.copy(e.a).add(e.b).multiplyScalar(0.5);
        b.wetT = (b.wetT || 0) - dt;
        if (b.wetT <= 0) { b.wetT = 0.3; if (this._wet(e)) { this._out(k, b, 'water'); return; } }
        b.left -= dt;
        if (b.left <= 0) { this._out(k, b, 'time'); return; }
        if (b.kind === 'z') { const z = g.zombieById?.get(b.id); if (z) z.burning = 0.6; } // (the zombie's own smoke, seen on every computer)
        const v = b.kind === 'v' ? g.duel._creature('v', b.id) : null;
        // a wizard puts himself out with «Firefighting» (4 of 5 know it; it costs mana) — the rest, and one out of mana, run in panic
        if (v?.wizard) {
            if (!b.act) { b.act = onFire({ knows: v.knowsFire !== false, mana: v.mana ?? 0, noWand: !!v.noWand, rank: v.rank }); g.castleLife?.alog?.decision?.(v, b.act.a === 'douse' ? `горит: тушится «Firefighting» (${FIRE.COST} маны, ${b.act.t} с)` : `горит: ${v.knowsFire === false ? 'не знает «Firefighting»' : 'нет маны или палочки'} — бежит к воде/прочь`); }
            if (b.act.a === 'douse') {
                b.selfT += dt;
                if (!b.said) { b.said = true; g.castleLife?._say?.(v, 'Firefighting!'); }
                if (b.selfT >= b.act.t) {
                    if (v.mana >= FIRE.COST) v.mana -= FIRE.COST;
                    this._puff(mid, 1.5);
                    g.sound?.playSpellFx?.('fxVacuum', mid, 0.8, 1);
                    this._out(k, b, 'wizard');
                    return;
                }
                b.run = null; // (while he says it he stands: the wand up)
            }
        }
        // panic: villagers and animals run, and shout
        b.panicT = (b.panicT || 0) - dt;
        if (b.panicT <= 0 && b.run) {
            b.panicT = 0.3;
            const sx = mid.x - b.run.x * 10, sz = mid.z - b.run.z * 10; // (a fear point BEHIND them: they run along `run`)
            if (b.kind === 'v') {
                const cr = v || g.duel._creature('v', b.id);
                if (cr) {
                    g.castleLife?.fear?.(cr, sx, sz, 1, 0.3, { panic: true });
                    if (!b.said) { b.said = true; g.castleLife?._say?.(cr, pick(SHOUT_BURN)); }
                }
            } else if (b.kind === 'a') {
                const cr = g.duel._creature('a', b.id);
                if (cr) g.animals?.fear?.(cr, sx, sz);
            }
        }
        b.tickT -= dt;
        if (b.tickT > 0) return;
        b.tickT += BURN.TICK;
        this._hurt(b, e, mid);
    }

    /** One burn on a creature of the host's (the same number for all: BURN.DMG; the dispatcher is Hellfire's). */
    _hurt(b, e, mid) {
        const g = this.game, by = b.by || null, d = BURN.DMG;
        const dir = _a.set(0, 0, 0);
        if (b.kind === 'z') {
            const z = g.zombieById?.get(b.id);
            if (z && !z.isDead) { z.damageCooldown = 0; g.damageZombie(z, d, false, dir, by); }
        } else if (b.kind === 'a') {
            const a = g.duel._creature('a', b.id);
            if (a) { a.damageCooldown = 0; g.animals?.hit?.(a, d, dir, by, true); }
        } else if (b.kind === 'v') {
            const v = g.duel._creature('v', b.id);
            if (v) g.castleLife?.hit?.(v, d, dir, by, { fire: true, kind: 'burn', hell: !!b.hell });
        } else if (b.kind === 'c') {
            const v = g.duel._creature('c', b.id);
            if (v) g.ships?.crew?.hit?.(v, d, dir, by, { fire: true, kind: 'burn', hell: !!b.hell }); // (a skeleton: Sailors.pirateBoneDamage decides how much)
        }
        g.sound?.playSpellFx?.('fxCrackle', mid, 0.5, 0.9 + Math.random() * 0.2);
    }

    /** Does any fire burn near enough to matter (a campfire, a burning block or tree)? Without one the check is rare and cheap. */
    _anyFire() {
        const g = this.game;
        if (g.fire?.burningBlocks?.size || g.fire?.burningTrees?.length) return true;
        const cf = g.campfires?.list;
        if (cf) for (const f of cf.values()) if (f.left > 0) return true;
        return false;
    }

    /** Touching a campfire or a burning block/tree sets a creature alight — a runner through the fire too (BURN.STAND). */
    _standCheck(s) {
        const g = this.game;
        const inFire = (x, y, z, r) => {
            _b.set(x, y, z);
            return !!(g.campfires?._fireAt?.(_b, r, 1.2, true) || g.fire?.burningAt?.(_b, 0.4));
        };
        const seen = new Set();
        const consider = (kind, id, x, y, z, r) => {
            const k = key(kind, id);
            if (!BURNS.has(kind)) return;
            if (inFire(x, y, z, r + BURN.EDGE)) {
                seen.add(k);
                const t = (this.stand.get(k) || 0) + s;
                if (t >= BURN.STAND) { this.stand.delete(k); this.ignite(kind, id, null); } else this.stand.set(k, t);
            }
        };
        const myFeet = g.character.group.position;
        if (!g.combat?.dead && !g.isDeadLocal) consider('p', g.localId, myFeet.x, myFeet.y - 2, myFeet.z, 0.9);
        if (g.authority) {
            for (const bd of g.duel?._bodies?.(g.localId) || []) {
                if (bd.kind === 'p' || !BURNS.has(bd.kind)) continue;
                consider(bd.kind, bd.id, bd.a.x, bd.a.y + 0.2, bd.a.z, 0.8 + bd.r * 0.3);
            }
        }
        for (const k of this.stand.keys()) if (!seen.has(k)) this.stand.delete(k);
    }

    /** A ray / stream of fire (the «Инферно»): whoever it touches catches fire (host: creatures). */
    igniteRay(o, d, len, width, by) {
        const g = this.game;
        if (!g.authority) return;
        for (const b of g.duel?._bodies?.(by) || []) {
            if (!BURNS.has(b.kind) || b.kind === 'p') continue;
            const mid = _m.copy(b.a).add(b.b).multiplyScalar(0.5);
            _a.subVectors(mid, o);
            const along = _a.dot(d);
            if (along < 0 || along > len + b.r) continue;
            if (_a.addScaledVector(d, -along).length() <= width + b.r + 0.6) this.ignite(b.kind, b.id, by);
        }
    }

    /** A blast of fire at `p` radius `R` (Fire Maxima's flower, a fire-burst): whoever is in it catches fire (host: creatures). */
    igniteSphere(p, R, by) {
        const g = this.game;
        if (!g.authority) return;
        for (const b of g.duel?._bodies?.(by) || []) {
            if (!BURNS.has(b.kind) || b.kind === 'p') continue;
            if (segDist(p, b.a, b.b) - b.r <= R) this.ignite(b.kind, b.id, by);
        }
    }

    _expire(dt) {
        for (const [k, s] of this.shown) { s.ttl -= dt; if (s.ttl <= 0) this.shown.delete(k); }
    }

    // ============================================================= how it looks
    _fx(dt) {
        const g = this.game, fx = g.fx;
        if (!fx?.glow || !fx.smoke) return;
        const cam = g.camera?.position;
        const pool = this._pool || (this._pool = []);
        let nd = 0;
        const add = (kind, id) => {
            let e = pool[nd];
            if (!e) e = pool[nd] = { kind, id, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
            if (g.duel?._bodyOf?.(kind, id, e)) { nd++; return e; }
            return null;
        };
        if (this.me) add('p', g.localId);
        for (const b of this.list.values()) add(b.kind, b.id);
        for (const s of this.shown.values()) { if (s.kind === 'p' && s.id === g.localId) continue; if (!this.list.has(key(s.kind, s.id))) add(s.kind, s.id); }
        const draw = this._draw || (this._draw = []);
        draw.length = nd;
        for (let i = 0; i < nd; i++) draw[i] = pool[i];
        if (!draw.length) { this._vigOff(); return; }
        if (this.me) this._vigOn();
        // the nearest get the full flames
        if (cam) draw.sort((p, q) => cam.distanceToSquared(p.a) - cam.distanceToSquared(q.a));
        for (let i = 0; i < draw.length; i++) {
            const e = draw[i];
            const dist = cam ? cam.distanceTo(e.a) : 0;
            if (dist > BURN.FAR) continue;
            const full = i < BURN.FULL && dist < BURN.FULL_R;
            const rate = full ? BURN.FLAME_RATE : 3;
            let n = Math.floor(rate * dt);
            if (Math.random() < rate * dt - n) n++;
            const H = Math.max(1, e.a.distanceTo(e.b) + e.r * 2), W = Math.max(0.3, e.r);
            while (n-- > 0) {
                const t = Math.random();
                const x = e.a.x + (e.b.x - e.a.x) * t + (Math.random() - 0.5) * W * 1.6;
                const y = e.a.y + (e.b.y - e.a.y) * t + (Math.random() - 0.5) * 0.4;
                const z = e.a.z + (e.b.z - e.a.z) * t + (Math.random() - 0.5) * W * 1.6;
                const tongue = Math.random() < 0.7;
                // tongues of flame run up the body (feet, back, arms, head); the odd spark and a dark wisp of smoke above
                fx.glow.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 1.8 * (H / 4), (Math.random() - 0.5) * 0.6,
                    pick(FLAME), (tongue ? 0.28 : 0.12) * (0.7 + H / 6) * (0.6 + Math.random() * 0.8), 0.35 + Math.random() * 0.35, { shrink: 0.9, spin: 3 });
                if (full && Math.random() < 0.35) {
                    fx.smoke.spawn(x, y + H * 0.2, z, (Math.random() - 0.5) * 0.5, 1.2 + Math.random(), (Math.random() - 0.5) * 0.5,
                        pick(DARK), 0.3 + Math.random() * 0.3, 1.2 + Math.random() * 0.8, { gravity: -0.2, shrink: -0.3, spin: 1 });
                }
            }
        }
    }

    /** Fire put out at p (size k): the flames lean down, a puff of smoke. */
    _puff(p, k = 1) {
        const fx = this.game.fx;
        if (!fx?.smoke) return;
        for (let i = 0; i < 10 * k; i++) {
            fx.smoke.spawn(p.x + (Math.random() - 0.5) * k, p.y + Math.random() * k * 1.2, p.z + (Math.random() - 0.5) * k,
                (Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2, 0xc9ced3, 0.3 + Math.random() * 0.3, 1.2 + Math.random() * 0.8, { gravity: -0.15, shrink: -0.3, spin: 1 });
        }
    }

    _vigOn() {
        if (this._vig === false) return;
        if (!this._vig) {
            if (typeof document === 'undefined') { this._vig = false; return; }
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;transition:opacity .25s;'
                + 'background:radial-gradient(ellipse at center, rgba(255,60,0,0) 55%, rgba(255,70,10,.38) 100%);';
            el.animate?.([{ opacity: 0.55 }, { opacity: 0.95 }, { opacity: 0.6 }], { duration: 700, iterations: Infinity, direction: 'alternate' });
            document.body.appendChild(el);
            this._vig = el;
        }
        this._vig.style.display = 'block';
    }

    _vigOff() {
        if (this._vig) this._vig.style.display = 'none';
    }

    // ============================================================= network
    _sendMe(on) {
        this._sentMe = on;
        this.game.sync?.burn?.(on);
    }

    _net(dt) {
        const g = this.game;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 1;
        if (this.me) this.game.sync?.burn?.(true); // (renewed: the others forget it after a few seconds without news)
        if (g.authority) {
            const l = [...this.list.values()].map((b) => [b.kind, b.id]);
            const s = JSON.stringify(l);
            if (l.length || this._sentList !== '[]' && this._sentList !== '') { this._sentList = s; g.sync?.burnList?.(l); }
        }
    }

    /** 'burn' from another player: they burn / stopped. */
    onNet(m) {
        if (!m || m.by == null || m.by === this.game.localId) return;
        const k = key('p', m.by);
        if (m.on) this.shown.set(k, { kind: 'p', id: m.by, ttl: BURN.TTL + 2 }); else this.shown.delete(k);
    }

    /** 'burnl' from the host: the burning creatures (guests). */
    onList(m) {
        const g = this.game;
        if (g.authority || !Array.isArray(m?.l)) return;
        for (const [k, s] of this.shown) if (s.kind !== 'p') this.shown.delete(k);
        for (const e of m.l.slice(0, 200)) {
            if (!Array.isArray(e) || !BURNS.has(e[0])) continue;
            this.shown.set(key(e[0], e[1]), { kind: e[0], id: e[1], ttl: BURN.TTL });
            if (e[0] === 'z') { const z = g.zombieById?.get(e[1]); if (z) z.burning = 0.6; }
        }
    }

    dispose() {
        if (this._vig?.remove) this._vig.remove();
        this._vig = null;
    }
}
