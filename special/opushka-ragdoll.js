import { DOLL, P, Ragdoll, makeSpec, restQuat } from '../src/game/Ragdoll.js';
import { fromRig, toRig, cleanRig } from '../src/game/RagdollPose.js';

const anchors = [
    [P.HEAD, 'head', [0, .075, .014]],
    [P.SHL, 'uaR'], [P.SHR, 'uaL'],
    [P.HIPL, 'thR'], [P.HIPR, 'thL'],
    [P.HNL, 'hdR'], [P.HNR, 'hdL'],
    [P.KNL, 'snR'], [P.FTL, 'ftR'], [P.KNR, 'snL'], [P.FTR, 'ftL'],
];
const links = [
    ['uaR', 'hdR', P.SHL, P.HNL], ['uaL', 'hdL', P.SHR, P.HNR],
    ['thR', 'snR', P.HIPL, P.KNL], ['snR', 'ftR', P.KNL, P.FTL],
    ['thL', 'snL', P.HIPR, P.KNR], ['snL', 'ftL', P.KNR, P.FTR],
];
let spec;
const delta = (a, b) => a.map((value, i) => value - b[i]);

function descriptor(rig, rest) {
    const points = anchors.map(([i, bone, off = [0, 0, 0]]) => [i, rig.B[bone], ...off]);
    spec ||= makeSpec({
        rest: anchors.map(([, name, off = [0, 0, 0]]) => rest[name].map((value, i) => value + off[i])),
        r: [.136, .095, .095, .105, .105, .073, .073, .085, .068, .085, .068],
        torsoR: [.154, .137, .109], faces: 1,
    });
    const limbs = links.map(([bone, end, from, to]) => ({ obj: rig.B[bone], from, to, rest: delta(rest[end], rest[bone]) }));
    const stiff = ['hips', 'spine', 'chest', 'head', 'faR', 'faL', 'hdL', 'hdR', 'ftL', 'ftR'].map(bone => rig.B[bone]);
    const head = { obj: rig.B.neck, rest: delta(spec.rest[P.HEAD], rest.neck) };
    return { root: () => rig.B.root, rootY: () => 0, hipLocal: [0, rest.thL[1], 0],
        restQ: restQuat(spec), points: () => points, limbs: () => limbs, stiff: () => stiff, head: () => head };
}

export function tumble(rig, rest, motion, direction, energy, grounded, dead) {
    if (rig.limp) {
        if(dead)rig.limp.doll.tone=0;
        if(rig.limp.recovering){
            rig.limp.recovering=false;
            rig.limp.doll.goal=null;
            rig.limp.doll.rise=null;
        }
        rig.limp.doll.push(direction.x * energy * .55, Math.min(2, energy * .18), direction.z * energy * .55);
        return;
    }
    const layout = descriptor(rig, rest), doll = new Ragdoll(spec);
    fromRig(doll, layout, rig);
    const lift=grounded?Math.min(.44,Math.max(0,motion.y)*.059):0;
    for(let i=1;i<doll.x.length;i+=3)doll.x[i]+=lift;
    doll.tone=dead?0:DOLL.TONE_LIVE;
    doll.launch(motion.x, motion.y, motion.z, .5);
    // The impact catches the torso before the feet, so a sideways hit tips the body over.
    const torque = DOLL.DT * Math.min(energy, 15);
    for (const i of [P.SHL, P.SHR, P.HEAD, P.FTL, P.FTR]) {
        const scale = i === P.FTL || i === P.FTR ? -.43 : .85;
        doll.o[i * 3] -= direction.x * torque * scale;
        doll.o[i * 3 + 2] -= direction.z * torque * scale;
    }
    rig.limp = { doll, layout, point: [0, 0, 0], feet: [0, 0, 0] };
}

export function stepLimp(rig, world, dt, state) {
    const { doll, point, feet } = rig.limp;
    doll.step(world, dt);
    doll.at(P.PELVIS, point);
    doll.at(P.FTL, feet);
    let bottom = feet[1];
    doll.at(P.FTR, feet);
    bottom = Math.min(bottom, feet[1], point[1]);
    state.pos.set(point[0], bottom - .068, point[2]);
    state.vel.set(0, 0, 0);
    state.vy = 0;
    state.grounded = doll.contacts > 0;
    if(rig.limp.recovering && doll.rise?.t >= DOLL.RISE_T - .001) standLimp(rig);
}

export function drawLimp(rig) {
    toRig(rig.limp.doll, rig.limp.layout, rig);
}

export function recoverLimp(rig, world, state) {
    if(!rig?.limp || rig.limp.recovering || !state.grounded)return;
    const floor=world.floor(state.pos.x,state.pos.z,state.pos.y+.2);
    const {fx,fz}=rig.limp.doll.standUp(state.pos.x,floor,state.pos.z,Math.sin(state.faceYaw),Math.cos(state.faceYaw));
    state.faceYaw=Math.atan2(fx,fz);
    rig.limp.recovering=true;
}

export function standLimp(rig) {
    if (!rig?.limp) return;
    cleanRig(rig.limp.layout, rig);
    rig.limp = null;
}

export function limpPose(rig, pos) {
    if (!rig?.limp) return undefined;
    const origin = [pos.x,pos.y,pos.z];
    return Array.from(rig.limp.doll.x,(v,i)=>Math.round((v-origin[i%3])*1000)/1000);
}

export function applyLimpPose(rig, rest, pos, pose, blend) {
    if (!rig.limp) {
        const layout=descriptor(rig,rest);
        rig.limp={doll:new Ragdoll(spec),layout};
        blend=1;
    }
    const origin=[pos.x,pos.y,pos.z], x=rig.limp.doll.x;
    for(let i=0;i<x.length;i++)x[i]+=(pose[i]+origin[i%3]-x[i])*blend;
}
