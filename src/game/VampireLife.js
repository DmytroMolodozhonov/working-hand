/**
 * VampireLife.js — Count Sracula's castle alive (the rules: VampireRules.js; the castle's blocks: src/world/VampireCastle.js).
 *
 *  - THE COUNT sleeps in his coffin in the crypt behind the throne. He wakes when his castle is plainly damaged (a blast near it), when his
 *    bats or guards are attacked (VAMPIRE.WAKE_DELAY s later: the bats first), when he is hit, or when a guest stands by his coffin.
 *    A guest who came unseen and attacked nobody finds him peaceful: he rises, faces the guest and talks — irritated, he tells him to leave,
 *    warns again and again; a guest who stays (PARLEY_MAX s), comes too close or attacks him is attacked. A guest who leaves is let go.
 *  - HIS FIGHT: no wand. He walks slowly; from RUSH_FROM m, facing the foe, he dashes in (RUSH m/s), strikes / bites (−BLOW), and leaps back;
 *    stalks a moment, again. He talks while he fights. When hurt badly, when the foe flies, or now and then, he turns into a great bat
 *    (TURN_T s of smoke and the body folding) for BAT_T s: flies, swoops and bites; then he must turn back where he lands.
 *  - THE BATS: fifty round the spires (one InstancedMesh, their wings beaten by the video card). A hero seen out of the keep within SEE m is
 *    their quarry: they swarm him; each bat bites (−1) at most once in COOL s, then flutters off and comes again. Killed — never back (saved).
 *  - THE GUARDS: ten skeletons in the count's livery (dark red tabards, black iron) at their posts: they go for a foe within SEE m, strike
 *    facing him, go back to the post beyond LEASH. Bones: what breaks the black ship's skeletons breaks theirs (Sailors.pirateBoneDamage).
 *  - THE SKY: over his land the clouds never part (Storm: skyDark; rain now and then); «To the Sun» cannot clear them while he lives —
 *    someone holds the clouds' magic (Game._castSun asks `sunBlocked`); after his death «To the Sun» scatters them for good.
 *  - HIS DEATH: he crumbles to dust; +150 mana cells to those who fought him (Achievements 'vampire'); his chests by the coffin unlock.
 * The host (or a single player) runs every mind; the guests see it by `vamp` messages and send their blows to the host. Saved: who is dead.
 */
import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../entities/VillagerModel.js';
import { Chest } from '../entities/Chest.js';
import { registerKind } from './CreatureImpact.js';
import { VAMPIRE, BATS, GUARDS, LINES, vampDamage, BOLT_DMG, fightMove, batMayBite, darkAt } from './VampireRules.js';
import { VAMP, vampUV, inVampKeep } from '../world/VampireCastle.js';
import { GOD_SPELLS } from './Mana.js';
import { pirateBoneDamage } from './Sailors.js';
import { FACE, facesTarget, turnToward, yawTo } from './FaceTarget.js';
import { stormDeck } from './GargoyleRitual.js';

const ACTIVE_R = 240, GONE_R = 320; // m: the castle's life is made / put away
const CLOUD = { R: VAMP.DARK_R + 80, H: 95, SEE: 900, SEE_FADE: 300, FADE_T: 8 }; // his cloud (the author 06.11: «тёмная туча, как у горгулий, только больше»): radius, m over the floor, seen from (the author 07.11: «слишком издалека вижу тучи» — no more than 900 m, thinning out over the last 300 m, not 2,2 km), s to melt away
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const r2 = (x) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ the models (shared shapes, made once)
let _batGeo = null, _batMat = null, _batTime = { value: 0 };
/** One bat (span BATS.SPAN): a furry body, ears, the membranes on finger-bones (vertex colours: the membrane lighter where thin, the bones dark), red eyes. `wing` attribute: −1…1 along the span (0 the body) — the video card beats it. */
function batGeometry() {
    if (_batGeo) return _batGeo;
    const pos = [], col = [], wing = [];
    const tri = (a, b, c, ca, cb, cc, wa, wb, wc) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); wing.push(wa, wb, wc); };
    const fur = [0.16, 0.12, 0.11], furL = [0.24, 0.18, 0.15], mem = [0.26, 0.15, 0.13], bone = [0.09, 0.07, 0.07], eye = [0.95, 0.12, 0.08];
    // the body: a little spindle of 8 sides (front −z)
    const ring = (z, r, n = 8) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r * 0.85, z]; });
    const R = [ring(-0.13, 0.02), ring(-0.08, 0.055), ring(0.02, 0.065), ring(0.11, 0.04), ring(0.17, 0.012)];
    for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < 8; i++) {
        const a = R[k][i], b = R[k][(i + 1) % 8], c = R[k + 1][(i + 1) % 8], d = R[k + 1][i], cf = i < 4 ? furL : fur;
        tri(a, b, c, cf, cf, cf, 0, 0, 0); tri(a, c, d, cf, cf, cf, 0, 0, 0);
    }
    // the ears and the eyes
    for (const s of [-1, 1]) {
        tri([s * 0.015, 0.035, -0.1], [s * 0.04, 0.035, -0.08], [s * 0.035, 0.1, -0.11], fur, fur, furL, 0, 0, 0);
        tri([s * 0.018, 0.02, -0.128], [s * 0.032, 0.022, -0.122], [s * 0.025, 0.034, -0.126], eye, eye, eye, 0, 0, 0);
    }
    // the wings: a membrane between the arm and four fingers, scalloped at its trailing edge
    const H = BATS.SPAN / 2;
    for (const s of [-1, 1]) {
        const sh = [s * 0.05, 0.01, -0.04], wr = [s * H * 0.45, 0.04, -0.03];
        const tips = [[s * H, 0.02, -0.02], [s * H * 0.92, 0, 0.12], [s * H * 0.72, 0, 0.2], [s * H * 0.46, 0, 0.21]];
        const hip = [s * 0.04, 0, 0.12];
        tri(sh, wr, hip, mem, mem, mem, s * 0.12, s * 0.45, s * 0.1);
        let prev = wr;
        for (let k = 0; k < tips.length; k++) {
            const t = tips[k], next = k < tips.length - 1 ? tips[k + 1] : hip;
            const mid = [(t[0] + next[0]) / 2 * 0.92, 0, (t[2] + next[2]) / 2 * 0.85]; // (the scallop between two fingers)
            tri(wr, t, mid, mem, bone, mem, s * 0.45, s * Math.abs(t[0]) / H, s * Math.abs(mid[0]) / H);
            tri(wr, mid, next, mem, mem, mem, s * 0.45, s * Math.abs(mid[0]) / H, s * Math.abs(next[0]) / H);
            void prev; prev = t;
        }
        // the finger-bones as thin dark strips over the membrane
        for (const t of tips) tri(wr, t, [wr[0], 0.012, wr[2] + 0.01], bone, bone, bone, s * 0.45, s * Math.abs(t[0]) / H, s * 0.45);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('wing', new THREE.Float32BufferAttribute(wing, 1));
    g.computeVertexNormals();
    g.userData.shared = true;
    return (_batGeo = g);
}
/** The bats' material: their wings beaten by the video card (each bat its own phase and beat, `beat` 0 — gliding with spread wings). */
function batMaterial() {
    if (_batMat) return _batMat;
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uBatT = _batTime;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float wing;\nattribute vec2 batPh;\nuniform float uBatT;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
            { float aw = abs(wing); float ph = uBatT * (11.0 + batPh.y * 6.0) + batPh.x;
              float beat = sin(ph) * (0.35 + 0.65 * batPh.y);
              float lift = beat * aw * 0.55 * ${BATS.SPAN.toFixed(2)};
              transformed.y += lift; transformed.x *= 1.0 - 0.18 * aw * abs(beat); transformed.z += 0.04 * aw * cos(ph); }`);
    };
    m.customProgramCacheKey = () => 'vampbat1';
    m.userData.shared = true;
    return (_batMat = m);
}

/** The count's own look: a nobleman of black and crimson, pale as wax, black hair swept back, red eyes; no wand. */
function countLook() {
    const L = villagerLook(1313, 'merchant', false, {});
    Object.assign(L, { coat: 0x120c12, shirt: 0xe9e2d6, accent: 0x7a0c14, pants: 0x121014, boots: 0x0c0a0c, hair: 'short', hairColor: 0x0b090c, beard: 'none',
        hat: 'none', skin: 0xe7ddd6, eyes: 0x9a0a10, tool: 'none' });
    return L;
}
/** The guards: the black ship's skeletons in the count's livery — dark crimson tabards in rags, black iron helms, halberd-like axes and swords. */
function guardLook(i) {
    const L = villagerLook(7000 + i * 97, 'builder', false, {});
    Object.assign(L, { skeleton: true, rags: [0x4a0a10, 0x3a0a14, 0x2a1418][i % 3], beard: 'none', hair: 'bald', dress: false, hat: i % 3 === 0 ? 'none' : 'scarf', hatColor: 0x1a1216,
        tool: i % 3 === 1 ? 'axe' : 'sword' });
    return L;
}
/** His cape: a long cloak from the shoulders, black outside, blood-red silk inside, a high stiff collar — two sides of one shape. */
function capeMesh() {
    const g = new THREE.Group();
    const shape = new THREE.PlaneGeometry(1.25, 2.3, 4, 8);
    const P = shape.attributes.position;
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), t = (1.15 - y) / 2.3; // (0 the shoulders … 1 the hem)
        P.setX(i, x * (0.75 + 0.55 * t));
        P.setZ(i, 0.18 + t * t * 0.5 + Math.cos(x * 4) * 0.04 * t);
    }
    shape.computeVertexNormals();
    const out = new THREE.Mesh(shape, new THREE.MeshLambertMaterial({ color: 0x0d080d, side: THREE.FrontSide }));
    const inn = new THREE.Mesh(shape, new THREE.MeshLambertMaterial({ color: 0x6a0a12, side: THREE.BackSide }));
    out.position.y = inn.position.y = -1.05;
    g.add(out, inn);
    // the high collar
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.5, 10, 1, true, Math.PI * 0.75, Math.PI * 1.5), new THREE.MeshLambertMaterial({ color: 0x6a0a12, side: THREE.DoubleSide }));
    col.position.set(0, 0.12, 0.08);
    g.add(col);
    g.userData.cape = out;
    return g;
}
/** The great bat he turns into: twice a man's span and more (~5 m), a gaunt body of black-crimson fur, a pale face with fangs, glowing eyes. */
function bigBatModel() {
    const g = new THREE.Group();
    const geo = batGeometry().clone();
    geo.deleteAttribute('wing');
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: 0x9a6070 }));
    m.scale.setScalar(6.5);
    g.add(m);
    const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    eyes.position.set(0.12, 0.2, -0.82); g.add(eyes);
    const e2 = eyes.clone(); e2.position.x = -0.12; g.add(e2);
    g.userData.body = m;
    return g;
}
/** His coffin: dark polished wood, six-sided, iron corners and handles, a lid with a crimson cross of inlay; the lid opens on the side. */
function coffinModel() {
    const g = new THREE.Group();
    const wood = new THREE.MeshPhongMaterial({ color: 0x241418, shininess: 40, specular: 0x332222 }), iron = new THREE.MeshPhongMaterial({ color: 0x2a2a2e, shininess: 60 });
    const hex = (w0, w1, l, h) => {
        const s = new THREE.Shape();
        s.moveTo(-w0, -l / 2); s.lineTo(w0, -l / 2); s.lineTo(w1, l * 0.18); s.lineTo(w0 * 0.75, l / 2); s.lineTo(-w0 * 0.75, l / 2); s.lineTo(-w1, l * 0.18); s.closePath();
        const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
        geo.rotateX(-Math.PI / 2);
        return geo;
    };
    const box = new THREE.Mesh(hex(0.55, 0.75, 3.6, 0.9), wood);
    g.add(box);
    const lid = new THREE.Group();
    lid.position.set(-0.75, 0.95, 0);
    const lidM = new THREE.Mesh(hex(0.58, 0.78, 3.66, 0.14), wood);
    lidM.position.x = 0.75;
    lid.add(lidM);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 1.8), new THREE.MeshPhongMaterial({ color: 0x7a0c14, shininess: 80 }));
    cross.position.set(0.75, 0.16, 0.1); lid.add(cross);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.12), cross.material);
    bar.position.set(0.75, 0.16, -0.35); lid.add(bar);
    g.add(lid);
    for (const z of [-1.2, 0, 1.2]) for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 10, Math.PI), iron); h.position.set(s * 0.72, 0.45, z); h.rotation.y = Math.PI / 2; h.rotation.z = Math.PI; g.add(h); }
    g.userData.lid = lid;
    return g;
}

export class VampireLife {
    constructor(game) {
        this.game = game;
        this.state = { countDead: false, batsDead: [], guardsDead: [], seen: false, cleared: false };
        this.on = false;
        this.count = null; // {model, cape, bat, pos, yaw, hp, mode, …}
        this.bats = []; // {i, p, v, home, ang, last, dead, mode}
        this.guards = [];
        this.batMesh = null;
        this.coffin = null;
        this._chests = [];
        this._netT = 0; this._sayT = 0; this._rainT = 30 + Math.random() * 60;
        this.list = []; // (CreatureImpact: the count and the guards — what can be pushed)
        this._alarm = 0; // s till the count wakes after an attack on his castle
    }

    get auth() { return !this.game.sync || !!this.game.authority; }
    get plan() { const t = this.game.terrain?.data || this.game.world?.terrain?.data; return t?.vamp?.plan || null; }

    // ------------------------------------------------------------------ the sky over his land
    /** How dark his clouds are here (Storm.update): 0 … 0.82. */
    skyDark() {
        const P = this.plan;
        if (!P || this.state.cleared) return 0;
        const me = this.game.character?.group?.position;
        if (!me) return 0;
        return darkAt(Math.hypot(me.x - P.x, me.z - P.z), VAMP.DARK_R, VAMP.DARK_FADE);
    }
    /** His clouds over `p` (for «To the Sun»). */
    cloudsOver(p) { const P = this.plan; return !!P && !this.state.cleared && Math.hypot(p.x - P.x, p.z - P.z) < VAMP.DARK_R + VAMP.DARK_FADE * 0.5; }
    /** «To the Sun» under his clouds: while he lives — nothing (a message); after — the clouds go for good. → true: handled here. */
    sun(p, isFinal) {
        if (!this.cloudsOver(p)) return false;
        const g = this.game;
        if (!this.state.countDead) { if (isFinal) g.hud?.setVoice?.(LINES.sunBlocked, true); return true; }
        this.state.cleared = true;
        g.storm?.clearSky?.();
        g.hud?.setVoice?.('☀️ Тучи над землёй графа расходятся — впервые за сто лет здесь светит солнце', true);
        if (g.sync) g.sync.vamp?.({ e: 'clear' });
        return true;
    }

    // ------------------------------------------------------------------ life near the castle
    update(dt) {
        const g = this.game, P = this.plan;
        if (!P || !(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        const me = g.character?.group?.position;
        if (!me) return;
        const d = Math.hypot(me.x - P.x, me.z - P.z);
        if (!this.on && d < ACTIVE_R && (g.terrain?.data?.landMade?.(Math.round(P.x), Math.round(P.z)) ?? true)) this._build(P);
        else if (this.on && d > GONE_R && !this._fightNear()) this._drop();
        this._weather(dt, d);
        if (!this.on) return;
        _batTime.value += dt;
        if (!this.state.seen && d < 160) { this.state.seen = true; g.hud?.setVoice?.('🦇 Над скалой — замок с острыми шпилями. Над ним вечно висят тучи, вокруг кружат летучие мыши…', true); }
        this.mapMark = { x: P.x, z: P.z, name: 'Замок графа Сракулы', icon: '🦇' };
        if (this.auth) { this._think(dt); this._netSend(dt); }
        else this._follow(dt);
        this._draw(dt);
    }

    _fightNear() { const c = this.count; return !!c && !c.dead && (c.mode === 'fight' || c.mode === 'bat'); }

    /** His cloud over the crag: two decks of the gargoyles' black-crimson storm cloud (bigger), lightning flickering inside; melts away once cleared. */
    _cloud(dt, d) {
        const g = this.game, P = this.plan;
        const want = this.state.cleared ? 0 : 1;
        this._cloudK = (this._cloudK ?? want) + Math.sign(want - (this._cloudK ?? want)) * Math.min(Math.abs(want - (this._cloudK ?? want)), dt / CLOUD.FADE_T);
        const show = d < CLOUD.SEE && this._cloudK > 0.003 && !g.space?.offEarth;
        if (!show) { if (this._decks) for (const m of this._decks) m.visible = false; return; }
        if (!this._decks) { this._decks = [0, 1].map((i) => { const m = stormDeck(CLOUD.R - i * 40, 31.7 + i * 9.1); g.scene.add(m); return m; }); this._cloudT = 0; this._flashT = 4; this._flash = 0; }
        this._cloudT += dt;
        this._flashT -= dt;
        if (this._flashT <= 0) { this._flashT = 5 + Math.random() * 12; this._flash = 1; if (d < 600) g.sound?.playTitan?.(_v.set(P.x + (Math.random() - 0.5) * 300, P.floor + CLOUD.H, P.z + (Math.random() - 0.5) * 300), 'thunder', 0.5); }
        this._flash = Math.max(0, this._flash - dt * 2.5);
        const far = Math.min(1, Math.max(0, (CLOUD.SEE - d) / CLOUD.SEE_FADE)); // (it comes out of the haze: fully thick only within SEE − SEE_FADE)
        this._decks.forEach((m, i) => {
            m.visible = far > 0.003;
            m.position.set(P.x, P.floor + CLOUD.H + i * 18, P.z);
            const u = m.material.uniforms;
            u.uTime.value = this._cloudT * (1 + i * 0.4); u.uStr.value = this._cloudK * far * (i ? 0.75 : 1); u.uFlash.value = this._flash * (0.6 + 0.4 * Math.random());
        });
    }

    _weather(dt, d) {
        const g = this.game;
        this._cloud(dt, d);
        if (this.state.cleared || d > VAMP.DARK_R) return;
        // (rain now and then over his land — not always: «может быть дождь, но может и не быть»)
        this._rainT -= dt;
        if (this._rainT <= 0) {
            this._rainT = 120 + Math.random() * 180;
            if (Math.random() < 0.45 && !g.storm?.raining) g.storm?.startRain?.(50 + Math.random() * 70);
        }
    }

    _build(P) {
        const g = this.game;
        this.on = true;
        // the bats: one InstancedMesh, each its own phase / beat
        const geo = batGeometry().clone();
        const ph = new Float32Array(BATS.N * 2);
        for (let i = 0; i < BATS.N; i++) { ph[i * 2] = Math.random() * 6.28; ph[i * 2 + 1] = 0.6 + Math.random() * 0.4; }
        geo.setAttribute('batPh', new THREE.InstancedBufferAttribute(ph, 2));
        this.batMesh = new THREE.InstancedMesh(geo, batMaterial(), BATS.N);
        this.batMesh.frustumCulled = false;
        this.batMesh.userData.vampBats = true;
        g.scene.add(this.batMesh);
        const dead = new Set(this.state.batsDead);
        this.bats = [];
        for (let i = 0; i < BATS.N; i++) {
            const home = P.roosts[i % P.roosts.length];
            const ang = Math.random() * 6.28, r = 6 + Math.random() * 16, y = home.y + Math.random() * 10 - 3;
            this.bats.push({ i, p: new THREE.Vector3(home.x + Math.cos(ang) * r, y, home.z + Math.sin(ang) * r), v: new THREE.Vector3(), home, ang, r, y, last: -1e9, dead: dead.has(i), mode: 'wheel', foe: null, t: 0, id: 'vb' + i });
        }
        // the guards
        const gdead = new Set(this.state.guardsDead);
        this.guards = P.posts.map((post, i) => {
            const model = new VillagerModel(guardLook(i), { castleColor: 0x5a0a12 });
            model.group.position.set(post.x, post.y, post.z);
            model.group.rotation.y = P.yaw;
            g.scene.add(model.group);
            const c = { isVamp: true, get isDead() { return this.dead; }, get group() { return this.model.group; }, get position() { return this.model.group.position; }, bodyCapsule: (out) => vampBody(c, out),
                kind: 'guard', i, id: 'vg' + i, model, post, hp: GUARDS.HP, dead: gdead.has(i), mode: 'idle', foe: null, cool: 0, yaw: P.yaw, r: 0.55, h: 3.4, speed: 0, animT: 0 };
            if (c.dead) model.group.visible = false;
            return c;
        });
        // the coffin in the crypt
        this.coffin = coffinModel();
        this.coffin.position.set(P.coffin.x, P.coffin.y - 1, P.coffin.z);
        this.coffin.rotation.y = P.yaw;
        g.scene.add(this.coffin);
        this.coffinBox = g.collision?.addBox?.(new THREE.Box3().setFromObject(this.coffin));
        // the count (asleep in the coffin: unseen till he rises)
        const model = new VillagerModel(countLook(), { castleColor: 0x7a0c14 });
        const cape = capeMesh();
        model.torso.add(cape);
        cape.position.set(0, 0.95, 0.3);
        const bat = bigBatModel();
        bat.visible = false;
        g.scene.add(model.group, bat);
        const cnt = this.count = { isVamp: true, get isDead() { return this.dead || this.mode === 'sleep' || this.mode === 'gone'; }, get group() { return this.mode === 'bat' ? this.bat : this.model.group; }, get position() { return this.pos; }, bodyCapsule: (out) => vampBody(cnt, out),
            kind: 'count', id: 'vc', model, cape, bat, pos: model.group.position, yaw: P.yaw, hp: VAMPIRE.HP, dead: this.state.countDead, mode: this.state.countDead ? 'gone' : 'sleep',
            foe: null, cool: 0, t: 0, batCool: 8, sayT: 6, r: 0.55, h: 3.6, speed: 0, animT: 0, warned: 0, parleyT: 0, flyY: 0, vel: new THREE.Vector3() };
        model.group.position.set(P.coffin.x, P.coffin.y, P.coffin.z);
        model.group.visible = false;
        this.list = [this.count, ...this.guards];
        // his chests by the coffin: locked while he lives (Game.openChest → Items.lootChest 'vampire')
        const ry = P.yaw + Math.PI;
        this._chests = (P.chests || []).map((c, i) => {
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y - 0.5, c.z), 'loot', ry, 'vampChest' + i, { style: 'rich' });
            chest.room = 'vampire';
            chest.locked = !this.state.countDead;
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision?.addBox(chest.getCollisionBox());
            if (g._openedChests?.has(chest.id)) chest.setOpenInstant();
            g.chests?.push(chest);
            return chest;
        });
    }

    _drop() {
        const g = this.game;
        this.on = false;
        if (this.batMesh) { g.scene.remove(this.batMesh); this.batMesh.geometry.dispose(); this.batMesh = null; }
        for (const c of this.guards) { g.scene.remove(c.model.group); c.model.dispose?.(); }
        this.guards = [];
        if (this.count) { g.scene.remove(this.count.model.group, this.count.bat); this.count.model.dispose?.(); this.count = null; }
        if (this.coffin) { g.scene.remove(this.coffin); this.coffin = null; if (this.coffinBox != null) g.collision?.removeBox?.(this.coffinBox); }
        for (const ch of this._chests) { const k = g.chests?.indexOf(ch); if (k >= 0) g.chests.splice(k, 1); if (ch.boxId != null) g.collision?.removeBox?.(ch.boxId); ch.dispose?.(); g.scene.remove(ch.mesh); }
        this._chests = [];
        this.list = [];
        this.bats = [];
    }

    // ------------------------------------------------------------------ who is near
    _players() {
        const g = this.game, out = this._pl || (this._pl = []);
        out.length = 0;
        const P = this.plan, info = this.count && !this.count.dead ? { key: 'vampire', x: this.count.pos.x, z: this.count.pos.z, say: (t) => this._say(t) } : null;
        const seen = (id, p) => (g.invis ? g.invis.aiPos(id, p, info) : p);
        if (!g.isDeadLocal && !g.combat?.dead) { const p = seen(g.localId, g.character.group.position); if (p) out.push({ id: g.localId, p: _feet(p, new THREE.Vector3()), fly: !!(g.flight?.active || g.wingFlight?.airborne) }); }
        for (const [id, r] of g.remotes || []) { if (r.dead) continue; const p = seen(id, r.position); if (p) out.push({ id, p: _feet(p, new THREE.Vector3()), fly: false }); }
        void P;
        return out;
    }

    _hurtPlayer(id, dmg, kind, from) {
        const g = this.game;
        if (id === g.localId) {
            if (g.wards?.shields?.(g.character.group.position, from)) return;
            g.combat?.damage?.(dmg, 'vampire', kind);
            g.fx?.blood?.(g.character.group.position.clone(), 6);
        } else g.sync?.vamp?.({ e: 'hurt', to: id, dmg, kind });
    }

    _say(t) {
        const g = this.game, c = this.count;
        if (!t || !c) return;
        g.hud?.setVoice?.(`🦇 Граф Сракула: «${t}»`, true);
        g.speech?.say?.(t, { pos: c.pos, voice: 'old_male', rate: 0.92 });
        if (g.sync && this.auth) g.sync.vamp?.({ e: 'say', t });
    }

    // ------------------------------------------------------------------ the minds (host)
    _think(dt) {
        const P = this.plan, players = this._players();
        this._thinkCount(dt, P, players);
        this._thinkBats(dt, P, players);
        for (const c of this.guards) if (!c.dead) this._thinkGuard(c, dt, players);
        if (this._alarm > 0) { this._alarm -= dt; if (this._alarm <= 0 && this.count?.mode === 'sleep') this._wake('attack'); }
    }

    /** Something attacked the castle at `pos` (a blast, a killed bat or guard): the bats rise, the count wakes a little later. */
    attacked(pos, by = null) {
        const P = this.plan;
        if (!P || !pos || Math.hypot(pos.x - P.x, pos.z - P.z) > VAMP.R + 40) return;
        if (!this.auth) { this.game.sync?.vamp?.({ e: 'att', p: [r2(pos.x), r2(pos.y), r2(pos.z)], by }); return; }
        for (const b of this.bats) if (!b.dead && b.mode === 'wheel' && Math.random() < 0.7) { b.mode = 'hunt'; b.foe = by; }
        if (this.count?.mode === 'sleep' && !(this._alarm > 0)) this._alarm = VAMPIRE.WAKE_DELAY;
        if (this.count && (this.count.mode === 'parley')) { this.count.mode = 'fight'; this.count.foe = by; this._say(pick(LINES.attack)); }
    }

    _wake(why, foe = null) {
        const c = this.count, P = this.plan, g = this.game;
        if (!c || c.dead || c.mode !== 'sleep') return;
        const lid = this.coffin?.userData.lid;
        if (lid) lid.rotation.z = -1.4;
        g.sound?.playVampire?.(c.pos, 'coffin');
        c.model.group.visible = true;
        c.pos.set(P.coffin.x + Math.cos(P.yaw) * 2.2, P.coffin.y - 0.5, P.coffin.z - Math.sin(P.yaw) * 2.2);
        c.mode = why === 'guest' ? 'parley' : 'fight';
        c.foe = foe; c.parleyT = 0; c.warned = 0; c.t = 0;
        this._say(why === 'guest' ? pick(LINES.parley) : pick(LINES.wake));
        g.sound?.playVampire?.(c.pos, why === 'guest' ? 'hiss' : 'laugh');
    }

    _nearest(players, from, max = 1e9) {
        let best = null, bd = max;
        for (const q of players) { const d = from.distanceTo(q.p); if (d < bd) { bd = d; best = q; } }
        return best ? { q: best, d: bd } : null;
    }

    _thinkCount(dt, P, players) {
        const c = this.count, g = this.game;
        if (!c || c.dead) return;
        c.t += dt;
        if (c.mode === 'sleep') {
            // a guest by the coffin: he rises — peaceful while the castle is quiet
            for (const q of players) if (Math.hypot(q.p.x - P.coffin.x, q.p.z - P.coffin.z) < VAMPIRE.WAKE_R && Math.abs(q.p.y - P.coffin.y) < 4) { this._wake(this._alarm > 0 || this.bats.some((b) => b.mode === 'hunt') ? 'attack' : 'guest', q.id); break; }
            return;
        }
        const tgt = (c.foe != null && players.find((q) => q.id === c.foe)) || this._nearest(players, c.pos, 60)?.q || null;
        if (!tgt) {
            // nobody near: back to the coffin
            if ((c.lonely = (c.lonely || 0) + dt) > 12) { c.mode = 'sleep'; c.model.group.visible = false; c.bat.visible = false; c.hp = Math.max(c.hp, Math.min(VAMPIRE.HP, c.hp + 40)); const lid = this.coffin?.userData.lid; if (lid) lid.rotation.z = 0; c.lonely = 0; }
            return;
        }
        c.lonely = 0;
        const dist = Math.hypot(tgt.p.x - c.pos.x, tgt.p.z - c.pos.z);
        const want = yawTo(c.pos.x, c.pos.z, tgt.p.x, tgt.p.z);
        if (c.mode === 'parley') {
            c.yaw = turnToward(c.yaw, want, 3 * dt);
            c.speed = 0; c.anim = 'talk';
            c.parleyT += dt;
            if (dist > 46) { if ((c.leftT = (c.leftT || 0) + dt) > 6) { this._say(pick(LINES.leave)); c.mode = 'sleep'; c.model.group.visible = false; const lid = this.coffin?.userData.lid; if (lid) lid.rotation.z = 0; } return; }
            c.leftT = 0;
            if (c.parleyT > VAMPIRE.PARLEY_WARN * (c.warned + 1) && c.warned < 3) { c.warned++; this._say(LINES.warn[Math.min(2, c.warned - 1)]); g.sound?.playVampire?.(c.pos, 'hiss'); }
            if (c.parleyT > VAMPIRE.PARLEY_MAX || dist < VAMPIRE.PARLEY_CLOSE) { c.mode = 'fight'; c.foe = tgt.id; this._say(pick(LINES.attack)); g.sound?.playVampire?.(c.pos, 'laugh'); }
            return;
        }
        if (c.mode === 'turning') {
            c.turnT -= dt;
            c.speed = 0;
            if (c.turnT <= 0) {
                if (c.toBat) { c.mode = 'bat'; c.batT = VAMPIRE.BAT_T; c.swoopT = 1.2; c.flyY = c.pos.y + 4; this._say(pick(LINES.bat)); }
                else { c.mode = 'fight'; c.batCool = VAMPIRE.BAT_EVERY; this._say(pick(LINES.back)); }
            }
            return;
        }
        if (c.mode === 'bat') { this._batForm(c, dt, tgt, dist); return; }
        // the fight on foot
        c.cool -= dt; c.batCool -= dt; c.sayT -= dt;
        if (c.sayT <= 0) { c.sayT = VAMPIRE.SAY_EVERY[0] + Math.random() * (VAMPIRE.SAY_EVERY[1] - VAMPIRE.SAY_EVERY[0]); this._say(pick(LINES.taunt)); }
        if (c.phase === 'rush') {
            c.phaseT -= dt;
            const dx = tgt.p.x - c.pos.x, dz = tgt.p.z - c.pos.z, dd = Math.hypot(dx, dz) || 1;
            c.yaw = want;
            this._step(c, dx / dd * VAMPIRE.RUSH * dt, dz / dd * VAMPIRE.RUSH * dt);
            c.anim = 'run'; c.speed = VAMPIRE.RUSH;
            if (dd < VAMPIRE.REACH) {
                this._hurtPlayer(tgt.id, VAMPIRE.BLOW, Math.random() < 0.5 ? 'bite' : 'claw', c.pos);
                g.sound?.playVampire?.(c.pos, 'bite');
                c.phase = 'leap'; c.phaseT = VAMPIRE.LEAP_T; c.cool = VAMPIRE.RECOVER[0] + Math.random() * (VAMPIRE.RECOVER[1] - VAMPIRE.RECOVER[0]);
            } else if (c.phaseT <= 0) { c.phase = 'leap'; c.phaseT = VAMPIRE.LEAP_T * 0.6; c.cool = VAMPIRE.RECOVER[0]; }
            return;
        }
        if (c.phase === 'leap') {
            c.phaseT -= dt;
            const dx = c.pos.x - tgt.p.x, dz = c.pos.z - tgt.p.z, dd = Math.hypot(dx, dz) || 1;
            this._step(c, dx / dd * VAMPIRE.LEAP * dt, dz / dd * VAMPIRE.LEAP * dt);
            c.hop = Math.sin((1 - c.phaseT / VAMPIRE.LEAP_T) * Math.PI) * 1.4;
            c.anim = 'run'; c.speed = 6;
            if (c.phaseT <= 0) { c.phase = null; c.hop = 0; }
            return;
        }
        const facing = facesTarget(c.yaw, c.pos.x, c.pos.z, tgt.p.x, tgt.p.z, FACE.MELEE);
        const move = fightMove({ dist, cool: c.cool, hpK: c.hp / VAMPIRE.HP, batCool: c.batCool, high: tgt.fly || tgt.p.y - c.pos.y > 6, facing });
        c.yaw = turnToward(c.yaw, want, 4 * dt);
        if (move === 'bat') { c.mode = 'turning'; c.toBat = true; c.turnT = VAMPIRE.TURN_T; g.sound?.playVampire?.(c.pos, 'turn'); this._smoke(c.pos, 40); return; }
        if (move === 'rush') { c.phase = 'rush'; c.phaseT = VAMPIRE.RUSH_T; g.sound?.playVampire?.(c.pos, 'rush'); return; }
        if (move === 'walk') { const dx = tgt.p.x - c.pos.x, dz = tgt.p.z - c.pos.z, dd = Math.hypot(dx, dz) || 1; this._step(c, dx / dd * VAMPIRE.WALK * dt, dz / dd * VAMPIRE.WALK * dt); c.anim = 'walk'; c.speed = VAMPIRE.WALK; return; }
        // stalking: a slow sidestep round the foe
        const sx = -(tgt.p.z - c.pos.z), sz = tgt.p.x - c.pos.x, sd = Math.hypot(sx, sz) || 1, side = (Math.floor(c.t / 3) % 2) ? 1 : -1;
        this._step(c, sx / sd * side * 1.4 * dt, sz / sd * side * 1.4 * dt);
        c.anim = 'walk'; c.speed = 1.4;
    }

    /** The great bat: flies over the foe, swoops down to bite, rises again; after BAT_T s it lands and turns back. */
    _batForm(c, dt, tgt, dist) {
        const g = this.game;
        c.batT -= dt; c.swoopT -= dt;
        const want = c.swoop ? tgt.p.y + 2.6 : tgt.p.y + 7 + Math.sin(c.t * 1.3) * 1.5;
        const dx = tgt.p.x - c.pos.x, dz = tgt.p.z - c.pos.z, dd = Math.hypot(dx, dz) || 1;
        const circle = c.swoop ? 0 : 1, ang = c.t * 0.9;
        const gx = c.swoop ? tgt.p.x : tgt.p.x + Math.cos(ang) * 9 * circle, gz = c.swoop ? tgt.p.z : tgt.p.z + Math.sin(ang) * 9 * circle;
        const mx = gx - c.pos.x, mz = gz - c.pos.z, md = Math.hypot(mx, mz) || 1, sp = Math.min(VAMPIRE.BAT_SPEED, md / dt);
        c.pos.x += mx / md * sp * dt; c.pos.z += mz / md * sp * dt;
        c.pos.y += (want - c.pos.y) * Math.min(1, dt * 2.5);
        c.yaw = Math.atan2(-mx, -mz);
        if (!c.swoop && c.swoopT <= 0) { c.swoop = true; g.sound?.playVampire?.(c.pos, 'hiss'); }
        if (c.swoop && dd < VAMPIRE.REACH + 0.6 && Math.abs(c.pos.y - tgt.p.y - 2) < 2.5) { this._hurtPlayer(tgt.id, VAMPIRE.BLOW, 'bite', c.pos); g.sound?.playVampire?.(c.pos, 'bite'); c.swoop = false; c.swoopT = VAMPIRE.BAT_SWOOP; }
        if (c.swoop && c.swoopT < -2.5) { c.swoop = false; c.swoopT = VAMPIRE.BAT_SWOOP; }
        void dist;
        if (c.batT <= 0) {
            // down to the ground, then the turning back
            const gy = this._ground(c.pos.x, c.pos.z, c.pos.y);
            c.pos.y += (gy - c.pos.y) * Math.min(1, dt * 4);
            if (c.pos.y - gy < 0.6) { c.pos.y = gy; c.mode = 'turning'; c.toBat = false; c.turnT = VAMPIRE.TURN_T; g.sound?.playVampire?.(c.pos, 'turn'); this._smoke(c.pos, 40); }
        }
    }

    _ground(x, z, y) { const col = this.game.collision; return col?.groundAt ? col.groundAt(x, z, y + 2) : col?.groundY ? col.groundY(x, z) : y; }

    /** A step on the ground for the count / a guard: never through walls (Collision.resolveCylinder), down onto the floor. */
    _step(c, dx, dz) {
        const p = c.kind === 'count' ? c.pos : c.model.group.position, col = this.game.collision;
        p.x += dx; p.z += dz;
        col?.resolveCylinder?.(p, c.r, p.y, c.h, 1.05);
        const gy = this._ground(p.x, p.z, p.y);
        if (gy < p.y + 1.2) p.y += (gy - p.y) * 0.5;
    }

    _thinkBats(dt, P, players) {
        const now = performance.now() / 1000, g = this.game;
        for (const b of this.bats) {
            if (b.dead) continue;
            b.t += dt;
            if (b.mode === 'wheel') {
                // wheeling round its spire; a hero seen out in the open (not in the keep) is the swarm's quarry
                b.ang += dt * (0.6 + (b.i % 5) * 0.08) * (b.i % 2 ? 1 : -1);
                _v.set(b.home.x + Math.cos(b.ang) * b.r, b.y + Math.sin(b.t * 0.7 + b.i) * 2, b.home.z + Math.sin(b.ang) * b.r);
                b.p.lerp(_v, Math.min(1, dt * 2));
                if ((b.i + Math.floor(b.t * 4)) % 8 === 0) for (const q of players) if (q.p.distanceTo(b.p) < BATS.SEE && !inVampKeep(P, q.p.x, q.p.z)) { b.mode = 'hunt'; b.foe = q.id; if (!this._swarmSaid || now - this._swarmSaid > 20) { this._swarmSaid = now; g.sound?.playVampire?.(b.p, 'swarm'); } break; }
                continue;
            }
            const q = players.find((o) => o.id === b.foe);
            if (!q || q.p.distanceTo(b.p) > BATS.LOSE || inVampKeep(P, q.p.x, q.p.z)) { b.mode = 'wheel'; b.foe = null; continue; }
            // a bat that bit flutters off a little, then comes again (a bite at most once in COOL s)
            const may = batMayBite(b.last, now);
            const off = may ? 0 : 1, a = b.t * 2.3 + b.i;
            _v.set(q.p.x + Math.cos(a) * (1.2 + off * 5), q.p.y + 2.6 + Math.sin(b.t * 3 + b.i) * 0.8 + off * 3, q.p.z + Math.sin(a) * (1.2 + off * 5));
            _v2.subVectors(_v, b.p);
            const d = _v2.length();
            if (d > 1e-3) b.p.addScaledVector(_v2, Math.min(1, BATS.SPEED * dt / d));
            if (may && b.p.distanceTo(_v.set(q.p.x, q.p.y + 2.6, q.p.z)) < 1.1) {
                b.last = now;
                this._hurtPlayer(q.id, BATS.BITE, 'batBite', b.p);
                if (!this._squeakAt || now - this._squeakAt > 0.4) { this._squeakAt = now; g.sound?.playVampire?.(b.p, 'squeak'); }
                if (this.count?.mode === 'sleep' && !(this._alarm > 0)) this._alarm = VAMPIRE.WAKE_DELAY * 2; // (the swarm's noise: the count stirs)
            }
        }
    }

    _thinkGuard(c, dt, players) {
        const p = c.model.group.position;
        c.cool -= dt;
        let tgt = c.foe != null ? players.find((q) => q.id === c.foe) : null;
        if (!tgt) { const n = this._nearest(players, p, GUARDS.SEE); if (n) { tgt = n.q; c.foe = tgt.id; } }
        const home = c.post, fromHome = Math.hypot(p.x - home.x, p.z - home.z);
        if (tgt && Math.hypot(tgt.p.x - home.x, tgt.p.z - home.z) > GUARDS.LEASH) { tgt = null; c.foe = null; }
        if (!tgt) {
            if (fromHome > 1) { const dx = home.x - p.x, dz = home.z - p.z, d = Math.hypot(dx, dz); c.yaw = turnToward(c.yaw, yawTo(p.x, p.z, home.x, home.z), 4 * dt); this._step(c, dx / d * GUARDS.WALK * dt, dz / d * GUARDS.WALK * dt); c.anim = 'walk'; c.speed = GUARDS.WALK; }
            else { c.anim = 'idle'; c.speed = 0; c.yaw = turnToward(c.yaw, this.plan.yaw, 2 * dt); }
            return;
        }
        const dx = tgt.p.x - p.x, dz = tgt.p.z - p.z, d = Math.hypot(dx, dz) || 1;
        c.yaw = turnToward(c.yaw, yawTo(p.x, p.z, tgt.p.x, tgt.p.z), 5 * dt);
        if (d > GUARDS.REACH) { this._step(c, dx / d * GUARDS.RUN * dt, dz / d * GUARDS.RUN * dt); c.anim = 'run'; c.speed = GUARDS.RUN; return; }
        c.anim = 'attack'; c.speed = 0;
        if (c.cool <= 0 && facesTarget(c.yaw, p.x, p.z, tgt.p.x, tgt.p.z, FACE.MELEE)) { c.cool = GUARDS.COOL; this._hurtPlayer(tgt.id, GUARDS.DMG, 'blade', p); this.game.sound?.playHit?.(); }
    }

    _smoke(pos, n) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        for (let i = 0; i < n; i++) fx.spark(_v.set(pos.x + (Math.random() - 0.5) * 2, pos.y + 0.5 + Math.random() * 3, pos.z + (Math.random() - 0.5) * 2), i % 3 ? 0x1a0a14 : 0x7a0c14, 0.25, _v2.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 1.2);
    }

    // ------------------------------------------------------------------ drawing
    _draw(dt) {
        const c = this.count;
        if (c && !c.dead) {
            const batNow = c.mode === 'bat' || (c.mode === 'turning' && c.toBat && c.turnT < VAMPIRE.TURN_T * 0.5) || (c.mode === 'turning' && !c.toBat && c.turnT > VAMPIRE.TURN_T * 0.5);
            const shown = c.mode !== 'sleep' && c.mode !== 'gone';
            c.model.group.visible = shown && !batNow;
            c.bat.visible = shown && batNow;
            c.model.group.rotation.y = c.yaw;
            if (c.hop) c.model.group.position.y = c.pos.y + c.hop;
            if (c.bat.visible) {
                c.bat.position.copy(c.pos).y += 1.5;
                c.bat.rotation.set(0, c.yaw, 0);
                const flap = Math.sin(performance.now() / 1000 * 7);
                c.bat.userData.body.scale.set(6.5 * (1 - 0.1 * Math.abs(flap)), 6.5 + flap * 1.2, 6.5);
            }
            if (c.model.group.visible) {
                c.animT = dt;
                c.model.update(dt, { mode: c.anim === 'talk' ? 'talk' : c.anim === 'run' ? 'run' : c.anim === 'walk' ? 'walk' : c.anim === 'attack' ? 'attack' : 'idle', speed: c.speed });
                // the cape follows the motion: blown back as he dashes
                c.cape.rotation.x = -Math.min(0.9, (c.speed || 0) * 0.05);
            }
        }
        for (const gd of this.guards) {
            if (gd.dead) { if (gd.deadT != null) { gd.deadT += dt; gd.model.update(dt, { mode: 'dead' }); if (gd.deadT > 20) gd.model.group.visible = false; } continue; }
            gd.model.group.rotation.y = gd.yaw;
            gd.model.update(dt, { mode: gd.anim || 'idle', speed: gd.speed });
        }
        if (this.batMesh) {
            let n = 0;
            for (const b of this.bats) {
                if (b.dead) continue;
                const dir = b.v.subVectors(b.p, b.prev || b.p);
                b.prev = (b.prev || new THREE.Vector3()).copy(b.p);
                const yaw = dir.lengthSq() > 1e-6 ? Math.atan2(-dir.x, -dir.z) : (b.yaw || 0);
                b.yaw = yaw;
                _q.setFromEuler(_e.set(Math.max(-0.5, Math.min(0.5, -dir.y * 4)), yaw, 0, 'YXZ'));
                _m.compose(b.p, _q, _s.set(1, 1, 1));
                this.batMesh.setMatrixAt(n++, _m);
            }
            this.batMesh.count = n;
            this.batMesh.instanceMatrix.needsUpdate = true;
        }
    }

    // ------------------------------------------------------------------ blows on them (spells, blades) — host decides
    /** The count, the guards and the bats a spell can aim at (Duel._bodies, Brainrot…). */
    targets() {
        if (!this.on) return [];
        const out = this._targ || (this._targ = []);
        out.length = 0;
        const c = this.count;
        if (c && !c.dead && c.mode !== 'sleep' && c.mode !== 'gone') out.push(c);
        for (const g of this.guards) if (!g.dead) out.push(g);
        return out;
    }
    byId(id) { if (id === 'vc') return this.count; return this.guards.find((g) => g.id === id) || null; }
    posOf(c) { return c.kind === 'count' ? c.pos : c.model.group.position; }

    /** A blow on one of them (host): HP by its own rules, the count wakes and fights the striker. */
    hit(c, dmg, spell = null, by = null) {
        const g = this.game;
        if (!c || c.dead || !(dmg > 0)) return;
        if (!this.auth) { g.sync?.vamp?.({ e: 'hit', id: c.id, dmg, spell, by }); return; }
        if (c.kind === 'count') {
            const hpWas = c.hp;
            c.hp -= vampDamage(spell, dmg, GOD_SPELLS.has(spell));
            c.model.flashHit?.(0.18);
            if (c.mode === 'sleep') this._wake('attack', by);
            else if (c.mode === 'parley') { c.mode = 'fight'; this._say(pick(LINES.attack)); }
            if (by != null) c.foe = by;
            if (hpWas - c.hp >= 8 && Math.random() < 0.35) this._say(pick(LINES.hurt));
            if (c.hp <= 0) this._countDies(by);
            return;
        }
        const d = spell === 'blade' || spell == null ? dmg : pirateBoneDamage(spell, dmg, true);
        c.hp -= d;
        c.model.flashHit?.(0.15);
        if (by != null) c.foe = by;
        this.attacked(c.model.group.position, by);
        if (c.hp <= 0) { c.dead = true; c.deadT = 0; this.state.guardsDead.push(c.i); g.sound?.playVampire?.(c.model.group.position, 'crumble'); }
    }

    /** A bat struck (any blow kills it): it falls and never comes back. */
    killBat(b, by = null) {
        if (!b || b.dead) return;
        if (!this.auth) { this.game.sync?.vamp?.({ e: 'bat', i: b.i, by }); return; }
        b.dead = true;
        this.state.batsDead.push(b.i);
        this.game.sound?.playVampire?.(b.p, 'squeak');
        this.attacked(b.p, by);
    }

    /** A blast / lightning at `pos` (Game.explode, lightningAt…). */
    hitAt(pos, radius, dmg, spell = null, by = null) {
        if (!this.on || !pos) return;
        for (const c of this.list) if (!c.dead && c.mode !== 'sleep' && this.posOf(c).distanceTo(pos) < radius + c.r + 1.5) this.hit(c, dmg * Math.max(0.3, 1 - this.posOf(c).distanceTo(pos) / (radius + 2)), spell, by);
        for (const b of this.bats) if (!b.dead && b.p.distanceTo(pos) < radius + 1) this.killBat(b, by);
        this.attacked(pos, by);
    }

    /** A ray (Sapira, Thunderwave, Ice, Inferno…) from `o` along `d` (len, width). */
    hitRay(o, d, len, width, dmg, spell = null, by = null) {
        if (!this.on) return;
        const near = (p, r) => { _v.subVectors(p, o); const t = Math.max(0, Math.min(len, _v.dot(d))); return _v.addScaledVector(d, -t).length() < width + r; };
        for (const c of this.list) if (!c.dead && c.mode !== 'sleep' && near(_v2.copy(this.posOf(c)).setY(this.posOf(c).y + 1.6), c.r + 0.8)) this.hit(c, dmg, spell, by);
        for (const b of this.bats) if (!b.dead && near(b.p, 0.4)) this.killBat(b, by);
    }

    /** A duel charge reached one of them. */
    boltHit(c, spell, by, front = null) {
        void front;
        const dmg = BOLT_DMG[spell] ?? 4;
        if (spell === 'Stupefy' && c) c.cool = Math.max(c.cool || 0, 2);
        this.hit(c, dmg, spell, by);
    }

    _countDies(by) {
        const c = this.count, g = this.game;
        c.dead = true; this.state.countDead = true; c.mode = 'gone';
        this._say(pick(LINES.death));
        g.sound?.playVampire?.(c.pos, 'crumble');
        this._smoke(c.pos, 120);
        c.model.group.visible = false; c.bat.visible = false;
        for (const ch of this._chests) ch.locked = false;
        g.achievements?.killed?.('vampire', 'count', by, c.pos);
        g.hud?.setVoice?.('🦇 Граф Сракула рассыпался в прах. Тучи над его землёй всё ещё висят — но теперь «To the Sun» их развеет', true);
        for (const b of this.bats) if (!b.dead) { b.mode = 'wheel'; b.foe = null; }
    }

    // ------------------------------------------------------------------ the network
    _netSend(dt) {
        const g = this.game;
        if (!g.sync || !this.on) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.12;
        const c = this.count;
        const bats = [];
        for (const b of this.bats) if (!b.dead) bats.push(b.i, r2(b.p.x), r2(b.p.y), r2(b.p.z));
        g.sync.vamp?.({ e: 'st', c: c ? [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.yaw), c.mode, Math.round(c.hp), c.anim || 'idle', r2(c.speed || 0), c.toBat ? 1 : 0, r2(c.turnT || 0)] : null,
            g: this.guards.map((x) => [r2(x.model.group.position.x), r2(x.model.group.position.y), r2(x.model.group.position.z), r2(x.yaw), x.anim || 'idle', x.dead ? 1 : 0]), b: bats,
            dead: this.state.countDead ? 1 : 0, cleared: this.state.cleared ? 1 : 0 });
    }

    _follow(dt) {
        const S = this._net;
        if (!S) return;
        const c = this.count, k = Math.min(1, dt * 10);
        if (c && S.c) {
            const [x, y, z, yaw, mode, hp, anim, speed, toBat, turnT] = S.c;
            c.pos.x += (x - c.pos.x) * k; c.pos.y += (y - c.pos.y) * k; c.pos.z += (z - c.pos.z) * k;
            c.yaw = yaw; c.mode = mode; c.hp = hp; c.anim = anim; c.speed = speed; c.toBat = !!toBat; c.turnT = turnT;
            if (mode !== 'sleep') { const lid = this.coffin?.userData.lid; if (lid) lid.rotation.z = -1.4; }
        }
        (S.g || []).forEach((r, i) => { const gd = this.guards[i]; if (!gd) return; const p = gd.model.group.position; p.x += (r[0] - p.x) * k; p.y += (r[1] - p.y) * k; p.z += (r[2] - p.z) * k; gd.yaw = r[3]; gd.anim = r[4]; if (r[5] && !gd.dead) { gd.dead = true; gd.deadT = 0; } });
        const alive = new Set();
        const B = S.b || [];
        for (let j = 0; j + 3 < B.length; j += 4) { const b = this.bats[B[j]]; if (!b) continue; alive.add(B[j]); b.p.lerp(_v.set(B[j + 1], B[j + 2], B[j + 3]), k); }
        for (const b of this.bats) if (!alive.has(b.i)) b.dead = true;
        if (S.dead && !this.state.countDead) { this.state.countDead = true; if (c) { c.dead = true; c.mode = 'gone'; } for (const ch of this._chests) ch.locked = false; }
        if (S.cleared) this.state.cleared = true;
    }

    /** A `vamp` message (NetSync). */
    onNet(m, from) {
        const g = this.game;
        if (m.e === 'st') { this._net = m; return; }
        if (m.e === 'say') { if (!this.auth) g.hud?.setVoice?.(`🦇 Граф Сракула: «${m.t}»`, true); return; }
        if (m.e === 'hurt') { if (m.to === g.localId) g.combat?.damage?.(m.dmg, 'vampire', m.kind); return; }
        if (m.e === 'clear') { this.state.cleared = true; g.storm?.clearSky?.(); return; }
        if (!this.auth) return;
        if (m.e === 'hit') { const c = this.byId(m.id); if (c) this.hit(c, m.dmg, m.spell, m.by ?? from); return; }
        if (m.e === 'bat') { const b = this.bats[m.i]; if (b) this.killBat(b, m.by ?? from); return; }
        if (m.e === 'att') { this.attacked(_v.set(m.p[0], m.p[1], m.p[2]), m.by ?? from); }
    }

    // ------------------------------------------------------------------ the save
    snapshot() { return { ...this.state, batsDead: [...this.state.batsDead], guardsDead: [...this.state.guardsDead] }; }
    restore(s) {
        if (!s) return;
        this.state = { countDead: !!s.countDead, batsDead: [...(s.batsDead || [])], guardsDead: [...(s.guardsDead || [])], seen: !!s.seen, cleared: !!s.cleared };
        if (this.on) { this._drop(); }
    }

    dispose() { if (this.on) this._drop(); if (this._decks) { for (const m of this._decks) { this.game.scene?.remove(m); m.geometry.dispose(); } this._decks = null; } }

    /** Shapes and materials to compile on the loading screen (Game.prewarm). */
    static samples() {
        const geo = batGeometry().clone();
        geo.setAttribute('batPh', new THREE.InstancedBufferAttribute(new Float32Array(2), 2));
        const im = new THREE.InstancedMesh(geo, batMaterial(), 1);
        im.setMatrixAt(0, new THREE.Matrix4());
        return [im, coffinModel(), bigBatModel()];
    }
}

function _feet(p, out) { return out.set(p.x, p.y - 1.95, p.z); }
const _posOf = (c) => (c.kind === 'count' ? c.pos : c.model.group.position);
/** A charge's target capsule (Duel._bodies): from the feet to the head (the great bat: a ball where it flies). */
export function vampBody(c, out = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }) {
    const p = _posOf(c), bat = c.mode === 'bat';
    out.r = bat ? 1.6 : c.r + 0.15;
    out.a.set(p.x, p.y + (bat ? 1.5 : out.r), p.z);
    out.b.set(p.x, p.y + (bat ? 1.6 : c.h - out.r), p.z);
    return out;
}
export function vampCenter(c, out = new THREE.Vector3()) { const p = _posOf(c); return out.set(p.x, p.y + (c.mode === 'bat' ? 1.5 : c.h * 0.55), p.z); }

// pushes, gusts, knockdowns (CreatureImpact): the guards are thrown like any skeleton; the count only reels (he is no man of bones)
registerKind('V', {
    name: 'vampire', faces: -1,
    list: (g) => g.vampire?.list || [],
    get: (g, id) => g.vampire?.byId(id),
    alive: (c) => !c.dead && c.mode !== 'sleep' && c.mode !== 'gone',
    body: (c) => (c.kind === 'count' ? 'vampire' : 'skeleton'),
    centre: (c, out) => { const p = c.kind === 'count' ? c.pos : c.model.group.position; return out.set(p.x, p.y + 1.7, p.z); },
    pivot: () => ({ obj: null, base: 0, lie: 0 }),
    head: (c) => c.model?.head || null, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { g.vampire?._step(c, dx, dz); },
    toss() {},
    hold(g, c, t) { c.cool = Math.max(c.cool || 0, Math.min(t, 1.5)); },
    frozen: () => false,
    noKnock: (c) => c.kind === 'count',
    struck(g, c, o) { if (o.by != null) c.foe = o.by; },
});
