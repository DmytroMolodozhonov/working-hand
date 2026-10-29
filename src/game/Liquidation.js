/**
 * Liquidation.js — «Liquidation» (10 mana) and «Liquidation Maxima» (25). Not a duel spell.
 *
 * The raised hand (the wand) points at a thing and the word is said: a splash — not a ray, a
 * small trembling lump of grey-violet magic — flies where the hand points and strikes the first
 * thing in its way:
 *   - a thing that is not alive (cheese, an apple, a sword, a shield lying about, a block of a
 *     wall, a plank…) crumbles into dust and is gone;
 *   - a MAGIC thing (a wand, a scroll, a spell book, a magic sword / bow / shield, a potion, a mana
 *     crystal, a dragon's egg, a phoenix's feather, the wizards' arcane stone…) only by «Максима»;
 *     the plain splash breaks on it and the caster is told;
 *   - a big thing of a house or a cave (a cauldron, a chest, a bed, a door) only by «Максима» (the
 *     plain splash is too small for it); a campfire, a surfboard — by either; a chest's things fall out;
 *   - anything alive (a player, a zombie, a villager, an animal, a tree…) loses 3 HP — and that is
 *     all; «Protection» (a shield turned to it, the dome) stops it.
 *
 * Aim: as the duel charges (Duel.AIM) — it flies where the hand points, with a light correction: the
 * nearest fitting thing (or body) in a narrow cone round the hand's line is its target, and it turns
 * towards it a little (at most AIM.BEND off the line), never round after it.
 *
 * Who decides: the spell goes to everybody ('spell'); every computer flies the same splash. The host
 * takes away the thing it struck (and tells the others: 'igone' / 'wgone') and hurts the creatures;
 * every computer hurts only its own player; a block of the world is taken by the caster's computer
 * (Builder._sendEdits, like every block a player takes). A cauldron, a chest, a bed, a door, a board:
 * the host takes it away and tells the others ('liq'); it is remembered (`gone`, saved with the world)
 * so a house, a cave, a beach coming near again never makes it anew.
 */

import { isEnchanted } from '../world/EnchantedStone.js';
import * as THREE from 'three';
import { BLOCK, TREE_KINDS } from '../world/Terrain.js';
import { isGodGift, ITEM_SCALE } from './ItemTypes.js';
import { liquidationNeedsMaxima, breakMyHeld, breakCreatureHeld } from './HeldBreak.js';
import { pickBody, bendToward, AIM } from './Duel.js';

export const LIQ = {
    SPEED: 26, // m/s
    RANGE: 28, // m
    DMG: 3, // HP to anything alive
    THING_R: 0.45, // a thing this near the splash's path is struck
    WEAPON_R: 0.6,
    NEAR_HIT: 0.9, // m: a thing lying this near where the splash hits the ground / a wall is what was aimed at
    GONE_MAX: 4000,
};
const THING_DUST = { cauldron: 0x5a5856, chest: 0x8a6a3a, bed: 0xc8b8a0, door: 0x7a4f2a, board: 0xb08a5a, campfire: 0x4a3a2a, crystal: 0x5cb8ff };

export const isLiquidation = (name) => name === 'Liquidation' || name === 'LiquidationMaxima';

export { liquidationNeedsMaxima };
/** The wizards' arcane stone, lamps, runes, potion shelves: magic blocks. */
export const isMagicBlock = (t) => t >= BLOCK.ARCANE && t <= BLOCK.RUNE;
const LIVING_BLOCKS = new Set(TREE_KINDS.flatMap((k) => [k.wood, k.leaves]).concat([BLOCK.WHEAT, BLOCK.VEG, BLOCK.FLOWERS]));
/**
 * What the splash does to a block of the world: 'dust' | 'maxima' (only «Максима») | 'alive'
 * (a tree's trunk and crown, wheat, flowers: living — nothing) | 'none' (bedrock, water, grass).
 */
export function blockVerdict(t, max) {
    // (grass: the living turf on the ground — the splash breaks on it, as on the ground)
    if (t === BLOCK.AIR || t === BLOCK.WATER || t === BLOCK.BEDROCK || t === BLOCK.ICE_SHAPE || t === BLOCK.GRASS) return 'none';
    if (LIVING_BLOCKS.has(t)) return 'alive';
    if (isMagicBlock(t)) return max ? 'dust' : 'maxima';
    return 'dust';
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). `does`: dust | hurt | none.
 */
export const LIQUIDATION_TARGETS = {
    me: { does: 'none', why: 'летит от колдующего — в себя не попасть' },
    players: { does: 'hurt', why: '−3 HP (каждый компьютер решает о своём игроке); щит «Protection», повёрнутый к всплеску, купол и щит в руке — держат' },
    zombies: { does: 'hurt', why: '−3 HP (решает хост)' },
    castlePeople: { does: 'hurt', why: 'жители, рыцари, король, волшебники: −3 HP; поднятый щит / купол Мастера держит (CastleLife.wardOff); это нападение — стража заметит' },
    animals: { does: 'hurt', why: '−3 HP' },
    sailors: { does: 'hurt', why: '−3 HP, в координатах корабля (всплеск бьёт по телу где оно есть)' },
    spider: { does: 'hurt', why: '−3 HP — для паучихи почти ничего' },
    livingTrees: { does: 'hurt', why: 'живое: −3 HP, не рассыпается' },
    bookBirds: { does: 'hurt', why: 'книга-птица — живая книга: −3, лёгкую сбивает на землю (книгу защиты — нет)' },
    dragon: { does: 'hurt', why: '−3 (DragonKinds.ON_DRAGON) — дракон только разозлится' },
    iceCastle: { does: 'hurt', why: 'снеговику −урон; королеву и ледяных монстров не берёт (заклинание без свитка — IceQueen.iceDamage)' },
    blackship: { does: 'hurt', why: 'капитану −урон, как человеку; скелетов не берёт (их разрушает только то, что живое дерево, и то, что ломает кости)' },
    phoenix: { does: 'hurt', why: '−3, это нападение' },
    owl: { does: 'none', why: 'не со свитка: сова увёртывается и улетает (Owls.TARGETS)' },
    canary: { does: 'hurt', why: 'обычный урон; лагерь сердится на колдующего (Canaries.hit)' },
    gargoyle: { does: 'hit', why: 'обычный урон: камень берёт, горгулья летит дальше (Gargoyles.hit)' },
    servants: { does: 'hurt', why: 'свои слуги тоже живые: −3, если попасть' },
    looseThings: { does: 'dust', why: 'любая неживая вещь на земле (еда, оружие, щит, лук, мешочек…) рассыпается в прах; волшебная — только «Максимой»' },
    godGifts: { does: 'none', why: 'дары богов (Ледяной Жезл, пьедесталы Творческого) — не действует даже «Максима»: их защита слишком сильна' },
    heldThings: { does: 'dust', why: 'вещь В РУКЕ человекоподобного (игрок, житель, рыцарь, король, волшебник, моряк, скелет, Чёрные Усы): основная рука, иначе другая; немагическое — рассыпается, волшебное — только «Максимой»; дар богов и палочка арены — нет (HeldBreak.js)' },
    blocks: { does: 'dust', why: 'блок стены, доска, камень, кирпич рассыпается (один блок); волшебный камень башен — только «Максимой»; у замка — это порча: стража заметит' },
    trees: { does: 'none', why: 'дерево живое: всплеск разбивается о ствол, ничего не рассыпается' },
    furniture: { does: 'dust', why: 'котёл, сундук, кровать, дверь — только «Максимой» (обычный всплеск для них мал); костёр, доска для волн — любым; из сундука его вещи выпадают; уничтоженное не появляется снова (запомнено, сохраняется); сундук корабля и повозки, ворота тронного зала и Ледяного замка, вещь в руках — нет (см. THINGS)' },
    ships: { does: 'none', why: 'корпус и паруса корабля — большие постройки: всплеск разбивается' },
    water: { does: 'none', why: 'вода не рассыпается: всплеск уходит в неё' },
    ground: { does: 'dust', why: 'трава (живой дёрн) и коренная порода — всплеск разбивается; голая земля, песок, камень — неживой блок, рассыпается, как любой блок' },
};

/**
 * Things that are not items, reached by their solid box (or their place): `need` 'dust' (either
 * splash) | 'maxima' (only «Максима»), and what does not crumble at all — with why.
 */
export const THINGS = {
    cauldron: { need: 'maxima', why: 'большой чугунный котёл: рассыпает только «Максима»' },
    chest: { need: 'maxima', why: 'сундук: только «Максима»; его вещи выпадают на землю (у боссов награда так не пропадает)' },
    bed: { need: 'maxima', why: 'кровать: только «Максима»' },
    door: { need: 'maxima', why: 'дверь: только «Максима»' },
    board: { need: 'dust', why: 'доска для волн — просто доска' },
    campfire: { need: 'dust', why: 'костёр: дрова рассыпаются, огонь гаснет' },
    crystal: { need: 'dust', why: 'кристалл маны раскалывается — его сила летит к тому, кто его разрушил (ManaCrystals.burst)' },
};
/** What the splash does to such a thing: 'dust' | 'maxima' | {none: why}. `o`: the thing itself (its own exceptions). */
export function thingVerdict(k, max, o = null) {
    const r = THINGS[k];
    if (!r) return { none: '' };
    if (o?.godGift) return { none: '✨ Это дар богов — никакое заклинание его не уничтожит' };
    if (k === 'chest' && (o?.ship || String(o?.id).startsWith('cart:'))) return { none: o?.ship ? '⛵ Сундук корабля — часть его палубы' : '🛞 Сундук — часть повозки' };
    if (k === 'chest' && o?.room === 'iceQueen' && o?.locked) return { none: '❄️ Сундуки Королевы скованы её чарами, пока она жива' };
    if (k === 'door' && (o?.gate || o?.ship || o?.ice)) return { none: o?.gate ? '🚪 Ворота тронного зала держат и взрывы — всплеску их не взять' : o?.ice ? '❄️ Ворота Ледяного замка — всплеску их не взять' : '⛵ Дверь корабля — часть его корпуса' };
    if (o?.inHand) return { none: '' };
    if (r.need === 'maxima' && !max) return 'maxima';
    return 'dust';
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

/** The nearest point of segment ab to point p: its t in 0…1. */
function segT(a, b, p) {
    _d.subVectors(b, a);
    const L2 = _d.lengthSq();
    if (L2 < 1e-9) return 0;
    return Math.max(0, Math.min(1, _c.subVectors(p, a).dot(_d) / L2));
}

/** The two segments' nearest distance (path p0→p1 and a body's a→b), sampled: good enough for a small lump. */
function segSegDist(p0, p1, a, b) {
    let best = Infinity;
    for (let k = 0; k <= 6; k++) {
        _a.lerpVectors(a, b, k / 6);
        const t = segT(p0, p1, _a);
        _b.lerpVectors(p0, p1, t);
        best = Math.min(best, _a.distanceTo(_b));
    }
    return best;
}

export class Liquidation {
    constructor(game) {
        this.game = game;
        this._geo = null;
        this.gone = new Set(); // 'cauldron:id' | 'chest:id' | 'bed:id' | 'door:id' | 'board:id' — crumbled, never made again
        this._sweepT = 0;
    }

    isGone(k, id) { return this.gone.has(k + ':' + id); }

    _gone(k, id) {
        this.gone.add(k + ':' + id);
        if (this.gone.size > LIQ.GONE_MAX) this.gone.delete(this.gone.values().next().value); // (a list with its limit)
    }

    snapshot() { return [...this.gone]; }

    restore(list) { for (const k of list || []) if (typeof k === 'string' && k.length < 200) this.gone.add(k); }

    /** (guests) The host saw it crumble. */
    onNet(m) {
        if (typeof m.k !== 'string' || !THINGS[m.k] || (typeof m.id !== 'string' && typeof m.id !== 'number')) return;
        const p = this._destroy(m.k, m.id);
        if (p) this._dust(p, THING_DUST[m.k] || 0x9c8f80);
        this._gone(m.k, m.id);
    }

    /**
     * Now and then: a house that came near again, a cave looked into anew, makes its door / beds /
     * chests / cauldron from the world's plan — what crumbled is taken away again at once (quietly).
     */
    update(dt) {
        if (!this.gone.size || (this._sweepT -= dt) > 0) return;
        this._sweepT = 1;
        const g = this.game;
        for (const c of [...(g.chests || [])]) if (this.gone.has('chest:' + c.id)) this._chestGone(c, false);
        for (const id of [...(g.beds?.list.keys() || [])]) if (this.gone.has('bed:' + id) && g.beds.lying !== id) g.beds.removeBed(id);
        for (const id of [...(g.doors?.list.keys() || [])]) if (this.gone.has('door:' + id)) g.doors.remove(id);
        for (const id of [...(g.cauldrons?.list.keys() || [])]) if (this.gone.has('cauldron:' + id)) g.cauldrons.destroy(id);
    }

    /** Voice on my computer: the raised hand (the wand) points where the splash goes. */
    cast(name, isFinal) {
        const g = this.game;
        if (name === 'Liquidation' && !isFinal) return null; // (wait: maybe «… Максима»)
        const now = performance.now();
        if (now - (this._lastAt || -1e9) < 900) return null;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = g.wandSide() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s)));
        if (!side || !ch.isArmRaised(side)) { if (isFinal) g.hud.setVoice('🫧 Поднимите руку (палочку) и направьте её на вещь, которую надо уничтожить, — и скажите «Liquidation»', true); return null; }
        const tired = g.combat.check(name);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay(name);
        this._lastAt = now;
        const origin = g.castOrigin(side);
        const dir = ch.getHandDirection(side);
        g.spells.cast(name, origin, dir, side, g.localId);
        g.sync?.spell(name, origin, dir, side);
        return name;
    }

    /** The splash flies (every computer: SpellManager.cast → here). */
    fly(name, origin, dir, casterId) {
        const g = this.game;
        const max = name === 'LiquidationMaxima';
        const d = dir.clone().normalize();
        const pos = origin.clone().addScaledVector(d, 0.3);
        const look = this._look(max);
        look.position.copy(pos);
        g.scene.add(look);
        g.sound?.playWhoosh?.();
        const prev = new THREE.Vector3();
        let went = 0, t = 0;
        // (the light correction: the thing the hand points at, as the duel charges find theirs)
        const d0 = d.clone(), want = new THREE.Vector3();
        const aim = this._aimAt(origin, d, casterId, max);
        g.spells.spells.push({
            life: LIQ.RANGE / LIQ.SPEED + 0.2,
            onUpdate: (spell, dt) => {
                t += dt;
                prev.copy(pos);
                if (aim) { const q = aim.at(); if (q && want.subVectors(q, pos).dot(d) > 0.2) bendToward(d, d0, want.normalize(), AIM.TURN * dt); }
                const step = Math.min(LIQ.SPEED * dt, LIQ.RANGE - went);
                pos.addScaledVector(d, step);
                went += step;
                // (the lump trembles as it flies: its look, not its path)
                look.position.copy(pos);
                look.scale.set(1 + Math.sin(t * 40) * 0.15, 1 + Math.cos(t * 33) * 0.15, 1 + Math.sin(t * 27) * 0.15);
                look.rotation.x += dt * 9; look.rotation.y += dt * 7;
                if (Math.random() < 0.7) g.fx.spark(pos, max ? 0xc9a8ff : 0xb8b0c8, 0.09, _a.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)), 0.35);
                const hit = this._first(prev, pos, d, casterId, max);
                if (hit) { this._strike(hit, name, origin, d, casterId, max); spell.life = 0; return; }
                if (went >= LIQ.RANGE) { this._burst(pos, max, 10); spell.life = 0; }
            },
            onEnd: () => { g.scene.remove(look); look.material.dispose(); },
        });
    }

    /**
     * What the hand points at: the nearest (along the line) fitting thing or body within AIM.CONE
     * (plus its own size) of the hand's line — {at(): its middle now} | null. What the splash could
     * never take (a ship's chest, the throne room's gates…) does not draw it.
     */
    _aimAt(o, d, casterId, max) {
        const g = this.game, list = [];
        const add = (p, r, at) => list.push({ a: p, b: p, r, at });
        for (const e of g.duel?._bodies(casterId) || []) {
            if (e.kind === 'p' && e.id === casterId) continue;
            const bk = e.kind, id = e.id;
            list.push({ a: e.a.clone(), b: e.b.clone(), r: e.r, at: () => { for (const f of g.duel._bodies(casterId)) if (f.kind === bk && f.id === id) return _c.lerpVectors(f.a, f.b, 0.5); return null; } });
        }
        const far = (p) => Math.abs(p.x - o.x) > LIQ.RANGE + 2 || Math.abs(p.z - o.z) > LIQ.RANGE + 2;
        for (const [uid, L] of g.items?.loose || []) {
            const p = L.model.position;
            if (!far(p)) add(p.clone(), Math.max(LIQ.THING_R, 0.3 * (ITEM_SCALE[L.item?.kind] || 1)), () => g.items.loose.get(uid)?.model.position || null);
        }
        for (const w of g.weapons?.weapons || []) if (!w.holder && !w.remoteTarget && !far(w.position)) add(w.position.clone(), LIQ.WEAPON_R, () => (w.holder ? null : w.position));
        const thing = (k, id, o2, p, r) => { if (!far(p) && !thingVerdict(k, true, o2).none) add(p, r, () => p); };
        for (const c of g.cauldrons?.list.values() || []) if (c.boxId != null) thing('cauldron', c.id, c, c.pos.clone(), 0.7);
        for (const c of g.chests || []) thing('chest', c.id, c, c.getPosition().clone().setY(c.getPosition().y + 0.4), 0.7);
        for (const b of g.beds?.list.values() || []) thing('bed', b.id, b, new THREE.Vector3(b.x, b.y + 0.4, b.z), 0.8);
        for (const dr of g.doors?.list.values() || []) thing('door', dr.id, dr, new THREE.Vector3(dr.x, dr.y + 1.8, dr.z), 0.8);
        for (const f of g.campfires?.list.values() || []) thing('campfire', f.id, f, new THREE.Vector3(f.x, f.y + 0.35, f.z), 0.6);
        for (const [id, m] of g.boards?.models || []) { const st = g.boards.reg?.map.get(id)?.st; if (st !== 'held' && st !== 'ridden') thing('board', id, null, m.model.position.clone(), 0.6); }
        for (const c of g.crystals?.growing?.() || []) if (c.center) thing('crystal', c.id, c, c.center.clone(), 0.3);
        return pickBody(o, d, list, LIQ.RANGE)?.body || null;
    }

    _look(max) {
        if (!this._geo) this._geo = new THREE.IcosahedronGeometry(0.22, 1);
        return new THREE.Mesh(this._geo, new THREE.MeshBasicMaterial({ color: max ? 0xb68cff : 0x9a90b0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    }

    /** The first thing on the path a→b: {t, kind, …} | null. */
    _first(a, b, d, casterId, max) {
        const g = this.game;
        const len = a.distanceTo(b);
        if (len < 1e-6) return null;
        let best = null;
        const take = (t, h) => { if (t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, ...h }; };
        // a house's sphere of protection stops it from outside
        const w = g.wards?.segmentHit?.(a, b);
        if (w) take(a.distanceTo(w) / len, { kind: 'ward' });
        // living bodies (every kind of creature and the players — Duel._bodies), not the caster
        for (const e of g.duel?._bodies(casterId) || []) {
            if (e.kind === 'p' && e.id === casterId) continue;
            if (segSegDist(a, b, e.a, e.b) > e.r + 0.2) continue;
            take(segT(a, b, _c.lerpVectors(e.a, e.b, 0.5)), { kind: 'body', bk: e.kind, id: e.id });
        }
        // things lying about (the host owns them; everybody sees the splash stop at them)
        for (const [uid, L] of g.items?.loose || []) {
            const p = L.model.position;
            const t = segT(a, b, p);
            if (_b.lerpVectors(a, b, t).distanceTo(p) < Math.max(LIQ.THING_R, 0.3 * (ITEM_SCALE[L.item?.kind] || 1))) take(t, { kind: 'item', uid });
        }
        for (const wp of g.weapons?.weapons || []) {
            if (wp.holder || wp.remoteTarget) continue;
            const t = segT(a, b, wp.position);
            if (_b.lerpVectors(a, b, t).distanceTo(wp.position) < LIQ.WEAPON_R) take(t, { kind: 'weapon', w: wp });
        }
        // a campfire (no box: you walk round it), a mana crystal growing in a cave
        for (const f of g.campfires?.list.values() || []) {
            if (Math.abs(f.x - a.x) > 40 || Math.abs(f.z - a.z) > 40) continue;
            _a.set(f.x, f.y + 0.35, f.z);
            const t = segT(a, b, _a);
            if (_b.lerpVectors(a, b, t).distanceTo(_a) < 0.75) take(t, { kind: 'thing', th: { k: 'campfire', id: f.id, o: f, p: _a.clone() } });
        }
        for (const c of g.crystals?.growing?.() || []) {
            if (!c.base || !c.tip || c.center.distanceTo(a) > LIQ.RANGE + 2) continue;
            if (segSegDist(a, b, c.base, c.tip) > (c.r || 0.15) + 0.15) continue;
            take(segT(a, b, c.center), { kind: 'thing', th: { k: 'crystal', id: c.id, o: c, p: c.center.clone() } });
        }
        // a block of the world
        const data = g.terrain?.data;
        const rh = data?.raycast(a, d, len);
        if (rh) {
            const tb = Math.hypot(rh.x - a.x, rh.y - a.y, rh.z - a.z) / len;
            _c.set(rh.x + d.x * 0.05, rh.y + d.y * 0.05, rh.z + d.z * 0.05);
            const x = Math.round(_c.x), L = Math.floor(_c.y + 1.5), z = Math.round(_c.z);
            take(tb, { kind: 'block', x, L, z, type: data.get(x, L, z) });
        }
        // the rest that stands in the way (trees of the start, chests, doors, beds, cauldrons…): it breaks on them
        const n = Math.max(1, Math.ceil(len / 0.3));
        for (let k = 1; k <= n; k++) {
            _c.lerpVectors(a, b, k / n);
            const box = g.collision?.boxAt?.(_c.x, _c.y, _c.z);
            if (box) { take(k / n, { kind: 'box', box }); break; }
            if (g.collision?.pointBlocked?.(_c.x, _c.y, _c.z)) { take(k / n, { kind: 'solid' }); break; }
        }
        if (best) best.at = new THREE.Vector3().lerpVectors(a, b, best.t);
        // (aimed at a thing lying on the ground or by a wall: the splash hit the ground right by it — it was the thing)
        if (best && (best.kind === 'block' || best.kind === 'solid')) {
            let near = null, nd = LIQ.NEAR_HIT;
            for (const [uid, L] of g.items?.loose || []) { const q = L.model.position.distanceTo(best.at); if (q < nd) { nd = q; near = { kind: 'item', uid }; } }
            for (const wp of g.weapons?.weapons || []) { if (wp.holder || wp.remoteTarget) continue; const q = wp.position.distanceTo(best.at); if (q < nd) { nd = q; near = { kind: 'weapon', w: wp }; } }
            if (near) best = { t: best.t, at: best.at, ...near };
        }
        return best;
    }

    /** What the splash struck. */
    _strike(h, name, origin, d, casterId, max) {
        const g = this.game;
        const mine = casterId === g.localId || casterId === 'local';
        const auth = g.authority;
        const say = (t) => { if (mine) g.hud.setVoice(t, true); };
        if (h.kind === 'body') {
            this._burst(h.at, max, 18);
            const stopped = this._hurt(h.bk, h.id, h.at, origin, d, casterId, name);
            if (!stopped) this.breakHeld(h.bk, h.id, h.at, casterId, max, origin, false); // (and what he holds in his hand crumbles: HeldBreak.js; a shield / the dome that stopped the splash — nothing)
            if (mine) g.mana?.success(name);
            return;
        }
        if (h.kind === 'item') {
            const L = g.items?.loose.get(h.uid);
            if (!L) { this._burst(h.at, max, 10); return; }
            if (isGodGift(L.item)) { this._burst(h.at, max, 12); say('✨ Это дар богов — никакое заклинание его не уничтожит'); return; }
            if (L.item.kind === 'crystal') { // (a mana crystal lying about cracks to ANY splash: its power to the caster — ManaCrystals)
                if (auth) { const p = L.model.position.clone(), n = L.item.count || 1; g.items.removeLoose(h.uid); g.sync?.itemGone?.(h.uid, null, null); g.crystals?.thingBurst(p, n, casterId); }
                if (mine) g.mana?.success(name);
                return;
            }
            if (liquidationNeedsMaxima(L.item) && !max) { this._burst(h.at, max, 12); say('✨ Эта вещь волшебная — её возьмёт только «Liquidation Максима»'); return; }
            this._dust(L.model.position, 0xb9a77f);
            if (auth) { g.items.removeLoose(h.uid); g.sync?.itemGone?.(h.uid, null, null); }
            if (mine) g.mana?.success(name);
            return;
        }
        if (h.kind === 'weapon') {
            const w = h.w;
            if (w.magic && !max) { this._burst(h.at, max, 12); say('✨ Это волшебное оружие — его возьмёт только «Liquidation Максима»'); return; }
            this._dust(w.position, 0x9ca3ad);
            if (auth && g.weapons.byId?.has(w.id)) { g.weapons.remove(w); g.sync?.weaponGone?.(w); }
            if (mine) g.mana?.success(name);
            return;
        }
        if (h.kind === 'box') { const th = this._thingOf(h.box); if (th) h = { ...h, kind: 'thing', th }; else if (h.box.godGift) { this._burst(h.at, max, 12); say('✨ Это дар богов — никакое заклинание его не уничтожит'); return; } }
        if (h.kind === 'thing') {
            const th = h.th, v = thingVerdict(th.k, max, th.o);
            if (v === 'maxima') { this._burst(h.at, max, 12); say('🫧 Эта вещь слишком большая — её рассыплет только «Liquidation Максима»'); return; }
            if (v !== 'dust') { this._burst(h.at, max, 12); if (v.none) say(v.none); return; }
            if (th.k !== 'crystal') this._dust(th.p, THING_DUST[th.k] || 0x9c8f80); // (a crystal cracks: ManaCrystals shows it)
            if (auth) {
                if (th.k === 'campfire') g.campfires._out(th.o); // (put out for everybody: Campfires sends it)
                else if (th.k === 'crystal') g.crystals.burst([th.id], casterId, name); // (cracks for everybody, saved; its power to the caster: ManaCrystals)
                else if (this._destroy(th.k, th.id, true)) { this._gone(th.k, th.id); g.sync?.liquidated?.(th.k, th.id); }
            }
            // (somebody's cauldron, chest, bed, door in a castle / a village: a crime there — whoever sees it calls the guard)
            if (mine && th.k !== 'board' && th.k !== 'campfire' && th.k !== 'crystal') g.castleLife?.damaged?.({ x: th.p.x, y: th.p.y, z: th.p.z }, g.localId, 1, false);
            if (mine) g.mana?.success(name);
            return;
        }
        if (h.kind === 'block') {
            const v = blockVerdict(h.type, max);
            const at = _a.set(h.x, h.L - 1, h.z);
            if (g.terrain?.data?.godGiftAt?.(h.x, h.L, h.z)) { this._burst(h.at, max, 12); say('✨ Это дар богов — никакое заклинание его не уничтожит'); return; }
            if (isEnchanted(h.type)) { this._burst(h.at, max, 12); say('✨ Заколдованный камень — «Liquidation» его не берёт'); return; } // (EnchantedStone.js)
            if (v === 'maxima') { this._burst(h.at, max, 12); say('✨ Это волшебный камень — его рассыпет только «Liquidation Максима»'); return; }
            if (v !== 'dust') { this._burst(h.at, max, 12); if (v === 'alive') say('🌳 Это живое — «Liquidation» рассыпает только неживое'); return; }
            if (mine && g.wards?.forbids?.(origin, at)) { this._burst(h.at, max, 12); say('🛡️ Этот дом под защитой'); return; }
            this._dust(at, 0x9c8f80);
            if (mine) this._takeBlock(h, origin);
            if (mine) g.mana?.success(name);
            return;
        }
        this._burst(h.at, max, 12); // (a ward, a tree, a chest, a door…: it breaks on it)
    }

    /**
     * The charge (a splash, or a duel charge — Duel.js) reached the humanoid `bk`/`id`: what is in his hand crumbles.
     * Me: on my computer (it knows my hands — a guest decides for himself); the others: the host. The caller has
     * already asked the shields (Protection, the dome, a raised shield): a charge they stopped never gets here. → the caster's word on what happened ('' if nothing to say)
     */
    breakHeld(bk, id, at, by, max, origin, wandFirst) {
        const g = this.game;
        const mine = by === g.localId || by === 'local';
        const opts = { max, wandFirst };
        let r = null;
        if (bk === 'p') {
            if (id !== g.localId) return;
            r = breakMyHeld(g, opts);
            if (r.out) { this._dust(g.combat.center(_b), 0xb9a77f); g.hud.setVoice('🫧 Вещь в вашей руке рассыпалась в прах', true); }
            else if (r.why) g.hud.setVoice(r.why, true);
            return;
        }
        if (!g.authority || (bk !== 'v' && bk !== 'c')) return;
        const c = g.duel?._creature(bk, id);
        if (!c || c.dead) return;
        r = breakCreatureHeld(g, c, opts);
        if (r.out) {
            this._dust(g.duel._creaturePoint(c, _c).setY(_c.y + 0.9), 0xb9a77f);
            if (bk === 'v') {
                if (r.out === 'wand') g.castleLife?._say?.(c, 'Моя палочка!', 3);
                g.castleLife?.startle?.(c, by, origin, { hit: true }); // (an attack: he turns on the one who did it)
            } else g.ships?.crew?.startle?.(c, by, origin, { hit: true });
        } else if (r.why && mine) g.hud.setVoice(r.why, true);
    }

    /** The thing a solid box belongs to: {k, id, o, p} | null (a pedestal, a counter, a cart… — null). */
    _thingOf(box) {
        const g = this.game, bid = box.id;
        for (const c of g.cauldrons?.list.values() || []) if (c.boxId === bid) return { k: 'cauldron', id: c.id, o: c, p: c.pos.clone() };
        for (const c of g.chests || []) if (c.boxId === bid) return { k: 'chest', id: c.id, o: c, p: c.getPosition().clone() };
        for (const b of g.beds?.list.values() || []) if (b.boxId === bid) return { k: 'bed', id: b.id, o: b, p: new THREE.Vector3(b.x, b.y + 0.4, b.z) };
        for (const d of g.doors?.list.values() || []) if (d.boxId === bid) return { k: 'door', id: d.id, o: g.doors.carried?.door === d ? { ...d, inHand: true } : d, p: new THREE.Vector3(d.x, d.y + 1.8, d.z) };
        for (const [id, m] of g.boards?.models || []) {
            if (m.boxId !== bid) continue;
            const st = g.boards.reg?.map.get(id)?.st;
            return { k: 'board', id, o: { inHand: st === 'held' || st === 'ridden' }, p: m.model.position.clone() };
        }
        return null;
    }

    /** It is gone (every computer: the host, then 'liq' to the others). Its place (for the dust), or null if it is not here. */
    _destroy(k, id, spill = false) {
        const g = this.game;
        if (k === 'cauldron') {
            const c = g.cauldrons?.list.get(id);
            if (!c) return null;
            const p = c.pos.clone();
            g.cauldrons.destroy(id);
            return p;
        }
        if (k === 'chest') {
            const c = (g.chests || []).find((x) => String(x.id) === String(id));
            if (!c) return null;
            const p = c.getPosition().clone();
            this._chestGone(c, spill);
            return p;
        }
        if (k === 'bed') {
            const b = g.beds?.list.get(id);
            if (!b) return null;
            if (g.beds.lying === id) g.beds.standUp(); // (I lay in it: on my feet)
            g.beds.removeBed(id);
            return new THREE.Vector3(b.x, b.y + 0.4, b.z);
        }
        if (k === 'door') {
            const d = g.doors?.list.get(id);
            if (!d) return null;
            if (g.wreck) g.wreck._breakDoor(d); else g.doors.remove(id);
            return new THREE.Vector3(d.x, d.y + 1.8, d.z);
        }
        if (k === 'board') {
            const m = g.boards?.models.get(id);
            const p = m ? m.model.position.clone() : null;
            if (g.boards?.reg.map.get(id)?.beach) g.boards.reg.beachTaken.add(id); // (the beach rack makes no new one)
            g.boards?.remove(id);
            return p;
        }
        return null;
    }

    /** A chest crumbles: gone; (spill, the host) what was in it falls out — nothing of a boss's reward is lost. */
    _chestGone(c, spill) {
        const g = this.game;
        c.mesh.updateMatrixWorld(true);
        const p = c.getPosition().clone();
        const rp = c.getRewardPosition(new THREE.Vector3());
        const wasOpen = c.isOpen || g._openedChests?.has(c.id);
        c.burnt = true; // (nothing else treats it as standing)
        if (c.boxId != null) { g.collision.removeBox(c.boxId); c.boxId = null; }
        c.dispose();
        const i = g.chests.indexOf(c);
        if (i >= 0) g.chests.splice(i, 1);
        (g._openedChests = g._openedChests || new Set()).add(c.id); // (nothing comes out of it any more)
        if (!spill || !g.authority) return;
        if (!wasOpen) { g.spillBurntChest?.(c, rp, false); return; }
        // opened: its things floating over it fall
        const over = (m) => Math.abs(m.x - p.x) < 2.2 && Math.abs(m.z - p.z) < 2.2 && m.y > p.y - 0.3 && m.y < p.y + 3.2;
        for (const L of g.items?.loose.values() || []) if (L.hover && over(L.model.position)) { L.hover = null; L.rise = null; L.rest = false; L.sentRest = false; }
        for (const w of g.weapons?.weapons || []) if (w.hover && !w.holder && over(w.hover.base || w.position)) { w.hover = null; w.wake?.(); }
    }

    /** (the caster's computer) the block is gone — for everybody, like a block a player takes. */
    _takeBlock(h, origin) {
        const g = this.game;
        const data = g.terrain?.data;
        if (!data || !g.builder) return;
        if (data.get(h.x, h.L, h.z) !== h.type) return;
        data.set(h.x, h.L, h.z, BLOCK.AIR);
        const edits = [[h.x, h.L, h.z, BLOCK.AIR]];
        for (const [x, L, z] of data._flood?.([{ x: h.x, y: h.L - 1, z: h.z }]) || []) edits.push([x, L, z, BLOCK.WATER]);
        g.builder._sendEdits(edits, true); // (what the crumbled block held may come down)
        // a castle / a village wall crumbled: a crime there (whoever sees it calls the guard)
        if (h.type >= BLOCK.CS_GREY && h.type <= BLOCK.RUNE) g.castleLife?.damaged?.({ x: h.x, y: h.L - 1, z: h.z }, g.localId, 1, false);
    }

    /** −3 HP to whatever living it struck (the host: creatures; each computer: its own player). */
    _hurt(bk, id, at, origin, d, by, name) {
        const g = this.game;
        if (bk === 'p') {
            if (id !== g.localId) { const r = g.remotes.get(id); if (r?.shieldBlocks?.(origin)) { r.showBlock(origin, g.fx); return true; } return false; }
            const c = g.combat;
            if (!c?.enabled || c.dead) return false;
            if (g.wards?.shields?.(origin, c.center(_b))) return true;
            if (c.shieldFactor(origin) >= 1) { c._blocked(origin, name); return true; }
            c.damage(LIQ.DMG, by, 'Liquidation');
            return false;
        }
        if (!g.authority) return true;
        if (g.wards?.shields?.(origin, at)) return true;
        const dir = _b.copy(d).setY(0).normalize();
        if (bk === 'z') { const z = g.zombieById?.get(id); if (z && !z.isDead) { z.damageCooldown = 0; g.damageZombie(z, LIQ.DMG, false, dir.clone(), null); } return; }
        if (bk === 's') { const sp = g.spiders?.byId(id); if (sp) g.spiders.hit(sp, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'D') { const dr = g.dragons?.byId(id); if (dr) g.dragons.hit(dr, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'f') { const f = g.phoenixes?.byId(id); if (f) g.phoenixes.hit(f, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'g') { const o = g.gargoyles?.byId(id); if (o) g.gargoyles.hit(o, LIQ.DMG, 'Liquidation', by); return; } // (an infernal gargoyle: plain damage)
        if (bk === 'N') { const cn = g.canaries?.byId(id); if (cn) g.canaries.hit(cn, LIQ.DMG, 'Liquidation', by); return; } // (a swamp canary: plain damage; the camp turns on the caster)
        if (bk === 'o') { const o = g.owls?.byId(id); if (o) g.owls.hit(o, LIQ.DMG, 'Liquidation', by); return; } // (no scroll's: the owl darts away)
        if (bk === 'I') { const ic = g.iceCastle?.byId(id); if (ic) g.iceCastle.hit(ic, LIQ.DMG, ic.type === 'snowman' ? 'melee' : 'Liquidation', by); return; }
        const c = g.duel?._creature(bk, id);
        if (!c) return;
        if (bk === 'b') { g.books?.hitBird(c, LIQ.DMG, 'Liquidation'); return; }
        if (bk === 't') { g.livingTrees?.hit(c, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'a') { g.animals?.hit(c, LIQ.DMG, dir.clone(), by); return; }
        if (bk === 'c') { g.ships?.crew.hit(c, LIQ.DMG, dir.clone(), by, { spell: true, magic: true, kind: name === 'LiquidationMaxima' ? 'LiquidationMaxima' : 'Liquidation' }); return; }
        if (bk === 'v') {
            if (g.castleLife?.wardOff?.(c, origin, 'Liquidation')) return true; // (a raised shield / the Master's dome took it)
            g.castleLife?.hit(c, LIQ.DMG, dir.clone(), by, { spell: true, magic: true });
        }
    }

    /** The splash breaks: a puff of grey-violet drops. */
    _burst(p, max, n) {
        const fx = this.game.fx;
        for (let i = 0; i < n; i++) fx.spark(p, i % 3 ? (max ? 0xc9a8ff : 0xb8b0c8) : 0xffffff, 0.1 + Math.random() * 0.08, _b.set((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5), 0.45);
        fx.lightFlash?.(p, max ? 0xb68cff : 0xa8a0c0, 1.5, 0.2, 8);
    }

    /** The thing crumbles into dust: it pours down and blows away. */
    _dust(p, color) {
        const fx = this.game.fx;
        for (let i = 0; i < 40; i++) fx.spark(_a.set(p.x + (Math.random() - 0.5) * 0.5, p.y + Math.random() * 0.5, p.z + (Math.random() - 0.5) * 0.5), i % 4 ? color : 0x6e655c, 0.05 + Math.random() * 0.08, _b.set((Math.random() - 0.5) * 1.2, -0.3 - Math.random() * 1.5, (Math.random() - 0.5) * 1.2), 1.2 + Math.random() * 0.8);
        for (let i = 0; i < 6; i++) fx.glow?.spawn(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.2, p.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6, color, 0.5 + Math.random() * 0.4, 1.6, { shrink: -0.5 });
        this.game.sound?.playCrumble?.() || this.game.sound?.playSplash?.();
    }
}
