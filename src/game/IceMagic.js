/**
 * IceMagic.js — «Create an Ice Castle» and «Ice Bridge»: ice made by hands and feet, as Elsa does it.
 *
 *   «Create an Ice Castle»  (500 mana; free in Creative) Water or snow within 30 m. Say the words, then
 *        STAMP a foot (a knee up and down hard — the camera's legs, PoseInterpreter.stompAt): a snowflake
 *        of ice runs over the ground from the foot, 15 m round it (the floor). Then bring BOTH HANDS from
 *        below up over the head: the palace rises out of the floor after them — as high as the hands are,
 *        so far it has grown (hands lowered: it waits; hands up again past where it stopped: it grows on),
 *        hands straight up: the dome closes, the spires get their tips — the castle is done: ice gates
 *        (they open by the hand — Doors.js), a hall under a dome, a curving stair up to a gallery and a
 *        balcony over the gates, a throne of ice, a chandelier like a snowflake, a bed.
 *        No legs in the picture (a close camera)? The stamp is both hands brought down hard instead (as if
 *        pressing the magic into the ground): from level or higher down to the hips in under 0.8 s.
 *   «Ice Bridge»  (50 mana) Water or snow within 18 m. Point the hand where the bridge should go (5–60 m:
 *        over a ravine, a river, a pit — or anywhere) and say the words: an arch of ice grows from the feet
 *        towards that point, after the hand — as far as the hand points along it, so far it has grown (the
 *        hand lowered towards the feet: it waits); pointed at the end, it reaches it. A deck three wide,
 *        railings of ice with glowing posts.
 *   Both are held spells (Concentration.js): until they are done (or «стоп») no other spell works; a stun,
 *   a fall or death breaks them — what has grown so far stays (it is ice: fire melts it). 45 s without
 *   growing: the magic ends by itself the same way.
 *
 * The ice is the palace's ice (Terrain.BLOCK.ICE_WALL / GLOW / FLOOR / DARK): solid blocks — everybody
 * walks on it, nobody goes through it (the players, every creature, things); the fire that melts the Ice
 * Queen's palace melts it too (IceQueen.meltAt: «Инферно», «Fire Maxima», «Let the Hellfire Come»), a blast
 * breaks it like any block; the castles' builders never rebuild it.
 *
 * «На кого и на что» — ICE_MAGIC_TARGETS below (tests/unit/spell-targets.test.js checks every kind).
 *
 * Warm or cold: ice made in the mountains, where it is cold (at the snow line or above it — the snow band of
 * Landscape.snowLine), stands for ever. Anywhere else it can be made too, but the sun melts it: a game day
 * it stands whole (dripping more and more), and by the end of the second it has melted away block by block
 * from the top down — the floor last (rec.cold, rec.age: saved with it).
 *
 * Multiplayer: the caster's computer reads the feet and the hands and says how far it has grown; the host
 * decides (checks the place, puts the blocks — they travel as ordinary block edits — the gates, the bed);
 * every computer sees the same frost, sparkles and hears the same tune. The castles and bridges (their
 * records: where, how far grown, which of their blocks are gone) are saved with the world.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS, isLeaves, isSolid, isCastleBlock, isPalaceIce, SNOW_BAND } from '../world/Terrain.js';
import { iceLocal, iceYaw } from '../world/IceCastle.js';
import { ICE_MAGIC, iceCastleMagicSteps, iceBridgePlan, rotTowards, waterOrSnowNear } from '../world/IceMagicPlan.js';
import { chandelierModel } from './IceModels.js';

export const ICE_SPELL = {
    NEED_CASTLE: 30, NEED_BRIDGE: 18, // m: water or snow this near
    STOMP_WAIT: 25, // s to stamp after the words
    FLOOR_T: 2.4, // s the snowflake floor takes to spread
    LIFT_LO: 0.35, LIFT_HI: 1.7, // the hands (armLift: 0 hanging, 1 level, 2 straight up): the castle's floor … its top
    RISE: 0.24, // the castle grows at most this share of its height a second (≥ 4 s up)
    BRIDGE_SPEED: 11, // m a second at most
    AIM: 64, // m: how far the hand points the bridge's end
    IDLE: 45, // s without growing: the magic ends (what grew stays)
    SLAM_UP: 0.8, SLAM_DOWN: 0.25, SLAM_MS: 800, // the stamp without legs: both hands from ≥ level to the hips
    BUDGET_MS: 2, MAX_EDITS: 380, // (blocks put a frame)
    RUIN: 0.3, // less than this share of its blocks left: gone (melted)
    // (the author: «не в горах, не там, где холодно — через пару дней полностью растает; в горах не растает»)
    MELT_START: 24 * 60, // s of play (a game day): ice made in the warm stands this long whole, dripping…
    MELT_END: 2 * 24 * 60, // … and is all gone by two game days (block by block, from the top down)
};

/** What the spells do to whom (CLAUDE.md «кто/что × как действует»). */
export const ICE_MAGIC_TARGETS = {
    me: { does: 'none', why: 'заклинание никого не бьёт и не толкает; замок растёт вокруг меня (я стою в его зале), мост — от моих ног' },
    players: { does: 'none', why: 'другие игроки не задеты; блок, который встал бы там, где кто-то стоит, ждёт, пока он уйдёт (никого не замуровывает)' },
    zombies: { does: 'none', why: 'зомби не задеты; лёд для них — как стена и пол: обходят, ходят по мосту и по залу' },
    castlePeople: { does: 'fear', why: 'жители замков не задеты, но пугаются ледяной магии рядом (Danger «ice»)' },
    animals: { does: 'none', why: 'животные не задеты; блок ждёт, пока животное уйдёт' },
    sailors: { does: 'none', why: 'моряки на кораблях не задеты; на корабле лёд не строится' },
    spider: { does: 'none', why: 'гигантский паук не задет; блок ждёт, пока он уйдёт' },
    livingTrees: { does: 'none', why: 'ожившее дерево не задето (обычные деревья на полу замка убираются, ожившее — нет: оно ходит)' },
    bookBirds: { does: 'none', why: 'книги-птицы летают над льдом, не задеты' },
    dragon: { does: 'none', why: 'дракон не задет; его огонь растапливает лёд (IceQueen.meltAt)' },
    phoenix: { does: 'none', why: 'феникс не задет' },
    owl: { does: 'none', why: 'сова не задета — вспархивает' },
    iceCastle: { does: 'none', why: 'Ледяная Королева, снеговики и ледяные монстры не задеты — лёд их стихия; рядом с её дворцом замок не строится (уже стоит лёд)' },
    blocks: { does: 'build', why: 'кладёт блоки льда; пол замка расчищает над собой (кусты, бугры, листья) и подсыпает лёд под себя до земли' },
    trees: { does: 'take', why: 'деревья, на которых ляжет пол замка, исчезают (лёд их вытесняет); мост деревья не трогает — проходит над ними или упирается' },
    water: { does: 'need + freeze', why: 'вода или снег рядом нужны (источник льда); вода под полом замка замерзает' },
    houses: { does: 'none', why: 'там, где дома, замки, деревни, корабли или чужая защита дома, лёд не строится' },
    ships: { does: 'none', why: 'на корабле и у его борта лёд не строится' },
    fire: { does: 'melted', why: 'огонь — слабость льда: «Инферно», «Fire Maxima», «Адский огонь», огонь драконов растапливают блоки замка и моста' },
    looseThings: { does: 'none', why: 'вещи на земле не задеты (пол ложится под ними)' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не строится' },
};

const AIR = BLOCK.AIR;
const TREE_WOOD = new Set(TREE_KINDS.map((k) => k.wood));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;
/** The notes of the rising tune (a pentatonic scale climbing two octaves): playback rates of one crystal bell. */
const TUNE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];

/** The gloss of the ice: one material for every shell (the same as Game.prewarm's sample sphere). */
let _gloss = null;
const glossMat = () => _gloss || (_gloss = new THREE.MeshPhongMaterial({ color: 0xbfefff, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide }));

/** The phrase: «Create an Ice Castle» / «Ice Bridge» (and the Russian ways of saying them) → name | null. */
export function iceMagicWords(text) {
    const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
    const words = s.split(/[^a-zа-я]+/).filter(Boolean);
    const iceEn = words.some((w) => /^(?:айс|айз|аис|айсе|ice|ais|ays)$/.test(w));
    const iceRu = words.some((w) => /^(?:лед|леда|ледян[а-я]*|ледов[а-я]*|изо)$/.test(w));
    if (!iceEn && !iceRu) return null;
    const castle = /(касл|кастл|кэсл|кесл|касел|кастел|кэстл|кестл|castle|castl|kasl|cassel|замок|замка|замку|дворец|дворц|палас|palace)/.test(s);
    const bridge = /(бридж|бриж|брыдж|бридз|брич|bridge|brige|bridg|bridj|мост|мостик)/.test(s);
    if (!castle && !bridge) return null;
    // (English words: «Ice Castle», «айс касл» are the spell; Russian talk about «ледяной замок» casts
    // only with a word of making: «создай / построй / сотвори ледяной замок»)
    const make = /(creat|крейт|криейт|криэйт|креит|кріейт|созда|сотвори|постро|сдела|make|мейк|build|билд)/.test(s);
    const en = iceEn || /(касл|кастл|кэсл|castle|бридж|бриж|bridge)/.test(s);
    if (!en && !make) return null;
    return castle ? 'IceCastle' : 'IceBridge';
}

export class IceMagic {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id → record {id, k: 'castle'|'bridge', …where, f, owner, name, t, miss}
        this.magic = null; // the ice growing now (every computer): {id, k, by, rec, t, f, …}
        this.pending = null; // (the caster) the words said, the stamp awaited: {at, stomp0}
        this.look = new Map(); // id → {group, ch} the castle's chandelier and gloss (every computer)
        this._plans = new Map(); // id → plan (made once, a piece a frame)
        this._gen = null; // the plan being made: {id, it, done}
        this._repairQ = [];
        this._waiting = [];
        this._lastCast = 0;
        this._interim = null;
        this._slam = { hi: 0 };
        this._sendT = 0;
        this._ruinT = 0;
        this.testLift = null; // (tests) the hands' height instead of the camera's (armLift)
        this.testAim = null; // (tests) where the hand points: {x, z}
    }

    get auth() { return this.game.authority; }
    get data() { return this.game.terrain?.data || this.game.world?.terrain?.data || null; }
    get free() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    /** Is my concentration on the ice (the words said, or my ice growing)? */
    mine() { const g = this.game; return !!this.pending || (!!this.magic && this.magic.by === g.localId); }

    // =================================================================== the words
    cast(name, isFinal = true) {
        const g = this.game;
        const now = Date.now();
        const early = this._interim;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interim = null; return null; }
        if (now - this._lastCast < 1500) return null;
        const say = (t) => { if (isFinal && t) g.hud?.setVoice?.(t, true); return null; };
        if (this.magic || this.pending) return say('❄️ Ледяная магия уже идёт — доведите её до конца или скажите «стоп»');
        if (g.flight?.active || g.swim?.swimming) return say('❄️ Встаньте на землю');
        const tired = g.combat?.check?.(name);
        if (tired) return say(tired);
        const me = g.character.group.position;
        const need = name === 'IceCastle' ? ICE_SPELL.NEED_CASTLE : ICE_SPELL.NEED_BRIDGE;
        if (!waterOrSnowNear(this.data, me.x, me.z, need)) return say(`❄️ Рядом нет ни воды, ни снега — льду не из чего родиться. Подойдите к реке, озеру, морю или снегу (до ${need} м)`);
        if (name === 'IceCastle') {
            this.pending = { at: performance.now(), stomp0: g.currentPose?.stompAt || 0 };
            this._slam.hi = 0;
            // (shown at once, even heard from an unfinished phrase: the magic waits for the stamp — the final words
            // of the same phrase change nothing, and without this line the player never knew to stamp)
            g.hud?.setVoice?.(this._legsSeen() ? '❄️ Теперь <b>топните ногой</b> — от неё пойдёт ледяной пол' : '❄️ Теперь <b>резко опустите обе руки вниз</b> (камера не видит ног — или отойдите, чтобы ноги были видны, и топните)', true);
        } else {
            const b = this._aimGround();
            if (!b) return say('🌉 Покажите рукой на землю там, куда вести мост (до 60 м)');
            const res = this._askBridge(b);
            if (res !== true) return say(res);
        }
        this._lastCast = now;
        this._interim = isFinal ? null : { name, at: now };
        g._manaLater = true; // (the success counts when it is done)
        return name;
    }

    _legsSeen() {
        const p = this.game.currentPose;
        return !!(p?.legsSeenAt && performance.now() - p.legsSeenAt < 3000);
    }

    /** The hands' height (0 hanging … 2 straight up): both hands. */
    _lift() {
        if (this.testLift != null) return this.testLift;
        const l = this.game.currentPose?.armLift;
        if (!l) return null;
        return ((l.left || 0) + (l.right || 0)) / 2;
    }

    /** Where my hand points on the ground (the bridge's end): a point or null. */
    _aimGround() {
        const g = this.game;
        if (this.testAim) return new THREE.Vector3(this.testAim.x, g.collision.groundY(this.testAim.x, this.testAim.z), this.testAim.z);
        const side = g.wandSide?.() || g.magicHand || 'right';
        const hand = g.character.getHandWorldPosition(side, new THREE.Vector3());
        const dir = g.character.getHandDirection(side, new THREE.Vector3());
        for (let k = 1; k < ICE_SPELL.AIM; k += 0.5) {
            const p = _v.copy(hand).addScaledVector(dir, k);
            const gy = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y) : g.collision.groundY(p.x, p.z);
            if (p.y <= gy + 0.2) return new THREE.Vector3(p.x, gy, p.z);
        }
        return null;
    }

    _askBridge(b) {
        const g = this.game, me = g.character.group.position;
        const dx = b.x - me.x, dz = b.z - me.z, d = Math.hypot(dx, dz);
        if (d < ICE_MAGIC.BRIDGE_MIN + 1.5) return '🌉 Слишком близко — покажите дальше (мост от 5 до 60 м)';
        if (d > ICE_MAGIC.BRIDGE_MAX + 1.5) return '🌉 Слишком далеко — мост не длиннее 60 м';
        const a = [r2(me.x + (dx / d) * 1.5), r2(me.z + (dz / d) * 1.5)];
        const ask = { k: 'bridge', p0: a, p1: [r2(b.x), r2(b.z)] };
        if (!this.auth) { g.sync?.net?.send({ t: 'icemagic', a: 'ask', ...ask }); return true; }
        return this._hostStart(ask, g.localId);
    }

    _askCastle() {
        const g = this.game, ch = g.character;
        const me = ch.group.position, ry = ch.group.rotation.y;
        const ask = { k: 'castle', c: [r2(me.x), r2(me.z)], rot: rotTowards(-Math.sin(ry), -Math.cos(ry)) };
        if (!this.auth) { g.sync?.net?.send({ t: 'icemagic', a: 'ask', ...ask }); return true; }
        return this._hostStart(ask, g.localId);
    }

    // ============================================================ the host checks
    /** The ground of a column: {L, wet} (under trees, bushes and flowers; water is ground for ice: it freezes). */
    _surface(x, z) {
        const data = this.data;
        let L = data.topLayer(x, z);
        for (let k = 0; k < 40; k++) {
            const t = data.get(x, L, z);
            if (t === BLOCK.WATER) return { L, wet: true };
            if (t === AIR || !isSolid(t) || isLeaves(t) || TREE_WOOD.has(t)) { L--; continue; }
            return { L, wet: false };
        }
        return { L, wet: false };
    }

    /** May ice stand on these columns (x, z, from L0 to L1)? null or why not. */
    _blocked(cols, L0, L1, own = null) {
        const g = this.game, data = this.data;
        for (const [x, z] of cols) {
            if (data.isSeaColumn?.(x, z) && !own) return '🌊 Тут море — лёд здесь не встанет';
            for (let L = L0; L <= L1; L += 1) {
                const t = data.get(x, L, z);
                if (isCastleBlock(t)) return '🏘️ Здесь уже что-то построено — найдите свободное место';
                if (isPalaceIce(t) && !own) return '❄️ Здесь уже стоит лёд';
            }
            if (g.ships?.footprintAt?.(x, L0, z)) return '⚓ Здесь корабль';
        }
        return null;
    }

    /** (host) Someone asks: check the place, start it. @returns true or why not */
    _hostStart(ask, by) {
        const g = this.game, data = this.data;
        if (this.magic) return '❄️ Ледяная магия уже идёт';
        if (!data) return '❄️ …';
        const id = 'ic' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        let rec;
        if (ask.k === 'castle') {
            const x = Math.round(+ask.c?.[0] || 0), z = Math.round(+ask.c?.[1] || 0);
            if (!waterOrSnowNear(data, x, z, ICE_SPELL.NEED_CASTLE + 2)) return '❄️ Рядом нет ни воды, ни снега';
            const s = this._surface(x, z);
            const G = s.L;
            const R = ICE_MAGIC.FLOOR_R;
            const cols = [];
            let bad = 0;
            for (let dx = -R; dx <= R; dx += 2) for (let dz = -R; dz <= R; dz += 2) {
                if (Math.hypot(dx, dz) > R) continue;
                cols.push([x + dx, z + dz]);
                if (Math.abs(this._surface(x + dx, z + dz).L - G) > 6) bad++;
            }
            if (bad > cols.length * 0.2) return '⛰️ Слишком неровно — для замка нужно место поровнее';
            const why = this._blocked(cols, G - 1, G + 26);
            if (why) return why;
            if (g.houseMagic?.houseNear?.({ x, z }, R + 2)) return '🏠 Здесь стоит дом — найдите свободное место';
            for (const o of this.list.values()) if (o.k === 'castle' && Math.hypot(o.x - x, o.z - z) < 2 * R + 6) return '❄️ Слишком близко к другому ледяному замку';
            if (g.wards?.list?.size && g.wards.forbids?.(g.character.group.position, _v.set(x, G + 1, z))) return '🛡️ Здесь чужая защита дома';
            rec = { id, k: 'castle', x, z, G, rot: (ask.rot | 0) & 3, f: 0 };
        } else {
            const ax = +ask.p0?.[0] || 0, az = +ask.p0?.[1] || 0, bx = +ask.p1?.[0] || 0, bz = +ask.p1?.[1] || 0;
            const len = Math.hypot(bx - ax, bz - az);
            if (len < ICE_MAGIC.BRIDGE_MIN || len > ICE_MAGIC.BRIDGE_MAX) return '🌉 Мост — от 5 до 60 м';
            if (!waterOrSnowNear(data, ax, az, ICE_SPELL.NEED_BRIDGE + 2)) return '❄️ Рядом нет ни воды, ни снега';
            const aL = this._surface(Math.round(ax), Math.round(az)).L + 1, bL = this._surface(Math.round(bx), Math.round(bz)).L + 1;
            if (Math.abs(aL - bL) > ICE_MAGIC.BRIDGE_RISE) return '🌉 Слишком высоко — концы моста на разной высоте больше чем на 22 м';
            rec = { id, k: 'bridge', ax: r2(ax), az: r2(az), aL, bx: r2(bx), bz: r2(bz), bL, f: 0 };
            const plan = this.plan(rec);
            const cols = [];
            for (let i = 0; i < plan.cells.length; i += 7) cols.push([plan.cells[i][0], plan.cells[i][2]]);
            const why = this._blocked(cols, Math.min(aL, bL) - 1, plan.top + 2, true);
            if (why) return why;
            if (g.wards?.list?.size && g.wards.forbids?.(g.character.group.position, _v.set(bx, bL, bz))) return '🛡️ Здесь чужая защита дома';
        }
        rec.cold = this.coldAt(rec.k === 'castle' ? rec.x : (rec.ax + rec.bx) / 2, rec.k === 'castle' ? rec.z : (rec.az + rec.bz) / 2, rec.k === 'castle' ? rec.G : Math.min(rec.aL, rec.bL) - 1);
        rec.age = 0;
        rec.owner = g.houseMagic?._key?.(by) || String(by);
        rec.name = g.houseMagic?._name?.(by) || 'Игрок';
        g.sync?.net?.send({ t: 'icemagic', a: 'go', rec, by });
        this._go(rec, by);
        g.castleLife?.alarm?.({ x: rec.x ?? rec.bx, y: (rec.G ?? rec.bL) + 1, z: rec.z ?? rec.bz }, 'ice', by, rec.k === 'castle' ? 16 : 8);
        return true;
    }

    /** (every computer) The ice begins: the caster pays; the frost and the sound. */
    _go(rec, by) {
        const g = this.game;
        this.list.set(rec.id, rec);
        this.magic = { id: rec.id, k: rec.k, by, rec, t: 0, f: 0, want: 0, ci: 0, fi: 0, idle: 0, note: 0, flashT: 0, soundT: 0, beat: 0 };
        if (rec.k === 'castle') { this._startPlan(rec); this._hookLight(); }
        if (by === g.localId) {
            this.pending = null;
            g.combat?.pay?.(rec.k === 'castle' ? 'IceCastle' : 'IceBridge');
            g.hud?.setVoice?.(rec.k === 'castle' ? '❄️ Лёд расходится от ноги… Теперь <b>поднимайте обе руки снизу вверх</b> — замок растёт за руками' : '🌉 Мост растёт за рукой — держите руку на том месте, куда он ведёт', true);
        }
        const c = this._centre(rec, _v);
        g.sound?.playIce?.(rec.k === 'castle' ? 'iceFloor' : 'iceChime', c, 1.2);
        g.fx?.lightFlash?.(c, 0xbfefff, 3, 0.5, 40);
    }

    /**
     * Is it cold here — the mountains' snow (ice made here never melts)? At the snow line or in the band
     * of snow patches under it (Landscape.snowLine: lower where the climate is cold). Without the world's
     * landscape (tests): natural snow lying round about.
     */
    coldAt(x, z, G) {
        const data = this.data;
        const land = data?.land;
        if (land?.snowLine && land.climate) {
            const T = land.climate(x, z, this._clim || (this._clim = {})).T;
            return G >= land.snowLine(x, z, T) - SNOW_BAND;
        }
        x = Math.round(x); z = Math.round(z);
        let n = 0;
        for (let dx = -12; dx <= 12; dx += 3) for (let dz = -12; dz <= 12; dz += 3) if (data && data.get(x + dx, data.topLayer(x + dx, z + dz), z + dz) === BLOCK.SNOW) n++;
        return n >= 6;
    }

    _centre(rec, out) {
        return rec.k === 'castle' ? out.set(rec.x, rec.G + 0.5, rec.z) : out.set((rec.ax + rec.bx) / 2, Math.max(rec.aL, rec.bL), (rec.az + rec.bz) / 2);
    }

    // =================================================================== the plans
    /** A record's plan (the bridge's at once; the castle's made a piece a frame — null until it is). */
    plan(rec) {
        let p = this._plans.get(rec.id);
        if (p) return p;
        if (rec.k === 'bridge') { p = iceBridgePlan(rec); this._plans.set(rec.id, p); return p; }
        return null;
    }

    _startPlan(rec) {
        if (this._plans.has(rec.id) || this._gen?.id === rec.id) return;
        if (this._gen) this._queue.push(rec); else this._gen = { id: rec.id, rec, it: iceCastleMagicSteps({ x: rec.x, z: rec.z, G: rec.G, rot: rec.rot }) };
    }

    get _queue() { return this.__q || (this.__q = []); }

    /** A piece of the castle's plan this frame (~1 ms). */
    _planStep() {
        const q = this._gen;
        if (!q) { const r = this._queue.shift(); if (r) this._startPlan(r); return; }
        const r = q.it.next();
        if (!r.done) return;
        this._plans.set(q.id, r.value);
        this._gen = null;
    }

    /** (tests, saving) The plan now, whatever it costs. */
    planNow(rec) {
        let p = this.plan(rec);
        if (p) return p;
        if (this._gen?.id === rec.id) { for (;;) { const r = this._gen.it.next(); if (r.done) { p = r.value; break; } } this._gen = null; }
        else { const it = iceCastleMagicSteps({ x: rec.x, z: rec.z, G: rec.G, rot: rec.rot }); for (;;) { const r = it.next(); if (r.done) { p = r.value; break; } } }
        this._plans.set(rec.id, p);
        return p;
    }

    // =================================================================== frame
    update(dt) {
        const g = this.game;
        if (this._gen || this.__q?.length) this._planStep();
        if (this.pending) this._awaitStomp();
        const m = this.magic;
        if (m) {
            m.t += dt;
            if (m.by === g.localId) this._casterGrow(m, dt);
            if (this.auth && this.magic === m) this._build(m);
            if (this.magic === m) this._sparkle(m, dt);
        }
        if (this.auth) {
            if (this._waiting.length) this._placeWaiting(dt);
            this._meltT = (this._meltT || 0) - dt;
            if (this._meltT <= 0) { this._meltT = 1; this._warmth(1); }
            this._ruinT -= dt;
            if (this._ruinT <= 0) { this._ruinT = 5; this._ruinCheck(); }
        }
        if (this._repairQ.length) this._repairStep();
        if (!this.auth) for (const r of this.list.values()) if (r.cold === false && this.magic?.id !== r.id) r.age = (r.age || 0) + dt; // (the drips: the host's clock decides)
        this._drips(dt);
        for (const L of this.look.values()) if (L.fade < 1) { L.fade = Math.min(1, L.fade + dt); L.gloss.forEach((s) => s.scale.setScalar(1).multiply(s.userData.k).multiplyScalar(0.96 + 0.04 * L.fade)); }
    }

    /** The words said: the stamp of a foot (or both hands brought down hard). */
    _awaitStomp() {
        const g = this.game, P = this.pending, now = performance.now();
        if (g.combat?.dead || (now - P.at) / 1000 > ICE_SPELL.STOMP_WAIT) {
            this.pending = null;
            g.hud?.setVoice?.('❄️ Магия льда рассеялась — не было топота', true);
            return;
        }
        const pose = g.currentPose;
        let stomp = !!(pose?.stompAt && pose.stompAt > P.stomp0 && pose.stompAt > P.at - 300);
        // (no legs in the picture: both hands brought down hard — from level or higher to the hips)
        const lift = this._lift();
        if (!stomp && lift != null) {
            if (lift >= ICE_SPELL.SLAM_UP) this._slam.hi = now;
            else if (lift <= ICE_SPELL.SLAM_DOWN && now - this._slam.hi < ICE_SPELL.SLAM_MS) stomp = true;
        }
        if (P.test) stomp = true;
        if (!stomp) return;
        this.pending = null;
        const res = this._askCastle();
        if (res !== true) { g.hud?.setVoice?.(res, true); return; }
        g.fx && (g.fx.shake = Math.max(g.fx.shake || 0, 0.35));
    }

    /** (tests) As if the foot came down now. */
    stamp() { if (this.pending) { this.pending.test = true; this._awaitStomp(); } }

    /** The caster: how far the hands (the castle) or the hand (the bridge) say it should have grown. */
    _casterGrow(m, dt) {
        const g = this.game;
        if (g.combat?.dead) { this.stopMine('dead'); return; }
        let want = m.want;
        if (m.k === 'castle') {
            if (m.t < ICE_SPELL.FLOOR_T) return; // (the floor first)
            const lift = this._lift();
            if (lift != null) want = Math.max(want, Math.min(1, (lift - ICE_SPELL.LIFT_LO) / (ICE_SPELL.LIFT_HI - ICE_SPELL.LIFT_LO)));
            m.f = Math.min(want, m.f + ICE_SPELL.RISE * dt);
        } else {
            const rec = m.rec, ax = rec.ax, az = rec.az, bx = rec.bx - ax, bz = rec.bz - az, L2 = bx * bx + bz * bz || 1;
            const p = this.testAim ? this.testAim : this._handGround();
            if (p) want = Math.max(want, Math.max(0, Math.min(1, ((p.x - ax) * bx + (p.z - az) * bz) / L2)));
            m.f = Math.min(want, m.f + (ICE_SPELL.BRIDGE_SPEED / Math.sqrt(L2)) * dt);
        }
        if (want > m.want + 1e-4) m.idle = 0; else m.idle += dt;
        m.want = want;
        if (m.idle > ICE_SPELL.IDLE) { this.stopMine('idle'); return; }
        if (!this.auth) {
            this._sendT -= dt;
            if (this._sendT <= 0) { this._sendT = 0.15; g.sync?.net?.send({ t: 'icemagic', a: 'grow', id: m.id, f: r2(m.f) }); }
        }
    }

    /** Where the hand points now on the ground (or far along it, pointed over a ravine). */
    _handGround() {
        const g = this.game;
        const side = g.wandSide?.() || g.magicHand || 'right';
        const hand = g.character.getHandWorldPosition?.(side, _v2);
        const dir = g.character.getHandDirection?.(side, new THREE.Vector3());
        if (!hand || !dir) return null;
        let p = null;
        for (let k = 1; k < ICE_SPELL.AIM + 6; k += 1) {
            p = _v.copy(hand).addScaledVector(dir, k);
            if (p.y <= g.collision.groundY(p.x, p.z) + 0.2) break;
        }
        return p;
    }

    /** My ice stops («стоп», a stun, death, idle): what has grown stays. */
    stopMine(why = 'stop') {
        const g = this.game;
        if (this.pending) { this.pending = null; return true; }
        const m = this.magic;
        if (!m || m.by !== g.localId) return false;
        if (why === 'idle') g.hud?.setVoice?.('❄️ Магия льда кончилась — то, что выросло, осталось', true);
        if (this.auth) this._end(m, false);
        else { g.sync?.net?.send({ t: 'icemagic', a: 'stop', id: m.id, f: r2(m.f) }); this._ended(m.id, m.f, false); }
        return true;
    }

    // ================================================================= building
    /** (host) The blocks: the floor spreading from the foot, then the castle up to f (or the bridge along to f). */
    _build(m) {
        const g = this.game, data = this.data;
        if (m.by !== g.localId && m.t - m.beat > 6) { this._end(m, false); return; } // (the caster's computer stopped answering)
        const t0 = performance.now();
        const edits = [];
        const out = () => edits.length >= ICE_SPELL.MAX_EDITS || performance.now() - t0 > ICE_SPELL.BUDGET_MS;
        if (m.k === 'castle') {
            const plan = this._plans.get(m.id);
            if (!plan) return; // (made over a few frames)
            if (!m.cols) m.cols = this._floorColumns(plan, m.rec);
            const r = (Math.min(1, m.t / ICE_SPELL.FLOOR_T)) * (ICE_MAGIC.FLOOR_R + 1);
            for (; m.fi < m.cols.length && m.cols[m.fi].d <= r && !out(); m.fi++) this._floorColumn(m.cols[m.fi], m.rec.G, edits);
            if (m.fi >= m.cols.length && !m.cleared) { m.cleared = true; for (const c of plan.clear) if (data.get(c[0], c[1], c[2]) !== AIR) { data.set(c[0], c[1], c[2], AIR); edits.push([c[0], c[1], c[2], AIR]); } }
            if (m.cleared) this._grow(m, plan, edits, out);
        } else {
            this._grow(m, this.plan(m.rec), edits, out);
        }
        if (edits.length) g.builder?._sendEdits(edits);
        // (the others see how far it is: the sparkles and the tune)
        this._sendT -= 1 / 60;
        if (m.f !== m.sentF && this._sendT <= 0) { this._sendT = 0.2; m.sentF = m.f; g.sync?.net?.send({ t: 'icemagic', a: 'f', id: m.id, f: r2(m.f) }); }
    }

    _grow(m, plan, edits, out) {
        const data = this.data;
        const bodies = m.ci < plan.cells.length ? this.game.houseMagic?._bodies?.() || [] : null;
        for (; m.ci < plan.cells.length && plan.cells[m.ci][4] <= m.f + 1e-6 && !out(); m.ci++) {
            const c = plan.cells[m.ci];
            const cur = data.get(c[0], c[1], c[2]);
            if (cur === c[3]) continue;
            if (m.k === 'bridge' && cur !== AIR && cur !== BLOCK.WATER && !isLeaves(cur) && cur !== BLOCK.SNOW) continue; // (the arch meets a hill: the hill stays)
            if (this._occupied(c[0], c[1], c[2], bodies)) { this._waiting.push(c); continue; }
            data.set(c[0], c[1], c[2], c[3]); edits.push([c[0], c[1], c[2], c[3]]);
        }
        if (m.ci >= plan.cells.length && m.f >= 1) this._end(m, true);
    }

    _occupied(x, L, z, bodies) {
        const y = L - 1;
        for (const b of bodies || []) if (Math.abs(b.x - x) < 1.1 && Math.abs(b.z - z) < 1.1 && y > b.y0 && y < b.y1) return true;
        return false;
    }

    /** The floor's columns, nearest the foot first: {x, z, t, d}. */
    _floorColumns(plan, rec) {
        return plan.floor.map((c) => ({ x: c[0], z: c[2], t: c[3], d: Math.hypot(c[0] - rec.x, c[2] - rec.z) })).sort((a, b) => a.d - b.d);
    }

    /** (host) One column of the floor: ice in the ground's place, cleared over it, ice under it down to the ground. */
    _floorColumn(c, F, edits) {
        const data = this.data;
        const set = (L, t) => { const cur = data.get(c.x, L, c.z); if (cur === t || cur === BLOCK.BEDROCK) return; data.set(c.x, L, c.z, t); edits.push([c.x, L, c.z, t]); };
        set(F, c.t);
        for (let L = F + 1; L <= F + 20; L++) {
            const t = data.get(c.x, L, c.z);
            if (t !== AIR && !isPalaceIce(t)) set(L, AIR);
        }
        for (let L = F - 1, k = 0; k < 10; L--, k++) {
            const t = data.get(c.x, L, c.z);
            if (isSolid(t) && t !== BLOCK.WATER && !isLeaves(t) && !TREE_WOOD.has(t)) break;
            set(L, BLOCK.ICE_DARK);
        }
        // (the instanced trees standing where the floor goes: gone)
        const g = this.game;
        for (const t of g.world?.trees || []) if (t.alive && Math.abs(t.x - c.x) < 0.6 && Math.abs(t.z - c.z) < 0.6) { g.world.removeTree?.(t); g.sync?.treeGone?.(t.index); }
    }

    /** (host) Blocks that waited for a body to go. */
    _placeWaiting(dt) {
        this._waitT = (this._waitT || 0) - dt;
        if (this._waitT > 0) return;
        this._waitT = 1;
        const data = this.data, edits = [];
        const bodies = this.game.houseMagic?._bodies?.() || [];
        this._waiting = this._waiting.filter((c) => {
            if (data.get(c[0], c[1], c[2]) === c[3]) return false;
            if (this._occupied(c[0], c[1], c[2], bodies)) return true;
            data.set(c[0], c[1], c[2], c[3]); edits.push([c[0], c[1], c[2], c[3]]);
            return false;
        });
        if (edits.length) this.game.builder?._sendEdits(edits);
    }

    /** (host) It is over: done (grown to the end) or stopped (what grew stays). */
    _end(m, done) {
        if (this.magic !== m) return;
        const f = done ? 1 : m.f;
        this.game.sync?.net?.send({ t: 'icemagic', a: 'end', id: m.id, f: r2(f), done });
        this._ended(m.id, f, done);
    }

    /** (every computer) The ice is finished: its record, the gates, the chandelier, the bed; the last chord. */
    _ended(id, f, done) {
        const g = this.game;
        const m = this.magic;
        if (!m || m.id !== id) return;
        this.magic = null;
        const rec = this.list.get(id) || m.rec;
        rec.f = done ? 1 : Math.max(0, Math.min(1, f));
        rec.t = Date.now();
        this.list.set(id, rec);
        const c = this._centre(rec, _v);
        if (done) {
            if (rec.k === 'castle') this._furnish(rec, this.auth);
            g.sound?.playIce?.('iceDone', c.setY(c.y + 8), 1.4);
            g.fx?.lightFlash?.(c, 0xdff6ff, 6, 0.9, 90);
            for (let i = 0; i < 70; i++) {
                const a = Math.random() * Math.PI * 2, r = Math.random() * (rec.k === 'castle' ? 14 : 4);
                g.fx?.spark?.(_v2.set(c.x + Math.cos(a) * r, c.y - 6 + Math.random() * 16, c.z + Math.sin(a) * r), i % 2 ? 0xffffff : 0x9ee4ff, 0.14, _v.set(0, 1.2, 0), 1.4);
            }
        }
        if (m.by === g.localId) {
            const name = rec.k === 'castle' ? 'IceCastle' : 'IceBridge';
            if (done) g.mana?.success?.(name);
            const warm = rec.cold === false ? ' Здесь тепло — через пару дней лёд растает (в горах, в снегах, он не тает)' : '';
            if (done) g.hud?.setVoice?.((rec.k === 'castle' ? '🏰 Ледяной замок готов! Ворота открываются рукой; наверх — по лестнице слева; огонь растапливает лёд.' : '🌉 Ледяной мост готов — по нему можно идти. Огонь его растапливает.') + warm, true);
        }
    }

    // ================================================================== furnishing
    /** (every computer) The castle's gates (doors of ice), its chandelier and the gloss of its ice; the host: the bed. */
    _furnish(rec, host = false) {
        const g = this.game;
        if (rec.k !== 'castle') return;
        this._hookLight();
        if (rec.f < 1) return;
        const S = { x: rec.x, z: rec.z, rot: rec.rot };
        const ry = iceYaw(S), F = rec.G, HR = ICE_MAGIC.HALL_R;
        for (const s of [-1, 1]) {
            const at = iceLocal(S, s * 1.25, HR + 0.1);
            const id = rec.id + (s < 0 ? 'gL' : 'gR');
            const was = g.doors?.list?.get(id);
            g.doors?._place?.({ id, x: at.x, y: F - 0.5, z: at.z, ry, color: 0xcdeffd, a: was?.a || 0, w: 2.5, h: 6, gen: true, banded: true, ice: true, mirror: s > 0 }); // (banded: not a castle's locked gate — open to everybody)
        }
        if (!this.look.has(rec.id) && g.scene) {
            const group = new THREE.Group();
            const ch = chandelierModel();
            ch.position.set(rec.x, F + ICE_MAGIC.WALL_H + 4, rec.z);
            group.add(ch);
            // the gloss: a thin shine over the walls (the gates left open) and over the dome
            const wall = new THREE.Mesh(new THREE.CylinderGeometry(HR + 0.12, HR + 0.12, ICE_MAGIC.WALL_H + 1, 40, 1, true, 0.42, Math.PI * 2 - 0.84), glossMat());
            wall.position.set(rec.x, F - 0.5 + (ICE_MAGIC.WALL_H + 1) / 2, rec.z);
            wall.rotation.y = ry;
            const dome = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.2, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), glossMat());
            dome.position.set(rec.x, F + ICE_MAGIC.WALL_H + 0.5, rec.z);
            dome.userData.k = new THREE.Vector3(1, (ICE_MAGIC.DOME_H + 0.5) / (HR + 0.2), 1);
            wall.userData.k = new THREE.Vector3(1, 1, 1);
            dome.scale.copy(dome.userData.k);
            for (const s of [wall, dome]) { s.renderOrder = 2; group.add(s); }
            g.scene.add(group);
            this.look.set(rec.id, { group, gloss: [wall, dome], fade: 0 });
        }
        if (host && g.beds && !g.beds.list?.has(rec.id + 'b')) {
            const p = iceLocal(S, 5.2, -3.6);
            g.beds.spawnBed({ x: p.x, y: F - 0.5, z: p.z }, ry + Math.PI / 2, 'cyan', { id: rec.id + 'b' });
        }
    }

    /** (the terrain's light: the hall of an ice castle is lit — the ice lets the day through — never a cave's dark) */
    _hookLight() {
        const data = this.data;
        if (!data || data._iceLit) return;
        data._iceLit = true;
        const prev = data.litLand;
        const R = ICE_MAGIC.HALL_R;
        data.litLand = (x, z) => {
            if (prev?.(x, z)) return true;
            for (const r of this.list.values()) if (r.k === 'castle' && Math.abs(x - r.x) <= R && Math.abs(z - r.z) <= R && Math.hypot(x - r.x, z - r.z) <= R) return true;
            return false;
        };
        // (the same as shapes, for a whole piece of land at once — TerrainView._sendRebuild)
        const prevS = data._litPair === prev ? data.litShapes : null;
        data.litShapes = (x0, z0, x1, z1, out) => {
            prevS?.(x0, z0, x1, z1, out);
            for (const r of this.list.values()) if (r.k === 'castle' && r.x + R >= x0 && r.x - R <= x1 && r.z + R >= z0 && r.z - R <= z1) out.push({ cx: r.x, cz: r.z, r: R });
            return out;
        };
        data._litPair = prev && !prevS ? null : data.litLand;
    }

    _unfurnish(rec) {
        const g = this.game;
        for (const s of ['gL', 'gR']) g.doors?.remove?.(rec.id + s);
        const L = this.look.get(rec.id);
        if (L) { g.scene?.remove(L.group); L.gloss.forEach((s) => s.geometry.dispose()); this.look.delete(rec.id); }
    }

    // ================================================================= the look and the sound
    _sparkle(m, dt) {
        const g = this.game, fx = g.fx, rec = m.rec;
        if (!fx?.spark) return;
        m.soundT -= dt;
        if (rec.k === 'castle') {
            const F = rec.G;
            if (m.t < ICE_SPELL.FLOOR_T + 0.3) {
                // the frost running over the ground from the foot: a ring of sparkles, six bright arms
                const r = Math.min(1, m.t / ICE_SPELL.FLOOR_T) * ICE_MAGIC.FLOOR_R;
                for (let i = 0; i < 14; i++) {
                    const a = Math.random() * Math.PI * 2;
                    fx.spark(_v.set(rec.x + Math.cos(a) * r, F + 0.05, rec.z + Math.sin(a) * r), Math.random() < 0.5 ? 0xffffff : 0xa8e8ff, 0.12, _v2.set(Math.cos(a) * 2, 0.6, Math.sin(a) * 2), 0.7);
                }
                for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + [0, Math.PI / 2, Math.PI, -Math.PI / 2][rec.rot]; fx.spark(_v.set(rec.x + Math.sin(a) * r, F + 0.1, rec.z + Math.cos(a) * r), 0xdff8ff, 0.2, _v2.set(0, 1.5, 0), 0.6); }
                if (m.soundT <= 0) { m.soundT = 0.22; g.sound?.playIce?.('iceBell', _v.set(rec.x, F + 1, rec.z), 0.5, TUNE[(Math.random() * 6) | 0] * 2); }
                return;
            }
            // the rising: sparkles round the growing edge, snow whirling up, a note higher as it grows
            const top = F + m.f * ICE_MAGIC.TOP;
            const R = top < F + ICE_MAGIC.WALL_H ? ICE_MAGIC.HALL_R : ICE_MAGIC.HALL_R * Math.sqrt(Math.max(0, 1 - ((top - F - ICE_MAGIC.WALL_H) / ICE_MAGIC.DOME_H) ** 2));
            for (let i = 0; i < 8; i++) {
                const a = Math.random() * Math.PI * 2;
                fx.spark(_v.set(rec.x + Math.cos(a) * R, top, rec.z + Math.sin(a) * R), i % 3 ? 0xbfefff : 0xffffff, 0.15, _v2.set(-Math.sin(a) * 3, 2.2, Math.cos(a) * 3), 0.9);
            }
            const a = m.t * 2.4;
            fx.spark(_v.set(rec.x + Math.cos(a) * 5, F + 1 + ((m.t * 6) % 20), rec.z + Math.sin(a) * 5), 0xffffff, 0.12, _v2.set(-Math.sin(a) * 4, 2, Math.cos(a) * 4), 1.2);
            const step = Math.floor(m.f * 16);
            if (step > m.note) { m.note = step; g.sound?.playIce?.('iceBell', _v.set(rec.x, top, rec.z), 0.9, TUNE[Math.min(TUNE.length - 1, Math.floor(step * TUNE.length / 17))]); }
            if (m.soundT <= 0 && m.f > 0 && m.f < 1 && m.f !== m.lastF) { m.soundT = 0.35 + Math.random() * 0.4; g.sound?.playIce?.('iceCrack', _v.set(rec.x + (Math.random() - 0.5) * 20, top, rec.z + (Math.random() - 0.5) * 20), 0.5); }
            m.lastF = m.f;
        } else {
            // the bridge: sparkles at its growing end, a note every tenth of the way
            const t = m.f, x = rec.ax + (rec.bx - rec.ax) * t, z = rec.az + (rec.bz - rec.az) * t;
            const len = Math.hypot(rec.bx - rec.ax, rec.bz - rec.az), rise = Math.min(9, 1 + 0.13 * len);
            const y = rec.aL + (rec.bL - rec.aL) * t + rise * 4 * t * (1 - t);
            for (let i = 0; i < 6; i++) fx.spark(_v.set(x + (Math.random() - 0.5) * 3, y + Math.random(), z + (Math.random() - 0.5) * 3), i % 2 ? 0xffffff : 0xa8e8ff, 0.13, _v2.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2), 0.8);
            const step = Math.floor(t * 10);
            if (step > m.note) { m.note = step; g.sound?.playIce?.('iceBell', _v.set(x, y, z), 0.8, TUNE[Math.min(TUNE.length - 1, step)]); }
        }
    }

    // =================================================================== ruins (melted)
    /** (host) A castle or bridge mostly melted (or blown away): it is gone — its gates and chandelier too. */
    _ruinCheck() {
        const g = this.game, data = this.data;
        if (!data) return;
        const me = g.character?.group?.position;
        for (const rec of [...this.list.values()]) {
            if (this.magic?.id === rec.id || rec.f <= 0) continue;
            if (rec.cold === false && (rec.age || 0) > ICE_SPELL.MELT_START) continue; // (melting in the warm: _warmth takes it to the end)
            const c = this._centre(rec, _v);
            if (me && Math.hypot(me.x - c.x, me.z - c.z) > 150) continue;
            const p = this.plan(rec);
            if (!p) { if (rec.k === 'castle') this._startPlan(rec); continue; }
            let n = 0, have = 0;
            for (let i = 0; i < p.cells.length && p.cells[i][4] <= rec.f; i += 3) { n++; if (isPalaceIce(data.get(p.cells[i][0], p.cells[i][1], p.cells[i][2]))) have++; }
            if (n && have < n * ICE_SPELL.RUIN) { this._gone(rec); g.sync?.net?.send({ t: 'icemagic', a: 'gone', id: rec.id }); }
        }
    }

    /**
     * (host) The warm melts the ice made in the warm: a game day whole, then block by block from the top
     * down until, at two days, nothing is left (every computer gets the blocks; the record goes).
     */
    _warmth(dt) {
        const g = this.game, data = this.data;
        if (!data) return;
        for (const rec of [...this.list.values()]) {
            if (rec.cold !== false || this.magic?.id === rec.id || !(rec.f > 0)) continue;
            rec.age = (rec.age || 0) + dt;
            if (rec.age <= ICE_SPELL.MELT_START) continue;
            const p = this.plan(rec);
            if (!p) { this._startPlan(rec); continue; }
            // (the order it melts in: the highest blocks first, the floor last)
            const all = rec._melt || (rec._melt = [...p.cells.filter((c) => c[4] <= rec.f + 1e-6).sort((a, b) => b[1] - a[1]), ...(p.floor || [])]);
            const k = Math.min(1, (rec.age - ICE_SPELL.MELT_START) / (ICE_SPELL.MELT_END - ICE_SPELL.MELT_START));
            const want = Math.ceil(k * all.length);
            const edits = [];
            const t0 = performance.now();
            rec.melted = rec.melted || 0;
            for (; rec.melted < want && performance.now() - t0 < ICE_SPELL.BUDGET_MS; rec.melted++) {
                const c = all[rec.melted];
                if (data.get(c[0], c[1], c[2]) !== c[3]) continue;
                data.set(c[0], c[1], c[2], AIR);
                edits.push([c[0], c[1], c[2], AIR]);
                if (edits.length < 4) g.fx?.spark?.(_v.set(c[0], c[1] - 1, c[2]), 0x9fd8ff, 0.08, _v2.set(0, -3, 0), 0.6);
            }
            if (edits.length) g.builder?._sendEdits(edits);
            if (k >= 1 && rec.melted >= all.length) { this._gone(rec); g.sync?.net?.send({ t: 'icemagic', a: 'gone', id: rec.id }); }
        }
    }

    /** (every computer) Ice in the warm drips — more and more as its time comes. */
    _drips(dt) {
        const g = this.game, fx = g.fx, me = g.character?.group?.position;
        if (!fx?.spark || !me) return;
        this._dripT = (this._dripT || 0) - dt;
        if (this._dripT > 0) return;
        this._dripT = 0.1;
        for (const rec of this.list.values()) {
            if (rec.cold !== false || !(rec.f > 0)) continue;
            const c = this._centre(rec, _v);
            if (Math.hypot(me.x - c.x, me.z - c.z) > 70) continue;
            const k = Math.min(1, (rec.age || 0) / ICE_SPELL.MELT_START);
            const n = Math.random() < 0.3 + 2.5 * k ? 1 + Math.floor(k * 2) : 0;
            const R = rec.k === 'castle' ? ICE_MAGIC.HALL_R : 2;
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const y = rec.k === 'castle' ? rec.G + 2 + Math.random() * ICE_MAGIC.WALL_H : c.y + 0.5;
                const x = rec.k === 'castle' ? c.x + Math.cos(a) * (R + 0.3) : rec.ax + (rec.bx - rec.ax) * Math.random();
                const z = rec.k === 'castle' ? c.z + Math.sin(a) * (R + 0.3) : rec.az + (rec.bz - rec.az) * Math.random();
                fx.spark(_v2.set(x, y, z), 0x9fd8ff, 0.07, _v.set(0, -4, 0), 0.5);
            }
        }
    }

    _gone(rec) {
        this._unfurnish(rec);
        this.list.delete(rec.id);
        this._plans.delete(rec.id);
    }

    // ================================================================ net / save
    /** The ice's blocks that are not there now (melted, blown away): kept with the record. */
    _missing(rec) {
        const data = this.data;
        if (!data || this.magic?.id === rec.id) return rec.miss || [];
        const p = this.planNow(rec), out = [];
        for (const c of [...(p.floor || []), ...p.cells]) {
            if (c[4] > rec.f + 1e-6) break;
            if (data.get(c[0], c[1], c[2]) !== c[3]) { out.push(c[0] + ',' + c[1] + ',' + c[2]); if (out.length >= 6000) break; }
        }
        return out;
    }

    /** After a load (or a guest's welcome): the ice stands block for block as it was saved (a piece a frame). */
    _repairStep() {
        const rec = this._repairQ[0];
        if (!this.list.has(rec.id)) { this._repairQ.shift(); return; }
        const p = this.plan(rec);
        if (!p) { this._startPlan(rec); return; }
        this._repairQ.shift();
        const data = this.data;
        if (!data) return;
        const miss = new Set(rec.miss || []);
        const edits = [];
        for (const c of [...(p.floor || []), ...p.cells]) {
            if (c[4] > rec.f + 1e-6) break;
            if (miss.has(c[0] + ',' + c[1] + ',' + c[2]) || data.get(c[0], c[1], c[2]) === c[3]) continue;
            data.set(c[0], c[1], c[2], c[3]);
            edits.push([c[0], c[1], c[2], c[3]]);
        }
        if (edits.length) { if (this.auth) this.game.builder?._sendEdits(edits); else this.game.blockEdits?.push?.(...edits); }
        this._furnish(rec, this.auth);
    }

    _accept(r) {
        if (!r?.id || !(r.k === 'castle' || r.k === 'bridge')) return;
        const was = this.list.get(r.id);
        const rec = { ...r, miss: Array.isArray(r.miss) ? r.miss.slice(0, 6000) : was?.miss || [] };
        this.list.set(rec.id, rec);
        this._repairQ.push(rec);
    }

    netList() { return [...this.list.values()].filter((r) => this.magic?.id !== r.id).map(({ _melt, ...r }) => ({ ...r, miss: this._missing(r) })); } // eslint-disable-line no-unused-vars
    applyNet(list) { for (const r of list || []) this._accept(r); }

    snapshot() { return { list: [...this.list.values()].filter((r) => r.f > 0 || this.magic?.id === r.id).map(({ _melt, ...r }) => ({ ...r, f: this.magic?.id === r.id ? this.magic.f : r.f, miss: this._missing(r) })) }; } // eslint-disable-line no-unused-vars
    restore(s) { for (const r of s?.list || []) this._accept(r); }

    /** Messages ('icemagic'). */
    onNet(m, isHost) {
        const g = this.game;
        switch (m.a) {
            case 'ask': {
                if (!isHost) break;
                const res = this._hostStart({ k: m.k === 'bridge' ? 'bridge' : 'castle', c: m.c, rot: m.rot, p0: m.p0, p1: m.p1 }, m.from);
                if (res !== true) g.sync?.net?.send({ t: 'icemagic', a: 'no', to: m.from, msg: String(res).slice(0, 200) });
                break;
            }
            case 'no': if (m.to === g.localId) { g.hud?.setVoice?.(m.msg, true); } break;
            case 'go': if (!isHost && m.rec) this._go(m.rec, m.by); break;
            case 'grow': if (isHost && this.magic?.id === m.id && this.magic.by === m.from) { this.magic.f = Math.max(this.magic.f, Math.min(1, +m.f || 0)); this.magic.beat = this.magic.t; } break;
            case 'f': if (!isHost && this.magic?.id === m.id && this.magic.by !== g.localId) this.magic.f = +m.f || 0; break;
            case 'stop': if (isHost && this.magic?.id === m.id && this.magic.by === m.from) { this.magic.f = Math.max(this.magic.f, +m.f || 0); this._end(this.magic, false); } break;
            case 'end': if (!isHost) this._ended(m.id, +m.f || 0, !!m.done); break;
            case 'gone': if (!isHost) { const r = this.list.get(m.id); if (r) this._gone(r); } break;
        }
    }

    /** (Game.prewarm) The gloss's material on a sample. */
    sampleModels() { return [new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glossMat())]; }
}
