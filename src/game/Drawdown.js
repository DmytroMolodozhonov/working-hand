/**
 * Drawdown.js — «Drawdown» / «Drawdown Maxima»: the ground the wand points at sinks.
 *
 * The raised hand (the wand) points at a piece of ground, the word is said: the ground there sinks
 * into a bowl. While it holds, the sinking FOLLOWS the wand: wherever the wand (the hand) points on
 * the ground now, the ground is pressed down there (one more layer every DRAWDOWN.*.every s, deepest
 * under the wand) — hold it on one place and the pit goes deeper, lead it along the ground and a
 * trench follows it. It goes on until «стоп» or the mana is gone (the author's words). Mana:
 * 5 at once and 1 a second; «Максима»: a wider bowl, 20 at once and 2 a second.
 *
 * Everything that stands on the ground goes down WITH it — never left hanging in the air: the whole
 * column of blocks above the sinking layer moves down (houses, castle walls, trees of blocks), the
 * trees of the start, chests, beds, doors and every collision box standing there go down with
 * it; creatures and players stand on the ground and come down as it sinks; things lying about wake
 * up and fall. Water, bedrock and a house under a sphere of protection don't move.
 *
 * No scroll: like «Earthquake» (the other spell of the ground) it is known by everybody.
 *
 * Who decides: the spell goes to everybody ('spell'); the caster's computer follows its wand and tells
 * the others where it points now ('ddat'); every computer presses there on its own clock and moves its
 * own boxes and models; the HOST moves the blocks (they are sent and saved). The caster's computer
 * pays the mana; «стоп» or no mana — everybody stops ('stop').
 */

import * as THREE from 'three';
import { BLOCK, MIN_LAYER } from '../world/Terrain.js';
import { castingHand } from './WandAim.js';

export const DRAWDOWN = {
    Drawdown: { r: 3.2, deep: 6, every: 1.5, drain: 1 },
    DrawdownMaxima: { r: 7, deep: 9, every: 1.3, drain: 2 },
    REACH: 30, // m: the ground the hand points at
    MAX_T: 600, // (a guard: nothing holds forever)
};

export const isDrawdown = (name) => name === 'Drawdown' || name === 'DrawdownMaxima';

/** How hard one step presses a column `dist` m from where the wand points: 1 under it, 0 at the bowl's edge. */
export function pressOf(name, dist) {
    const P = DRAWDOWN[name];
    if (!P || dist > P.r) return 0;
    return 1 - (dist / P.r) ** 2;
}

/** How many layers down a column is after this much pressing (each step adds pressOf; at most `deep`). */
export const depthOf = (name, press) => Math.max(0, Math.min(DRAWDOWN[name].deep, Math.floor(press + 0.35)));

/** Natural ground: where a column «stands» (everything above it — built, grown — goes down with it). */
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.FARMLAND, BLOCK.PATH, BLOCK.GRAVEL, BLOCK.DEEPSTONE]);

/** The top layer of natural ground in a column (scanning down from its top), or null. */
export function groundLayer(get, x, z, top) {
    for (let L = top; L > MIN_LAYER; L--) if (GROUND.has(get(x, L, z))) return L;
    return null;
}

/**
 * One layer down for the whole column: the block under the ground's top disappears and everything
 * above it (the ground, a house, a tree…) moves one layer down. → edits [[x, L, z, block], …] | null
 * (bedrock, water standing on it: it stays).
 */
export function sinkColumn(get, x, z, top) {
    const gL = groundLayer(get, x, z, top);
    if (gL == null) return null;
    const base = gL - 1;
    if (base <= MIN_LAYER + 1 || get(x, base, z) === BLOCK.BEDROCK) return null;
    if (get(x, gL + 1, z) === BLOCK.WATER) return null; // (a lake's bed: water doesn't sink with it)
    const edits = [];
    const hi = Math.max(top, gL) + 1;
    for (let L = base; L <= hi; L++) {
        const now = get(x, L, z), next = L < hi ? get(x, L + 1, z) : BLOCK.AIR;
        if (now !== next) edits.push([x, L, z, next]);
    }
    return { edits, gL };
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). `does`: sink | none.
 */
export const DRAWDOWN_TARGETS = {
    me: { does: 'sink', why: 'стою на проседающей земле — опускаюсь вместе с ней (тело стоит на земле)' },
    players: { does: 'sink', why: 'все игроки на этой земле опускаются вместе с ней; не урон' },
    zombies: { does: 'sink', why: 'стоят на земле — опускаются с ней' },
    castlePeople: { does: 'sink', why: 'жители, рыцари — опускаются с землёй; разрушение замка (проседают стены) — порча: стража видит, люди пугаются (опасность «quake»)' },
    animals: { does: 'sink', why: 'опускаются с землёй' },
    sailors: { does: 'none', why: 'моряки на корабле: корабль на воде, а вода не проседает' },
    spider: { does: 'sink', why: 'стоит на земле — опускается с ней' },
    livingTrees: { does: 'sink', why: 'живое дерево стоит на земле — опускается с ней' },
    bookBirds: { does: 'none', why: 'летают — их не касается' },
    dragon: { does: 'sink', why: 'на земле — опускается с ней (в полёте — нет)' },
    iceCastle: { does: 'sink', why: 'стоят на земле — опускаются с ней (их сила тяжести); лёд замка опускается как блоки' },
    blackship: { does: 'none', why: 'капитан и скелеты стоят на палубе чёрного корабля в море — земля под ними не опускается' },
    phoenix: { does: 'none', why: 'в воздухе не касается; на земле — стоит на ней и опускается' },
    owl: { does: 'none', why: 'в воздухе не касается; на земле — вспархивает (сова)' },
    canary: { does: 'none', why: 'стоит на суше — земля под ним опускается, как под любым; в воду не заходит' },
    spencer: { does: 'none', why: 'не касается: птичка вспархивает' },
    ghost: { does: 'none', why: 'не касается: призрак бестелесный, он парит над землёй' },
    custom: { does: 'none', why: 'стоит на земле — опускается вместе с ней; плавающее остаётся в воде' },
    gargoyle: { does: 'none', why: 'в воздухе не касается; низко летящую горгулью не достаёт' },
    blocks: { does: 'sink', why: 'вся колонна блоков над проседающим слоем — земля, дома, стены, деревья из блоков — опускается целиком' },
    trees: { does: 'sink', why: 'деревья (и из блоков, и деревья у старта) опускаются вместе с землёй' },
    furniture: { does: 'sink', why: 'сундуки, кровати, двери и всё с коробкой столкновения опускаются вместе с землёй' },
    looseThings: { does: 'sink', why: 'вещи и оружие на земле просыпаются и падают на опустившуюся землю' },
    water: { does: 'none', why: 'дно озера и моря не проседает (вода не уходит вниз)' },
    bedrock: { does: 'none', why: 'коренная порода не проседает' },
    ships: { does: 'none', why: 'корабли на воде' },
    ward: { does: 'none', why: 'дом под сферой защиты не проседает' },
};

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Drawdown {
    constructor(game) {
        this.game = game;
        this._live = new Map(); // casterId → the spell holding now (its `center` follows the wand)
    }

    /** Where my wand (my raised hand) points on the ground now, or null. */
    _aim() {
        const g = this.game;
        const h = castingHand(g);
        if (!h) return null;
        const hit = g.terrain?.data?.raycast(h.origin, h.dir, DRAWDOWN.REACH);
        if (!hit || h.dir.y > -0.05) return null;
        return { side: h.side, d: h.dir, at: new THREE.Vector3(hit.x, hit.y, hit.z) };
    }

    /** Voice on my computer: the raised hand (the wand) points at the ground. */
    cast(name, isFinal) {
        const g = this.game;
        if (name === 'Drawdown' && !isFinal) return null; // (wait: maybe «… Максима»)
        const now = performance.now();
        if (now - (this._lastAt || -1e9) < 1500) return null;
        if (this._mine?.life > 0) return null; // (one at a time: «стоп» ends it)
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (!castingHand(g)) return hint('⬇️ Поднимите руку (палочку), направьте её на землю — и скажите «Drawdown»');
        const aim = this._aim();
        if (!aim) return hint('⬇️ Направьте палочку <b>на землю</b> (не дальше 30 м) и скажите «Drawdown»');
        const tired = g.combat.check(name);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay(name);
        this._lastAt = now;
        g.spells.cast(name, aim.at, aim.d, aim.side, g.localId);
        g.sync?.spell(name, aim.at, aim.d, aim.side);
        g.hud.setVoice('⬇️ Земля проседает там, куда показывает палочка: держите на месте — глубже, ведите — яма идёт за ней. «Стоп» — хватит', true);
        return name;
    }

    /** (every computer) the ground sinks where the caster's wand points, while it is held. */
    start(name, at, casterId) {
        const g = this.game;
        const P = DRAWDOWN[name];
        const mine = casterId === g.localId || casterId === 'local';
        const center = at.clone();
        let stepT = 0, rumble = 0, sentAt = null;
        const press = new Map(), sunk = new Map(); // column → how hard it was pressed / layers it went down
        const spell = {
            life: DRAWDOWN.MAX_T, held: true, by: casterId, kind: name, center,
            onUpdate: (sp, dt) => {
                // the caster pays while it holds (no mana: it stops — for everybody)
                if (mine && g.spells.hooks.drain && g.spells.hooks.drain(casterId, P.drain * dt, dt) === false) {
                    sp.life = 0; g.hud.setVoice('⬇️ Мана кончилась — земля больше не проседает', true); g.sync?.stopSpells?.(); return;
                }
                // it follows the wand: where it points on the ground now (the others hear it — 'ddat')
                if (mine) { const a = this._aim(); if (a) center.copy(a.at); }
                // the thread of magic from the hand to the ground
                const hp = g.handPose?.(casterId, mine ? (castingHand(g)?.side || 'right') : 'right');
                if (hp && Math.random() < 0.6) g.fx.spark(_v.lerpVectors(hp.origin, center, Math.random()), 0xa0784a, 0.07, _w.set(0, -0.4, 0), 0.4);
                stepT -= dt;
                while (stepT <= 0) {
                    stepT += P.every;
                    if (mine && (!sentAt || sentAt.distanceToSquared(center) > 0.04)) { g.sync?.drawdownAt?.(center); sentAt = center.clone(); }
                    this._step(name, center, press, sunk, casterId);
                }
                rumble -= dt;
                if (rumble <= 0) { rumble = 0.25; this._dust(center, P.r, 4); }
            },
        };
        if (mine) this._mine = spell;
        this._live.set(casterId, spell);
        g.spells.spells.push(spell);
    }

    /** Another computer's wand points here now ('ddat'). */
    onNet(by, p) {
        const sp = this._live.get(by);
        if (sp && sp.life > 0 && p) sp.center.copy(p);
    }

    /** One step: the ground under the wand is pressed; every column pressed a layer deeper goes down. */
    _step(name, at, press, sunk, by) {
        const g = this.game;
        const P = DRAWDOWN[name];
        const data = g.terrain?.data;
        const get = data ? (x, L, z) => data.get(x, L, z) : null;
        const cx = Math.round(at.x), cz = Math.round(at.z), R = Math.ceil(P.r);
        const edits = [];
        let castle = 0, moved = 0;
        for (let x = cx - R; x <= cx + R; x++) {
            for (let z = cz - R; z <= cz + R; z++) {
                const k = pressOf(name, Math.hypot(x - at.x, z - at.z));
                if (k <= 0) continue;
                const key = x + ',' + z;
                const pr = (press.get(key) || 0) + k;
                press.set(key, pr);
                const want = depthOf(name, pr);
                let have = sunk.get(key) || 0;
                while (have < want) {
                    have++;
                    moved++;
                    this._lowerThings(x, z); // (every computer: its boxes and models)
                    if (!g.authority || !get) continue;
                    const top = data.topLayer(x, z);
                    if (g.wards?.protects?.(x, top - 1, z)) continue; // (a house's sphere holds it)
                    const s = sinkColumn(get, x, z, top);
                    if (!s) continue;
                    for (const e of s.edits) {
                        if (e[3] >= BLOCK.CS_GREY && e[3] <= BLOCK.RUNE) castle++;
                        data.set(e[0], e[1], e[2], e[3]);
                        edits.push(e);
                    }
                }
                sunk.set(key, have);
            }
        }
        if (!moved) return;
        this._dust(at, P.r, name === 'DrawdownMaxima' ? 22 : 12);
        g.sound?.playLandThud?.(at, g.character?.group?.position) || g.sound?.playExplosion?.(at, at, 0.3);
        const me = g.character?.group.position;
        if (me && me.distanceTo(at) < P.r + 6) g.fx.shake = Math.max(g.fx.shake || 0, name === 'DrawdownMaxima' ? 0.5 : 0.3);
        if (!g.authority) return;
        // wake the things lying about there: they fall onto the ground that went down
        for (const L of g.items?.loose?.values() || []) if (L.model.position.distanceTo(at) < P.r + 1.5) { L.rest = false; L.sentRest = false; }
        if (edits.length) g.builder?._sendEdits(edits);
        // the people near take fright; a castle sinking is damage done to it
        g.castleLife?.alarm?.(at, 'quake', by, P.r);
        if (castle) g.castleLife?.damaged?.(at, by, castle, true, { r: P.r, kind: 'quake' });
    }

    /** One column went a layer down: what stands on it here (boxes, chests, beds, doors, the start's trees) too. */
    _lowerThings(x, z) {
        const g = this.game;
        const col = g.collision;
        const inCol = (px, pz) => Math.abs(px - x) <= 0.5 && Math.abs(pz - z) <= 0.5;
        // (the whole column goes down: whatever box stands in it goes with it)
        for (const b of [...(col?.queryBoxes?.(x - 0.5, x + 0.5, z - 0.5, z + 0.5) || [])]) {
            if (!inCol((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)) continue;
            b.minY -= 1; b.maxY -= 1;
        }
        for (const c of g.chests || []) if (!(c.cart && g.carriages?.list?.has(c.cart.id) && !g.carriages.list.get(c.cart.id).chestOut) && inCol(c.mesh.position.x, c.mesh.position.z)) c.mesh.position.y -= 1; // (a cart's chest goes with its cart)
        for (const b of g.beds?.list?.values() || []) if (b.model && inCol(b.model.position.x, b.model.position.z)) { b.model.position.y -= 1; if (b.y != null) b.y -= 1; }
        for (const d of g.doors?.list?.values() || []) if (d.model && inCol(d.x, d.z)) { d.model.position.y -= 1; d.y -= 1; }
        for (const w of g.weapons?.weapons || []) if (!w.holder && inCol(w.position.x, w.position.z)) w.wake?.();
        // the start's trees (drawn apart from the blocks)
        const W = g.world;
        for (const tr of W?.trees || []) {
            if (!tr.alive || !inCol(tr.x, tr.z)) continue;
            W.sinkTree(tr, -1);
        }
    }

    _dust(at, r, n) {
        const fx = this.game.fx;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, d = r * (0.6 + Math.random() * 0.5);
            const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
            fx.glow?.spawn(x, at.y + 0.3, z, -Math.cos(a) * 0.6, 0.6 + Math.random(), -Math.sin(a) * 0.6, [0x9a8466, 0x7d6a55, 0xb59a78][i % 3], 0.6 + Math.random() * 0.6, 1.3, { shrink: -0.4 });
            if (i % 2) fx.spark(_v.set(x, at.y + 0.2, z), 0x6b5440, 0.18, new THREE.Vector3(-Math.cos(a) * 1.5, 1.5 + Math.random() * 2, -Math.sin(a) * 1.5), 0.8);
        }
    }
}
