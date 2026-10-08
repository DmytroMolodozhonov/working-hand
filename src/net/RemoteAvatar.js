/**
 * RemoteAvatar.js — another player in the world.
 * A full VoxelCharacter (head and body visible) driven by network snapshots,
 * smoothly interpolated, with a floating name tag.
 */

import * as THREE from 'three';
import { VoxelCharacter } from '../entities/Character.js';
import { CombatVisuals } from '../game/Combat.js';

const COLORS = [0xe67e22, 0x9b59b6, 0x1abc9c, 0xe74c3c, 0xf1c40f, 0x2ecc71, 0xecf0f1, 0x34495e];
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();

export class RemoteAvatar {
    constructor(scene, id, name, colorIndex = 0) {
        this.id = id;
        this.name = name || 'Игрок';
        this.character = new VoxelCharacter(scene, { remote: true });
        this.character.setShowHands(true);
        // Different shirt colour per player so friends are easy to tell apart.
        const shirt = COLORS[colorIndex % COLORS.length];
        this.color = shirt; // (also the player's dot on the minimap)
        this.character.body.material.color.setHex(shirt);
        this.character.leftArmAnchor.children[0].material.color.setHex(shirt);
        this.target = null;
        this.hp = null;
        this.lastUpdate = performance.now();
        this.tag = makeNameTag(this.name);
        this.tag.position.set(0, 3.4, 0);
        this.character.group.add(this.tag);
        this.scene = scene;
        this.combat = { shield: 0, side: 'right', shieldLeft: 0, frozen: false }; // Свободный мир
        this.visuals = null;
        this.dead = false;
    }

    setDead(dead) {
        this.dead = dead;
        this.character.group.visible = !dead;
    }

    /** Would this player's shield stop something coming from `from`? */
    shieldBlocks(from) {
        const c = this.combat;
        if (!c.shield || c.shieldLeft <= 0) return false;
        if (c.shield === 2) return true;
        const hp = this.handPose(c.side);
        return hp.dir.dot(_d.subVectors(from, hp.origin).normalize()) > 0.25;
    }

    showBlock(from, fx) {
        const c = this.combat;
        const at = c.shield === 2
            ? this.position.clone().add(_d.set(0, 0.6, 0)).addScaledVector(_d.subVectors(from, this.position).normalize(), 2.4)
            : this.handPose(c.side).origin;
        for (let i = 0; i < 20; i++) fx.spark(at, i % 2 ? 0x9fd8ff : 0xffffff, 0.15, _d.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.4);
    }

    get position() {
        return this.character.group.position;
    }

    applyState(s) {
        this.target = s;
        this.lastUpdate = performance.now();
        if (s.hp !== undefined) this.hp = s.hp;
        if (s.ft !== undefined) this.fatigue = s.ft;
        this.duelContact = s.dc ? s.dc[0] : 1;
        this.duelJerk = s.dc ? s.dc[1] : 0;
        if (s.c) {
            // [shield type, side (1 = left), seconds left, frozen seconds left]
            this.combat.shield = s.c[0];
            this.combat.side = s.c[1] ? 'left' : 'right';
            this.combat.shieldLeft = s.c[2];
            this.combat.frozen = s.c[3] > 0;
            if (!this.visuals) this.visuals = new CombatVisuals(this.scene);
        }
    }

    update(dt) {
        const s = this.target;
        if (!s) return;
        const ch = this.character;
        const k = Math.min(1, dt * 12);
        const p = s.s.p;
        const g = ch.group.position;
        if (Math.hypot(p[0] - g.x, p[2] - g.z) > 10) g.set(p[0], p[1], p[2]);
        else { g.x += (p[0] - g.x) * k; g.y += (p[1] - g.y) * k; g.z += (p[2] - g.z) * k; }
        let d = s.s.ry - ch.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        ch.group.rotation.y += d * k;
        ch.group.rotation.x += ((s.s.rx || 0) - ch.group.rotation.x) * k; // flight tilt
        ch.flying = Math.abs(s.s.rx || 0) > 0.05;
        ch.head.rotation.y += (s.s.hy - ch.head.rotation.y) * k;
        ch.head.rotation.x += (s.s.hp - ch.head.rotation.x) * k;
        const slerp = (obj, arr) => { if (arr) obj.quaternion.slerp(_q.set(arr[0], arr[1], arr[2], arr[3]), k); };
        slerp(ch.leftArmAnchor, s.s.la);
        slerp(ch.leftElbowAnchor, s.s.le);
        slerp(ch.rightArmAnchor, s.s.ra);
        slerp(ch.rightElbowAnchor, s.s.re);
        ch.setRunning(s.s.run >= 0, Math.max(0, s.s.run));
        ch.setCrouching(!!s.s.cr);
        ch.knockedDown = !!s.s.kd;
        ch.leftSimplifiedHand.applyState(s.s.lh);
        ch.rightSimplifiedHand.applyState(s.s.rh);
        ch.update(dt, null, false);
        if (this.visuals) {
            if (this.combat.shieldLeft > 0) this.combat.shieldLeft = Math.max(0, this.combat.shieldLeft - dt);
            const hp = this.handPose(this.combat.side);
            this.visuals.update(dt, this.combat, { center: this.position.clone().add(_d.set(0, 0.6, 0)), hand: hp.origin, dir: hp.dir });
        }
    }

    /** Live hand pose for spells cast by this player (ice beam follows their hand). */
    handPose(side) {
        return { origin: this.character.getHandWorldPosition(side), dir: this.character.getHandDirection(side) };
    }

    dispose() {
        this.visuals?.dispose();
        this.tag.material.map.dispose();
        this.tag.material.dispose();
        this.character.dispose();
    }
}

function makeNameTag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = Math.min(250, 30 + ctx.measureText(name).width);
    roundRect(ctx, (256 - w) / 2, 8, w, 48, 12);
    ctx.fill();
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    // Same readable size on screen at any distance (sizeAttenuation off)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sprite.scale.set(0.3, 0.075, 1);
    sprite.renderOrder = 10;
    return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
