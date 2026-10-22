/**
 * Riders.js — the riders of the roads (a part of Travelers.js): a knight errant, an ordinary man or a
 * wizard going alone (or two together) right on a horse — not in a cart (the author: «одиночные рыцари
 * на конях. Или обычные жители на конях, или волшебники на конях — прямо на коне»).
 *
 * The horse is a real horse of the herds (Animals.js: its body, its collision, its health, everything
 * that hits / lifts / pushes / burns a horse — CreatureImpact, spells, blows, arrows, Levitation — works
 * on it); while it is ridden the rider leads it (`a.mount.on`: Animals does not think for it), round
 * the others (crowdStep) and round water, slopes, trees and walls (Carriages.wayFree).
 *
 * Who / what × how («на кого и на что»):
 *  - a blow, a spell, a blast, a push that throws the RIDER (his v.vy, a stun, Levitation) or the HORSE
 *    (its push, its stun, Levitation, its death) — the rider falls off (he lies a moment, stunned);
 *    the horse, frightened, runs off a little way;
 *  - attacked: a knight or a wizard gets down and fights on foot (CastleLife / WizardFight); an ordinary
 *    rider gallops away from the danger instead (back on his way when it is calm);
 *  - calm again: the rider walks to his horse and gets on; the horse dead or gone — on foot;
 *  - a player may take a free horse whose rider is down (Animals.tryMount: not one being ridden).
 * The host leads them; the guests see the horse (Animals net) and the rider in the saddle (mode 'ride').
 */

import * as THREE from 'three';
import { wayFree } from './Carriages.js';
import { crowdStep } from './CrowdSources.js';

export const RIDE = {
    WALK: 3.6, // m/s: a steady walk on the road
    RUN: 8.5, // m/s: an ordinary rider galloping away from trouble
    FLEE_T: 10, // s of galloping away
    SADDLE: 3.6, // m over the horse's origin: the top of the saddle
    SIDE: 1.6, // m to the side: where a rider gets down / falls
    REACH: 1.8, // m from the horse: gets back on
    FAR: 60, // m: a horse farther than this — he goes on foot
    THROWN_STUN: 1.4, // s lying after a fall
    AIM_T: 0.8, // s between looks for the way
};

const turn = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * Math.min(1, k); };

export class Riders {
    constructor(trav) {
        this.trav = trav;
        this.game = trav.game;
    }

    get life() { return this.game.castleLife; }

    /** A horse under rider `v` at (x, z), facing `yaw`. */
    mount(v, P, x, z, yaw) {
        const g = this.game, A = g.animals;
        if (!A?._spawn) return null;
        const y = (g.collision?.groundY ? g.collision.groundY(x, z) : 0) + 0.5;
        const a = A._spawn('horse', new THREE.Vector3(x, y, z), { yaw });
        if (!a) return null;
        a.mount = { v: v.id, party: P.id, on: true };
        (P.horses || (P.horses = [])).push(a);
        a.state = 'ridden'; a.tamed = null;
        if (a.model.userData.saddle) a.model.userData.saddle.visible = true;
        v.horse = a; v.job = 'ride'; v.seated = true; v.mode = 'ride';
        this._place(v, a);
        return a;
    }

    _place(v, a) {
        const p = a.group.position;
        v.x = p.x; v.z = p.z; v.y = p.y + RIDE.SADDLE; // (as on a cart's bench: v.y is the seat's top — Carriages.seatPos)
        v.yaw = a.group.rotation.y; v.speed = 0; v.mode = 'ride';
    }

    /** (host, every frame) The party's horses: thrown riders, the way, the others after the leader. */
    update(P, dt) {
        // (a rider gone — out of the world: his horse is a free horse now)
        if (P.horses?.length) P.horses = P.horses.filter((a) => { if (a.mount && !P.members.some((v) => v.horse === a)) { this._free(a); return false; } return !!a.mount; });
        const riders = P.members.filter((v) => v.horse);
        let lead = null;
        for (const v of riders) {
            const a = v.horse;
            if (v.job !== 'ride' || !v.seated) continue;
            if (v.dead || v.lev || v.vy || v.stunT > 0 || v.removable || a.dead || a.lev || a.vy || a.stunT > 0 || !a.mount?.on) { this.unseat(v, true); continue; }
            if (!lead) lead = v;
        }
        for (const v of riders) {
            if (v.job !== 'ride' || !v.seated) continue;
            const a = v.horse;
            let speed = 0, aim = a.group.rotation.y;
            if (P.fleeT > 0 && P.fleeFrom) {
                // an ordinary rider: away from the danger at a gallop
                aim = Math.atan2(-(v.x - P.fleeFrom.x), -(v.z - P.fleeFrom.z)) + Math.PI;
                aim = this._way(a, aim, RIDE.RUN, null) ?? aim;
                speed = RIDE.RUN;
            } else if (P.state === 'go') {
                if (v === lead) {
                    const left = Math.hypot(P.dest.x - v.x, P.dest.z - v.z);
                    if (left < P.dest.r) { this.trav._arrive(P); }
                    v.roadT = (v.roadT || 0) - dt;
                    if (v.roadT <= 0 || v.roadAim === undefined) { v.roadT = RIDE.AIM_T; v.roadAim = this._way(a, Math.atan2(-(P.dest.x - v.x), -(P.dest.z - v.z)), RIDE.WALK, P.dest.into); }
                    if (v.roadAim != null) { aim = v.roadAim; speed = RIDE.WALK; }
                } else if (lead) {
                    const k = riders.indexOf(v), fy = lead.horse.group.rotation.y;
                    const tx = lead.x + Math.sin(fy) * 5 * k + Math.cos(fy) * 1.6, tz = lead.z + Math.cos(fy) * 5 * k - Math.sin(fy) * 1.6;
                    const d = Math.hypot(tx - v.x, tz - v.z);
                    if (d > 0.8) { aim = Math.atan2(-(tx - v.x), -(tz - v.z)); speed = Math.min(RIDE.RUN, RIDE.WALK * (d > 6 ? 1.8 : 1)); }
                }
            }
            this._move(a, aim, speed, dt);
            this._place(v, a);
        }
        P.fleeT = Math.max(0, (P.fleeT || 0) - dt);
    }

    /** The way that is free ahead (the nearest to `aim`), or null. */
    _way(a, aim, speed, into) {
        const p = a.group.position, look = Math.max(8, speed * 2.2);
        for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2]) {
            const y = aim + off;
            if (wayFree(this.game, p.x, p.z, -Math.sin(y), -Math.cos(y), look, { half: 0.9, rise: 1.5, clear: 6, avoidLand: true, into }) >= look) return y;
        }
        return null;
    }

    /** The horse a step: turned to `aim`, round the others, on the ground, never through walls. */
    _move(a, aim, speed, dt) {
        const g = this.game, A = g.animals, p = a.group.position;
        a.group.rotation.y = turn(a.group.rotation.y, aim, dt * 3);
        let ux = -Math.sin(a.group.rotation.y), uz = -Math.cos(a.group.rotation.y);
        if (speed > 0) {
            const s = crowdStep(g, a, p, ux, uz, speed * dt + 2, { r: 1.1, speed, dt, look: 3 + speed * 0.4 });
            if (!s) speed = 0; else { ux = s.x; uz = s.z; }
        }
        const step = speed * dt;
        p.x += ux * step; p.z += uz * step;
        const gy = g.collision?.groundAt ? g.collision.groundAt(p.x, p.z, p.y + 1) : g.collision?.groundY?.(p.x, p.z) ?? p.y - 0.5;
        p.y += (gy + 0.5 - p.y) * Math.min(1, dt * 8);
        g.collision?.resolveCylinder?.(p, 0.7, p.y - 0.5, 2.5, 1.2);
        a.spd = speed; a.walkT += step * 1.6; a.pose = 0;
        A?._animate?.(a, Math.min(1, speed / 9), dt);
    }

    /** Off the horse: `thrown` — he falls beside it and lies a moment, the horse runs off a little. */
    unseat(v, thrown) {
        const a = v.horse, g = this.game;
        v.seated = false; v.job = 'road';
        if (a?.mount) a.mount.on = false;
        if (a && !a.dead) {
            const p = a.group.position, ry = a.group.rotation.y, side = v.idx % 2 ? 1 : -1;
            const x = p.x + Math.cos(ry) * RIDE.SIDE * side, z = p.z - Math.sin(ry) * RIDE.SIDE * side;
            if (!v.vy && !v.lev) { v.x = x; v.z = z; } // (from the saddle's height: he falls — CastleLife._fallStep)
            a.state = thrown ? 'flee' : 'graze'; a.stateT = thrown ? 4 : 0; a.spd = 0;
            a.target?.copy?.(p); a.idle = 'stand'; a.idleT = 4;
        }
        if (thrown && !v.dead) { v.stunT = Math.max(v.stunT || 0, RIDE.THROWN_STUN); if (!v.vy) v.vy = 1.5; }
        else if (!thrown && !v.dead && !v.vy) v.vy = 0.5; // (he jumps down)
        this.trav.log.push({ ev: thrown ? 'thrown' : 'down', id: v.id });
    }

    /** (host, Travelers.step) In the saddle: the place is kept by update; a fighter with a foe gets down. True: handled. */
    hold(v, P) {
        if (v.foe && (P.kind !== 'folkRider' || v.roadBrave)) { this.unseat(v, false); return false; }
        if (v.horse && v.seated) { this._place(v, v.horse); return true; }
        return false;
    }

    /** (host, Travelers.step) A rider on foot: back to his horse and up when it is calm; no horse — on foot. True: handled. */
    toHorse(v, P, dt) {
        const L = this.life, a = v.horse;
        if (!a || a.dead || a.rider || !a.mount || Math.hypot(a.group.position.x - v.x, a.group.position.z - v.z) > RIDE.FAR) {
            if (a?.mount) { a.mount = null; if (a.model.userData.saddle && !a.rider) a.model.userData.saddle.visible = false; }
            v.horse = null; return false; // (on foot from now on: Travelers.step)
        }
        if (P.state !== 'go') { v.speed = 0; v.mode = v.talking > 0 ? 'talk' : 'idle'; L._ground(v); return true; }
        const p = a.group.position;
        const d = L._steer(v, p.x, p.z, (v.walk || 2.3) * 1.2, dt, RIDE.REACH * 0.8);
        v.mode = v.speed > 0 ? 'walk' : 'idle';
        L._ground(v);
        if (d <= RIDE.REACH && !(a.stunT > 0) && !a.vy && !a.lev) {
            a.mount.on = true; a.state = 'ridden';
            v.job = 'ride'; v.seated = true;
            v.roadAim = undefined;
            this._place(v, a);
            this.trav.log.push({ ev: 'mounted', id: v.id });
        }
        return true;
    }

    /** (host) Trouble for the party: the fighters get down, an ordinary rider gallops away. */
    trouble(P, at) {
        for (const v of P.members) {
            if (v.dead || !v.horse || v.job !== 'ride' || !v.seated) continue;
            if (P.kind === 'folkRider' && !v.roadBrave) { if (at) { P.fleeFrom = { x: at.x, z: at.z }; P.fleeT = RIDE.FLEE_T; } }
            else this.unseat(v, false);
        }
    }

    /** No rider of the roads any more: a free horse (Animals leads it, and takes it away far off and unseen). */
    _free(a) {
        a.mount = null;
        if (!a.rider && a.model.userData.saddle) a.model.userData.saddle.visible = false;
        if (!a.dead && !a.rider) { a.state = 'graze'; a.target?.copy?.(a.group.position); }
    }

    /**
     * The party is gone (far off and unseen): a horse still under its rider goes with him; one standing
     * without him (he fell, he died) stays a free horse — nothing vanishes before anybody's eyes.
     */
    remove(P) {
        const A = this.game.animals;
        for (const a of P.horses || []) {
            if (a.mount?.on && !a.dead && !a.rider) A?._remove?.(a);
            else if (a.mount) this._free(a);
        }
        for (const v of P.members) v.horse = null;
        P.horses = [];
    }
}
