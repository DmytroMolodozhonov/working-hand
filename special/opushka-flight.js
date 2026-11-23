import { HERO_FLY, wingStep } from '../src/game/WingFlight.js';
import { FlapReader } from '../src/game/ImperiusFlight.js';

const FLIGHT = { ...HERO_FLY, takeoff: 2.5, maxFwd: 16, maxUp: 7 };
const bound = (v, min, max) => Math.min(max, Math.max(min, v));

export class OpushkaFlight {
    constructor() {
        this.state = { air: false, vf: 0, vy: 0, since: 0 };
        this.reader = new FlapReader();
        this.last = null;
        this.high = -Infinity;
        this.flap = 0;
    }

    step(dt, now, input) {
        const { pose, at, ground, pitch, alt, blocked, boost } = input;
        if (blocked) {
            this.land();
            this.reader.reset();
            this.last = null;
            this.high = -Infinity;
            return this.state;
        }
        let stroke = boost ? 1 : 0, arms = '';
        if (pose?.leftWrist && pose.rightWrist && pose.leftShoulder && pose.rightShoulder && now - at < 600) {
            const left = pose.leftWrist.y - pose.leftShoulder.y, right = pose.rightWrist.y - pose.rightShoulder.y;
            if (left < -0.035 && right < -0.035) this.high = at;
            if (left > 0.2 && right > 0.2) arms = 'down';
            else if (Math.abs(left) < 0.16 && Math.abs(right) < 0.16 &&
                Math.abs(pose.leftWrist.x - pose.leftShoulder.x) > 0.10 && Math.abs(pose.rightWrist.x - pose.rightShoulder.x) > 0.10) arms = 'spread';
            if (this.last && at > this.last.at) {
                const seconds = (at - this.last.at) / 1000;
                if (seconds < 0.3) {
                    const effect = this.reader.update(seconds, { y: 3 * (this.last.left - left) / seconds }, { y: 3 * (this.last.right - right) / seconds });
                    if (this.state.air || at - this.high < 700) stroke = Math.max(stroke, effect);
                } else this.reader.reset();
            }
            this.last = { at, left, right };
        } else {
            this.last = null;
            this.reader.reset();
        }
        if (stroke) this.flap = 1;
        else this.flap = Math.max(0, this.flap - dt * 2.8);
        return wingStep(this.state, FLIGHT, { stroke, arms, alt, dive: bound(-pitch * 0.9, -1, 1),
            ground: boost ? Math.max(ground, FLIGHT.takeoff) : ground }, dt);
    }

    land() {
        this.state.air = false;
        this.state.vy = 0;
        this.state.vf = 0;
    }
}
