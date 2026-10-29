/**
 * Firmitas.js — the game part of «Pentagranium Firmitas», the white pentagram of absolute steadiness (rules and numbers: FirmRules.js; the flag:
 * Steadiness.absolute; the circle: Pentagranium.js — it calls `useCircle` each frame the hero stands in a lit circle of this kind).
 *
 * The rite: the hero stands in the circle, a magic pebble LIES on it (a canary's find), and there are 300 mana. The mana is paid and the pebble is
 * used up at once, and the gift is set at once (so no interruption leaves it half given: the picture below is only the picture). The picture (FIRM.ANIM_T s):
 * the pebble rises from the ground over the hero's head and spins, glowing; threads of amber light run along the lines of the figure to the hero's feet
 * (the circle «roots» them); the pebble shrinks and pours into the hero as a stream of sparks; a column of light climbs from the feet; at the end a flash,
 * a ring of light runs out over the ground, the earth trembles and the hero braces in the «устоял» pose. Everything is the shared spark pool and the
 * shared flash light: nothing new in the frame.
 *
 * What may go wrong (CLAUDE.md): not enough mana / no pebble — nothing is paid or used up, a hint says what to bring (once per standing); the pebble lies in
 * the bag or in a hand — it does not count (it must lie on the mark); two pebbles — one is used; the gift already given — «already» and nothing is paid; the
 * hero dies / the game closes during the picture — the gift is already set (death takes it into the body); a neighbour grabbing the same lying pebble — the host's
 * item list decides (`itemGone`); the circle goes out during the picture — the picture goes on from its own copy of the pebble; Creative — no pebble, no mana.
 */
import * as THREE from 'three';
import { FIRM, FIRM_HINT, findPebble } from './FirmRules.js';
import { makeItemModel, ITEM_SCALE } from './ItemTypes.js';
import { figureLines } from './PentagramRules.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const AMBER = [0xffb347, 0xffe0a0, 0xf0b25a, 0xfff4d0];
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export class Firmitas {
    constructor(game) {
        this.game = game;
        this.anim = null; // the rite's picture {t, m, model, from, polys}
    }

    /** Does the hero stand firm for good? */
    get has() { return !!this.game.steady?.absolute; }

    /** Death: the picture stops (the gift itself goes with Steadiness.onDeath; it lies in the body: Legacy.js). */
    onDeath() { const had = this.has; this._end(); if (had) this.game.perf?.note?.('🗿 неколебимость: дар забрала смерть'); }

    /**
     * The hero stands in a circle of absolute steadiness (called by Pentagranium._useStep each frame while inside).
     * `ctx`: { m (the mark), pays (mana rules), hint(text), mana (now), fx() } → true when the gift was given this frame.
     */
    useCircle(ctx) {
        const g = this.game;
        if (this.has) { ctx.hint('🗿 ' + FIRM_HINT.have); return false; }
        if (g.isDeadLocal || g.combat?.dead) return false;
        let found = null;
        if (ctx.pays) {
            found = findPebble(this._looseIn(ctx.m));
            if (!found) { ctx.hint('🗿 ' + FIRM_HINT.noPebble); return false; }
            if (ctx.mana < FIRM.COST) { ctx.hint('🗿 ' + FIRM_HINT.noMana(FIRM.COST)); return false; }
            g.combat.fatigue -= FIRM.COST; g.combat._hudKey = '';
            this._take(found);
        }
        g.steady?.setAbsolute(true); // (given at once)
        this._begin(ctx.m, found);
        ctx.fx?.();
        g.hud?.setVoice?.(FIRM_HINT.done, true);
        g.perf?.note?.('🗿 Пентаграмма абсолютной устойчивости: дар получен');
        return true;
    }

    /** The resting things lying inside the circle `m` (a pebble dropped there counts). */
    _looseIn(m) {
        const out = [];
        if (!m) return out;
        for (const [uid, L] of this.game.items?.loose || []) {
            const p = L.model?.position;
            if (p && L.rest !== false && Math.hypot(p.x - m.x, p.z - m.z) <= m.r && Math.abs(p.y - m.y) < 4) out.push({ uid, item: L.item, rest: L.rest, L });
        }
        return out;
    }

    /** Uses up ONE pebble of the lying stack. */
    _take(found) {
        const g = this.game, it = found.item;
        if ((it.count || 1) > 1) { it.count--; return; }
        g.items.removeLoose(found.uid);
        g.sync?.itemGone?.(found.uid, null, null);
    }

    // ------------------------------------------------------------ the picture
    _begin(m, found) {
        const g = this.game;
        if (this.anim) this._end();
        let model = null;
        try {
            model = makeItemModel({ kind: FIRM.ITEM });
            model.scale.setScalar(ITEM_SCALE[FIRM.ITEM] || 2.4);
            const from = found?.L?.model?.position;
            const me = g.character.group.position;
            model.position.set(from ? from.x : me.x, from ? from.y : me.y - PLAYER_GROUND_OFFSET + 0.2, from ? from.z : me.z);
            g.scene.add(model);
        } catch (e) { model = null; }
        this.anim = { t: 0, m, model, from: model ? model.position.clone() : null, polys: figureLines(m.pent, m.rot), flashed: false };
        g.sound?.playSpellFxAt?.('fxFirm', _v.set(m.x, m.y, m.z), 1, 1, 24);
    }

    _end() {
        const A = this.anim;
        if (!A) return;
        if (A.model) A.model.parent?.remove(A.model); // (the shapes and materials are shared: nothing to dispose)
        this.anim = null;
    }

    /** For Game.prewarm: the pebble (its stone and its unlit glowing rune) — the rite's picture uses no other shader. */
    sampleModels() { return [makeItemModel({ kind: FIRM.ITEM })]; }

    update(dt) { if (this.anim) this._step(dt); }

    _step(dt) {
        const g = this.game, A = this.anim, fx = g.fx, me = g.character?.group?.position;
        if (!me) { this._end(); return; }
        A.t += dt;
        const T = FIRM.ANIM_T, t = A.t, m = A.m;
        const feet = me.y - PLAYER_GROUND_OFFSET, rise = ease(clamp01(t / 1.0)), pour = ease(clamp01((t - 2.7) / 1.1));
        const hover = feet + 5.6;
        // 1) the pebble rises over the hero's head, spins faster and faster, then shrinks and pours down into the chest
        const md = A.model;
        if (md) {
            const hx = me.x, hz = me.z;
            const y = A.from.y + (hover - A.from.y) * rise + (feet + 2.6 - hover) * pour;
            md.position.set(A.from.x + (hx - A.from.x) * rise, y, A.from.z + (hz - A.from.z) * rise);
            md.rotation.y += dt * (3 + 10 * clamp01(t / 2.7));
            md.rotation.z = Math.sin(t * 3) * 0.2 * (1 - pour);
            md.scale.setScalar((ITEM_SCALE[FIRM.ITEM] || 2.4) * (1 + 0.25 * clamp01(t / 2.7)) * (1 - 0.95 * pour));
        }
        if (fx) {
            // 2) threads of amber light run along the lines of the figure (and its ring) to the hero's feet — the circle roots the hero
            if (t > 0.5 && t < 3.6) {
                for (let i = 0; i < 3; i++) {
                    let x, z;
                    if (i === 0) { const a = Math.random() * Math.PI * 2; x = m.x + Math.cos(a) * m.r; z = m.z + Math.sin(a) * m.r; } // the ring
                    else {
                        const poly = A.polys[(Math.random() * A.polys.length) | 0], k = (Math.random() * poly.length) | 0, a = poly[k], b = poly[(k + 1) % poly.length], u = Math.random();
                        x = m.x + (a[0] + (b[0] - a[0]) * u) * m.r; z = m.z + (a[1] + (b[1] - a[1]) * u) * m.r;
                    }
                    _p.set(x, m.y + 0.15, z);
                    _d.set(me.x - x, 0, me.z - z);
                    const len = _d.length() || 1;
                    _d.multiplyScalar(4.2 / len); _d.y = 0.6;
                    fx.spark(_p, AMBER[i % 4], 0.13, _d, Math.min(1.1, len / 4.2));
                }
            }
            // 3) a spiral of sparks climbs round the hero (and the pebble's glow lights the air)
            for (let i = 0; i < 2; i++) {
                const a = t * 6 + i * Math.PI, h = clamp01(t / 3.2) * 4.4;
                fx.spark(_p.set(me.x + Math.cos(a) * 1.4, feet + h, me.z + Math.sin(a) * 1.4), AMBER[i], 0.1, _d.set(-Math.sin(a) * 1.3, 0.5, Math.cos(a) * 1.3), 0.8);
            }
            if (md && ((A._lf = (A._lf || 0) - dt) <= 0)) { A._lf = 0.12; fx.lightFlash?.(_p.copy(md.position), AMBER[0], 1.6 + 2.4 * clamp01(t / 2.7), 0.2, 20); }
            // 4) the pebble pours into the hero as a stream; a column of light climbs from the feet
            if (md && pour > 0 && pour < 1) {
                for (let i = 0; i < 4; i++) fx.spark(_p.copy(md.position).add(_v.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), AMBER[(Math.random() * 4) | 0], 0.14, _d.set((me.x - md.position.x) * 1.5, -2.6, (me.z - md.position.z) * 1.5), 0.7);
            }
            if (t > 2.7 && t < T - 0.2) {
                for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.7; fx.spark(_p.set(me.x + Math.cos(a) * r, feet + 0.1, me.z + Math.sin(a) * r), AMBER[i % 4], 0.16, _d.set(0, 3.5 + Math.random() * 3.5, 0), 1.0); }
            }
            // 5) the flash: a ring of light runs out over the ground, the earth trembles, the hero braces
            if (!A.flashed && t >= 3.8) {
                A.flashed = true;
                for (let i = 0; i < 90; i++) { const a = (i / 90) * Math.PI * 2; fx.spark(_p.set(me.x, feet + 0.2, me.z), AMBER[i % 4], 0.2, _d.set(Math.cos(a) * 8, 0.3, Math.sin(a) * 8), 1.1); }
                fx.lightFlash?.(_p.set(me.x, feet + 1.8, me.z), AMBER[1], 5, 0.5, 40);
                fx.shake = Math.max(fx.shake || 0, FIRM.SHAKE);
                g.knock?.held?.({ dir: 'back', v: 7 });
                if (md) md.visible = false;
            }
        }
        if (t >= T) this._end();
    }

    dispose() { this._end(); }
}
