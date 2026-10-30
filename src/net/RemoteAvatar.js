/**
 * RemoteAvatar.js — another player in the world.
 * A full VoxelCharacter (head and body visible) driven by network snapshots,
 * smoothly interpolated, with a floating name tag.
 */

import { applyRemoteMonster } from '../game/MonsterTransform.js';
import * as THREE from 'three';
import { VoxelCharacter } from '../entities/Character.js';
import { CombatVisuals } from '../game/Combat.js';
import { KD_NAME } from '../game/Impact.js';
import { wrapPi, stepAngle, neckLimit, TWIST } from './RemoteTwist.js';
import { safeLegs } from '../input/LegSafe.js';
import { decodeFace, applyFaceDiff } from '../entities/FaceExpr.js';

const COLORS = [0xe67e22, 0x9b59b6, 0x1abc9c, 0xe74c3c, 0xf1c40f, 0x2ecc71, 0xecf0f1, 0x34495e];
const _sh = { x: 0, y: 0, z: 0 };
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();

/** m from the hand to a wand's tip (a remote player's hand shield stands there: Combat.shieldAt). */
const WAND_LEN = 0.32;

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
        this.vel = new THREE.Vector3();
        this._pp = new THREE.Vector3();
        this._ppOk = false;
    }

    /** The other player's own hero (face, clothes…). */
    setLook(look) {
        if (!look || JSON.stringify(look) === this._lookKey) return;
        this._lookKey = JSON.stringify(look);
        this.character.setLook(look);
        this.color = look.topColor ?? this.color;
    }

    /** How this player's hero is drawn — as THEY chose it ('real': the «Реалистичный» test model; else the standard one). */
    setHeroModel(hm) {
        const v = hm === 'real' ? 'real' : 'std';
        if (v === (this.character.heroModel || 'std')) return;
        this.character.setHeroModel(v);
    }

    setDead(dead) {
        this.dead = dead;
        clearTimeout(this._hideT);
        // (knocked down as they died — Avada, a blast: the body is seen falling first)
        if (dead && this.character.knockedDown && typeof setTimeout === 'function') this._hideT = setTimeout(() => { if (this.dead) this.character.group.visible = false; }, 1200);
        else this.character.group.visible = !dead;
    }

    /** The diary line «ноги назад» when the sent head is turned far back from the body (once in 10 s per player). */
    _neck(dt) {
        const ch = this.character;
        this._twistLogT = Math.max(0, (this._twistLogT || 0) - dt);
        const raw = wrapPi(this.target.s.hy);
        if (Math.abs(raw) > 2.1 && this._twistLogT <= 0 && typeof this.log === 'function') {
            this._twistLogT = TWIST.LOG_GAP;
            const deg = (a) => Math.round(wrapPi(a) * 180 / Math.PI);
            this.log(`ноги назад: ${this.id}, корпус ${deg(ch.group.rotation.y)}°, голова от корпуса ${deg(raw)}°, пришло ry ${deg(this.target.s.ry)}°`);
        }
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
        for (let i = 0; i < 20; i++) fx.spark(at, i % 2 ? (c.gods ? 0xffcf4a : 0x9fd8ff) : 0xffffff, 0.15, _d.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.4);
    }

    get position() {
        return this.character.group.position;
    }

    applyState(s) {
        this.target = s;
        this.lastUpdate = performance.now();
        if (s.hp !== undefined) this.hp = s.hp;
        if (s.ft !== undefined) this.fatigue = s.ft;
        if (s.mm !== undefined) this.maxMana = s.mm; // (its mana maximum: «Inspirius»' scroll turns up only for 500+)
        this.firm = !!s.ab; // (absolute steadiness: FirmRules.js)
        this.sees = !!s.sg; // (they see the invisible: Invisibles.seesInvisible)
        if (Array.isArray(s.sk)) this.known = new Set(s.sk.slice(0, 400).map(String)); // (the scrolls they already know: a chest they open gives none of them)
        this.imperius = !!s.im; // («Империус»: their mind is in another body — their eyes burn white)
        this.monsterForm = Array.isArray(s.mo) ? s.mo : null; // (the monster form: drawn in update — MonsterTransform.applyRemoteMonster)
        if (this.imperius !== !!this._impShown) { this._impShown = this.imperius; this.character.setImperiusEyes(this.imperius); }
        this.dark = Math.max(0, Math.min(100, Number(s.dk) || 0)); // (их уровень тьмы: метки на теле — DarkSkin.js; волшебники читают его как данные)
        if (this.dark !== this._darkShown) { this._darkShown = this.dark; this.character.setDarkLevel(this.dark); }
        this.dragonWand = !!s.dw; // (the dragon's wand in their hand: their fire spells are 60% stronger)
        this.mastery = Math.max(0, Number(s.dms) || 0); // (their «дуэльное мастерство»: a duel counts it)
        this.wand = s.wd ? { dir: s.wd[0] || null, fav: s.wd[1] || null, power: s.wd[2] || 0 } : null; // (their wand: a duel counts it — Duel._wandK)
        this.lumos = !!s.lm; // (their wand's tip shines: a sleeping dragon sees it from farther)
        // their face (the «Реалистичный» hero): a whole face, or only what changed, or '-' none seen any more
        const ch = this.character;
        if (typeof s.fc === 'string') {
            if (s.fc === '-') this._fc = null;
            else if (s.fc[0] === '+') this._fc = this._fc ? applyFaceDiff(this._fc, s.fc.slice(1)) : null;
            else this._fc = s.fc;
            if (this._fc) ch.face = decodeFace(this._fc, ch.face || undefined) || ch.face;
        }
        if (this._fc) ch.faceAt = performance.now();
        const rl = Array.isArray(s.rl) ? s.rl : null;
        ch.legLift = rl ? safeLegs({ l: rl[0], lh: rl[1], r: rl[2], rh: rl[3] }) : null; // (a bad packet cannot bend a knee backwards: LegSafe)
        ch.torsoLean = rl ? Math.max(-1, Math.min(1, +rl[4] || 0)) : 0;
        this.duelContact = s.dc ? s.dc[0] : 1;
        this.duelJerk = s.dc ? s.dc[1] : 0;
        if (s.c) {
            // [shield type, side (1 = left), seconds left, frozen seconds left, times it shattered, the gods' shield (gold)]
            const was = this.combat.shield, wasSide = this.combat.side, wasGods = !!this.combat.gods;
            this.combat.shield = s.c[0];
            this.combat.gods = !!s.c[5]; // (ProtectionGods.js: their shield / dome golden)
            this.combat.atWand = !!s.c[6]; // (their hand shield at their wand's tip)
            this.combat.cross = !!s.c[7]; // (the crossed arms' shield: in front of their arms)
            this.combat.side = s.c[1] ? 'left' : 'right';
            this.combat.shieldLeft = s.c[2];
            this.combat.frozen = s.c[3] > 0;
            if (!this.visuals) this.visuals = new CombatVisuals(this.scene);
            // their shield shattered (out of mana, or knocked down by a spell from the same hand): the pieces fly
            const broke = s.c[4] | 0;
            if (this._broke != null && broke !== this._broke && was) {
                if (was === 2) this.visuals.shatter(2, this.position.clone().add(_d.set(0, 0.6, 0)), null, wasGods);
                else { const hp = this.handPose(wasSide); this.visuals.shatter(1, hp.origin.clone().addScaledVector(hp.dir, 0.45), hp.dir, wasGods); }
            }
            this._broke = broke;
        } else if (this.combat.shield) {
            // (no shield sent any more: it went out — «стоп», a jerk — long before its time)
            this.combat.shield = 0;
            this.combat.gods = false;
            this.combat.shieldLeft = 0;
            this.combat.frozen = false;
        }
    }

    update(dt, ships = null, space = null) {
        const s = this.target;
        if (!s) return;
        const ch = this.character;
        if (this.monsterForm || this._monster?.on || (ch.size || 1) !== 1) applyRemoteMonster(this, this.monsterForm, dt); // (×7, the monster's body on their bones)
        ch.restoreArms(); // (an arm drawn reaching last frame — a hand held — back to the tracked one first)
        const k = Math.min(1, dt * 12);
        let p = s.s.p;
        // on a ship: their place on its deck, put where this computer draws the ship (no sliding off)
        this.ship = Array.isArray(s.sh) ? s.sh[0] : null;
        if (this.ship && ships?.remoteOnShip(s.sh, _sh)) p = [_sh.x, _sh.y, _sh.z];
        // in space: their true place there, put where my own space is drawn (Space.js: each hero has his own origin)
        if (s.sp && space?.remoteWorld(s.sp, this._spw || (this._spw = []))) p = this._spw;
        const g = ch.group.position;
        if (Math.hypot(p[0] - g.x, p[2] - g.z) > 10) g.set(p[0], p[1], p[2]);
        else { g.x += (p[0] - g.x) * k; g.y += (p[1] - g.y) * k; g.z += (p[2] - g.z) * k; }
        // how fast the body moves (my hands striking it measure their speed against it)
        if (this._ppOk && dt > 0) { _d.subVectors(g, this._pp).divideScalar(dt); if (_d.lengthSq() < 900) this.vel.lerp(_d, 0.3); else this.vel.set(0, 0, 0); }
        this._pp.copy(g); this._ppOk = true;
        // (the head turns only so far from the chest; sent further round, the body — and the legs — are put round to meet it)
        const nk = neckLimit(Number.isFinite(+s.s.hy) ? +s.s.hy : 0);
        const bodyTo = (Number.isFinite(+s.s.ry) ? +s.s.ry : ch.group.rotation.y) + nk.turn;
        ch.group.rotation.y = stepAngle(ch.group.rotation.y, bodyTo, k);
        // off the feet / reeling (Knockdown.js): the body tips over (or leans) the way it was pushed
        const kd = s.s.kd | 0, sg = Array.isArray(s.s.sg) ? s.s.sg : null;
        ch.knockedDown = kd > 0;
        ch.fallDir = KD_NAME[kd] || ch.fallDir;
        ch.tumbleAng = kd && Number.isFinite(+s.s.tb) ? +s.s.tb : 0; // (flipping over in the air: «Джолт»)
        ch.tumbleDir = null;
        ch.liftUp = kd ? Math.max(0, Math.min(1, +s.s.ku || 0)) : 0; // (pulled up by a hand)
        ch.staggerLean = sg ? +sg[0] || 0 : 0;
        ch.staggerRoll = sg ? +sg[1] || 0 : 0;
        const bk = Array.isArray(s.s.bk) ? s.s.bk : null;
        ch.braceK = bk ? Math.max(0, Math.min(1, +bk[0] || 0)) : 0; // («устоял»: the stance instead of the steps on the spot)
        ch.braceSide = bk ? (+bk[1] | 0) : 0;
        if (sg && !bk) ch.stepping = Math.max(ch.stepping || 0, 0.15);
        if (!kd && !sg && !ch._pitchOwned) ch.group.rotation.x += ((s.s.rx || 0) - ch.group.rotation.x) * k; // flight tilt
        ch.flying = !kd && !sg && !s.bd && Math.abs(s.s.rx || 0) > 0.05; // (pitched on a wave on a surfboard is not flying)
        ch.legPose = Array.isArray(s.s.lg) ? { left: { hip: +s.s.lg[0] || 0 }, right: { hip: +s.s.lg[1] || 0 } } : null;
        ch.boardRoll = Number.isFinite(+s.s.rz) ? +s.s.rz : 0;
        ch.swimming = s.s.sw != null; // (swimming: lying in the water, the legs kicking — the tilt and the arms come as they are)
        ch.swimMove = +s.s.sw || 0;
        ch.head.rotation.y = stepAngle(ch.head.rotation.y, nk.head, k); // (the short way round: an angle sent past ±π must not spin the head the long way)
        this._neck(dt);
        ch.head.rotation.x += (s.s.hp - ch.head.rotation.x) * k;
        const slerp = (obj, arr) => { if (arr) obj.quaternion.slerp(_q.set(arr[0], arr[1], arr[2], arr[3]), k); };
        slerp(ch.leftArmAnchor, s.s.la);
        slerp(ch.leftElbowAnchor, s.s.le);
        slerp(ch.rightArmAnchor, s.s.ra);
        slerp(ch.rightElbowAnchor, s.s.re);
        ch.setRunning(s.s.run >= 0, Math.max(0, s.s.run));
        ch.setCrouching(s.s.cr >= 0.95); // (a squat; a little stoop under a low roof: how much lower)
        ch.setStoop(+s.s.cr || 0);
        ch.jumpAir = !!s.s.jp; ch.verticalVelocity = s.s.jp === 2 ? 1 : 0; // (in a jump: the legs tucked, as on its own screen)
        ch.leftSimplifiedHand.applyState(s.s.lh);
        ch.rightSimplifiedHand.applyState(s.s.rh);
        ch.update(dt, null, false);
        if (this.visuals) {
            if (this.combat.shieldLeft > 0) this.combat.shieldLeft = Math.max(0, this.combat.shieldLeft - dt);
            const hp = this.handPose(this.combat.side);
            if (this.combat.atWand) hp.origin.addScaledVector(hp.dir, WAND_LEN); // (at the wand's tip, as on their own screen)
            this.combat.dark = !!this.character?.darkLord; // (a true dark mage in his outfit: dark shields — DarkLord.js)
            this.visuals.update(dt, this.combat, { center: this.position.clone().add(_d.set(0, 0.6, 0)), hand: hp.origin, dir: hp.dir });
        }
    }

    /** Live hand pose for spells cast by this player (ice beam follows their hand). */
    handPose(side) {
        if (this.combat.cross && this.combat.shield === 1) return this.character.crossShieldPose();
        return { origin: this.character.getHandWorldPosition(side), dir: this.character.getHandDirection(side) };
    }

    dispose() {
        this.visuals?.dispose();
        this.tag.material.map.dispose();
        this.tag.material.dispose();
        this.character.dispose();
    }

    /** «Высший маг» (Achievements.js): the name tag turns gold with a star — every player sees it. */
    setTitle(title) {
        if ((this._title || null) === (title || null)) return;
        this._title = title || null;
        const map = this.tag?.material?.map;
        if (!map?.image) return;
        drawNameTag(map.image, this.name, this._title, !!this._speaking);
        map.needsUpdate = true;
    }

    /** The voice chat: he speaks now (VoiceChat.js) — a green glow and sound waves by his name (redrawn only on a change). */
    setSpeaking(on) {
        if (!!this._speaking === !!on) return;
        this._speaking = !!on;
        const map = this.tag?.material?.map;
        if (!map?.image) return;
        drawNameTag(map.image, this.name, this._title, this._speaking);
        map.needsUpdate = true;
    }
}

/** The tag's picture: the name; a High Mage's — gold, with a star (Achievements.js). */
function drawNameTag(canvas, name, title = null, speaking = false) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const text = title ? `★ ${name} ★` : name;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = title ? 'rgba(21,24,63,0.8)' : 'rgba(0,0,0,0.55)';
    const w = Math.min(250, 30 + ctx.measureText(text).width + (speaking ? 34 : 0));
    roundRect(ctx, (256 - w) / 2, 8, w, 48, 12);
    ctx.fill();
    if (title) { ctx.strokeStyle = '#e7c25a'; ctx.lineWidth = 3; ctx.stroke(); }
    if (speaking) {
        // (speaks in the voice chat: a soft green rim, and a mouth's sound waves before the name)
        ctx.save();
        ctx.shadowColor = 'rgba(85,239,140,0.9)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(110,240,160,0.95)';
        ctx.lineWidth = 3;
        roundRect(ctx, (256 - w) / 2 + 1.5, 9.5, w - 3, 45, 11);
        ctx.stroke();
        ctx.restore();
        const x = (256 - w) / 2 + 16, y = 32;
        ctx.fillStyle = '#7dffb0';
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7dffb0';
        ctx.lineCap = 'round';
        for (let k = 1; k <= 3; k++) {
            ctx.globalAlpha = 1 - k * 0.22;
            ctx.lineWidth = 3 - k * 0.5;
            ctx.beginPath(); ctx.arc(x, y, 4.5 + k * 5, -Math.PI / 3.2, Math.PI / 3.2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.translate(17, 0); // (the name moves over to make room)
    }
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = title ? '#ffd36e' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33, speaking ? 206 : 240);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function makeNameTag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    drawNameTag(canvas, name);
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
