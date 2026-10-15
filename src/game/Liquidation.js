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
 *   - anything alive (a player, a zombie, a villager, an animal, a tree…) loses 3 HP — and that is
 *     all; «Protection» (a shield turned to it, the dome) stops it.
 *
 * Who decides: the spell goes to everybody ('spell'); every computer flies the same splash. The host
 * takes away the thing it struck (and tells the others: 'igone' / 'wgone') and hurts the creatures;
 * every computer hurts only its own player; a block of the world is taken by the caster's computer
 * (Builder._sendEdits, like every block a player takes).
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS } from '../world/Terrain.js';
import { isMagicItem } from './ItemTypes.js';

export const LIQ = {
    SPEED: 26, // m/s
    RANGE: 28, // m
    DMG: 3, // HP to anything alive
    THING_R: 0.45, // a thing this near the splash's path is struck
    WEAPON_R: 0.6,
};

export const isLiquidation = (name) => name === 'Liquidation' || name === 'LiquidationMaxima';

/** Magic things the plain splash cannot take (the «Максима» can). */
const MAGIC_KINDS = new Set(['wand', 'hammer', 'iceRod', 'book', 'scroll', 'potion', 'crystal', 'dragonEgg', 'phoenixFeather']);
export function liquidationNeedsMaxima(it) {
    if (!it) return false;
    return isMagicItem(it) || MAGIC_KINDS.has(it.kind);
}

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
    servants: { does: 'hurt', why: 'свои слуги тоже живые: −3, если попасть' },
    looseThings: { does: 'dust', why: 'любая неживая вещь на земле (еда, оружие, щит, лук, мешочек…) рассыпается в прах; волшебная — только «Максимой»' },
    heldThings: { does: 'none', why: 'вещь в руке не трогает — всплеск попадает в руку (живое: −3 HP тому, кто держит)' },
    blocks: { does: 'dust', why: 'блок стены, доска, камень, кирпич рассыпается (один блок); волшебный камень башен — только «Максимой»; у замка — это порча: стража заметит' },
    trees: { does: 'none', why: 'дерево живое: всплеск разбивается о ствол, ничего не рассыпается' },
    furniture: { does: 'none', why: 'сундуки, двери, кровати, котлы, костры — всплеск разбивается о них (это часть дома, ломают «Бомбардо»)' },
    ships: { does: 'none', why: 'корпус и паруса корабля — большие постройки: всплеск разбивается' },
    water: { does: 'none', why: 'вода не рассыпается: всплеск уходит в неё' },
    ground: { does: 'dust', why: 'трава (живой дёрн) и коренная порода — всплеск разбивается; голая земля, песок, камень — неживой блок, рассыпается, как любой блок' },
};

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
        g.spells.spells.push({
            life: LIQ.RANGE / LIQ.SPEED + 0.2,
            onUpdate: (spell, dt) => {
                t += dt;
                prev.copy(pos);
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
            if (_b.lerpVectors(a, b, t).distanceTo(p) < LIQ.THING_R) take(t, { kind: 'item', uid });
        }
        for (const wp of g.weapons?.weapons || []) {
            if (wp.holder || wp.remoteTarget) continue;
            const t = segT(a, b, wp.position);
            if (_b.lerpVectors(a, b, t).distanceTo(wp.position) < LIQ.WEAPON_R) take(t, { kind: 'weapon', w: wp });
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
            if (g.collision?.pointBlocked?.(_c.x, _c.y, _c.z)) { take(k / n, { kind: 'solid' }); break; }
        }
        if (best) best.at = new THREE.Vector3().lerpVectors(a, b, best.t);
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
            this._hurt(h.bk, h.id, h.at, origin, d, casterId, name);
            if (mine) g.mana?.success(name);
            return;
        }
        if (h.kind === 'item') {
            const L = g.items?.loose.get(h.uid);
            if (!L) { this._burst(h.at, max, 10); return; }
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
        if (h.kind === 'block') {
            const v = blockVerdict(h.type, max);
            const at = _a.set(h.x, h.L - 1, h.z);
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

    /** (the caster's computer) the block is gone — for everybody, like a block a player takes. */
    _takeBlock(h, origin) {
        const g = this.game;
        const data = g.terrain?.data;
        if (!data || !g.builder) return;
        if (data.get(h.x, h.L, h.z) !== h.type) return;
        data.set(h.x, h.L, h.z, BLOCK.AIR);
        const edits = [[h.x, h.L, h.z, BLOCK.AIR]];
        for (const [x, L, z] of data._flood?.([{ x: h.x, y: h.L - 1, z: h.z }]) || []) edits.push([x, L, z, BLOCK.WATER]);
        g.builder._sendEdits(edits);
        // a castle / a village wall crumbled: a crime there (whoever sees it calls the guard)
        if (h.type >= BLOCK.CS_GREY && h.type <= BLOCK.RUNE) g.castleLife?.damaged?.({ x: h.x, y: h.L - 1, z: h.z }, g.localId, 1, false);
    }

    /** −3 HP to whatever living it struck (the host: creatures; each computer: its own player). */
    _hurt(bk, id, at, origin, d, by, name) {
        const g = this.game;
        if (bk === 'p') {
            if (id !== g.localId) { const r = g.remotes.get(id); if (r?.shieldBlocks?.(origin)) r.showBlock(origin, g.fx); return; }
            const c = g.combat;
            if (!c?.enabled || c.dead) return;
            if (g.wards?.shields?.(origin, c.center(_b))) return;
            if (c.shieldFactor(origin) >= 1) { c._blocked(origin, name); return; }
            c.damage(LIQ.DMG, by, 'Liquidation');
            return;
        }
        if (!g.authority) return;
        if (g.wards?.shields?.(origin, at)) return;
        const dir = _b.copy(d).setY(0).normalize();
        if (bk === 'z') { const z = g.zombieById?.get(id); if (z && !z.isDead) { z.damageCooldown = 0; g.damageZombie(z, LIQ.DMG, false, dir.clone(), null); } return; }
        if (bk === 's') { const sp = g.spiders?.byId(id); if (sp) g.spiders.hit(sp, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'D') { const dr = g.dragons?.byId(id); if (dr) g.dragons.hit(dr, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'f') { const f = g.phoenixes?.byId(id); if (f) g.phoenixes.hit(f, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'I') { const ic = g.iceCastle?.byId(id); if (ic) g.iceCastle.hit(ic, LIQ.DMG, ic.type === 'snowman' ? 'melee' : 'Liquidation', by); return; }
        const c = g.duel?._creature(bk, id);
        if (!c) return;
        if (bk === 'b') { g.books?.hitBird(c, LIQ.DMG, 'Liquidation'); return; }
        if (bk === 't') { g.livingTrees?.hit(c, LIQ.DMG, 'Liquidation', by); return; }
        if (bk === 'a') { g.animals?.hit(c, LIQ.DMG, dir.clone(), by); return; }
        if (bk === 'c') { g.ships?.crew.hit(c, LIQ.DMG, dir.clone(), by, { spell: true, magic: true, kind: 'Liquidation' }); return; }
        if (bk === 'v') {
            if (g.castleLife?.wardOff?.(c, origin, 'Liquidation')) return; // (a raised shield / the Master's dome took it)
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
