/**
 * ArenaBoardFx.js — the magic board of a duel arena: a hologram floating over the road by the steward's stall (ArenaBoard.js tells what
 * it says: the duel now and how long it may last, the queue, the result and the pay-out).
 *
 * Cheap (CLAUDE.md «Производительность»): ONE board per arena near the hero (made when he is within BOARD.SEE_R, taken away beyond twice of
 * it), a canvas texture drawn again only when the words change (the fight's minutes — once a second), a basic material (no light), shared
 * geometry; the plane turns to the camera about the vertical axis only.
 */
import * as THREE from 'three';
import { BOARD, boardView, boardKey } from '../game/ArenaBoard.js';

const COLORS = { gold: '#ffd36e', white: '#f2f6ff', green: '#8ff0a8', red: '#ff8a8a' };
let _plane = null;

function draw(ctx, view) {
    const W = 1024, H = 640;
    ctx.clearRect(0, 0, W, H);
    // the hologram panel: a dark glass, a cyan frame with cut corners, thin scan lines
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(10,26,48,0.88)'); g.addColorStop(1, 'rgba(18,10,44,0.88)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(40, 6); ctx.lineTo(W - 40, 6); ctx.lineTo(W - 6, 40); ctx.lineTo(W - 6, H - 40); ctx.lineTo(W - 40, H - 6); ctx.lineTo(40, H - 6); ctx.lineTo(6, H - 40); ctx.lineTo(6, 40); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6fe3ff'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(111,227,255,0.07)'; ctx.lineWidth = 2;
    for (let y = 14; y < H; y += 8) { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(W - 14, y); ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6fe3ff'; ctx.font = 'bold 54px sans-serif'; ctx.fillText(view.title, W / 2, 56);
    ctx.fillStyle = 'rgba(111,227,255,0.5)'; ctx.fillRect(60, 96, W - 120, 3);
    let y = 150;
    for (const h of view.head) { if (!h.text) continue; ctx.fillStyle = COLORS[h.color] || COLORS.white; ctx.font = 'bold 50px sans-serif'; ctx.fillText(h.text, W / 2, y, W - 80); y += 62; }
    y = Math.max(y + 14, 290);
    ctx.textAlign = 'left'; ctx.font = 'bold 40px sans-serif';
    if (view.queue.length) { ctx.fillStyle = '#9fb8ff'; ctx.fillText('Очередь:', 70, y); y += 52; ctx.fillStyle = COLORS.white; for (const q of view.queue) { ctx.fillText(q, 90, y, W - 160); y += 48; } }
    else { ctx.fillStyle = 'rgba(159,184,255,0.7)'; ctx.fillText('Очередь пуста', 70, y); }
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe28a'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(view.foot, W / 2, H - 38, W - 80);
}

export class ArenaBoardFx {
    constructor(game) {
        this.game = game;
        this.sets = new Map(); // arena id → {mesh, tex, ctx, key}
    }

    /** `arenas`: [{id, def, st, at}] — `st` the board's numbers, `at` the moment they were told (performance.now()). */
    update(arenas) {
        const me = this.game.character?.group?.position, cam = this.game.camera?.position;
        if (!me) return;
        const seen = new Set();
        for (const A of arenas) {
            const P = A.def.desk?.stall?.board || A.def.desk?.front;
            if (!P || A.def.practice) continue;
            const d = Math.hypot(P.x - me.x, P.z - me.z);
            let set = this.sets.get(A.id);
            if (!set && d < BOARD.SEE_R) { set = this._make(A, P); this.sets.set(A.id, set); }
            if (!set) continue;
            if (d > BOARD.SEE_R * 2) continue;
            seen.add(A.id);
            set.mesh.visible = d < BOARD.SEE_R * 1.3;
            if (!set.mesh.visible) continue;
            const el = A.at ? (performance.now() - A.at) / 1000 : 0;
            const key = boardKey(A.st, el);
            if (key !== set.key) { set.key = key; draw(set.ctx, boardView(A.st, el)); set.tex.needsUpdate = true; }
            if (cam) set.mesh.rotation.y = Math.atan2(cam.x - set.mesh.position.x, cam.z - set.mesh.position.z);
            set.mesh.material.opacity = 0.93 + 0.05 * Math.sin(performance.now() / 380); // (a hologram's breath)
        }
        for (const [id, set] of this.sets) if (!seen.has(id)) { this._drop(set); this.sets.delete(id); }
    }

    _make(A, P) {
        _plane = _plane || new THREE.PlaneGeometry(BOARD.W, BOARD.H);
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 640;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        mesh.position.set(P.x, P.y + BOARD.UP, P.z);
        mesh.name = 'arena-board';
        this.game.scene.add(mesh);
        return { mesh, tex, ctx: c.getContext('2d'), key: null };
    }

    _drop(set) { this.game.scene.remove(set.mesh); set.mesh.material.dispose(); set.tex.dispose(); }

    dispose() { for (const s of this.sets.values()) this._drop(s); this.sets.clear(); }
}
