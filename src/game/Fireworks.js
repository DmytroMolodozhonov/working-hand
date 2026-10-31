/**
 * Fireworks.js — «Fireworks» (known from the start, no scroll — the author: «изначально известно человеку»):
 * the wand raised, the word said, and for 10 seconds salvos of fireworks leave the wand tip by themselves —
 * a bunch of one to three rockets each, one salvo every 1.2…2 s, every burst different (FireworkShapes.js).
 *
 *   Cost     15 mana once, at the start (Combat.SPELL_COST); the 10 s cost nothing more.
 *   Reward   +3 cells of mana for the first real salvo (Mana.FIRST_SPELL), once.
 *   Held     Concentration: while it goes no other spell works; «стоп» ends it; death, a stun, the ice or a fall break it.
 *   The wand The salvos go while the wand points up (`UP_Y`); lowered, they wait (the 10 s do not stop), raised
 *            again they go on after a breath. A raised hand does it in Creative too (the same `castingHand`).
 *   Net      the caster's computer sends each salvo ('fwk': the wand tip, the lean, the salvo's seed) — every computer
 *            makes the same bursts from the seed; a player who comes later sees nothing of the old ones. Not saved.
 *   Seen     bursts up to ~1.1 km away (the light), heard later by the distance (FireworksFx).
 */

import * as THREE from 'three';
import { castingHand, pointsUp } from './WandAim.js';
import { FireworksFx } from '../fx/FireworksFx.js';
import { salvoGap } from '../fx/FireworkShapes.js';
import { breathable } from './Space.js';

export const FIREWORKS = {
    LIFE: 10, // s the spell goes (the author)
    UP_Y: 0.45, // the wand's direction at least this far up for the salvos to go (the word itself needs `pointsUp`: 0.6)
    SETTLE: 0.3, // s the first salvo waits after the wand is raised again
    CHEER_R: 70, // m: the castle people this near, idle and awake, may cheer
    CHEER_EVERY: 5, // s between two cheers (one person each)
    WAKE_R: 25, // m: the whistle and the noise at the wand wake sleepers this near (night.noise)
};

/** What the people of the castles say watching it (no fear: they are pleased). */
export const CHEERS = ['Ого, салют!', 'Красота!', 'Вот это да!', 'Ну и зрелище!', 'Смотрите, как расцвело!'];

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). The fireworks are for looking at: they wound nobody, break nothing and set nothing on
 * fire (the sparks are high up and go out in the air). `does`: look | cheer | none | wake | vacuum.
 */
export const FIREWORKS_TARGETS = {
    me: { does: 'look', why: 'сам колдующий любуется; 15 маны один раз при запуске, 10 секунд дальше бесплатно; палочка вниз — залпы ждут, палочка вверх — идут дальше' },
    players: { does: 'look', why: 'другие игроки видят и слышат те же залпы (каждый залп — один сид, одинаковый на всех компьютерах); никого не ранит и не толкает' },
    servants: { does: 'none', why: 'мои слуги (живое дерево, «Брейнрот») салюту не мешают и не реагируют' },
    zombies: { does: 'none', why: 'зомби не реагируют: ни агро, ни испуга (искры высоко, до земли не долетают)' },
    castlePeople: { does: 'cheer', why: 'жители, рыцари, король, волшебники смотрят с интересом: ближний (до 70 м, не спит, не дерётся) может сказать «Ого, салют!»; НЕ пугаются, тревоги нет (castleLife.alarm не зовётся, DANGERS не меняется), стража виновника не ищет' },
    sleepers: { does: 'wake', why: 'спящих будит только свист и шум у самой палочки (≤ 25 м, night.noise); далёкий салют не будит' },
    animals: { does: 'none', why: 'животным салют безразличен: ни паники, ни Danger; лошадь со всадником не сбрасывает его' },
    sailors: { does: 'none', why: 'моряки и пираты смотрят вверх, но не реагируют: корабль и палуба не затронуты' },
    spider: { does: 'none', why: 'паучиха не реагирует (не видит в салюте угрозы)' },
    livingTrees: { does: 'none', why: 'ожившие деревья и скелеты не реагируют' },
    bookBirds: { does: 'none', why: 'книги-птицы не сбиваются: искры их не касаются' },
    dragon: { does: 'none', why: 'дракон любопытствует издалека, но злости и обиды не копит (Dragons.hit / grudge не зовутся); огонь на дракона всё равно не действует' },
    phoenix: { does: 'none', why: 'феникс не обращает внимания' },
    owl: { does: 'none', why: 'сова не обращает внимания' },
    canary: { does: 'none', why: 'канарики любуются салютом и не пугаются' },
    taron: { does: 'none', why: 'Тароны далеко, в подземном мире; залп их не касается' },
    spencer: { does: 'none', why: 'птичка Спенсера не замечает салют' },
    ghost: { does: 'none', why: 'призраки замка призраков салют не замечают: они не видят мира за стенами' },
    custom: { does: 'none', why: 'созданные существа смотрят на салют; пугливые — убегают от шума' },
    gargoyle: { does: 'none', why: 'горгульи не смотрят на небо: охотятся на тех, кто внизу' },
    iceCastle: { does: 'none', why: 'Ледяная Королева, снеговики и ледяные монстры не затронуты: салют не холодный и не горячий, урона и заморозки нет' },
    blackship: { does: 'none', why: 'чёрный корабль и его экипаж не затронуты: барьер не вспыхивает — салют в него не бьёт' },
    looseThings: { does: 'none', why: 'вещи на земле и в руках, книги, сундуки, корабли, деревья, вода, земля — не затрагиваются: ничего не ломает и не поджигает' },
    houses: { does: 'none', why: 'дома, стены и замки не затрагиваются; сфера защиты дома не нужна — салют в неё не бьёт' },
    ships: { does: 'none', why: 'корабль, паруса и палуба не горят: искры гаснут высоко над ними' },
    ward: { does: 'none', why: 'сфера защиты дома салюту не мешает и не ломается: он ничего не бьёт' },
    godGift: { does: 'none', why: 'дары богов и храм не затрагиваются: нечему разрушаться' },
    enchanted: { does: 'none', why: 'заколдованный камень (арены, башни волшебников) не затрагивается: салют ничего не ломает' },
    water: { does: 'none', why: 'под водой салют не зажечь (ракета гаснет): подсказка «Под водой салют не зажечь»; над водой — как над землёй' },
    space: { does: 'vacuum', why: 'на Земле и на планетах с воздухом — со свистом, хлопком и дымком; в космосе и без воздуха работает беззвучно: искры летят по прямой, без торможения, дыма и свиста' },
};

// ------------------------------------------------------------------ the 10 seconds (pure)
/** A fresh run: the first salvo has just gone, the next is `salvoGap` away. `rnd` → [0, 1). */
export function newRun(rnd = Math.random) {
    return { t: 0, next: salvoGap(rnd), wasUp: true, salvos: 1, done: false };
}

/**
 * One step of the run: `dt` s, `up` — the wand points up now. True when a salvo must go now. The run ends at LIFE
 * (`run.done`); a lowered wand makes the salvos wait (the time still runs), a raised one waits SETTLE first.
 */
export function stepRun(run, dt, up, rnd = Math.random) {
    run.t += dt;
    if (run.t >= FIREWORKS.LIFE) { run.done = true; return false; }
    if (up && !run.wasUp) run.next = Math.max(run.next, run.t + FIREWORKS.SETTLE);
    run.wasUp = up;
    if (!up || run.t < run.next) return false;
    run.next = run.t + salvoGap(rnd);
    run.salvos++;
    return true;
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const r3 = (n) => Math.round(n * 1000) / 1000;
const newSeed = () => (Math.random() * 4294967295) >>> 0;

export class Fireworks {
    constructor(game) {
        this.game = game;
        this.on = false;
        this.run = null;
        this.fx = new FireworksFx(game);
        this._cheerT = 0;
        this._airT = 0;
        this._airless = false;
    }

    /** Is it the airless sky (space, a planet without air) where I am? Then no sound and no haze. */
    get airless() { return this._airless; }

    _checkAir() {
        const sp = this.game.space;
        this._airless = !!(sp?.offEarth && (sp.realm === 'space' || !breathable(sp.planets?.get?.(sp.realm))));
        this.fx.vacuum = this._airless;
    }

    /** The word, on my computer. */
    cast(isFinal) {
        const g = this.game;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.on) return hint('🎆 Салют уже идёт — «стоп», чтобы закончить');
        if (g.swim?.underwater) return hint('🎆 Под водой салют не зажечь');
        const hand = castingHand(g);
        if (!hand || !g.character.isArmRaised(hand.side) || !pointsUp(hand.dir)) return hint('🎆 Поднимите палочку вверх и скажите «Fireworks»');
        const tired = g.combat.check('Fireworks');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Fireworks');
        this.on = true;
        this.run = newRun();
        this._salvo(hand.origin, hand.dir);
        g.mana?.success?.('Fireworks'); // (the first real salvo: +3 cells, once)
        g.perf?.note?.('🎆 Fireworks: пошёл салют (10 с)');
        return 'Fireworks';
    }

    /** One salvo from the wand tip: seen here at once, sent to the others. */
    _salvo(origin, dir) {
        const g = this.game, seed = newSeed();
        _o.copy(origin); _d.copy(dir);
        this.launch(_o, _d, seed, g.localId);
        g.sync?.fireworks?.(_o, _d, seed);
    }

    /** A salvo (mine or another's, the same seed on every computer). */
    launch(origin, dir, seed, by) {
        const g = this.game;
        this._checkAir();
        this.fx.launchSalvo(origin, dir, seed, by, this._airless);
        g.invis?.noted?.(by); // (a spell gives an invisible caster away: about where)
        // the whistle and the noise at the wand wake the sleepers near it (host decides) — the far ones sleep on
        if (g.authority && !this._airless) g.castleLife?.night?.noise?.(origin, FIREWORKS.WAKE_R);
    }

    /** Another player's salvo ('fwk'). */
    onNet(m) {
        if (!m || !Array.isArray(m.o) || !Array.isArray(m.d) || !Number.isFinite(m.s)) return;
        const o = m.o.map(Number), d = m.d.map(Number);
        if (o.some((x) => !Number.isFinite(x)) || d.some((x) => !Number.isFinite(x))) return;
        this.game.voiceGate?.noteRemote?.('Fireworks', performance.now());
        this.launch(_o.set(o[0], o[1], o[2]), _d.set(d[0], d[1], d[2]), m.s >>> 0, m.by);
    }

    /** Every frame: the run (my own), the bursts. */
    update(dt) {
        const g = this.game;
        this._airT -= dt;
        if (this._airT <= 0) { this._airT = 0.5; this._checkAir(); }
        this._cheerT = Math.max(0, this._cheerT - dt);
        if (this.on) {
            if (g.swim?.underwater) this.stop('water');
            else {
                const hand = castingHand(g);
                const up = !!hand && g.character.isArmRaised(hand.side) && hand.dir.y >= FIREWORKS.UP_Y;
                if (stepRun(this.run, dt, up)) this._salvo(hand.origin, hand.dir);
                if (this.run.done) this.stop('time');
            }
        }
        this.fx.update(dt);
    }

    /** «стоп» / a lost concentration / the time: true when it was going. */
    stop(why = 'stop') {
        if (!this.on) return false;
        this.on = false;
        this.run = null;
        if (why === 'water') this.game.hud?.setVoice?.('🎆 Под водой салют гаснет', true);
        this.game.perf?.note?.('🎆 Fireworks: кончился (' + why + ')');
        return true;
    }

    /**
     * A burst went off at (x, y, z) (every computer, from FireworksFx): on the host, one idle awake person of a castle
     * near it may cheer. Nobody is frightened, nothing is alarmed.
     */
    onBurst(x, y, z, R, by) {
        const g = this.game;
        if (!g.authority || this._cheerT > 0 || !g.castleLife?.byId) return;
        const cl = g.castleLife;
        let pick = null, n = 0;
        for (const v of cl.byId.values()) {
            if (v.dead || v.sleep || v.foe || v.fleeT > 0 || v.stunT > 0 || v.fear?.level > 0) continue;
            if (Math.hypot(v.x - x, v.z - z) > FIREWORKS.CHEER_R) continue;
            if (Math.random() * ++n < 1) pick = v; // (one of them at random)
        }
        if (!pick) return;
        this._cheerT = FIREWORKS.CHEER_EVERY;
        cl._say?.(pick, CHEERS[Math.floor(Math.random() * CHEERS.length)], 3);
    }

    /** Hear / see nothing more (a new world). */
    clear() { this.on = false; this.run = null; this.fx.clear(); }
}

