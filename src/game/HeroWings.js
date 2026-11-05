/**
 * HeroWings.js — «Зелье крыльев»: the hero grows wings, for good (till death). The author 05.11:
 *   «Крылья не сразу отрастут полностью, а в течение 10 минут. И ты будешь страдать: минус 1 ХП в полминуты в течение 20 минут —
 *   можно умереть, если не поддерживаешь силу (не кушаешь). Тебе будет плохо, тошнить, всё замыленное, будет говориться, что крылья
 *   растут, и шкала внизу. Потом он сможет летать без заклинаний. Крылья довольно немаленькие, складываются, когда не летаешь, как у
 *   ангелов.» The potion: magic swan wings + a golden apple, one flask from a cauldron (Potions 'wings').
 *
 * Here: the growing (GROW_S), the pain (PAIN every PAIN_EVERY s for PAIN_S), the nausea (the head swims — Knockdown's dizziness: the
 * picture blurred, the head sways, in waves), the bar at the bottom and the words, the wings on the back (the kit's feathered wing ×SCALE,
 * folded down the back as an angel's, spread out to the sides), their state for the network and the save, death takes them.
 * The flight by the arms' strokes — WingFlight.js (it sets `open`, `flap`, `flex` here).
 *
 * Sizes (the world's measures; the hero model ~4.7 m from the feet to the hair, the shoulders ~3.2 m up): each wing spread ~2.6 m
 * (a span of ~6 m with the back) — «немаленькие»; folded the wrist sits over the shoulder and the long feathers reach the back of the
 * thighs.
 *
 * What may go wrong (CLAUDE.md «а если…»): drunk with wings / while they grow — not drunk (the flask stays), said why; the hero dies while
 * they grow / after — they are gone with the body (death takes all); in the Creative «Бессмертен» — no pain (no harm at all), but the
 * growing and the nausea are as said; the game saved and loaded mid-growth — the time is kept; the monster form / the dragon form — the
 * wings are hidden (the body is another's) and come back; another player — sees the wings, their growth, folded or spread (pose 'wg').
 */
import * as THREE from 'three';
import { MODEL_KIT as K, animateWings } from './AnimalModels.js';

export const WINGS = {
    GROW_S: 600, // s: 10 minutes to grow full (the author)
    PAIN_S: 1200, // s: the pain lasts 20 minutes (the author)
    PAIN_EVERY: 30, PAIN: 1, // −1 HP every half a minute (the author)
    SCALE: 4.4, // × the kit's wing (~0.6 its own span): ~2.6 m a wing spread
    MOUNT: { X: 0.3, Y: 0.6, Z: 0.42 }, // on the torso (its units = m): the back between the shoulder blades
    NAUSEA: 0.3, // the head's swimming (Knockdown.dizzyS) at the worst of a wave
    SAY_AT: [0.25, 0.5, 0.75], // the words as they grow
};

/** How grown (0…1) `t` s after the potion: a slow start, then they come quicker, the last part slow (an ease). */
export function growthAt(t) {
    const k = Math.max(0, Math.min(1, (t || 0) / WINGS.GROW_S));
    return k * k * (3 - 2 * k);
}

/** How many pains fall between t0 and t1 (s after the potion): one at every PAIN_EVERY up to PAIN_S. */
export function painsBetween(t0, t1) {
    const a = Math.min(WINGS.PAIN_S, Math.max(0, t0)), b = Math.min(WINGS.PAIN_S, Math.max(0, t1));
    return Math.max(0, Math.floor(b / WINGS.PAIN_EVERY) - Math.floor(a / WINGS.PAIN_EVERY));
}

/** The feathered wings on a character's back (mine or another player's). → {set(grown, open, flap, flex), dispose()} */
export function attachWings(character, magic = true) {
    const torso = character?.torso;
    if (!torso) return null;
    const feather = magic ? K.wingMat(0xf4f6ff, 0xb8d4ff) : K.wingMat(0xf9f8f4);
    const mounts = [], wings = [];
    for (const s of [1, -1]) {
        // (the kit's wing is a pig's: along +Z (its body) folded, the feathers hanging −Y; on a man standing up its «along the body» is down
        // the back and its «down» is back away from it — turned a quarter about X and flipped in Y)
        const mount = new THREE.Group();
        mount.name = s > 0 ? 'heroWingRight' : 'heroWingLeft';
        mount.position.set(WINGS.MOUNT.X * s, WINGS.MOUNT.Y, WINGS.MOUNT.Z);
        mount.rotation.x = Math.PI / 2;
        const w = new THREE.Group();
        w.userData.side = s;
        const m = new THREE.Mesh(K.pigWingGeo(), feather);
        m.castShadow = true;
        m.name = 'wing';
        w.userData.mesh = m;
        w.add(m);
        mount.add(w);
        torso.add(mount);
        mounts.push(mount); wings.push(w);
    }
    const holder = { userData: { wings } };
    return {
        mounts,
        set(grown, open = 0, flap = 0, flex = 0) {
            const k = WINGS.SCALE * Math.max(0.04, grown);
            for (let i = 0; i < 2; i++) {
                const s = i === 0 ? 1 : -1;
                mounts[i].visible = grown > 0.005;
                mounts[i].scale.set(k * s, -k, k);
            }
            animateWings(holder, open, flap, flex);
        },
        dispose() { for (const m of mounts) m.parent?.remove(m); },
    };
}

export class HeroWings {
    constructor(game) {
        this.game = game;
        this.grown = 0; // 0…1
        this.t = null; // s since the potion (null: not growing nor in pain)
        this.open = 0; this.flap = 0; this.flex = 0; // (WingFlight sets these in the air)
        this.model = null;
        this._said = 0;
        this._bar = null;
    }

    /** The wings are grown: the hero can fly (WingFlight). */
    get has() { return this.grown >= 0.999 && !this.hidden; }
    get growing() { return this.t != null && this.t < WINGS.GROW_S; }
    /** The body is another's now (the monster, the dragon): no wings drawn, no flight. */
    get hidden() { const g = this.game; return !!(g.monster?.active || g.dragonForm?.id); }

    /** Why the potion of wings cannot be drunk now (null: it can). */
    cantDrink() {
        if (this.grown >= 0.999) return '🪽 У вас уже есть крылья';
        if (this.t != null && this.t < WINGS.GROW_S) return '🪽 Крылья уже растут — второе зелье не нужно';
        return null;
    }

    /** The potion drunk: they begin to grow (and the pain, and the nausea). */
    start() {
        if (this.cantDrink()) return false;
        this.t = 0;
        this.grown = Math.max(this.grown, 0);
        this._said = 0;
        this.game.hud?.setVoice?.('🪽 Ваши крылья начали расти… Будет больно и тошно — держитесь и ешьте, чтобы не умереть', true);
        return true;
    }

    /** Wings at once (the Creative «С крыльями»: no growing, no pain). */
    grant() {
        this.grown = 1;
        this.t = null;
        this._ensure();
    }

    /** Death takes them (CLAUDE.md «умер — всё»). */
    onDeath() {
        this.grown = 0; this.t = null; this.open = 0; this.flap = 0; this.flex = 0;
        this.model?.dispose(); this.model = null;
        this._showBar(-1);
    }

    _ensure() {
        if (!this.model && this.game.character) this.model = attachWings(this.game.character, true);
    }

    update(dt) {
        const g = this.game;
        if (this.t != null) {
            const t0 = this.t;
            this.t += dt;
            this.grown = Math.max(this.grown, growthAt(this.t));
            // the pain: −1 HP every half a minute for 20 minutes (no harm to the immortal of the Creative)
            const n = painsBetween(t0, this.t);
            if (n > 0) this._hurt(n);
            // the nausea: the head swims in waves while they grow (and fades after)
            if (this.t < WINGS.GROW_S && g.knock) {
                const wave = 0.5 + 0.5 * Math.sin(this.t * 0.45);
                const s = WINGS.NAUSEA * (0.35 + 0.65 * wave);
                if (!(g.knock.dizzyLeft > 2)) { g.knock.dizzyLeft = g.knock.dizzyDur = 4; g.knock.dizzyS = s; } // (kept up: never the fading half)
                else if (g.knock.dizzyS <= WINGS.NAUSEA + 1e-6) g.knock.dizzyS = s; // (a hard fall's own dizziness is stronger: left as it is)
            }
            // the words as they grow
            const k = this.grown;
            while (this._said < WINGS.SAY_AT.length && k >= WINGS.SAY_AT[this._said]) {
                g.hud?.setVoice?.(`🪽 Крылья растут — ${Math.round(WINGS.SAY_AT[this._said] * 100)}%. Вас мутит…`, true);
                this._said++;
            }
            if (this.t >= WINGS.GROW_S && this._said <= WINGS.SAY_AT.length) {
                this._said = WINGS.SAY_AT.length + 1;
                g.hud?.setVoice?.('🪽 Крылья выросли! Разбегитесь и машите обеими руками сверху вниз — взлетите. Руки в стороны — планируете. Садитесь мягко', true);
            }
            if (this.t >= WINGS.PAIN_S) this.t = null; // (the pain is over too)
            this._showBar(this.t != null && this.t < WINGS.GROW_S ? this.grown : -1);
        }
        if (this.grown > 0) this._ensure();
        if (this.model) {
            if (this.hidden) { for (const m of this.model.mounts) m.visible = false; return; }
            // folded on the ground: a slow breath of the feathers; in the air WingFlight sets open / flap / flex
            if (!g.wingFlight?.airborne) {
                this._breathT = (this._breathT || 0) + dt;
                this.open += (0 - this.open) * Math.min(1, dt * 3);
                this.flap = 0.03 * Math.sin(this._breathT * 1.3);
                this.flex = 0;
            }
            this.model.set(this.grown, this.open, this.flap, this.flex);
        }
    }

    _hurt(n) {
        const g = this.game, c = g.combat;
        if (g.isDeadLocal || c?.dead) return;
        if (c?.enabled) {
            c.hp = Math.max(0, (c.hp ?? 0) - WINGS.PAIN * n);
            c._hudKey = '';
            g.hud?.damageFlash?.();
            if (c.hp <= 0) { c.die(null, 'wingsGrow'); return; }
        } else if (g.config?.mode !== 'creative') g.damageLocalPlayer?.(WINGS.PAIN * n, 'wingsGrow');
    }

    /** The bar at the bottom: «🪽 Крылья растут — 37 %» (k < 0: hidden). */
    _showBar(k) {
        if (typeof document === 'undefined') return;
        let el = this._bar;
        if (!el && k >= 0) {
            el = this._bar = document.createElement('div');
            el.id = 'wings-grow';
            el.innerHTML = '<div class="wg-cap">🪽 Крылья растут</div><div class="wg-track"><div class="wg-fill"></div></div>';
            document.body.appendChild(el);
        }
        if (!el) return;
        el.style.display = k >= 0 ? 'block' : 'none';
        if (k >= 0) {
            const p = Math.round(k * 100);
            if (p !== this._barP) { this._barP = p; el.querySelector('.wg-fill').style.width = p + '%'; el.querySelector('.wg-cap').textContent = `🪽 Крылья растут — ${p}%`; }
        }
    }

    /** For my pose packet: [grown, open, flap, flex] ×100 (nothing without wings). */
    net() {
        if (!(this.grown > 0) || this.hidden) return undefined;
        const r = (v) => Math.round(v * 100);
        return [r(this.grown), r(this.open), r(this.flap), r(this.flex)];
    }

    snapshot() { return this.grown > 0 || this.t != null ? { g: Math.round(this.grown * 1000) / 1000, t: this.t == null ? null : Math.round(this.t) } : null; }
    restore(s) {
        if (!s) return;
        this.grown = Math.max(0, Math.min(1, +s.g || 0));
        this.t = s.t == null ? null : Math.max(0, +s.t || 0);
        if (this.t != null) this._said = WINGS.SAY_AT.filter((x) => this.grown >= x).length;
        if (this.grown > 0) this._ensure();
    }
}
