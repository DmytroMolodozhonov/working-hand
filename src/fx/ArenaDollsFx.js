/**
 * ArenaDollsFx.js — the three small figures on the arena steward's counter (the author: «как крытый рынок/прилавок продавца, а вместо товаров —
 * МАЛЕНЬКИЕ ФИГУРКИ волшебников (не во весь рост), подписанные: младший / средний / сильный… сейчас они накладываются друг на друга»).
 * A figure is a wizard of that rank in his robe, ONE METRE tall (a hero is 3,5 m: the model at a 0,29 scale), standing on a little round
 * base; over it a plate: the rank, the stake and the prize («Младший · ставка 50 · победа 100»). The three stand at their own points 1,6 m apart
 * (ArenaSteward.dollSpots: the slots on the counter, DuelArenas.entries — or, in an older world, on little stones by the steward) and the plates
 * are 1,3 m wide: nothing lies on anything. The player chooses with the hand on a figure (ArenaDuels._signUp) or by the word to the steward;
 * the figure the wand points at is lit (`glow`). Only the arenas near the hero have them (made once, taken away when he is far — nothing builds
 * up); the people of the models are the same shapes as the tower's (shared geometries), the signs are cached by the tier.
 */
import * as THREE from 'three';
import { VillagerModel, villagerLook, VILLAGER_FOOT_OFFSET } from '../entities/VillagerModel.js';
import { TIERS, FIG, dollSpots } from '../game/ArenaSteward.js';
import { RANK_COLOR } from '../game/ArenaTag.js';

const LOOKS = {
    novice: { role: 'student', rank: 'novice', dress: 0x2f7a3e, hat: 0x246230 },
    adept: { role: 'student', rank: 'adept', dress: 0x2c4f9e, hat: 0x213f80 },
    teacher: { role: 'teacher', rank: 'teacher', dress: 0xb25a1f, hat: 0x8f4617 },
};
const FAR = 90; // m: the figures are made when the hero is nearer than this, and taken away at twice of it
export const FIG_SCALE = FIG.H / 3.5; // (a hero is 3,5 m; the figure a metre)
export const SIGN = { W: 1.3, H: 0.65, GAP: 0.35 }; // m: the plate (narrower than the 1,6 m between two figures) and its distance over the figure's head
const _signTex = new Map();

function signTexture(tier) {
    if (_signTex.has(tier)) return _signTex.get(tier);
    const T = TIERS[tier], c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const x = c.getContext('2d'), col = RANK_COLOR[tier] || '#ffd36e';
    x.fillStyle = 'rgba(14,10,28,0.82)'; x.strokeStyle = col; x.lineWidth = 8;
    x.beginPath(); x.roundRect(6, 6, 500, 244, 28); x.fill(); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = col; x.font = 'bold 74px sans-serif'; x.fillText(T.ru, 256, 58);
    x.fillStyle = '#f4ecd0'; x.font = 'bold 48px sans-serif'; x.fillText(`ставка ${T.coins}`, 256, 142);
    x.fillStyle = '#ffe28a'; x.font = 'bold 48px sans-serif'; x.fillText(`победа ${T.coins * 2}`, 256, 205);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    _signTex.set(tier, tex);
    return tex;
}

let _geo = null;
function shared() {
    return _geo || (_geo = {
        stone: new THREE.CylinderGeometry(0.55, 0.65, 0.35, 20), stoneMat: new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 0.9 }),
        base: new THREE.CylinderGeometry(0.3, 0.34, 0.07, 18), baseMat: new THREE.MeshStandardMaterial({ color: 0x5a3b8c, roughness: 0.6, metalness: 0.2 }),
        plate: new THREE.PlaneGeometry(SIGN.W, SIGN.H),
        ring: new THREE.RingGeometry(0.34, 0.46, 28).rotateX(-Math.PI / 2), ringMat: new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.85, depthWrite: false }),
    });
}

export class ArenaDollsFx {
    constructor(game) {
        this.game = game;
        this.sets = new Map(); // arena id → {group, models: [], figs: Map(tier → {sign, ring})}
        this.lit = new Map(); // arena id → the tier lit (the wand points at it / a hand is on it)
    }

    /** `arenas`: the arenas near the hero ({id, def}); the figures follow them. */
    update(arenas) {
        const g = this.game, me = g.character?.group?.position;
        if (!me) return;
        const seen = new Set();
        for (const A of arenas) {
            const S = A.def?.desk?.stand;
            if (!S || A.def.practice) continue;
            const d = Math.hypot(S.x - me.x, S.z - me.z);
            const have = this.sets.get(A.id);
            if (d < FAR && !have) { this.sets.set(A.id, this._make(A)); }
            if (have && d <= FAR * 2) seen.add(A.id);
            if (!have && d < FAR) seen.add(A.id);
        }
        for (const [id, set] of this.sets) if (!seen.has(id)) { this._drop(set); this.sets.delete(id); }
    }

    _make(A) {
        const group = new THREE.Group(), models = [], figs = new Map(), G = shared();
        group.name = 'arena-dolls';
        const S = A.def.desk.stand;
        for (const d of dollSpots(A.def)) {
            const L = LOOKS[d.tier];
            const look = villagerLook(((S.x * 31 + S.z * 17) | 0) + d.tier.length * 7, L.role, d.tier === 'adept', { castleColor: A.def.color });
            Object.assign(look, { rank: L.rank, dress: true, dressColor: L.dress, shirt: L.dress, pants: 0x2a2030, hatColor: L.hat, hat: 'wizard', tool: 'wand', wizard: true });
            const model = new VillagerModel(look, { castleColor: A.def.color });
            const lift = d.onCounter ? 0.07 : 0.35; // (a base on the counter, a stone on the ground)
            model.group.scale.setScalar(FIG_SCALE);
            model.group.position.set(d.x, d.y + lift + VILLAGER_FOOT_OFFSET * FIG_SCALE, d.z);
            model.group.rotation.y = d.yaw;
            model.update(0, { mode: 'idle' });
            group.add(model.group);
            models.push(model);
            const base = new THREE.Mesh(d.onCounter ? G.base : G.stone, d.onCounter ? G.baseMat : G.stoneMat);
            base.position.set(d.x, d.y + lift / 2, d.z);
            group.add(base);
            const top = d.y + lift + FIG.H;
            const sign = new THREE.Mesh(G.plate, new THREE.MeshBasicMaterial({ map: signTexture(d.tier), transparent: true, depthWrite: false }));
            sign.position.set(d.x, top + SIGN.GAP + SIGN.H / 2, d.z);
            group.add(sign);
            const ring = new THREE.Mesh(G.ring, G.ringMat);
            ring.position.set(d.x, d.y + lift + 0.04, d.z);
            ring.visible = false;
            group.add(ring);
            figs.set(d.tier, { sign, ring, x: d.x, y: d.y, z: d.z });
        }
        this.game.scene.add(group);
        return { group, models, figs };
    }

    _drop(set) {
        this.game.scene.remove(set.group);
        for (const m of set.models) m.dispose?.();
        for (const f of set.figs.values()) f.sign.material.dispose(); // (the plate's geometry and the rest are shared)
    }

    /** Light the figure of `tier` (null — none) at the arena: its ring glows, its plate grows a little. */
    glow(arenaId, tier) { this.lit.set(arenaId, tier || null); }

    /** The plates turn to the camera, the lit figure's ring turns (every frame — three planes). */
    face() {
        const cam = this.game.camera?.position;
        if (!cam) return;
        const t = performance.now() / 1000;
        for (const [id, set] of this.sets) {
            const lit = this.lit.get(id);
            for (const [tier, f] of set.figs) {
                f.sign.rotation.y = Math.atan2(cam.x - f.sign.position.x, cam.z - f.sign.position.z);
                const on = tier === lit;
                f.ring.visible = on;
                if (on) f.ring.rotation.y = t * 1.5;
                f.sign.scale.setScalar(on ? 1.12 : 1);
            }
        }
    }

    /** → the figures of the arena near the hero as {tier, x, y, z} (for the tests / the touch). */
    figures(arenaId) { const s = this.sets.get(arenaId); return s ? [...s.figs.entries()].map(([tier, f]) => ({ tier, x: f.x, y: f.y, z: f.z })) : []; }

    dispose() { for (const set of this.sets.values()) this._drop(set); this.sets.clear(); }
}
