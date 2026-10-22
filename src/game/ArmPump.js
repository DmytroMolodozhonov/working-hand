/**
 * ArmPump.js — running with the arms, as a sprinter does: the two hands swinging back and forth IN TURN
 * (one forward and up while the other goes back and down), over and over. The author: «you can run up to
 * 40% faster if you work your arms … it depends on how fast you move them … but only while the legs run».
 *
 *   - pumping: each arm has turned back at least FLIPS times lately, and the two move against each other
 *     (one arm waving, a spell cast, a bow drawn, a sword's swing, both arms together — a swim stroke — never);
 *   - bonus: 0 … MAX by how fast the arms go, only while the legs run; it grows and fades smoothly.
 * Pure logic: the hands' speeds against the body (Character.handRelVelocity — x right, y up, z back).
 */

export const ARM_RUN = {
    MAX: 0.4, // +40% at most
    MOVE: 1.2, // a hand moving at least this fast (forward-up / back-down) has a direction (slower: no turn counted)
    FLIPS: 3, // turns of each arm within …
    FLIP_MS: 1500, // … this long (a throw's wind-up and swing turn twice at most)
    FROM: 1.5, // the arms' swing speed (against each other) where the bonus starts …
    FULL: 6, // … and where it is all of MAX
    RATE: 0.6, // the bonus changes this much a second at most (no jump in the speed)
    EASE: 2.5, // 1/s: how fast the swing's speed is measured (smoothing)
};

const SIDES = ['left', 'right'];

export class ArmPump {
    constructor() { this.reset(); }

    reset() {
        this.t = 0;
        this.e = 0; // smoothed −(left swing × right swing): positive when the arms go against each other
        this.dir = { left: 0, right: 0 };
        this.flips = { left: [], right: [] };
        this.speed = 0;
        this.pumping = false;
        this.bonus = 0;
    }

    /**
     * @param {number} dt s
     * @param {{x,y,z}|null} vL, vR  the hands' speeds against the body (null: that hand is gone)
     * @param {boolean} running  the legs run (the camera's run)
     * @returns {number} the bonus (0 … MAX): the run's speed × (1 + bonus)
     */
    update(dt, vL, vR, running) {
        if (!(dt > 0)) return this.bonus;
        this.t += dt * 1000;
        // the swing along forward-up / back-down (a runner's hand goes forward and up, back and down)
        const sL = vL ? vL.y - vL.z : 0, sR = vR ? vR.y - vR.z : 0;
        this.e += (-(sL * sR) - this.e) * Math.min(1, dt * ARM_RUN.EASE);
        const s = { left: sL, right: sR };
        let turns = Infinity;
        for (const side of SIDES) {
            const f = this.flips[side];
            if (Math.abs(s[side]) > ARM_RUN.MOVE) {
                const d = Math.sign(s[side]);
                if (this.dir[side] && d !== this.dir[side]) { f.push(this.t); if (f.length > 8) f.shift(); }
                this.dir[side] = d;
            }
            while (f.length && this.t - f[0] > ARM_RUN.FLIP_MS) f.shift();
            turns = Math.min(turns, f.length);
        }
        this.speed = Math.sqrt(Math.max(0, this.e));
        this.pumping = turns >= ARM_RUN.FLIPS && this.speed > ARM_RUN.FROM;
        const k = Math.max(0, Math.min(1, (this.speed - ARM_RUN.FROM) / (ARM_RUN.FULL - ARM_RUN.FROM)));
        const target = running && this.pumping ? ARM_RUN.MAX * k : 0;
        const step = ARM_RUN.RATE * dt;
        this.bonus += Math.max(-step, Math.min(step, target - this.bonus));
        return this.bonus;
    }
}
