/**
 * ArenaDollsFx.js — the three dolls by the arena's steward (the author: «он как продавец… такие куколки: младший, средний, сильный;
 * с главой башни сразиться нельзя»). A doll is a wizard of that rank in his robe, standing still on a little round stone
 * with a sign over his hat: «Младший · 50 монет» / «Средний · 100» / «Сильный преподаватель · 150». The player chooses whom to fight
 * by the hand on a doll (ArenaDuels._signUp) or by the word to the steward. Only the arenas near the hero have them (made once,
 * taken away when he is far — nothing builds up); the people of the models are the same shapes as the tower's (shared geometries).
 */
import * as THREE from 'three';
import { VillagerModel, villagerLook, VILLAGER_FOOT_OFFSET } from '../entities/VillagerModel.js';
import { TIERS, dollSpots } from '../game/ArenaSteward.js';
import { RANK_COLOR } from '../game/ArenaTag.js';

const LOOKS = {
    novice: { role: 'student', rank: 'novice', dress: 0x2f7a3e, hat: 0x246230 },
    adept: { role: 'student', rank: 'adept', dress: 0x2c4f9e, hat: 0x213f80 },
    teacher: { role: 'teacher', rank: 'teacher', dress: 0xb25a1f, hat: 0x8f4617 },
};
const FAR = 90; // m: the dolls are made when the hero is nearer than this, and taken away at twice of it
const _signTex = new Map();

function signTexture(tier) {
    if (_signTex.has(tier)) return _signTex.get(tier);
    const T = TIERS[tier], c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const x = c.getContext('2d'), col = RANK_COLOR[tier === 'teacher' ? 'teacher' : tier] || '#ffd36e';
    x.fillStyle = 'rgba(14,10,28,0.78)'; x.strokeStyle = col; x.lineWidth = 7;
    x.beginPath(); x.roundRect(6, 6, 500, 148, 26); x.fill(); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = col; x.font = 'bold 56px sans-serif'; x.fillText(T.ru, 256, 54);
    x.fillStyle = '#ffe28a'; x.font = 'bold 40px sans-serif'; x.fillText(`за победу ${T.coins} монет`, 256, 112);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    _signTex.set(tier, tex);
    return tex;
}

let _stone = null, _stoneMat = null;

export class ArenaDollsFx {
    constructor(game) {
        this.game = game;
        this.sets = new Map(); // arena id → {group, models: []}
    }

    /** `arenas`: the arenas near the hero ({id, def}); the dolls follow them. */
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
        const group = new THREE.Group(), models = [];
        group.name = 'arena-dolls';
        if (!_stone) { _stone = new THREE.CylinderGeometry(1.1, 1.3, 0.35, 20); _stoneMat = new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 0.9 }); }
        const S = A.def.desk.stand;
        for (const d of dollSpots(A.def)) {
            const L = LOOKS[d.tier];
            const look = villagerLook(((S.x * 31 + S.z * 17) | 0) + d.tier.length * 7, L.role, d.tier === 'adept', { castleColor: A.def.color });
            Object.assign(look, { rank: L.rank, dress: true, dressColor: L.dress, shirt: L.dress, pants: 0x2a2030, hatColor: L.hat, hat: 'wizard', tool: 'wand', wizard: true });
            const model = new VillagerModel(look, { castleColor: A.def.color });
            const yaw = Math.atan2(-(S.x - A.def.x), -(S.z - A.def.z));
            model.group.position.set(d.x, d.y + 0.35 + VILLAGER_FOOT_OFFSET, d.z);
            model.group.rotation.y = yaw;
            model.update(0, { mode: 'idle' });
            group.add(model.group);
            models.push(model);
            const stone = new THREE.Mesh(_stone, _stoneMat);
            stone.position.set(d.x, d.y + 0.17, d.z);
            group.add(stone);
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.31), new THREE.MeshBasicMaterial({ map: signTexture(d.tier), transparent: true, depthWrite: false }));
            sign.position.set(d.x, d.y + 6.9, d.z);
            sign.userData.billboard = true;
            group.add(sign);
            models.push({ sign });
        }
        this.game.scene.add(group);
        return { group, models };
    }

    _drop(set) {
        this.game.scene.remove(set.group);
        for (const m of set.models) { m.sign ? (m.sign.geometry.dispose(), m.sign.material.dispose()) : m.dispose?.(); }
    }

    /** The signs turn to the camera (every frame — three planes). */
    face() {
        const cam = this.game.camera?.position;
        if (!cam) return;
        for (const set of this.sets.values()) for (const m of set.models) if (m.sign) m.sign.rotation.y = Math.atan2(cam.x - m.sign.position.x, cam.z - m.sign.position.z);
    }

    dispose() { for (const set of this.sets.values()) this._drop(set); this.sets.clear(); }
}
