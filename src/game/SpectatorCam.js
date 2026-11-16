/**
 * SpectatorCam.js — the player as a camera in «Битва существ» (Brawl.js): flies by the keyboard and the mouse, no web camera.
 *
 *   W A S D — along the view (flat), Space / E up, Ctrl / Q down, Shift faster, wheel — the speed;
 *   right mouse button held and dragged — look round (no pointer lock: the left button puts fighters, Brawl panel).
 * The hero's body follows the camera on the ground under it (the world and the creatures wake round the hero) and is hidden.
 */
import * as THREE from 'three';

export const SPECTATOR = {
    SPEED: 16, FAST: 3, MIN_SPEED: 4, MAX_SPEED: 60,
    LOOK: 0.0034, // rad per pixel
    RADIUS: 52, // m from the middle (the cliffs are at 44–54)
    UP_MAX: 70, // m over the ground
    UP_MIN: 1.6,
    START: { x: 0, y: 26, z: 46, yaw: 0, pitch: -0.5 },
};

const _f = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _ray = new THREE.Raycaster(), _p = new THREE.Vector2();

export class SpectatorCam {
    constructor(game, canvas) {
        this.game = game;
        this.canvas = canvas || game.renderer?.domElement;
        this.active = true;
        this.pos = new THREE.Vector3(SPECTATOR.START.x, SPECTATOR.START.y, SPECTATOR.START.z);
        this.yaw = SPECTATOR.START.yaw;
        this.pitch = SPECTATOR.START.pitch;
        this.speed = SPECTATOR.SPEED;
        this.keys = new Set();
        this._look = false;
        this._onKey = (e) => {
            if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT' || e.target?.tagName === 'TEXTAREA') return;
            const c = e.code;
            if (e.type === 'keydown') { if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ControlLeft|ShiftLeft|ShiftRight)$/.test(c)) this.keys.add(c); if (c === 'Space') e.preventDefault(); }
            else this.keys.delete(c);
        };
        this._onBlur = () => { this.keys.clear(); this._look = false; };
        this._onDown = (e) => { if (e.button === 2) { this._look = true; e.preventDefault(); } };
        this._onUp = (e) => { if (e.button === 2) this._look = false; };
        this._onMove = (e) => {
            if (!this._look) return;
            this.yaw -= e.movementX * SPECTATOR.LOOK;
            this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * SPECTATOR.LOOK));
        };
        this._onWheel = (e) => { this.speed = Math.max(SPECTATOR.MIN_SPEED, Math.min(SPECTATOR.MAX_SPEED, this.speed * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); };
        this._noMenu = (e) => e.preventDefault();
        window.addEventListener('keydown', this._onKey);
        window.addEventListener('keyup', this._onKey);
        window.addEventListener('blur', this._onBlur);
        window.addEventListener('mouseup', this._onUp);
        window.addEventListener('mousemove', this._onMove);
        this.canvas?.addEventListener('mousedown', this._onDown);
        this.canvas?.addEventListener('wheel', this._onWheel, { passive: true });
        this.canvas?.addEventListener('contextmenu', this._noMenu);
    }

    /** Move by the keys (the game's time, so a slow frame does not leap). */
    step(dt) {
        dt = Math.min(dt, 0.1);
        const k = this.keys;
        const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? SPECTATOR.FAST : 1;
        const sp = this.speed * fast * dt;
        const fw = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), st = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
        const up = (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('ControlLeft') || k.has('KeyQ') ? 1 : 0);
        // (forward along the look, level: the camera looks down at the field, and W must not dive into the ground)
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        this.pos.x += (-sy * fw + cy * st) * sp;
        this.pos.z += (-cy * fw - sy * st) * sp;
        this.pos.y += up * sp;
        const d = Math.hypot(this.pos.x, this.pos.z);
        if (d > SPECTATOR.RADIUS) { this.pos.x *= SPECTATOR.RADIUS / d; this.pos.z *= SPECTATOR.RADIUS / d; }
        const g = this.game.brawl?.groundAt(this.pos.x, this.pos.z) ?? 0;
        this.pos.y = Math.max(g + SPECTATOR.UP_MIN, Math.min(g + SPECTATOR.UP_MAX, this.pos.y));
    }

    /** Put the camera there, and the (hidden) hero on the ground below it. */
    apply(camera, dt) {
        this.step(dt);
        this._cleanse();
        camera.position.copy(this.pos);
        camera.quaternion.setFromEuler(_e.set(this.pitch, this.yaw, 0));
        const ch = this.game.character;
        if (ch?.group) {
            const g = this.game.brawl?.groundAt(this.pos.x, this.pos.z) ?? this.pos.y - 3;
            ch.group.position.set(this.pos.x, g, this.pos.z);
            ch.group.visible = false;
        }
    }

    /** Nothing may make the picture muddy, shaky, frozen or dark: no dizziness, shake, stun, ice, damage flash (a blast, a stunned hero, a fall). */
    _cleanse() {
        const g = this.game;
        if (g.knock) g.knock.dizzyLeft = 0; // (`dizzy` is read from it: the blur of the picture)
        if (g.fx) g.fx.shake = 0;
        const c = g.combat;
        if (c && (c.stunLeft > 0 || c.frozenLeft > 0 || c.slowLeft > 0 || c.chill > 0)) c.clearEffects();
        if (g.hud && this._flash !== false) { g.hud.setDizzy?.(0, g.renderer?.domElement); g.hud.setFrozenOverlay?.(0); }
    }

    /** The point of the ground under the mouse (client pixels): {x, z} | null. */
    pick(clientX, clientY, camera) {
        const r = this.canvas.getBoundingClientRect();
        _p.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        _ray.setFromCamera(_p, camera);
        const o = _ray.ray.origin, d = _ray.ray.direction;
        if (d.y > -0.02) return null; // (looking at the sky)
        let y = this.game.brawl?.groundAt(0, 0) ?? 0;
        let x = 0, z = 0;
        for (let i = 0; i < 3; i++) { // (the plane, then the ground at that spot, again: a hill moves it)
            const t = (y - o.y) / d.y;
            x = o.x + d.x * t; z = o.z + d.z * t;
            y = this.game.brawl?.groundAt(x, z) ?? y;
        }
        return { x, z };
    }

    dispose() {
        this.active = false;
        window.removeEventListener('keydown', this._onKey);
        window.removeEventListener('keyup', this._onKey);
        window.removeEventListener('blur', this._onBlur);
        window.removeEventListener('mouseup', this._onUp);
        window.removeEventListener('mousemove', this._onMove);
        this.canvas?.removeEventListener('mousedown', this._onDown);
        this.canvas?.removeEventListener('wheel', this._onWheel);
        this.canvas?.removeEventListener('contextmenu', this._noMenu);
        if (this.game.character?.group) this.game.character.group.visible = true;
    }
}
