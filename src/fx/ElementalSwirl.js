/**
 * ElementalSwirl.js — the elemental mage winds his element round himself (air, fire, water; the earth mage has his stones).
 *
 * The author 14.11: «Закручивать воду вокруг себя — это его основная функция. Маг огня тоже должен закручивать огонь вокруг себя. Маг воздуха тоже может закручивать воздух».
 * While a mage rests, coils, gathers or whirls, his element goes round him in a rising spiral: air in white wisps, fire in embers and flame, water in drops and strands.
 * Seen on every computer from one bit of the mage's `fx` (FX.SWIRL, set by the host's controller — ElementalMages.think), drawn from the shared particle pool: nothing new
 * to build, no light, a few particles a frame per mage, only the near ones.
 */
import { FX } from './WizardFx.js';

const NEAR = 50; // m: farther mages' swirls are not drawn
const LOOK = {
    // (14.11, the author: «недостаточно видно, что он владеет магией воздуха… микрочастицы, мини-листики, воздух искажается»: wisps, leaves and dust going up in the spiral, a ring of dust on the ground, big faint haze)
    air: { cols: [0xffffff, 0xdff3ff, 0xbfe6ff, 0x8fc24a, 0xb7d65c, 0xd9b66a, 0xa8895a], r: 1.9, up: 1.7, spin: 3.8, size: [0.12, 0.3], life: 0.95, n: 6, dust: true },
    fire: { cols: [0xff6a00, 0xffd27a, 0xff2a00, 0xffb030], r: 1.25, up: 2.2, spin: 3.2, size: [0.2, 0.4], life: 0.85, n: 4 },
    water: { cols: [0x6ec6ff, 0x9fdcff, 0xd8f2ff, 0x4aa8e8], r: 1.4, up: 0.9, spin: 4.0, size: [0.15, 0.3], life: 0.9, n: 4 },
};
export class ElementalSwirl {
    constructor(game) { this.game = game; this.t = 0; }
    /** The air mage's ground dust ring and faint haze: the air round him is seen to move. */
    _air(glow, v, fast) {
        for (let i = 0; i < 2; i++) {
            const a = this.t * 3.2 * fast + i * 3.14 + Math.random() * 0.6, r = 1.6 + Math.random() * 1.4;
            glow.spawn(v.x + Math.cos(a) * r, v.y + 0.15, v.z + Math.sin(a) * r, -Math.sin(a) * 4.5 * fast, 0.7 + Math.random() * 0.8, Math.cos(a) * 4.5 * fast, 0xcbbf9f, 0.22 + Math.random() * 0.3, 0.8, { shrink: 0.9 }); // (dust)
        }
        if (Math.random() < 0.7) {
            const a = Math.random() * 6.2832, r = 0.9 + Math.random() * 1.6;
            glow.spawn(v.x + Math.cos(a) * r, v.y + 0.5 + Math.random() * 3, v.z + Math.sin(a) * r, -Math.sin(a) * 2.2 * fast, 0.4, Math.cos(a) * 2.2 * fast, 0xeef6ff, 0.55 + Math.random() * 0.5, 1.0, { shrink: 0.5 }); // (a faint wide haze: the air itself)
        }
    }

    update(dt) {
        const g = this.game, glow = g.fx?.glow, L = g.castleLife, me = g.character?.group?.position;
        if (!glow || !L || !me) return;
        this.t += dt;
        for (const v of L.byId.values()) {
            const K = LOOK[v.element];
            if (!K || v.dead || !(v.fx & FX.SWIRL) || !v.group?.visible) continue;
            if (Math.hypot(v.x - me.x, v.z - me.z) > NEAR) continue;
            const fast = v.mode === 'airSpin' ? 2.2 : v.elemental?.recover ? 0.8 : 1;
            if (K.dust) this._air(glow, v, fast);
            const n = Math.max(1, Math.round(K.n * (v.mode === 'airSpin' ? 2.5 : 1)));
            for (let i = 0; i < n; i++) {
                const k = (this.t * 0.9 + i / n) % 1; // (a turn of the helix: the spawn point climbs and goes round)
                const a = this.t * K.spin * fast + i * (6.2832 / n) + Math.random() * 0.4;
                const h = 0.2 + k * 3.6, r = K.r * (1 + 0.25 * Math.sin(k * 6.2832 + this.t));
                const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r, y = v.y + h;
                const tang = K.spin * fast * r * 0.9;
                glow.spawn(x, y, z, -Math.sin(a) * tang, K.up * (0.6 + Math.random() * 0.8), Math.cos(a) * tang, K.cols[(Math.random() * K.cols.length) | 0],
                    K.size[0] + Math.random() * (K.size[1] - K.size[0]), K.life * (0.7 + Math.random() * 0.5), { shrink: 1.4 });
            }
        }
    }
}
