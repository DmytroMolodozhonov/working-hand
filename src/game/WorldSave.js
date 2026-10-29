/**
 * WorldSave.js — worlds are saved by themselves, all the time.
 *
 * A world is kept on the computer of the one who created it (the host, or
 * the single player) in the browser's database (IndexedDB): the seed it was
 * generated from plus everything that changed — built and destroyed blocks,
 * craters, gathered and burnt trees, ice, opened chests, things lying around,
 * the time of day — and every player's own things: what is in their slots,
 * the spells they learned from books, where they were, their health.
 * Nothing to press: it is written every few seconds and when the tab closes.
 * In the menu the world can be continued (single player, or as a server).
 *
 * Players are remembered by their own lasting id (kept by their browser), not
 * by name: a friend who comes back to the same server gets their things back,
 * and two players who both call themselves «Игрок» never get each other's
 * things or learned spells. (Old saves keyed by name still work once.)
 */

import { manaRules } from './HeroSetup.js';
import { onSpot } from './LoreLibrary.js'; // (a library's book still on its desk is not kept: the library lays it again)
import { breaking } from '../world/EnchantedStone.js';
import { keepIn } from './HouseWards.js';
import { legacyMode } from '../ui/GameNames.js';
import { runBoom } from '../world/BoomCarve.js';
import { normalizeSpawn, spawnLabel, normalizeFoe, DUEL_FOES } from './SpawnSpots.js';
import { retireScrollsIn } from './ItemTypes.js';
import { WORLD_GEN, FURNISH_FROM_GEN, PLANTS_FROM_GEN, PENT_STAND_FROM_GEN, SPAWN_MAPS_FROM_GEN, BAKSADI_FROM_GEN, BRIGHTFLOWER_FROM_GEN, CANARIES_FROM_GEN, GATE_METAL_FROM_GEN, HOUSE_SIZE_FROM_GEN, DUNGEON_FROM_GEN, ARENA_ENTRIES_FROM_GEN } from '../world/Terrain.js';

const DB_NAME = 'zns-worlds';
const STORE = 'worlds';
const SAVE_EVERY = 8; // seconds

/** The version of the game running now (from /api/version): written into every save. */
export const GAME_VERSION = { date: '', sha: '' };
export function setGameVersion(v) {
    GAME_VERSION.date = v?.date || '';
    GAME_VERSION.sha = v?.sha || '';
}

/** What the menu says about a saved world's version (old: saved by another version of the game). */
export function worldVersionLabel(w, cur = GAME_VERSION) {
    const v = w?.version;
    if (!v || (!v.date && !v.sha)) return { text: 'версия неизвестна (сохранён до обновления)', old: true };
    return { text: `версия от ${v.date || '?'}${v.sha ? ` (${v.sha})` : ''}`, old: !!(cur?.sha && v.sha && cur.sha !== v.sha) };
}

/**
 * The hover note of a saved world, in plain words: the game version it was saved by and what a world of its age lacks.
 * `gen` is the world's generation (Terrain.WORLD_GEN); a record without one is the oldest kind.
 */
export function worldHoverNote(w, cur = GAME_VERSION) {
    const ver = worldVersionLabel(w, cur);
    const gen = Number.isFinite(w?.gen) ? w.gen : 1;
    const lacks = [];
    if (gen < 2) lacks.push('морей и морских замков');
    if (gen < 5) lacks.push('нового ландшафта (высокие горы, каньоны, парящие острова)');
    if (gen < 6) lacks.push('плавных склонов и скруглённых крыш');
    if (gen < FURNISH_FROM_GEN) lacks.push('мебели и сундуков в комнатах замков');
    if (gen < PLANTS_FROM_GEN) lacks.push('живых растений на лугах');
    if (gen < PENT_STAND_FROM_GEN) lacks.push('рисунка пентаграммы телепортации в библиотеках волшебников');
    if (gen < SPAWN_MAPS_FROM_GEN) lacks.push('отдельных мест для дракона, Ледяной Королевы и пещеры паучихи в Творческом режиме');
    if (gen < BAKSADI_FROM_GEN) lacks.push('дерева Баксади и новых диких растений');
    if (gen < BRIGHTFLOWER_FROM_GEN) lacks.push('огненных цветков Ярколето на тёплых лугах');
    if (gen < CANARIES_FROM_GEN) lacks.push('канариков на болотах');
    if (gen < GATE_METAL_FROM_GEN) lacks.push('кованых железных ворот в замках');
    if (gen < HOUSE_SIZE_FROM_GEN) lacks.push('просторных домов жителей (у богатых — в два этажа)');
    if (gen < DUNGEON_FROM_GEN) lacks.push('данжей (развалин и подземелий с сундуками)');
    if (gen < ARENA_ENTRIES_FROM_GEN) lacks.push('входа для зрителей и лавки распорядителя у арен дуэлей');
    const head = `Версия игры: ${ver.text.replace(/^версия /, '')}.`;
    if (!lacks.length) return `${head} Мир актуален: в нём есть всё новое.`;
    return `${head} Мир устарел: он создан в старой версии, поэтому в нём нет ${lacks.join(', ')}. Играть в нём можно, и ваши постройки и вещи на месте.`;
}

/** Where the hero of a Creative world appears («Где появиться» in the settings), in a few words: «Дуэли на арене (Средний)», «У башни волшебников»; '' without one. */
export function worldSpawnLabel(w) {
    const h = w?.hero;
    if (!h || w.mode !== 'creative') return '';
    const id = normalizeSpawn(h.spawn);
    if (id === 'start') return spawnLabel(id);
    if (id === 'arena') return `Дуэли магов на арене · ${(DUEL_FOES.find((f) => f.id === normalizeFoe(h.foe))?.label || '').replace(/ \(.*\)/, '')}`.replace(/ · $/, '');
    return spawnLabel(id).replace(/ \(.*\)$/, '');
}

let _db = null;
function db() {
    if (_db) return _db;
    _db = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    _db.catch(() => { _db = null; });
    return _db;
}

function tx(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const st = t.objectStore(STORE);
        const req = fn(st);
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
    }));
}

/** All saved worlds, newest first: [{id, name, mode, seed, updated, players}] (without the heavy parts). */
export async function listWorlds() {
    try {
        const all = await tx('readonly', (st) => st.getAll());
        return (all || []).map((w) => ({ id: w.id, name: w.name, mode: legacyMode(w.mode), seed: w.seed, updated: w.updated, created: w.created, version: w.version || null, gen: Number.isFinite(w.gen) ? w.gen : null, hero: w.hero ? { spawn: w.hero.spawn, foe: w.hero.foe } : null, fav: !!w.fav, players: Object.entries(w.players || {}).map(([k, p]) => p?.name || k) }))
            .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.updated - a.updated); // (favourites first, then newest)
    } catch (e) { return []; }
}

export async function loadWorld(id) {
    try { const w = await tx('readonly', (st) => st.get(id)); if (w) w.mode = legacyMode(w.mode); return w; } catch (e) { return null; }
}

export async function deleteWorld(id) {
    try { await tx('readwrite', (st) => st.delete(id)); } catch (e) { /* ignore */ }
}

export async function putWorld(w) {
    await tx('readwrite', (st) => st.put(w));
}

export const NAME_MAX = 40;
/** A world's name from what was typed: trimmed, one line, at most NAME_MAX; '' if empty. */
export function cleanWorldName(v) {
    return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Rename a saved world / mark it as a favourite (changes only these fields of the record). */
export async function updateWorldMeta(id, { name, fav } = {}) {
    const w = await loadWorld(id);
    if (!w) return null;
    if (name !== undefined) { const n = cleanWorldName(name); if (n) w.name = n; }
    if (fav !== undefined) w.fav = !!fav;
    await putWorld(w);
    return w;
}

export function newWorldId() {
    return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

const r2 = (v) => Math.round(v * 100) / 100;

/** One player's own things (works for the local player; guests send theirs). */
export function playerSnapshot(game) {
    const inv = game.inventory;
    const slots = inv ? inv.slots.map((s) => (s ? { ...s, stack: undefined } : null)) : [];
    // what is in the hand belongs to the slots too
    const h = inv?.inHand;
    if (h && h.kind === 'weapon' && h.weapon) {
        const i = slots.findIndex((s) => !s);
        if (i >= 0) slots[i] = { kind: 'weapon', type: h.weapon.type, id: h.weapon.id, magic: !!h.weapon.magic, bonus: h.weapon.bonus || 0, ench: h.weapon.ench || undefined };
    }
    // (the monster form is never saved: the man's place and health are — MonsterForm.js; it ends on leaving)
    const p = game.monster?.active ? game.monster.humanPos() : game.character.group.position;
    return {
        slots,
        extraSlots: inv ? Math.max(0, inv.slots.length - 5) : 0,
        purse: inv?.purse?.count || 0, // the coins in the pouch on the belt (CoinBelt)
        purseMagic: inv?.purse?.magic ? inv.purse.magicUid || true : undefined, // the pouch is on the belt (all the coins in it)
        ownWand: inv?.ownWand || undefined, // my own wand (lying on the ground when the game was left: «Акцио» brings it back, the stand-in goes — Inventory.gotWand)
        learned: game.books ? [...game.books.learned] : [],
        pos: [r2(p.x), r2(p.y), r2(p.z)],
        hp: game.monster?.active ? game.monster.origHp : game.combat?.enabled ? game.combat.hp : game.playerHP, // («Выживание»: the health lives in Combat)
        mp: manaRules(game) ? Math.round(game.combat.fatigue * 10) / 10 : undefined, // the mana in the bar now (not only its maximum)
        bonus: game.bonus || null, // scrolls burnt: more health / strength for good
        gear: game.items?.snapshot() || null, // what is in the hands, the backpack worn
        dark: game.dark?.snapshot() || null, // чёрная магия: уровень тьмы
        dl: game.darkLord?.snapshot() || null, // «настоящий тёмный маг» (DarkLord.js): наряд надет
        bw: game.breakward?.snapshot() || null, // метка «слом защиты» и выученный рисунок пентаграммы
        pentMarks: game.pentagranium?.marksSnapshot() || null, // the good pentagrams on the ground (permanent: teleport, life, mend…)
        pentBare: game.pentagranium?.bareSnapshot() || null, // the bare-hand power (BareHand.js: the rite of «Palmaris» done)
        pentSeen: game.pentagranium?.snapshot() || null, // the pentagrams' drawings the hero has looked at (Pentagrams.js: without it nothing is counted)
        sight: game.sight?.snapshot() || null, // the night eyes and the sight of the invisible (SecondSight.js)
        steady: game.steady?.snapshot() || null, // «Устойчивость»: the skill and the run towards the next +1
        mana: game.mana?.snapshot() || null, // the mana maximum grown, the spells / magical creatures already counted
        ach: game.achievements?.snapshot() || null, // the achievements (and «Высший маг»): kept for good
        limbs: game.dismember?.snapshot() || null, // cut off (until death): no healing by leaving
        bleed: game.bleeding?.rate || 0,
        ship: game.ships?.playerSnap() || null, // standing on a ship: [ship id, place on its deck]
        bed: game.beds?.home || null, // the bed they come back to life at
        space: game.space?.snapshot() || null, // in space: where (the planets' surfaces need nothing: the place says it — Space.js)
        caves: game.caveMap?.snapshot() || null, // the cave map: what the hero has seen of the caves (CaveMap.js)
    };
}

/** Give a player their things back. */
export function applyPlayerSnapshot(game, s) {
    if (!s) return;
    retireScrollsIn(s); // (the scrolls of health and of mana cells are gone from the game: an old one is an apple)
    game._playerRestored = true; // (a player of this world before: their own things, no starting gifts)
    const inv = game.inventory;
    let owed = 0; // coins of an old save that wait for the pouch
    if (inv && Array.isArray(s.slots)) {
        if (s.extraSlots && inv.setExtraSlots) inv.setExtraSlots(s.extraSlots);
        for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = s.slots[i] ? { ...s.slots[i] } : null;
        inv.selected = -1;
        if (typeof s.ownWand === 'string') inv.ownWand = s.ownWand;
        if (inv.purse) { inv.purse.count = 0; inv.purse.magic = false; inv.purse.magicUid = null; }
        if (inv.purse && s.purseMagic) inv.purse.tieMagic({ kind: 'coins', magic: true, uid: typeof s.purseMagic === 'string' ? s.purseMagic : undefined, count: 0 });
        // (an old save: the plain pouches in the slots and the coins of the belt's pouches go into the one bottomless pouch — nothing is lost)
        owed = Number.isFinite(s.purse) && s.purse > 0 ? s.purse : 0;
        for (let i = 0; i < inv.slots.length; i++) { const it = inv.slots[i]; if (it?.kind === 'coins' && !it.magic && !it.shop) { owed += it.count || 0; inv.slots[i] = null; } }
        inv._render?.();
    }
    if (game.books && Array.isArray(s.learned)) for (const k of s.learned) game.books.learned.add(k);
    if (Array.isArray(s.pos) && s.pos.every(Number.isFinite)) game.character.group.position.set(s.pos[0], s.pos[1] + 0.5, s.pos[2]);
    if (Number.isFinite(s.hp) && s.hp > 0) game.playerHP = Math.min(game.maxHP, s.hp);
    if (s.bonus) {
        game.bonus = { ...s.bonus };
        if (s.bonus.hp) {
            game.maxHP += s.bonus.hp; game.playerHP = Math.min(game.maxHP, game.playerHP + s.bonus.hp);
            if (game.combat?.enabled) game.combat.addMaxHp?.(s.bonus.hp);
        }
        if (s.bonus.fatigue) game.combat.addMaxFatigue?.(s.bonus.fatigue);
    }
    if (s.gear) game.items?.restore(s.gear);
    if (inv?.purse) { // (every hero has the pouch: a save without it gets a new one; the coins owed go into it)
        inv.purse.ensure();
        if (owed > 0) {
            if (inv.purse.magic) inv.purse.add(owed);
            else { const mine = [inv.slots.find((x) => x?.kind === 'coins'), game.items?.held.right?.item, game.items?.held.left?.item].find((x) => x?.kind === 'coins'); if (mine) mine.count = (mine.count || 0) + owed; }
        }
        inv._render?.();
    }
    if (s.dark) game.dark?.restore(s.dark);
    if (s.dl) game.darkLord?.restore(s.dl);
    if (s.bw) game.breakward?.restore(s.bw);
    if (s.steady) game.steady?.restore(s.steady);
    if (s.sight) game.sight?.restore(s.sight);
    if (s.pentSeen) game.pentagranium?.restore(s.pentSeen);
    game.pentagranium?.bareRestore(s.pentBare);
    if (s.pentMarks) game.pentagranium?.marksRestore(s.pentMarks);
    if (s.mana) game.mana?.restore(s.mana);
    if (s.ach) game.achievements?.restore(s.ach);
    if (s.limbs && Number.isFinite(s.hp) && s.hp > 0) game.dismember?.restoreMine(s.limbs, s.bleed || 0);
    if (s.bed) game.beds?.setHome(s.bed);
    if (s.ship) game.ships?.applyPlayerSnap(s.ship); // (back on the ship's deck, wherever it sailed)
    if (s.space) game.space?.restore(s.space); // (still in space)
    if (s.caves) game.caveMap?.restore(s.caves);
    // («Выживание»: as it was when they left — not full health / mana; after the scrolls and the mana grown above)
    const c = game.combat;
    if (c?.enabled && !c.dead) {
        if (Number.isFinite(s.hp) && s.hp > 0) { c.hp = Math.min(c.maxHp || game.maxHP, s.hp); game.playerHP = c.hp; }
        if (Number.isFinite(s.mp) && s.mp >= 0) c.fatigue = Math.min(c.maxFatigue || s.mp, s.mp);
        c._hudKey = '';
    } else if (manaRules(game) && Number.isFinite(s.mp) && s.mp >= 0) c.fatigue = Math.min(c.maxFatigue || s.mp, s.mp); // (Creative with a finite mana: the mana left)
}

/**
 * Keeps the current game's world saved (host or single player only).
 */
export class WorldKeeper {
    constructor(game, { id, name, mode, seed, created, players, gen, createdVersion, fav } = {}) {
        this.game = game;
        this.id = id || newWorldId();
        this.name = name || 'Мир';
        this.fav = !!fav; // the heart in the menu: kept by every autosave
        this.mode = mode || game.config.mode;
        this.seed = seed ?? game.seed;
        this.gen = gen ?? game.gen ?? 1; // world generation (seas from 2)
        this.godsOnEarth = !!game.config?.godsOnEarth; // (multiplayer: the gods' spells allowed on the Earth — chosen when made)
        this.hero = game.config?.mode === 'creative' ? game.config.hero : undefined; // (HeroSetup.js: kept with the world)
        this.realTrees = !!game.config?.realTrees; // (made with real trees, not blocks — Trees.js)
        this.created = created || Date.now();
        this.createdVersion = createdVersion || { ...GAME_VERSION };
        this.players = players || {}; // 'id:'+lasting id (or an old name) -> snapshot (guests and the host)
        this._t = 0;
        this._saving = false;
        this._onHide = () => this.save();
        if (typeof window !== 'undefined') window.addEventListener('pagehide', this._onHide);
    }

    get myName() {
        return this.game.net?.name || 'Игрок';
    }

    /** Where a player's things are kept: under their lasting id (or, without one, their name). */
    static key(pid, name) {
        return pid ? 'id:' + String(pid).slice(0, 40) : String(name || 'Игрок').slice(0, 16);
    }

    get myKey() {
        return WorldKeeper.key(this.game.net?.pid, this.myName);
    }

    /** A guest's things arrived (they send them now and then). */
    notePlayer(pid, name, snap) {
        if (!snap || (!pid && !name)) return;
        this.players[WorldKeeper.key(pid, name)] = { ...snap, name: String(name || '').slice(0, 16) };
    }

    /**
     * A player's saved things: by their lasting id; an old save kept by name is
     * used (once — it moves to the id) only if it is not the host's own name
     * (`self`: the host / single player looking up their own).
     */
    playerFor(pid, name, { self = false } = {}) {
        const byId = pid ? this.players[WorldKeeper.key(pid)] : null;
        if (byId) return byId;
        const nk = WorldKeeper.key(null, name);
        const legacy = this.players[nk];
        if (!legacy || (!self && nk === WorldKeeper.key(null, this.myName))) return null;
        if (pid) delete this.players[nk];
        return legacy;
    }

    snapshot() {
        const g = this.game;
        this.players[this.myKey] = { ...playerSnapshot(g), name: this.myName };
        const DAY = g.constructor.DAY_CYCLE_MS || 24 * 60 * 1000;
        return {
            id: this.id,
            name: this.name,
            fav: this.fav || undefined,
            mode: this.mode,
            seed: this.seed,
            gen: this.gen,
            godsOnEarth: this.godsOnEarth || undefined,
            hero: this.hero, // (Creative: the hero's settings made with the world — HeroSetup.js; none in an old world)
            realTrees: this.realTrees || undefined,
            created: this.created,
            updated: Date.now(),
            version: { ...GAME_VERSION }, // the game that wrote it last
            createdVersion: this.createdVersion,
            dayPhase: g.dayPhase ? g.dayPhase() : 0,
            dayMs: DAY,
            explosions: g.explosions.slice(-4000),
            edits: (g.blockEdits || []).slice(-30000),
            treesGone: g.world.treesGoneList?.() || [],
            treesMoved: g.world.movedTrees?.() || [], // (carried by «Левиоса Максима»: World.placeTree)
            ice: g.iceCells || [],
            chests: [...new Set([...(g.chests || []).filter((c) => c.isOpen).map((c) => c.id), ...(g._openedChests || [])])],
            // (a good lying unpaid for sale is the market's, not the world's: the merchant lays it out again — kept, it came back
            // beside his new goods at every load, the counters filling up with wands and price cards)
            items: g.items ? [...g.items.loose.values()].filter((L) => !onSpot(L) && !(L.item.shop && !L.item.shop.paid)).map((L) => ({ item: L.item, p: [r2(L.model.position.x), r2(L.model.position.y), r2(L.model.position.z)], h: L.hover ? 1 : 0 })) : [],
            gargoyleScorch: g.gargoyles?.snapshot() || undefined, // (the burnt pentagrams of the gargoyles: spent for good)
            enchantCircles: g.enchantCircles?.snapshot() || undefined, // (the permanent circles of the enchanting pentagram)
            weapons: g.weapons.weapons.filter((w) => !w.holder).map((w) => w.serialize()),
            fixedWeapons: g.fixedWeapons || [], // the weapons the world starts with (a newer game may add more)
            animals: g.animals?.snapshot() || [],
            animalSites: g.animals?.sitesSnapshot() || {}, // (herd places emptied lately; an older save has none: all full)
            doors: g.doors?.snapshot() || [],
            locks: g.locks?.snapshot() || null, // («Алохомора»: what was unlocked, the gates)
            boards: g.boards?.snapshot() || null,
            campfires: g.campfires?.snapshot() || [],
            cauldrons: g.cauldrons?.snapshot() || null,
            liquidated: g.liquidation?.snapshot() || [], // cauldrons, chests, beds, doors, boards crumbled by «Liquidation» (they never come back)
            houses: g.houses?.snapshot() || null,
            wards: g.wards?.snapshot() || [], // houses' spheres of protection (HouseWards.js)
            divineCreations: g.divine?.snapshot() || null,
            customCreatures: g.customCreatures?.snapshot() || null, // creatures of one's own: their kinds and the ones alive (CustomCreatures.js) // what «Да пусть создастся» made: the buildings' records, their chests (DivineCreation.js)
            magicCastles: g.castleMagic?.snapshot() || null, // castles made by magic and what is in their chests (CastleMagic.js)
            magicHouses: g.houseMagic?.snapshot() || null, // houses made by magic and what is in their chests (HouseMagic.js)
            iceMagic: g.iceMagic?.snapshot() || null, // castles and bridges of ice (IceMagic.js)
            planets: g.space?.planets.toJSON() || null, // the planets: made by players, changed by spells (Planets.js)
            beds: g.beds?.snapshot() || [],
            castles: g.castleLife?.snapshot() || {},
            rebuild: g.castleLife?.rebuild.snapshot() || null, // what the builders put back (Rebuild.js)
            bodies: g.death?.snapshot() || [],
            crystals: g.crystals?.snapshot() || [],
            spiders: g.spiders?.snapshot() || [], // the giant spider's lairs whose spider was killed (she never comes back there: Spider.js)
            dragons: g.dragons?.snapshot() || {}, // dragons' lairs: the gold left, their dragons' health (Dragons.js)
            iceCastle: g.iceCastle?.snapshot() || null, // the Ice Castle: the queen dead or her health, the monsters, seen on the map (IceQueen.js; its melted ice — the block edits)
            ships: g.ships?.snapshot() || [], // ships that moved, burnt, sank, were captured…
            guns: g.ships?.cannons.snapshot() || [],
            players: this.players,
        };
    }

    async save() {
        if (this._saving || !this.game.active) return;
        if (this.game.groundVortex?.busy) return; // («Ground Vortex» holds blocks out of the ground: saved when it ends or, leaving, returnAll lays them back first)
        this._saving = true;
        try { await putWorld(this.snapshot()); this.lastSaved = Date.now(); } catch (e) { console.warn('[WorldSave] not saved', e); }
        this._saving = false;
    }

    update(dt) {
        this._t += dt;
        if (this._t >= SAVE_EVERY) { this._t = 0; this.save(); }
    }

    dispose() {
        if (typeof window !== 'undefined') window.removeEventListener('pagehide', this._onHide);
    }
}

/** Put a saved world back into a freshly generated game (same seed). */
export function restoreWorld(game, save, THREE) {
    retireScrollsIn(save); // (the loose things, the bodies, the chests… of an old save: the retired scrolls become apples)
    const g = game;
    if (!save) return;
    if (Array.isArray(save.edits) && save.edits.length) {
        // (an old world's other wizards' towers are no more — the world keeps one: their edits would be holes in bare land)
        const towers = g.world?.terrain?.data?.towers;
        g.builder?.applyEdits(towers?.dropLostEdits ? towers.dropLostEdits(save.edits) : save.edits);
    }
    for (const i of save.treesGone || []) g.world.treeGoneById(i); // (one whose land is not here yet stays gone when it comes)
    g.world.restoreMovedTrees?.(save.treesMoved);
    // (the checks of the buildings after each blast: at once, in the blasts' order, unseen — Structure.js, Collapse.Settling)
    const replay = (fn) => (g.world.terrain?.data?.settling ? g.world.terrain.data.settling.replay(fn) : fn());
    replay(() => {
        for (const e of save.explosions || []) {
            // (k: the houses' spheres of protection it could not eat into — HouseWards.js)
            if (e.boom) runBoom(g.world.destructible ? g.world.terrain?.data : null, e); // («Бум»: its whole crater — BoomCarve.js)
            else breaking(e.en && g.world.terrain?.data, e.en, e.p[0], e.p[2], () => { // (en: a breaker of the enchanted stone — EnchantedStone.js)
                if (e.ruin) g.world.ruin(new THREE.Vector3(e.p[0], e.p[1], e.p[2]), e.r, keepIn(e.k), e.ri != null ? { inner: e.ri, full: e.rf } : null); // («Total Destruction»; ri: a band of a wave)
                else g.world.explode(new THREE.Vector3(e.p[0], e.p[1], e.p[2]), e.r, keepIn(e.k));
            });
            g.explosions.push(e);
        }
    });
    if (save.rebuild) g.castleLife?.rebuild.restore(save.rebuild); // (after the blasts: what the builders put back since)
    if (save.ice && save.ice.length) g.applyIce(save.ice);
    if (save.liquidated) g.liquidation?.restore(save.liquidated); // (before the things themselves: what crumbled is not made again)
    for (const id of save.chests || []) { (g._openedChests = g._openedChests || new Set()).add(id); const c = g.chests?.find((x) => x.id === id); if (c) c.setOpenInstant(); }
    for (const e of save.items || []) if (!(e.item?.shop && !e.item.shop.paid)) g.items?.spawnLoose( // (an older save's goods for sale: left out — see the snapshot)
        e.item, new THREE.Vector3(e.p[0], e.p[1], e.p[2]), { hover: !!e.h, broadcast: false });
    if (save.animals) g.animals?.restore(save.animals);
    if (save.animalSites) g.animals?.sitesRestore(save.animalSites);
    if (save.doors) g.doors?.restore(save.doors);
    if (save.locks) g.locks?.restore(save.locks);
    if (save.boards) g.boards?.restore(save.boards);
    if (save.campfires) g.campfires?.restore(save.campfires);
    if (save.cauldrons) g.cauldrons?.restore(save.cauldrons);
    if (save.houses) g.houses?.restore(save.houses);
    if (save.wards) g.wards?.restore(save.wards); // houses' spheres of protection
    if (save.beds) g.beds?.restore(save.beds);
    if (save.castles) g.castleLife?.restore(save.castles);
    if (save.enchantCircles) g.enchantCircles?.restore(save.enchantCircles);
    if (save.gargoyleScorch) g.gargoyles?.restore(save.gargoyleScorch);
    if (save.bodies) g.death?.restore(save.bodies);
    if (save.crystals) g.crystals?.restore(save.crystals);
    if (save.spiders) g.spiders?.restore(save.spiders);
    if (save.dragons) g.dragons?.restore(save.dragons);
    if (save.iceCastle) g.iceCastle?.restore(save.iceCastle);
    if (save.ships) g.ships?.restore(save.ships);
    if (save.guns) g.ships?.cannons.restore(save.guns);
    if (save.magicHouses) g.houseMagic?.restore(save.magicHouses);
    if (save.magicCastles) g.castleMagic?.restore(save.magicCastles);
    if (save.divineCreations) g.divine?.restore(save.divineCreations);
    if (save.customCreatures) g.customCreatures?.restore(save.customCreatures); // («Да пусть создастся») // («Create a Castle») // (after the beds, the doors and the things lying about)
    if (save.iceMagic) g.iceMagic?.restore(save.iceMagic);
    if (save.planets) g.space?.planets.applyJSON(save.planets);
    // (Creative always opens in the full day; the other modes go on from the hour they were left at)
    if (Number.isFinite(save.dayPhase) && g.config?.mode !== 'creative') g.dayStart = Date.now() - save.dayPhase * (save.dayMs || 24 * 60 * 1000);
    if (g.dayCycle) g.world.setDayPhase(g.dayPhase());
    // things lying around: exactly what was there (a sword taken into a slot is not on its pedestal any more)
    if (Array.isArray(save.weapons)) {
        const keep = new Set(save.weapons.map((s) => s[0]));
        const inSlots = new Set();
        for (const p of Object.values(save.players || {})) for (const s of p.slots || []) if (s && s.kind === 'weapon') inSlots.add(s.id);
        // (a start weapon the save never knew — added by a newer game — stays on its pedestal)
        const known = new Set(save.fixedWeapons || ['tA', 'tS']), fresh = (id) => (g.fixedWeapons || []).includes(id) && !known.has(id);
        for (const w of [...g.weapons.weapons]) if ((!keep.has(w.id) && !fresh(w.id)) || inSlots.has(w.id)) g.weapons.remove(w);
        for (const s of save.weapons) {
            if (inSlots.has(s[0])) continue;
            let w = g.weapons.byId.get(s[0]);
            const pos = new THREE.Vector3(s[2], s[3], s[4]);
            const q = new THREE.Quaternion(s[5], s[6], s[7], s[8]);
            if (!w) { w = g.weapons.markMagic(g.weapons.spawn(s[1], pos, q, s[0]), s[10]); if (s[11]) w.ench = s[11]; w.wake(); }
            else if (!w.hover) w.placeAt(pos, q);
        }
    }
}
