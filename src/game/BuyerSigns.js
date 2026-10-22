/**
 * BuyerSigns.js — the «Скупка» plaque over the counter of the pawnshop (wizards' settlement) and the shady
 * buyer's plaque in a town (signSpec in BuyerDeal.js has the sizes). One shared geometry per part, one
 * texture + material per kind (made once); a plaque is built when its stall is near and hidden far off.
 */
import * as THREE from 'three';
import { signSpec } from './BuyerDeal.js';

const SHOW = 40, BUILD = 60;
let _shared = null;

function paint(kind) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = kind === 'pawn' ? 256 : 224;
    const x = c.getContext('2d');
    x.textAlign = 'center';
    if (kind === 'pawn') {
        x.fillStyle = '#4a2c12'; x.fillRect(0, 0, 512, 256);
        x.strokeStyle = '#d9a93a'; x.lineWidth = 12; x.strokeRect(10, 10, 492, 236);
        x.fillStyle = '#f5d36a'; x.font = 'bold 112px sans-serif'; x.fillText('СКУПКА', 256, 140);
        x.fillStyle = '#f3e3b0'; x.font = '38px sans-serif'; x.fillText('покупаем любые вещи', 256, 205);
    } else {
        x.fillStyle = '#2a2622'; x.fillRect(0, 0, 512, 224);
        x.strokeStyle = '#6d6455'; x.lineWidth = 8; x.strokeRect(6, 6, 500, 212);
        x.fillStyle = '#cfc4ad'; x.font = 'bold 54px sans-serif'; x.fillText('Скупаю вещи.', 256, 98);
        x.fillText('Без вопросов.', 256, 168);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

function shared() {
    if (_shared) return _shared;
    const mk = (kind) => {
        const edge = new THREE.MeshBasicMaterial({ color: kind === 'pawn' ? 0x4a2c12 : 0x2a2622 });
        const face = new THREE.MeshBasicMaterial({ map: paint(kind) });
        return [edge, edge, edge, edge, face, edge]; // (box faces: +x −x +y −y +z −z → the text on +z)
    };
    _shared = { box: new THREE.BoxGeometry(1, 1, 1), mats: { pawn: mk('pawn'), fence: mk('fence') }, chain: new THREE.MeshBasicMaterial({ color: 0x3a3a3a }) };
    return _shared;
}

export class BuyerSigns {
    constructor(game) { this.game = game; this.map = new Map(); }

    /** One sample of each plaque (Game.prewarm: their shaders compiled on the loading screen). */
    sampleModels() {
        const S = shared();
        return ['pawn', 'fence'].map((k) => new THREE.Mesh(S.box, S.mats[k]));
    }

    /** The plaque of a stall (key `id:sN`), built once. */
    _make(spec) {
        const S = shared();
        const g = new THREE.Group();
        const board = new THREE.Mesh(S.box, S.mats[spec.kind]);
        board.scale.set(spec.w, spec.h, 0.1);
        g.add(board);
        const len = Math.max(0.2, spec.top - (spec.y + spec.h / 2));
        for (const sx of [-1, 1]) {
            const ch = new THREE.Mesh(S.box, S.chain);
            ch.scale.set(0.06, len, 0.06);
            ch.position.set(sx * (spec.w / 2 - 0.2), spec.h / 2 + len / 2, 0);
            g.add(ch);
        }
        g.position.set(spec.x, spec.y, spec.z);
        g.rotation.y = spec.yaw;
        g.userData.shared = true;
        return g;
    }

    update(castles) {
        const g = this.game;
        if (!g.scene) return;
        const me = g.character.group.position;
        let built = 0;
        for (const cs of castles) {
            cs.def.stalls?.forEach((stall, i) => {
                if (!stall.pawn && !stall.fence) return;
                const key = cs.def.id + ':s' + i;
                const spec = signSpec(stall);
                if (!spec) return;
                const d = Math.hypot(spec.x - me.x, spec.z - me.z);
                let e = this.map.get(key);
                if (!e) {
                    if (d > BUILD || built) return;
                    built++;
                    e = this._make(spec);
                    g.scene.add(e);
                    this.map.set(key, e);
                }
                e.visible = d < SHOW;
            });
        }
        // (a castle that went away takes its plaque with it)
        for (const [key, m] of this.map) {
            const id = key.slice(0, key.lastIndexOf(':s'));
            if (!castles.some((cs) => cs.def.id === id)) { g.scene.remove(m); this.map.delete(key); }
        }
    }
}
