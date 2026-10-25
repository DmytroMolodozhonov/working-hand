/**
 * Mana.js — the blue bar at the bottom («Мана», internally still Combat.fatigue).
 *
 *   30 mana to start, +1 a second back. Every spell costs mana (Combat.SPELL_COST).
 *   The MAXIMUM grows (the author's rules):
 *     • the FIRST time each spell really works — once per spell, by how strong it is
 *       (FIRST_SPELL below: Lumos +1 … Lightning Strike +12 … Hellfire +20). Every Maxima
 *       form is its own spell («Вайнд» +1, «Вайнд Максима» +3). Casting it again: nothing.
 *     • a duel won AND the opponent wizard killed by it (a player, a tower's wizard, a wanderer):
 *       45% of (his maximum − 30), at least +1 (duelGain); killed some other way (a bomb, a sword, an ambush): 25% (killGain), the
 *       same flow-of-power animation; won but he lives (lifted with Leviosa,
 *       stunned…): +1…+3 at random. Each opponent counts once (a win once, a kill once).
 *     • the first kill of each MAGICAL creature kind, to whoever struck the last blow
 *       (MAGIC_KILL: the winged pig +3 … the giant spider, a dragon +20). Ordinary creatures —
 *       horses, cows, sheep, villagers, knights, zombies, sailors — nothing.
 *     • +1 for every mana crystal I broke (squeezed, blown up, cut… — ManaCrystals: its power flies into me)
 *   A burnt strength scroll still adds its points for good. On death all the growth is lost:
 *   the maximum is 30 again (plus the scrolls) — and the lists of spells / creatures already
 *   counted are cleared with it, so what death took can be earned back (never more than once
 *   per life). In Creative mana never limits.
 *
 * ONE hook for every spell: `game.mana.success(name)` — call it where the code knows the spell
 * worked (Game.castLocalSpell already does it for spells that always work once paid for; a spell
 * that may still fail reports it itself). ONE hook for a magical creature killed by me:
 * `game.mana.magicKill(kind)` (or `creditKill(game, by, …)` from the host, which tells a guest).
 */

import { TEMPLE_SCROLLS } from '../world/GodsTemple.js';
import { IMPERIUS, IMPERIUS_MAXIMA } from './Imperius.js';
import { isDark, onDarkCast } from './DarkMagic.js';

const _fp = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const _fv = { x: 0, y: 0, z: 0 };

export const MANA = {
    BASE: 30,
    CRYSTAL: 1, // (the author: «одна ячейка маны за один кристалл»)
    DUEL_K: 0.45, // a duel won: this share of (the opponent's maximum − BASE)
    KILL_K: 0.25, // a wizard killed some other way (no clash won): this share, same formula
    DUEL_MIN: 1,
};

/**
 * The first real success of each spell: + this much to the maximum (once). Every name
 * matchSpell / Combat.SPELL_COST knows is here (tests/unit/mana.test.js checks it).
 */
/**
 * «Дуэльное мастерство» (the author): how good one is at duels — a measure of its own, not the mana.
 * A duel won (the opponent alive): a new opponent +5, one beaten before +3; won to the death +10.
 * It is never spent: in a duel it is added to the mana (Duel._strength — as if it were mana).
 * Death takes it (into the body: Legacy.js), as all the hero grew.
 */
export const DUEL_MASTERY = { WIN_K: 0.06, KILL_K: 0.1, KNOWN: 0.5, MIN: 1, MAX_BEATEN: 400 }; // (points = a share of the beaten one's own mana: a novice (50) 3 / 5 killed, the Master (500) 30 / 50; one beaten before — half)

export const FIRST_SPELL = {
    // simple: +1
    Lumos: 1, LumosFlashlight: 1, LumosAhead: 1, Draw: 1, Accio: 1, Gather: 1, Levitation: 1, Up: 1, Fire: 1, Wind: 1,
    CreateFloor: 1, CreateCeiling: 1, CreateWall: 1, CreateDoor: 1, BuildRoof: 1, CreateBed: 1, CreateBoard: 1,
    ChangeColor: 1, Unfurl: 1, Furl: 1, Alohomora: 1, Lock: 1, Waterball: 1, WaterForming: 1, AirBubble: 1, VortexBubble: 1,
    Protection: 1, WardDispel: 1, Rescue: 1, Brainrot: 3, Firefighting: 1, Drawdown: 1, Stitching: 1, CreateBridge: 1, GroundVortex: 8, VisibleGodi: 5, Pentagranium: 6, // («Visible Godi»: the author — +5 cells at the first real look behind a wall; VisibleGodi.js)
    Groundprud: 2, // (Groundprud: a wall of the ground — the author: +2 cells at the first cast; Groundprud.js)
    Fireworks: 3, // (the author: «за первое применение даётся 3 ячейки маны» — once, at the first real salvo)
    // medium: +2…+5
    LumosMaxima: 2, LumosFollowing: 3, AirBubbleMaxima: 2, AlohomoraMaxima: 2, Maxima: 2,
    Flight: 2, LetItRain: 2, ToTheSun: 2, Frozen: 2, RodFrozen: 3, RodIce: 1, Sapira: 2, Sands: 2, Ice: 2, Jolt: 2,
    Bombardo: 2, Earthquake: 2, Overgrown: 2, Breakthrough: 2, WaveAttack: 2, WindImpulse: 2, Liquidation: 2,
    WindMaxima: 3, Inferno: 3, Stupefy: 3, Expelliarmus: 3, Disarmor: 3, SuitUp: 1, ProtectionInvisible: 3,
    DrawdownMaxima: 3, Invisibility: 4, LiquidationMaxima: 4,
    BrainrotMaxima: 8, // (a dragon calmed: the first time — +8 cells)
    OvergrownMaxima: 4, WaveAttackMaxima: 4, BreakthroughMaxima: 4, ProtectionMaxima: 4, ProtectionHouse: 4, StrengthenHouse: 4, Thunderwave: 4,
    EarthquakeMaxima: 5, WindImpulseMaxima: 5, BombardoMaxima: 5, JoltMaxima: 5, FireMaxima: 5, FirefightingMaxima: 5,
    // strong: up to +20
    Snowman: 3, WaterVortex: 8, Alive: 8, AliveMaxima: 12, LevitationMaxima: 8, AvadaKedavra: 10, LightningStrike: 12, TotalDestruction: 15,
    TotalDestructionMaxima: 20, Hellfire: 20, WaterVortexSuperMaxima: 20,
    CircleAttack: 15, CircleAttackMaxima: 20, Inspirius: 20, CreateHouse: 8, ImproveHouse: 8, CreateCastle: 20,
    IceCastle: 15, IceBridge: 3, GiveMyPower: 2,
    IceMaxima: 5, Accentric: 8, Electrum: 10, Pilbidrio: 12, // (the strong duel spells — StrongSpells.js)
    // the gods' scrolls (the author: «за использование любого заклинания из этой библиотеки первый раз — 100 ячеек маны»)
    CreatePlanet: 100, EnlargePlanet: 100, TerraformPlanet: 100, LevitationSuperMaxima: 100, Boom: 100, PlanetLiquidation: 100,
    FlyingMaxima: 100, // (the gods' own flight through space: given by the gods at 1000 cells — Space.checkUnlock)
    Die: 100, // («Дай»: the ninth scroll of the gods' library — StrongSpells.js)
    ImperiusMaxima: IMPERIUS_MAXIMA.FIRST, // (the tenth: «Империус Максима» — Imperius.js; the library's 100, the author's rule)
    Imperius: IMPERIUS.FIRST, // («Империус»: a strong scroll of the Earth — +15)
    ProtectionGods: 100, ProtectionGodsMaxima: 100, // (the gods' shield and its dome: each its own scroll, each its own first — ProtectionGods.js)
};

/**
 * Space's achievements (the author): the first time out in space +20 cells, each planet first entered (into its
 * air and down to it — the Moon and the planets made by «Create a Planet» too) +50. Once per life, as the firsts.
 */
export const DISCOVER = { space: 20, planet: 50 };

/**
 * The spells of the gods (the scrolls of the gods' library — GodsTemple.TEMPLE_SCROLLS, so a new scroll there is one
 * of them by itself — and «Flying Maxima», the gods' own flight: no scroll, the gods give it — Space.checkUnlock): +100 cells the first time, with a banner of its own; the gods' shield pays for them
 * (ProtectionGods.js: DIVINE_SPELLS is this list).
 */
export const GOD_SPELLS = new Set([...TEMPLE_SCROLLS, 'FlyingMaxima']); // (PlanetMagic.js' four, «Бум» — Boom.js, «Planet Liquidation» — PlanetDestroy.js, «Protection Gods (Maxima)» — ProtectionGods.js)

/** Not spells (or nothing to learn): never grow the maximum. */
export const NOT_SPELLS = new Set(['GroundShield', 'Stand', 'Stop', 'Pause', 'Nox', 'Attack', 'Reveal', 'Hammer', 'WardGrow', 'ProtectionHouseGrant']);

/** Other names a spell reports itself by → the spell. */
export const SAME_SPELL = { WallRise: 'Breakthrough', WallRiseMaxima: 'BreakthroughMaxima', InfernoMaxima: 'Inferno' };

/** A spell's first-success bonus (0: not a spell). Unknown names: +1. */
export function firstSpellGain(name) {
    if (!name || NOT_SPELLS.has(name)) return 0;
    return FIRST_SPELL[SAME_SPELL[name] || name] ?? 1;
}

/** A duel charge's name → the spell it came from. */
export const DUEL_SPELL_NAME = { SapiraDuel: 'Sapira', SandsDuel: 'Sands', IceDuel: 'Ice', LevitateDuel: 'Levitation', Stupefy: 'Stupefy', AvadaKedavra: 'AvadaKedavra', Expelliarmus: 'Expelliarmus', Disarmor: 'Disarmor', IceDuelMaxima: 'IceMaxima', Accentric: 'Accentric', Pilbidrio: 'Pilbidrio', Die: 'Die', Electrum: 'Electrum', Jolt: 'Jolt', JoltMaxima: 'JoltMaxima' };

/**
 * Magical creatures: the first kill of each kind + this much (to whoever struck the last blow).
 * Book-birds are not here: they are never killed — a charge only knocks them down as a book.
 */
export const MAGIC_KILL = {
    wingedPig: { n: 3, name: 'Крылатая свинья' },
    runningBook: { n: 4, name: 'Бегущая книга' },
    livingTree: { n: 6, name: 'Живое дерево' },
    pegasus: { n: 8, name: 'Пегас' },
    phoenix: { n: 10, name: 'Феникс' },
    owl: { n: 6, name: 'Умная сова' },
    bronzeBull: { n: 12, name: 'Медный бык' },
    minotaur: { n: 12, name: 'Минотавр' },
    spider: { n: 20, name: 'Гигантская паучиха' },
    snowman: { n: 1, name: 'Злой снеговик' },
    iceMonster: { n: 12, name: 'Ледяной монстр' },
    iceQueen: { n: 30, name: 'Ледяная Королева' },
    dragon: { n: 20, name: 'Дракон' },
    gargoyle: { n: 4, name: 'Адская горгулья' }, // (the pentagram's: only the first kill of the kind counts — Gargoyles.js)
};

/** An animal's magical kind (null: an ordinary animal — nothing for it). */
export function animalMagicKind(a) {
    if (!a) return null;
    if (a.pegasus) return 'pegasus';
    if (a.form && a.guard === 'bull') return 'bronzeBull'; // (the cow turned bronze bull of Colchis)
    if (a.form && a.guard === 'ram') return 'minotaur'; // (the ram turned minotaur)
    if (a.type === 'pig') return 'wingedPig'; // (every pig here has wings: PigFlight.js)
    if (a.type === 'runbook') return 'runningBook';
    return null;
}

/** A duel won against an opponent whose mana maximum is `oppMax`. */
export function duelGain(oppMax) {
    const n = Math.round(MANA.DUEL_K * ((Number(oppMax) || MANA.BASE) - MANA.BASE));
    return Math.max(MANA.DUEL_MIN, n);
}

/** An opponent wizard killed without a duel won (a bomb, a sword, an arrow…). */
export function killGain(oppMax) {
    const n = Math.round(MANA.KILL_K * ((Number(oppMax) || MANA.BASE) - MANA.BASE));
    return Math.max(MANA.DUEL_MIN, n);
}

/**
 * (whoever decides the kill — the host) `by` killed something worth mana: my own kill grows my
 * maximum here; another player's is sent to his computer (his own maximum grows there).
 * @param {{kind?: string, wiz?: string, mm?: number, pos?: number[]}} m  a magical kind, or an NPC wizard beaten
 */
export function creditKill(game, by, m) {
    if (!game || by == null || !m) return;
    if (by === game.localId || by === 'local') applyCredit(game, m);
    else if (game.remotes?.has?.(by)) game.sync?.manaCredit?.(by, m);
}

/** On the killer's own computer. */
export function applyCredit(game, m) {
    if (!m) return;
    if (m.kind) game.mana?.magicKill(String(m.kind));
    else if (m.wiz != null) game.duel?.opponentDied?.(m.wiz, Number(m.mm) || MANA.BASE, m.pos);
}

export class Mana {
    constructor(game) {
        this.game = game;
        this.growth = 0; // grown with practice (lost on death)
        this.spellsUsed = new Set(); // spells whose first success was already counted (this life)
        this.killsMade = new Set(); // magical creature kinds already counted (this life)
        this.duelsWon = new Map(); // opponent id → 'win' | 'kill' already counted (this life)
        this.found = new Set(); // 'space', 'planet:<id>' — space's achievements already counted (this life)
        this.mastery = 0; // «дуэльное мастерство»: duels won (DUEL_MASTERY); never spent, adds to the mana in a duel (lost on death)
        this.beaten = new Set(); // opponents already beaten in a duel (this life): a known one gives less
        this.log = []; // (tests) the last few gains
    }

    get combat() { return this.game.combat; }

    /** The bar's maximum now. */
    get max() { return this.combat?.maxFatigue || MANA.BASE; }

    get value() { return this.combat?.fatigue ?? MANA.BASE; }

    /**
     * A spell really worked: the first time — its bonus; later — nothing.
     * @returns {number} how much the maximum grew
     */
    success(name) {
        if (isDark(name)) onDarkCast(this.game, name); // (чёрная магия: +1 к тьме с шансом 50 %)
        const n = firstSpellGain(name);
        const key = SAME_SPELL[name] || name;
        if (!n || this.spellsUsed.has(key)) return 0;
        if (GOD_SPELLS.has(key) && !this.combat?.manaOn) return 0; // (Creative: mana does not count — nothing to earn)
        this.spellsUsed.add(key);
        this.grow(n, 'spell', key);
        if (GOD_SPELLS.has(key)) {
            // (a gift of the gods: cells added to the maximum for good — death takes them into the body, Legacy.js)
            const g = this.game, title = `✨ +${n} ячеек маны!`, sub = `Первое «${spellTitle(key)}» — дар богов. Теперь ячеек маны: ${Math.round(this.max)}`;
            if (g.achievements?._banner) g.achievements._banner(title, sub, true);
            else this._say(`${title} ${sub}`);
            g.sound?.playSpace?.('spaceGift', 0.7);
            return n;
        }
        this._say(`🔷 Первое «${spellTitle(key)}»! Мана +${n} к максимуму`);
        return n;
    }

    /**
     * Space reached ('space') or a planet entered ('planet:<id>', its `name`) the first time: its cells and an
     * achievement banner (Space.js). Creative: mana does not count — nothing.
     * @returns {number} how much the maximum grew
     */
    discover(key, name = '') {
        const n = key === 'space' ? DISCOVER.space : DISCOVER.planet;
        if (this.found.has(key) || !this.combat?.manaOn) return 0;
        this.found.add(key);
        this.grow(n, 'discover', key);
        const g = this.game;
        const title = key === 'space' ? '🏆 Ачивка: Вы в космосе!' : `🏆 Ачивка: открыта планета «${name || 'Планета'}»`;
        const sub = `+${n} ячеек маны. Теперь ячеек маны: ${Math.round(this.max)}`;
        if (g.achievements?._banner) g.achievements._banner(title, sub, true);
        else this._say(`${title} ${sub}`);
        g.sound?.playSpace?.('spaceGift', 0.7);
        return n;
    }

    /** A real duel won: the opponent `id` (his mana maximum `oppMax`) beaten in the clash and killed. */
    duelWon(oppMax = MANA.BASE, id = null, pos = null) {
        this.masteryWon(id, true, oppMax);
        if (id != null && this.duelsWon.get(String(id)) === 'kill') return 0; // (this one already counted)
        if (id != null) this.duelsWon.set(String(id), 'kill');
        const n = duelGain(oppMax);
        this.grow(n, 'duel');
        this._say(`🔷 Победа в дуэли, соперник повержен: +${n} к максимуму маны`);
        this.powerFlow(pos, n, 'duel');
        return n;
    }

    /** The opponent `id` killed by me without a clash won (a bomb, a sword, an ambush): 25%, once per opponent. */
    killWon(oppMax = MANA.BASE, id = null, pos = null) {
        if (!this.combat?.manaOn) return 0; // (Creative: no mana rules)
        if (id != null && this.duelsWon.get(String(id)) === 'kill') return 0; // (already paid — a duel or a kill)
        if (id != null) this.duelsWon.set(String(id), 'kill');
        const n = killGain(oppMax);
        this.grow(n, 'killWiz');
        this.powerFlow(pos, n, 'kill');
        return n;
    }

    /** The beaten one's power flies to my chest: a stream of sparks (the shared pool), a flash and a chime at the end. */
    powerFlow(pos, n, how) {
        const g = this.game;
        if (!this.combat?.manaOn) return;
        if (how !== 'duel') this._say(`🔷 Сила побеждённого перешла к вам (победа без дуэли): +${n} ячеек маны`);
        else this._say(`🔷 Сила побеждённого перешла к вам в дуэли: +${n} ячеек маны`);
        if (!g.camera || !Array.isArray(pos) || pos.length < 3) return;
        const list = this._flow || (this._flow = []);
        const count = 30 + Math.floor(Math.random() * 21);
        for (let i = 0; i < count; i++) {
            list.push({ t: -Math.random() * 0.5, d: 1.0 + Math.random() * 0.5, fx: +pos[0] || 0, fy: (+pos[1] || 0) + 2.4, fz: +pos[2] || 0, ax: (Math.random() - 0.5) * 3, ay: 1 + Math.random() * 3, az: (Math.random() - 0.5) * 3, gold: Math.random() < 0.25 });
        }
        g.sound?.playSpace?.('spaceGift', 0.5);
    }

    /** (every frame) moves the sparks of powerFlow; nothing to do when none are flying. */
    update(dt) {
        const list = this._flow;
        if (!list || !list.length) return;
        const g = this.game;
        const cam = g.camera.position;
        let done = false;
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.t += dt;
            if (p.t < 0) continue;
            const k = Math.min(1, p.t / p.d), e = k * k * (3 - 2 * k), a = 4 * e * (1 - e); // (an arc: a bulge in the middle)
            _fp.set(p.fx + (cam.x - p.fx) * e + p.ax * a, p.fy + (cam.y - 0.5 - p.fy) * e + p.ay * a, p.fz + (cam.z - p.fz) * e + p.az * a);
            g.fx.spark(_fp, p.gold ? 0xffd86b : 0xbfe6ff, 0.18, _fv, 0.22);
            if (k >= 1) { list.splice(i, 1); done = true; }
        }
        if (done && !list.length) g.fx.lightFlash(_fp.set(cam.x, cam.y - 0.5, cam.z), 0xbfe6ff, 3, 0.35, 20);
    }

    /** The clash won but the opponent `id` lives (lifted, stunned…): +1…+3 at random, once per opponent. */
    duelWonAlive(id = null, rng = Math.random, oppMax = MANA.BASE) {
        this.masteryWon(id, false, oppMax);
        if (id != null && this.duelsWon.has(String(id))) return 0;
        if (id != null) this.duelsWon.set(String(id), 'win');
        const n = 1 + Math.min(2, Math.floor(rng() * 3));
        this.grow(n, 'duelAlive');
        this._say(`🔷 Победа в дуэли: +${n} к максимуму маны`);
        return n;
    }

    /**
     * A duel won against `id` (`kill`: to the death): «дуэльное мастерство» grows — every duel won,
     * a new opponent more than a known one (DUEL_MASTERY). Shown after every one, in every mode.
     * @returns {number} how much it grew
     */
    masteryWon(id = null, kill = false, oppMax = MANA.BASE) {
        const key = id != null ? String(id) : null;
        const known = key != null && this.beaten.has(key);
        const base = (Number(oppMax) || MANA.BASE) * (kill ? DUEL_MASTERY.KILL_K : DUEL_MASTERY.WIN_K);
        const n = Math.max(DUEL_MASTERY.MIN, Math.round(known ? base * DUEL_MASTERY.KNOWN : base));
        if (key != null && !known) {
            if (this.beaten.size >= DUEL_MASTERY.MAX_BEATEN) this.beaten.delete(this.beaten.values().next().value);
            this.beaten.add(key);
        }
        this.mastery += n;
        this.log.push({ why: 'mastery', name: key, n });
        if (this.log.length > 20) this.log.shift();
        const hud = this.game.hud, text = `⚔️ ${kill ? 'Соперник повержен' : 'Победа в дуэли'}: +${n} дуэльного мастерства (всего ${this.mastery})`;
        if (hud?.toast) hud.toast(text, 3000);
        else hud?.setVoice?.(text, true);
        return n;
    }

    /** A magical creature killed by me: the first of its kind counts. */
    magicKill(kind) {
        const k = MAGIC_KILL[kind];
        if (!k || this.killsMade.has(kind)) return 0;
        this.killsMade.add(kind);
        this.grow(k.n, 'kill', kind);
        this._say(`🔷 ${k.name}: +${k.n} к максимуму маны`);
        return k.n;
    }

    /** (old name) The giant spider killed by me. */
    spiderKilled() { return this.magicKill('spider'); }

    /** A mana crystal I broke: its power came into me. */
    crystal() {
        this.grow(MANA.CRYSTAL, 'crystal');
        this._say(`💎 Сила кристалла в вас: +${MANA.CRYSTAL} ячейка маны`);
    }

    /** The maximum grows (and the mana in it with it). */
    grow(n, why = 'spell', name = null) {
        if (!(n > 0)) return;
        this.growth += n;
        this.combat?.addMaxFatigue?.(n);
        this.log.push({ why, name, n });
        if (this.log.length > 20) this.log.shift();
        if (this.combat) this.combat._hudKey = ''; // (the bar shows the new maximum at once)
    }

    /** Death: all the growth is lost — back to 30 (plus the burnt scrolls); the firsts can be earned again. */
    onDeath() {
        const c = this.combat;
        if (c && this.growth) {
            c.maxFatigue = Math.max(MANA.BASE, (c.maxFatigue || MANA.BASE) - this.growth);
            c.fatigue = Math.min(c.fatigue, c.maxFatigue);
            c._hudKey = '';
        }
        this.growth = 0;
        this.spellsUsed.clear();
        this.killsMade.clear();
        this.duelsWon.clear();
        if (this._flow) this._flow.length = 0;
        this.found.clear();
        this.mastery = 0;
        this.beaten.clear();
    }

    /** Kept with the player (world save, multiplayer). */
    snapshot() {
        return { growth: this.growth, spells: [...this.spellsUsed], kills: [...this.killsMade], found: [...this.found], mastery: this.mastery, beaten: [...this.beaten] };
    }

    restore(s) {
        if (!s) return;
        for (const k of [...(Array.isArray(s.spells) ? s.spells : []), ...(Array.isArray(s.strong) ? s.strong : [])]) this.spellsUsed.add(String(k)); // («strong»: an older save)
        if (Array.isArray(s.kills)) for (const k of s.kills) if (MAGIC_KILL[k]) this.killsMade.add(k);
        if (Array.isArray(s.found)) for (const k of s.found) this.found.add(String(k));
        this.mastery = Math.max(this.mastery, Math.max(0, Math.min(1e6, Math.floor(Number(s.mastery) || 0))));
        if (Array.isArray(s.beaten)) for (const k of s.beaten.slice(-DUEL_MASTERY.MAX_BEATEN)) this.beaten.add(String(k));
        const g =Math.max(0, Math.min(10000, Number(s.growth) || 0));
        if (g > this.growth) this.grow(g - this.growth, 'restore');
    }

    _say(text) {
        const hud = this.game.hud;
        if (!this.combat?.manaOn) return; // (no mana rules outside the free world)
        if (hud?.toast) hud.toast(text);
        else hud?.setVoice?.(text, true);
    }
}

/** How a spell is said, for the hint. */
const TITLES = {
    Lumos: 'Люмос', Draw: 'Lightning Writing', Accio: 'Акцио', Gather: 'Gather', Levitation: 'Вингардиум Левиоса', LevitationMaxima: 'Вингардиум Левиоса Максима', Up: 'Up', Fire: 'Fire', Wind: 'Вайнд',
    CreateFloor: 'Create a Floor', CreateCeiling: 'Create a Ceiling', CreateWall: 'Create a Wall', CreateDoor: 'Create a Door', BuildRoof: 'Build a Roof', CreateBed: 'Create a Bed', CreateBoard: 'Create a Board',
    ChangeColor: 'Change a color', Unfurl: 'Анфёрл', Furl: 'Фёрл', Alohomora: 'Алохомора', Lock: 'Lock', Waterball: 'Waterbollow', WaterForming: 'Water forming', AirBubble: 'Air Bubble', VortexBubble: 'Бабл',
    Protection: 'Protection', Rescue: 'Rescue', Brainrot: 'Брейнрот', BrainrotMaxima: 'Брейнрот Максима', Maxima: 'Максима в дуэли',
    Flight: 'Флайн', LetItRain: 'Let it rain', ToTheSun: 'To the Sun', GiveMyPower: 'Give Me My Power', Frozen: 'Frozen', RodFrozen: 'Frozen (Ледяной Жезл)', RodIce: 'Лёд Ледяного Жезла', Sapira: 'Сапира', Sands: 'Даст', Ice: 'Айс', Jolt: 'Джолт',
    Bombardo: 'Бомбардо', Earthquake: 'Earthquake', Overgrown: 'Overgrown', Breakthrough: 'Breakthrough', WaveAttack: 'Wave Attack',
    Inferno: 'Инферно', Stupefy: 'Остолбеней', Expelliarmus: 'Экспеллиармус', Disarmor: 'Disarmor', SuitUp: 'Suit Up', ProtectionInvisible: 'Protection Invisible', WardDispel: 'Dispel Ward', ProtectionHouse: 'Protection House', StrengthenHouse: 'Strengthen House', Thunderwave: 'Тандервейв',
    WaterVortex: 'Water Vortex', Snowman: 'Snowman', Alive: 'Alive', AliveMaxima: 'Alive Максима', AvadaKedavra: 'Авада Кедавра', LightningStrike: 'Lightning Strike', TotalDestruction: 'Total Destruction', CircleAttack: 'Circle Attack', CircleAttackMaxima: 'Circle Attack Maxima', Inspirius: 'Inspirius', Boom: 'Бум',
    IceMaxima: 'Айс Максима', Accentric: 'Акцентрик', Pilbidrio: 'Пилбидрио', Electrum: 'Электром', Die: 'Дай',
    Hellfire: 'Let the Hellfire Come', WaterVortexSuperMaxima: 'Water Vortex Super Maxima', CreateHouse: 'Create a House', ImproveHouse: 'Improve a House', CreateCastle: 'Create a Castle',
    WindImpulse: 'Wind Impulse', Drawdown: 'Drawdown', Liquidation: 'Liquidation', Stitching: 'Stitching', Invisibility: 'Invisibility', CreateBridge: 'Create a Bridge', Groundprud: 'Groundprud', VisibleGodi: 'Visible Godi', Pentagranium: 'Пентаграниум', GroundVortex: 'Ground Vortex',
    Fireworks: 'Fireworks', IceCastle: 'Create an Ice Castle', IceBridge: 'Ice Bridge', FlyingMaxima: 'Flying Maxima',
    CreatePlanet: 'Create a Planet', EnlargePlanet: 'Enlarge Planet', TerraformPlanet: 'Terraform Planet', LevitationSuperMaxima: 'Wingardium Leviosa Super Maxima', ProtectionGods: 'Protection Gods', ProtectionGodsMaxima: 'Protection Gods Maxima', PlanetLiquidation: 'Planet Liquidation',
};

export function spellTitle(name) {
    if (TITLES[name]) return TITLES[name];
    const m = /^(.+)Maxima$/.exec(name || '');
    if (m && TITLES[m[1]]) return `${TITLES[m[1]]} ${/[а-яё]/i.test(TITLES[m[1]]) ? 'Максима' : 'Maxima'}`;
    return name;
}
