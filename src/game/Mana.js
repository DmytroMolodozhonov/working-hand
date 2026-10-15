/**
 * Mana.js — the blue bar at the bottom («Мана», internally still Combat.fatigue).
 *
 *   30 mana to start, +1 a second back. Every spell costs mana (Combat.SPELL_COST).
 *   The MAXIMUM grows (the author's rules):
 *     • the FIRST time each spell really works — once per spell, by how strong it is
 *       (FIRST_SPELL below: Lumos +1 … Lightning Strike +12 … Hellfire +20). Every Maxima
 *       form is its own spell («Вайнд» +1, «Вайнд Максима» +3). Casting it again: nothing.
 *     • a duel won AND the opponent wizard killed by it (a player, a tower's wizard, a wanderer):
 *       30% of (his maximum − 30), at least +1 (duelGain); won but he lives (lifted with Leviosa,
 *       stunned…): +1…+3 at random. Each opponent counts once (a win once, a kill once).
 *     • the first kill of each MAGICAL creature kind, to whoever struck the last blow
 *       (MAGIC_KILL: the winged pig +3 … the giant spider, a dragon +20). Ordinary creatures —
 *       horses, cows, sheep, villagers, knights, zombies, sailors — nothing.
 *     • +5 for every mana crystal broken with both hands
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

export const MANA = {
    BASE: 30,
    CRYSTAL: 5,
    DUEL_K: 0.3, // a duel won: this share of (the opponent's maximum − BASE)
    DUEL_MIN: 1,
};

/**
 * The first real success of each spell: + this much to the maximum (once). Every name
 * matchSpell / Combat.SPELL_COST knows is here (tests/unit/mana.test.js checks it).
 */
export const FIRST_SPELL = {
    // simple: +1
    Lumos: 1, Draw: 1, Accio: 1, Gather: 1, Levitation: 1, Up: 1, Fire: 1, Wind: 1,
    CreateFloor: 1, CreateCeiling: 1, CreateWall: 1, CreateDoor: 1, BuildRoof: 1, CreateBed: 1, CreateBoard: 1,
    ChangeColor: 1, Unfurl: 1, Furl: 1, Alohomora: 1, Waterball: 1, WaterForming: 1, AirBubble: 1, VortexBubble: 1,
    Protection: 1, Rescue: 1, Brainrot: 1, Firefighting: 1, Drawdown: 1, Stitching: 1,
    // medium: +2…+5
    LumosMaxima: 2, UnfurlMaxima: 2, AirBubbleMaxima: 2, AlohomoraMaxima: 2, Maxima: 2,
    Flight: 2, LetItRain: 2, ToTheSun: 2, Frozen: 2, Sapira: 2, Sands: 2, Ice: 2, Jolt: 2,
    Bombardo: 2, Earthquake: 2, Overgrown: 2, Breakthrough: 2, WaveAttack: 2, WindImpulse: 2, Liquidation: 2,
    WindMaxima: 3, Inferno: 3, Stupefy: 3, Expelliarmus: 3, Disarmor: 3, SuitUp: 1, ProtectionInvisible: 3,
    DrawdownMaxima: 3, Invisibility: 4, LiquidationMaxima: 4,
    OvergrownMaxima: 4, WaveAttackMaxima: 4, BreakthroughMaxima: 4, ProtectionMaxima: 4, ProtectionHouse: 4, Thunderwave: 4,
    EarthquakeMaxima: 5, WindImpulseMaxima: 5, BombardoMaxima: 5, JoltMaxima: 5, FireMaxima: 5, FirefightingMaxima: 5,
    // strong: up to +20
    WaterVortex: 8, Alive: 8, AliveMaxima: 12, LevitationMaxima: 8, AvadaKedavra: 10, LightningStrike: 12, TotalDestruction: 15,
    TotalDestructionMaxima: 20, Hellfire: 20, WaterVortexSuperMaxima: 20,
    CircleAttack: 15, CircleAttackMaxima: 20, Inspirius: 20, CreateHouse: 8, ImproveHouse: 8,
};

/** Not spells (or nothing to learn): never grow the maximum. */
export const NOT_SPELLS = new Set(['Stand', 'Stop', 'Pause', 'Nox', 'Attack', 'Reveal', 'Hammer', 'WardGrow', 'ProtectionHouseGrant']);

/** Other names a spell reports itself by → the spell. */
export const SAME_SPELL = { WallRise: 'Breakthrough', WallRiseMaxima: 'BreakthroughMaxima', InfernoMaxima: 'Inferno' };

/** A spell's first-success bonus (0: not a spell). Unknown names: +1. */
export function firstSpellGain(name) {
    if (!name || NOT_SPELLS.has(name)) return 0;
    return FIRST_SPELL[SAME_SPELL[name] || name] ?? 1;
}

/** A duel charge's name → the spell it came from. */
export const DUEL_SPELL_NAME = { SapiraDuel: 'Sapira', SandsDuel: 'Sands', IceDuel: 'Ice', LevitateDuel: 'Levitation', Stupefy: 'Stupefy', AvadaKedavra: 'AvadaKedavra', Expelliarmus: 'Expelliarmus', Disarmor: 'Disarmor', Jolt: 'Jolt', JoltMaxima: 'JoltMaxima' };

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
    bronzeBull: { n: 12, name: 'Медный бык' },
    minotaur: { n: 12, name: 'Минотавр' },
    spider: { n: 20, name: 'Гигантская паучиха' },
    dragon: { n: 20, name: 'Дракон' },
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

/**
 * (whoever decides the kill — the host) `by` killed something worth mana: my own kill grows my
 * maximum here; another player's is sent to his computer (his own maximum grows there).
 * @param {{kind?: string, wiz?: string, mm?: number}} m  a magical kind, or an NPC wizard beaten
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
    else if (m.wiz != null) game.duel?.opponentDied?.(m.wiz, Number(m.mm) || MANA.BASE);
}

export class Mana {
    constructor(game) {
        this.game = game;
        this.growth = 0; // grown with practice (lost on death)
        this.spellsUsed = new Set(); // spells whose first success was already counted (this life)
        this.killsMade = new Set(); // magical creature kinds already counted (this life)
        this.duelsWon = new Map(); // opponent id → 'win' | 'kill' already counted (this life)
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
        const n = firstSpellGain(name);
        const key = SAME_SPELL[name] || name;
        if (!n || this.spellsUsed.has(key)) return 0;
        this.spellsUsed.add(key);
        this.grow(n, 'spell', key);
        this._say(`🔷 Первое «${spellTitle(key)}»! Мана +${n} к максимуму`);
        return n;
    }

    /** A real duel won: the opponent `id` (his mana maximum `oppMax`) beaten in the clash and killed. */
    duelWon(oppMax = MANA.BASE, id = null) {
        if (id != null && this.duelsWon.get(String(id)) === 'kill') return 0; // (this one already counted)
        if (id != null) this.duelsWon.set(String(id), 'kill');
        const n = duelGain(oppMax);
        this.grow(n, 'duel');
        this._say(`🔷 Победа в дуэли, соперник повержен: +${n} к максимуму маны`);
        return n;
    }

    /** The clash won but the opponent `id` lives (lifted, stunned…): +1…+3 at random, once per opponent. */
    duelWonAlive(id = null, rng = Math.random) {
        if (id != null && this.duelsWon.has(String(id))) return 0;
        if (id != null) this.duelsWon.set(String(id), 'win');
        const n = 1 + Math.min(2, Math.floor(rng() * 3));
        this.grow(n, 'duelAlive');
        this._say(`🔷 Победа в дуэли: +${n} к максимуму маны`);
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

    /** A mana crystal broken with both hands. */
    crystal() {
        this.grow(MANA.CRYSTAL, 'crystal');
        this._say(`💎 Кристалл маны! Мана +${MANA.CRYSTAL} к максимуму`);
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
    }

    /** Kept with the player (world save, multiplayer). */
    snapshot() {
        return { growth: this.growth, spells: [...this.spellsUsed], kills: [...this.killsMade] };
    }

    restore(s) {
        if (!s) return;
        for (const k of [...(Array.isArray(s.spells) ? s.spells : []), ...(Array.isArray(s.strong) ? s.strong : [])]) this.spellsUsed.add(String(k)); // («strong»: an older save)
        if (Array.isArray(s.kills)) for (const k of s.kills) if (MAGIC_KILL[k]) this.killsMade.add(k);
        const g = Math.max(0, Math.min(10000, Number(s.growth) || 0));
        if (g > this.growth) this.grow(g - this.growth, 'restore');
    }

    _say(text) {
        const hud = this.game.hud;
        if (!this.combat?.enabled) return; // (no mana rules outside the free world)
        if (hud?.toast) hud.toast(text);
        else hud?.setVoice?.(text, true);
    }
}

/** How a spell is said, for the hint. */
const TITLES = {
    Lumos: 'Люмос', Draw: 'Lightning Writing', Accio: 'Акцио', Gather: 'Gather', Levitation: 'Вингардиум Левиоса', LevitationMaxima: 'Вингардиум Левиоса Максима', Up: 'Up', Fire: 'Fire', Wind: 'Вайнд',
    CreateFloor: 'Create a Floor', CreateCeiling: 'Create a Ceiling', CreateWall: 'Create a Wall', CreateDoor: 'Create a Door', BuildRoof: 'Build a Roof', CreateBed: 'Create a Bed', CreateBoard: 'Create a Board',
    ChangeColor: 'Change a color', Unfurl: 'Анфёрл', Furl: 'Фёрл', Alohomora: 'Алохомора', Waterball: 'Waterbollow', WaterForming: 'Water forming', AirBubble: 'Air Bubble', VortexBubble: 'Бабл',
    Protection: 'Protection', Rescue: 'Rescue', Brainrot: 'Брейнрот', Maxima: 'Максима в дуэли',
    Flight: 'Флайн', LetItRain: 'Let it rain', ToTheSun: 'To the Sun', Frozen: 'Frozen', Sapira: 'Сапира', Sands: 'Даст', Ice: 'Айс', Jolt: 'Джолт',
    Bombardo: 'Бомбардо', Earthquake: 'Earthquake', Overgrown: 'Overgrown', Breakthrough: 'Breakthrough', WaveAttack: 'Wave Attack',
    Inferno: 'Инферно', Stupefy: 'Остолбеней', Expelliarmus: 'Экспеллиармус', Disarmor: 'Disarmor', SuitUp: 'Suit Up', ProtectionInvisible: 'Protection Invisible', ProtectionHouse: 'Protection House', Thunderwave: 'Тандервейв',
    WaterVortex: 'Water Vortex', Alive: 'Alive', AliveMaxima: 'Alive Максима', AvadaKedavra: 'Авада Кедавра', LightningStrike: 'Lightning Strike', TotalDestruction: 'Total Destruction', CircleAttack: 'Circle Attack', CircleAttackMaxima: 'Circle Attack Maxima', Inspirius: 'Inspirius',
    Hellfire: 'Let the Hellfire Come', WaterVortexSuperMaxima: 'Water Vortex Super Maxima', CreateHouse: 'Create a House', ImproveHouse: 'Improve a House',
    WindImpulse: 'Wind Impulse', Drawdown: 'Drawdown', Liquidation: 'Liquidation', Stitching: 'Stitching', Invisibility: 'Invisibility',
};

export function spellTitle(name) {
    if (TITLES[name]) return TITLES[name];
    const m = /^(.+)Maxima$/.exec(name || '');
    if (m && TITLES[m[1]]) return `${TITLES[m[1]]} ${/[а-яё]/i.test(TITLES[m[1]]) ? 'Максима' : 'Maxima'}`;
    return name;
}
