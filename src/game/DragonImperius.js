/**
 * DragonImperius.js — the dragon that holds a mind of «Империус Максима»: the rules (pure, no THREE; tests/unit/dragon-imperius.test.js).
 * The game's side: ImperiusFlyers.js (drive), Dragons.js (_breathe), DragonSmash.js (the wings and the body break things).
 *
 * The author: «Я стою на месте, а он почему-то идёт. Так не должно быть» · «Огонь должен поджигать то, на что попадает» ·
 * «Крылья и тело дракона ломают всё, с чем взаимодействуют: огромное существо с большой массой».
 *
 *  1. WalkGate — the dragon (every taken body) walks ONLY while the hero's own legs keep stepping, freshly: the camera lost the pose /
 *     stopped sending results (the last «бегу» stays in the smoother), a blip of the shoulders' bob — and it goes on walking.
 *  2. FLAME_TARGETS — who and what the dragon's fire sets alight (the table; the code is Dragons._breathe → Game._burnRay + Burning.igniteRay).
 *  3. SMASH — what the wings, the tail and the flank break, by how fast they move and how much the dragon weighs; BREAKS — block by block.
 */
import { BLOCK } from '../world/Terrain.js';

// ============================================================ 1. standing is standing
export const WALK_GATE = {
    START: 0.15, // s of steps in a row before the body walks (a blip of the camera is no step)
    STALE: 0.4, // s without a new pose from the camera: its «walking» is old — stand
};

/** One taken body's walk: `step(in, dt)` → 0 (stands) or the walk's strength (0.2…1). Stops at once, starts after START. */
export class WalkGate {
    constructor() { this.held = 0; }
    reset() { this.held = 0; }
    /** in: {running: the hero is stepping, intensity: 0…1, age: s since the camera's last pose (null: unknown), paused: the menu / loading} */
    step(i, dt) {
        const stale = i.age != null && i.age > WALK_GATE.STALE;
        if (!i.running || stale || i.paused || i.lost) { this.held = 0; return 0; }
        this.held += dt;
        return this.held < WALK_GATE.START ? 0 : Math.max(0.2, Math.min(1, i.intensity || 0));
    }
}

// ============================================================ 2. the fire
/**
 * ON WHOM AND ON WHAT the dragon's flame (the caster's «У») acts. `does`: 'burn' | 'harm' | 'none'.
 * 'burn' = it catches fire (Burning.igniteRay / Fire.igniteAlong / Ships.igniteAlong), 'none' = with the reason.
 */
export const FLAME_TARGETS = {
    trees: { does: 'burn', why: 'деревья (блоками и «обычные»), листва — Fire.igniteAlong; ожившие деревья — LivingTrees.burnAlong; огонь расходится по правилам огня (FireLights — общий свет)' },
    wood: { does: 'burn', why: 'дерево, доски, крыши, солома, сено, ткань, двери — Fire.igniteAlong (сухие блоки); дома горят и рушатся (BurnWreck → Collapse)' },
    grass: { does: 'burn', why: 'трава и сухие кусты — Fire.igniteAlong' },
    villagers: { does: 'burn', why: 'жители, рыцари, волшебники, торговцы — Burning.igniteRay (горят, бегут к воде), страх — Danger «fire»' },
    animals: { does: 'burn', why: 'лошади, свиньи, коровы, бараны — Burning.igniteRay + Animals.burnAlong' },
    zombies: { does: 'burn', why: 'зомби — Burning.igniteRay (замороженный не загорается — лёд тает)' },
    sailors: { does: 'burn', why: 'моряки (ships.crew, kind c) — Burning.igniteRay; скелеты Чёрных Усов горят как моряки' },
    ships: { does: 'burn', why: 'паруса и палуба кораблей — Ships.igniteAlong; чёрный корабль проклят — барьер вспыхивает, огня нет (isCursed)' },
    items: { does: 'burn', why: 'бумага (свитки, книги) на земле сгорает — Game._flameBurnsPaper; остальные вещи не горят' },
    snowmen: { does: 'harm', why: 'злые снеговики и ледяные монстры — огонь их слабость (×2, IceCastle.hitRay); добрые снеговики тают' },
    iceQueen: { does: 'none', why: 'Ледяная Королева: огонь не горит на ней, как и простые заклинания без свитка (IceQueen.iceDamage); лёд замка тает (meltRay)' },
    dragons: { does: 'none', why: 'драконы не горят (и дракон игрока не обжигает сам себя)' },
    owls: { does: 'none', why: 'совы не горят; феникс — огонь его стихия' },
    gods: { does: 'none', why: 'храм богов и дары богов не горят — золотая защита; заколдованный камень не горит' },
    me: { does: 'none', why: 'вселившийся игрок в пламени своего дракона не горит (его тело стоит далеко); чужие игроки в пламени горят у себя' },
};

// ============================================================ 3. the weight
export const SMASH = {
    TICK: 0.1, // s: the strike is looked at this often (not every frame)
    MIN_SPEED: 3.5, // m/s of a part: slower is a touch (it pushes a little, breaks nothing)
    BUDGET_K: 0.55, // hardness of blocks one strike may break per (m/s)² over the minimum, × the dragon's size
    MAX_BLOCKS: 90, // blocks one look may break (all the parts together): a piece at a frame, no hitches
    MAX_PER_PART: 28, // … by one part
    DEPTH: 4, // blocks deep a strike goes into a wall at most (diving: more)
    HIT_CD: 0.8, // s between two blows on the same creature
    DMG_K: 0.9, // HP per m/s over the minimum, × size (a creature)
    DMG_MAX: 60,
    PUSH_K: 1.1, // m/s of the shove per m/s of the part, × size
    SOUND_CD: 0.45,
};

/** A part of the dragon that strikes: its reach (m, × size) and weight share. */
export const PARTS = {
    wingTip: { r: 1.5, mass: 0.7 },
    wingMid: { r: 1.9, mass: 0.9 },
    tailTip: { r: 1.1, mass: 0.8 },
    tailMid: { r: 1.3, mass: 0.9 },
    chest: { r: 2.3, mass: 1.6 },
    rump: { r: 2.2, mass: 1.3 },
};

/**
 * How hard a block is to break (the budget one block costs); null: never broken by a body, however heavy.
 * Land (earth, grass, sand, snow, gravel, rock under the ground), water, bedrock, the other planets' ground, the ice of lakes,
 * and the enchanted stone are not broken (the enchanted stone and the gods' gifts are also guarded by Terrain.set itself).
 */
export const HARDNESS = (() => {
    const B = BLOCK, h = [];
    const put = (list, v) => { for (const k of list) if (B[k] != null) h[B[k]] = v; };
    put(['WHEAT', 'VEG', 'FLOWERS', 'CARPET_RED', 'CARPET_BLUE', 'CARPET_GREEN', 'CARPET_PURPLE', 'CLOTH_WHITE', 'CLOTH_YELLOW', 'LANTERN', 'POTION', 'ARCANE_LAMP', 'ARCANE_LAMP_VIOLET', 'BOOKS'], 0.25);
    put(['LEAVES', 'BIRCH_LEAVES', 'SPRUCE_LEAVES', 'CHERRY_LEAVES', 'DARK_LEAVES', 'THATCH', 'HAY', 'FENCE'], 0.4);
    put(['ROOF_RED', 'ROOF_BLUE', 'ROOF_SLATE', 'ROOF_PURPLE', 'PLASTER'], 1.0);
    put(['WOOD', 'BIRCH', 'SPRUCE', 'CHERRY', 'DARK', 'PLANKS', 'PLANKS_DARK'], 1.3);
    put(['BRICK', 'COBBLE', 'GOLD'], 2.3);
    put(['CS_GREY', 'CS_SAND', 'CS_DARK', 'CS_WHITE', 'CS_MOSSY', 'RUNE'], 3.0);
    put(['ARCANE', 'ARCANE_DARK'], 3.4);
    put(['ICE_WALL', 'ICE_GLOW', 'ICE_FLOOR', 'ICE_DARK'], 2.2); // (the palace's ice: brittle under a body this big)
    return h;
})();

export const hardnessOf = (t) => HARDNESS[t] ?? null;

/**
 * ON WHOM AND ON WHAT the weight acts (the table; the code is DragonSmash.js). `does`: 'break' | 'push' | 'hurt' | 'none'.
 */
export const SMASH_TARGETS = {
    blocks: { does: 'break', why: 'стены, крыши, постройки, ограды — блок за блоком по твёрдости (дерево 1,3, кирпич 2,3, камень замка 3); снятое идёт через builder._sendEdits(settle) → Structure/Collapse: что потеряло опору, рушится' },
    trees: { does: 'break', why: 'деревья (отдельные и блоками) ломаются, ожившие деревья получают урон' },
    ships: { does: 'break', why: 'корпус трескается, сильный удар пробивает (Ships.smash); чёрный корабль проклят — барьер вспыхивает, ничего не ломается' },
    creatures: { does: 'push', why: 'жители, звери, зомби, моряки: толчок CreatureImpact (тяжёлое тело) + урон от скорости; дракон дракона не бьёт' },
    players: { does: 'push', why: 'другие игроки: толчок (Impact), урон считает их компьютер' },
    land: { does: 'none', why: 'земля, трава, песок, снег, гравий, вода, бедрок — не ломаются (дракон не копает)' },
    godGifts: { does: 'none', why: 'дары богов и храм богов — золотая защита; заколдованный камень (арены, башни волшебников) — только божественный «Бум»/«Инспириус»/«Total Destruction Максима»' },
    wards: { does: 'none', why: 'дом под сферой защиты — удар не проходит' },
};

/**
 * The strike of a part moving at `speed` m/s (the dragon's `size` m per model m; `mass` the part's share): its budget of hardness,
 * and how deep into a wall it goes. 0: a touch.
 */
export function strikeOf(speed, size, mass = 1) {
    const over = speed - SMASH.MIN_SPEED;
    if (over <= 0) return { budget: 0, depth: 0 };
    const budget = over * over * SMASH.BUDGET_K * size * mass;
    const depth = Math.min(SMASH.DEPTH + 2, Math.max(1, Math.round(1 + over / 10)));
    return { budget, depth };
}

/**
 * Which of `cells` ({x,L,z,t,d: distance to the part}) one strike breaks: nearest first while the budget lasts (each block costs
 * its hardness), at most `max`. Pure: the caller removes them. → the chosen cells.
 */
export function pickBreaks(cells, budget, max = SMASH.MAX_PER_PART) {
    const out = [];
    let left = budget;
    cells.sort((a, b) => a.d - b.d);
    for (const c of cells) {
        const h = hardnessOf(c.t);
        if (h == null) continue;
        if (h > left) continue; // (too hard for what is left: a lighter one further on may still go)
        left -= h;
        out.push(c);
        if (out.length >= max) break;
    }
    return out;
}

/** A creature's hurt and shove from a part moving at `speed`: {dmg, push (m/s)}; a touch (slower than MIN_SPEED) shoves a little, hurts not. */
export function blowOn(speed, size, mass = 1) {
    const over = Math.max(0, speed - SMASH.MIN_SPEED);
    return {
        dmg: Math.min(SMASH.DMG_MAX, over * SMASH.DMG_K * size * mass),
        push: Math.min(40, (over > 0 ? 3 + over : speed * 0.5) * SMASH.PUSH_K * mass),
    };
}
