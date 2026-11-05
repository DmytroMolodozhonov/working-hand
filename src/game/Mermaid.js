/**
 * Mermaid.js — «Зелье русалки» (the author 05.11: «Русалка (12 мин): хвост, дышит под водой, ×2 скорость при «рыбьих» движениях с
 * поднятыми руками, не ходит; «стоп» не снимает: хвост магического водного существа + груша Баксади»). The effect's clock is
 * PotionEffects ('mermaid', 12 min — «Обнуление» and death end it, «стоп» does not: it is no spell); here is what it does:
 *   - the legs are gone: a fish's tail grows from the hips (the model below), seen by everyone (the pose packet's px bit 8);
 *   - under the water the air never runs out (Swimming);
 *   - in the water: the arms raised together over the head and the body waving (the hands going up and down together, the way a
 *     fish swims) — the tail drives the body on up to twice the swimmer's top speed (TAIL); the arms' strokes push as always;
 *   - on the land: it does not walk — it drags itself slowly on the tail (LAND_K of the walking pace), no jumping;
 *   - the tail sweeps up and down in the water, faster the faster it swims; out of the water it lies still and only twitches.
 * What may go wrong: drunk on a horse / a broom / in flight — the tail is there, the riding goes on (no walking is the only rule); in the
 * dragon's form — the dragon goes on (the tail shows when he is a man again, if the time is left); dead — it ends (PotionEffects).
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from './AnimalModels.js';
import { finGeo } from './SeaModels.js';
import { SWIM } from './SwimStroke.js';

export const MERMAID = {
    LAND_K: 0.18, // × the walking pace on the land (it drags itself)
    TAIL_MAX: 2, // × the swimmer's top speed with the tail
    THRUST: 3.2, // m/s² the tail adds while the fish's movement goes on
    WAVE: 0.55, // m/s: the raised hands going up and down together at least this fast — the fish's movement
    LEN: 2.25, // m from the hips to the fluke's root (the legs were 1.95)
};

let _tailMats = null;
function mats() {
    if (_tailMats) return _tailMats;
    const scales = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, shininess: 70, specular: 0x8fd8ff });
    const fin = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: new THREE.Color(0x1b6f8a), emissiveIntensity: 0.25 });
    _tailMats = { scales, fin };
    return _tailMats;
}

/** The scales: rows of overlapping scales (a darker rim on each), teal to green along the tail, a play of violet, the belly paler. */
function scalePaint(t, ang) {
    const row = t * 46, col = ang * 7 + (Math.floor(row) % 2) * 0.5;
    const fx = row - Math.floor(row), fy = col - Math.floor(col);
    const rim = Math.max(Math.abs(fx - 0.5), Math.abs(fy - 0.5)) * 2; // (0 the middle of a scale … 1 its edge)
    let c = K.mix([0.12, 0.62, 0.66], [0.16, 0.58, 0.34], t);
    c = K.mix(c, [0.45, 0.33, 0.78], 0.25 * (0.5 + 0.5 * Math.sin(t * 9 + ang * 2)));
    c = K.mix(c, [0.62, 0.86, 0.84], 0.4 * Math.max(0, -Math.sin(ang))); // (the belly paler)
    const k = 1.08 - 0.32 * rim * rim;
    return [c[0] * k, c[1] * k, c[2] * k];
}

/** The tail on a character (its legs hidden): {set(on, sweep), dispose()}. */
export function attachTail(character) {
    const g = character?.group;
    if (!g) return null;
    const { scales, fin } = mats();
    const root = new THREE.Group();
    root.name = 'mermaidTail';
    const L = MERMAID.LEN;
    // the tail: from the hips (wide as them) narrowing down to the fluke, a little forward then back like a fish's body
    const tail = K.mesh(root, K.cached('mermaidTail', () => {
        const k = K.keys([[0, 0.42, 0.3, 0], [0.18, 0.4, 0.3, 0.02], [0.45, 0.3, 0.24, 0.03], [0.75, 0.17, 0.14, 0.01], [1, 0.07, 0.06, 0]]);
        return K.sweep([K.v3(0, 0.15, 0), K.v3(0, -L * 0.35, 0.06), K.v3(0, -L * 0.7, -0.02), K.v3(0, -L, 0.04)], (t) => k(t), { rings: 30, sides: 22, color: scalePaint, side: new THREE.Vector3(1, 0, 0) });
    }), scales);
    tail.name = 'tailBody';
    // the fluke (a lower part that bends), wide and veined, translucent at its edge
    const low = new THREE.Group();
    low.position.set(0, -L * 0.62, 0.0);
    root.add(low);
    const fluke = K.mesh(low, finGeo('mermaidFluke', [[0, 0.1], [0.25, -0.05], [0.62, -0.42], [0.72, -0.72], [0.4, -0.55], [0.08, -0.5], [0, -0.42], [-0.08, -0.5], [-0.4, -0.55], [-0.72, -0.72], [-0.62, -0.42], [-0.25, -0.05]], 0.03,
        (x, y, e) => K.mix([0.2, 0.7, 0.72], [0.75, 0.97, 0.95], Math.min(1, e * 1.1)).map((v, i) => v * (0.92 + 0.08 * Math.sin(Math.atan2(y, x) * 18 + i)))), fin, 0, -L * 0.38, 0);
    fluke.rotation.x = -0.15;
    // little fins at the hips
    for (const s of [1, -1]) {
        const f = K.mesh(root, finGeo('mermaidSide', [[0, 0], [0.18, -0.08], [0.3, -0.3], [0.12, -0.24], [0, -0.12]], 0.02, (x, y, e) => K.mix([0.22, 0.68, 0.7], [0.7, 0.95, 0.95], e)), fin, 0.33 * s, -0.25, 0.05);
        f.scale.x = s;
        f.rotation.y = 0.4 * s;
    }
    root.position.set(0, 0, 0);
    g.add(root);
    const legs = [character.leftLegPivot, character.rightLegPivot].filter(Boolean);
    return {
        root,
        set(on, sweep = 0) {
            root.visible = on;
            for (const l of legs) l.visible = !on;
            root.rotation.x = 0.25 * sweep;
            low.rotation.x = 0.55 * sweep;
        },
        dispose() { root.parent?.remove(root); for (const l of legs) l.visible = true; },
    };
}

export class Mermaid {
    constructor(game) {
        this.game = game;
        this.tail = null;
        this.ph = 0;
        this._hy = null;
        this.wave = 0;
    }

    get active() { return !!this.game.potionFx?.has?.('mermaid'); }

    /** Every frame: the tail on / off, its sweep; on the land — the slow drag. */
    update(dt) {
        const g = this.game, ch = g.character;
        if (!ch) return;
        const on = this.active && !g.dragonForm?.active;
        if (on && !this.tail) { this.tail = attachTail(ch); g.hud?.setVoice?.('🧜 Вместо ног — хвост! В воде поднимите руки над головой и двигайтесь волной, как рыба', true); }
        if (!on) { if (this.tail) { this.tail.dispose(); this.tail = null; } return; }
        const swimming = !!ch.swimming;
        const sp = swimming ? (g.swim?.motion?.speed || 0) : 0;
        this.ph += dt * (swimming ? 2 + sp * 1.6 : 0.8);
        this.tail.set(true, swimming ? Math.sin(this.ph) * (0.35 + 0.15 * Math.min(1, sp / 4)) : 0.06 * Math.sin(this.ph * 3));
        // on the land: no walking — it drags itself
        if (!swimming && ch.swimY == null) { ch.speedScale = MERMAID.LAND_K; ch.jumpAir = false; }
    }

    /** In the water (Swimming._swim calls it): the fish's movement with the arms raised — the tail drives the body on. */
    swim(M, dt) {
        const g = this.game, ch = g.character;
        const up = ch.areBothHandsUp?.() || false;
        const v = ch.handRelVelocity;
        const vy = v ? (Math.abs(v.left?.y || 0) + Math.abs(v.right?.y || 0)) / 2 : 0;
        this.wave += ((up ? vy : 0) - this.wave) * Math.min(1, dt * 3);
        const max = SWIM.MAX_SPEED * MERMAID.TAIL_MAX;
        if (up && this.wave > MERMAID.WAVE) M.speed = Math.min(max, M.speed + MERMAID.THRUST * Math.min(2, this.wave / MERMAID.WAVE) * dt);
        else if (up) M.speed = Math.min(max, M.speed * Math.exp(SWIM.DRAG * 0.6 * dt)); // (streamlined, the arms up: it glides on longer)
        if (up && M.speed > 1) M.sinceStroke = 0;
    }
}
