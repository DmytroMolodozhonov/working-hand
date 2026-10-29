/**
 * SecondSight.js — the two gifts of the white pentagrams of sight (rules and numbers: SightRules.js; the circles: Pentagranium.js):
 *
 *   night «Noctis»    — the hero sees 50 % better in the dark (night and caves): World.setNightVision brightens the light a little in
 *                       the dark and pushes the fog of the dark 1.5 times farther. The existing night / cave post-light is used: no new
 *                       light source, no extra pass.
 *   sight «Spectris»  — the hero sees the invisible (Invisibles.js): Spencer's birds, Beslan's grass, the feathers and sheaves on the
 *                       ground, players under «Invisibility» (drawn see-through, ~15 %). A feather of the bird (or a sheaf of the grass) is
 *                       used up by the circle.
 *
 * The gifts live with the hero (saved in the world's player record `sight`; a death takes them — `wipeHero` — and «Give Me My Power»
 * brings them back — `captureLegacy` / `absorbLegacy`). The flag `sg` goes to the other players with the hero's state (RemoteAvatar.sees).
 *
 * What may go wrong (CLAUDE.md): not enough mana — nothing is paid, nothing is used up; no feather — the hint says what to bring; the hero
 * dies / the game closes while the eyes open — the gift is set at once when it is paid for (the eyes opening is only the picture);
 * the second circle of the same kind — "already have" and nothing is paid; the feather lies in the circle on the ground, in the bag or in a
 * hand — all three are looked in; a multiplayer neighbour grabbing the same lying feather — the host's item list decides (`itemGone`).
 */
import * as THREE from 'three';
import { SIGHT, SIGHT_HINT, findIngredient } from './SightRules.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const EYES_ID = 'sight-eyes-overlay';

export class SecondSight {
    constructor(game) {
        this.game = game;
        this.night = false;
        this.sees = false;
        this._nv = 0; // the night gift as the world is told (eased)
        this.anim = null; // the eyes opening {kind, t, m}
        this._eyes = null;
    }

    // ------------------------------------------------------------ saving
    snapshot() { return this.night || this.sees ? { n: this.night ? 1 : 0, s: this.sees ? 1 : 0 } : null; }
    restore(o) { this.night = !!o?.n; this.sees = !!o?.s; }
    /** Death: both gifts go (they lie in the body with the rest of the power: Legacy.js). */
    onDeath() { const had = this.night || this.sees; this.restore(null); this.anim = null; this._eyesHide(); if (had) this.game.perf?.note?.('👁️ зрение: дары забрала смерть'); }
    /** The flag told to the other players with the hero's state. */
    netFlag() { return this.sees ? 1 : undefined; }

    // ------------------------------------------------------------ the circles
    /**
     * The hero stands in a circle of sight (called by Pentagranium._useStep each frame while inside).
     * `ctx`: { m (the mark), pays (mana rules), hint(text), mana (now), fx() } → true when the gift was given this frame.
     */
    useCircle(kind, ctx) {
        const g = this.game, pays = ctx.pays, cost = kind === 'night' ? SIGHT.NIGHT_COST : SIGHT.SEE_COST;
        if (kind === 'night' ? this.night : this.sees) { ctx.hint('🌙 ' + (kind === 'night' ? SIGHT_HINT.nightHave : SIGHT_HINT.seeHave)); return false; }
        if (g.isDeadLocal || g.combat?.dead) return false;
        let found = null;
        if (kind === 'sight' && pays) {
            found = findIngredient({ slots: g.inventory?.slots || [], held: ['left', 'right'].map((sd) => g.items?.held?.[sd]?.item), loose: this._looseIn(ctx.m) });
            if (!found) { ctx.hint('👁️ ' + SIGHT_HINT.noIngredient); return false; }
        }
        if (pays && ctx.mana < cost) { ctx.hint((kind === 'night' ? '🌙 ' : '👁️ ') + SIGHT_HINT.noMana(cost)); return false; }
        if (pays) { g.combat.fatigue -= cost; g.combat._hudKey = ''; }
        if (found) this._take(found);
        if (kind === 'night') this.night = true; else this.sees = true; // (given at once: the picture below is only the picture)
        this.anim = { kind, t: 0, m: ctx.m };
        ctx.fx?.();
        g.hud.setVoice?.(kind === 'night' ? SIGHT_HINT.nightDone : SIGHT_HINT.seeDone, true);
        g.perf?.note?.(kind === 'night' ? '🌙 Пентаграмма ночного зрения: дар получен' : '👁️ Пентаграмма видения невидимых: дар получен');
        return true;
    }

    /** The loose things lying inside the circle `m` (a feather dropped there counts). */
    _looseIn(m) {
        const out = [];
        if (!m) return out;
        for (const [uid, L] of this.game.items?.loose || []) {
            const p = L.model?.position;
            if (p && Math.hypot(p.x - m.x, p.z - m.z) <= m.r && Math.abs(p.y - m.y) < 4) out.push({ uid, item: L.item });
        }
        return out;
    }

    /** Uses up ONE of the found ingredient. */
    _take(found) {
        const g = this.game;
        if (found.from === 'slot') { g.inventory.take(found.ref, 1); return; }
        if (found.from === 'hand') {
            const side = ['left', 'right'].find((sd) => g.items?.held?.[sd]?.item === found.ref);
            if (!side) return;
            if ((found.ref.count || 1) > 1) found.ref.count--; else g.items.releaseHand(side);
            return;
        }
        const L = found.ref, it = L.item;
        if ((it.count || 1) > 1) it.count--;
        else { g.items.removeLoose(L.uid); g.sync?.itemGone?.(L.uid, null, null); }
    }

    // ------------------------------------------------------------ per frame
    update(dt) {
        const g = this.game, w = g.world;
        const want = this.night ? 1 : 0;
        this._nv += (want - this._nv) * Math.min(1, dt * 1.2);
        if (Math.abs(this._nv - want) < 0.003) this._nv = want;
        w?.setNightVision?.(this._nv);
        if (this.anim) this._animStep(dt);
    }

    /** The eyes open: a ripple of light spreads over the air, a spiral of sparks climbs round the hero, two eyes open on the screen. */
    _animStep(dt) {
        const g = this.game, A = this.anim, fx = g.fx, me = g.character?.group?.position;
        A.t += dt;
        const T = SIGHT.ANIM_T, k = Math.min(1, A.t / T), see = A.kind === 'sight';
        if (fx && me) {
            const cols = see ? [0xff7ad9, 0xffe0f4, 0xb48cff] : [0x9fb4ff, 0xe8eeff, 0xffffff];
            // a spiral climbing round the body
            for (let i = 0; i < 3; i++) {
                const a = A.t * 6 + i * 2.1, h = -1.9 + k * 4.4;
                fx.spark(_v.set(me.x + Math.cos(a) * 1.3, me.y + h, me.z + Math.sin(a) * 1.3), cols[i % 3], 0.11, _d.set(-Math.sin(a) * 1.2, 0.6, Math.cos(a) * 1.2), 0.9);
            }
            // the ripple: a ring of light flying out at the height of the eyes (the air shimmers) — three times
            for (const t0 of [0.5, 1.25, 2.0]) {
                if (A.t >= t0 && !A['r' + t0]) {
                    A['r' + t0] = 1;
                    for (let i = 0; i < 36; i++) {
                        const a = (i / 36) * Math.PI * 2;
                        fx.spark(_v.set(me.x, me.y + 1.5, me.z), cols[i % 3], 0.1, _d.set(Math.cos(a) * 6, 0.15, Math.sin(a) * 6), 1.0);
                    }
                    fx.lightFlash?.(_v.set(me.x, me.y + 1.5, me.z), cols[0], 3, 0.4, 24);
                }
            }
        }
        if (see) this._eyesShow(A.t, T);
        if (A.t >= T) { this.anim = null; this._eyesHide(); }
    }

    /** The two eyes on the screen: they open (0…0.9 s), glow, and fade away (the last second). A cheap DOM picture, made once. */
    _eyesShow(t, T) {
        if (typeof document === 'undefined') return;
        if (!this._eyes) {
            const el = document.createElement('div');
            el.id = EYES_ID;
            el.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:55;display:flex;align-items:center;justify-content:center;gap:9vmin;opacity:0';
            const eye = () => {
                const e = document.createElement('div');
                e.style.cssText = 'width:20vmin;height:9vmin;border-radius:100% 0 100% 0/100% 0 100% 0;transform:rotate(45deg) scaleY(0);background:radial-gradient(ellipse at center,#fff 0%,#ffd6f0 18%,#ff7ad9 45%,rgba(255,122,217,0) 72%);box-shadow:0 0 6vmin 1vmin rgba(255,122,217,.65);filter:blur(.4px)';
                return e;
            };
            const a = eye(), b = eye();
            b.style.transform = 'rotate(-45deg) scaleY(0)';
            el.append(a, b);
            const glow = document.createElement('div');
            glow.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,122,217,.0) 35%,rgba(255,122,217,.28) 100%)';
            el.prepend(glow);
            document.body.appendChild(el);
            this._eyes = { el, a, b, glow };
        }
        const E = this._eyes, open = Math.min(1, t / 0.9), fade = t > T - 1 ? Math.max(0, T - t) : 1;
        const sy = Math.sin(open * Math.PI / 2) * (1 - 0.06 * Math.sin(t * 9) * open);
        E.el.style.opacity = String(0.95 * fade);
        E.a.style.transform = `rotate(45deg) scaleY(${sy})`;
        E.b.style.transform = `rotate(-45deg) scaleY(${sy})`;
    }

    _eyesHide() { if (this._eyes) { this._eyes.el.style.opacity = '0'; } }

    dispose() { if (this._eyes) { this._eyes.el.remove(); this._eyes = null; } this.game.world?.setNightVision?.(0); }
}
