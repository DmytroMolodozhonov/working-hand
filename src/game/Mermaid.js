/**
 * Mermaid.js — «Зелье русалки» (the author 05.11: «Русалка (12 мин): хвост, дышит под водой, ×2 скорость при «рыбьих» движениях с
 * поднятыми руками, не ходит; «стоп» не снимает: хвост магического водного существа + груша Баксади»). The effect's clock is
 * PotionEffects ('mermaid', 12 min — «Обнуление» and death end it, «стоп» does not: it is no spell); here is what it does:
 *   - the legs are gone: a fish's tail grows from the hips (the model below), seen by everyone (the pose packet's px bit 8);
 *   - under the water the air never runs out (Swimming);
 *   - in the water: the TORSO swaying side to side, the way a fish wriggles (the author 05.11, the second time: «не нужно руки вверх
 *     поднимать… достаточно просто туловищем туда-сюда водить… ещё сильнее ускоряться, до 5 раз больше… при условии, что он немало
 *     времени потратил на то, чтобы петлять») — the tail drives the body on: at once twice the swimmer's top speed, and the longer the
 *     wriggling goes on, the faster — up to TAIL_TOP (five times that); the old way (the raised hands waving) works too; the arms'
 *     strokes push as always;
 *   - on the land: it does not walk — it drags itself slowly on the tail (LAND_K of the walking pace), no jumping;
 *   - the tail sweeps up and down in the water, faster the faster it swims; out of the water it lies still and only twitches.
 * What may go wrong: drunk on a horse / a broom / in flight — the tail is there, the riding goes on (no walking is the only rule); in the
 * dragon's form — the dragon goes on (the tail shows when he is a man again, if the time is left); dead — it ends (PotionEffects).
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from './AnimalModels.js';
import { finGeo } from './SeaModels.js';
import { SWIM } from './SwimStroke.js';
import { changeHurt, painRed } from './TransformPain.js';

const _sp = new THREE.Vector3(), _sv = new THREE.Vector3();

export const MERMAID = {
    LAND_K: 0.18, // × the walking pace on the land (it drags itself)
    TAIL_MAX: 2, // × the swimmer's top speed with the tail, from the first strokes of it
    TAIL_TOP: 10, // × the swimmer's top speed: the tail at full rhythm (FLOW 1) — five times the start (the author: «до 5 раз больше»)
    FLOW_UP: 0.03, // 1/s the rhythm builds while the wriggling goes on (× how fast: ~25–35 s of it to the top — «немало времени петлять»)
    FLOW_DOWN: 0.45, // 1/s it falls away when the waves stop (slow ones: it eases off a little at a time)
    THRUST: 3.2, // m/s² the tail adds while the fish's movement goes on (more at a higher rhythm)
    WAVE: 0.55, // m/s: the raised hands going up and down together at least this fast — the fish's movement (the old way)
    SWAY: 0.55, // shoulder-widths a second: the torso swaying side to side at least this fast — the wriggle
    SWAY_TURN: 1.6, // s: a turn of the sway (left ↔ right) at least this recent — it is a wriggle, not one step aside
    LEN: 2.25, // m from the hips to the fluke's root (the legs were 1.95)
    // the change (the author 05.11: «как с крыльями… анимация какое-то время длилась… страдания… минус 1 хп… красное вокруг экрана,
    // замыливание, а через секунд 10 — хвост»)
    CHANGE_S: 10, // s from the potion to the tail
    PAIN: 1, // HP lost to it
    TAIL_GROW_S: 3, // s: the last of the change — the legs grow together into the tail
};

let _tailMats = null;
function mats() {
    if (_tailMats) return _tailMats;
    const scales = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, shininess: 70, specular: 0x8fd8ff });
    const fin = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: new THREE.Color(0x1b6f8a), emissiveIntensity: 0.25 });
    _tailMats = { scales, fin };
    return _tailMats;
}

/** The scales: rows of overlapping scales (a darker rim on each), teal to green along the tail, a play of violet, the belly paler. */
function scalePaint(t, ang) {
    const row = t * 46, col = ang * 7 + (Math.floor(row) % 2) * 0.5;
    const fx = row - Math.floor(row), fy = col - Math.floor(col);
    const rim = Math.max(Math.abs(fx - 0.5), Math.abs(fy - 0.5)) * 2; // (0 the middle of a scale … 1 its edge)
    let c = K.mix([0.12, 0.62, 0.66], [0.16, 0.58, 0.34], t);
    c = K.mix(c, [0.45, 0.33, 0.78], 0.25 * (0.5 + 0.5 * Math.sin(t * 9 + ang * 2)));
    c = K.mix(c, [0.62, 0.86, 0.84], 0.4 * Math.max(0, -Math.sin(ang))); // (the belly paler)
    const k = 1.08 - 0.32 * rim * rim;
    return [c[0] * k, c[1] * k, c[2] * k];
}

/** The tail on a character (its legs hidden): {set(on, sweep), dispose()}. */
export function attachTail(character) {
    const g = character?.group;
    if (!g) return null;
    const { scales, fin } = mats();
    const root = new THREE.Group();
    root.name = 'mermaidTail';
    const L = MERMAID.LEN;
    // the tail: from the hips (wide as them) narrowing down to the fluke, a little forward then back like a fish's body
    const tail = K.mesh(root, K.cached('mermaidTail', () => {
        const k = K.keys([[0, 0.42, 0.3, 0], [0.18, 0.4, 0.3, 0.02], [0.45, 0.3, 0.24, 0.03], [0.75, 0.17, 0.14, 0.01], [1, 0.07, 0.06, 0]]);
        return K.sweep([K.v3(0, 0.15, 0), K.v3(0, -L * 0.35, 0.06), K.v3(0, -L * 0.7, -0.02), K.v3(0, -L, 0.04)], (t) => k(t), { rings: 30, sides: 22, color: scalePaint, side: new THREE.Vector3(1, 0, 0) });
    }), scales);
    tail.name = 'tailBody';
    // the fluke (a lower part that bends), wide and veined, translucent at its edge
    const low = new THREE.Group();
    low.position.set(0, -L * 0.62, 0.0);
    root.add(low);
    const fluke = K.mesh(low, finGeo('mermaidFluke', [[0, 0.1], [0.25, -0.05], [0.62, -0.42], [0.72, -0.72], [0.4, -0.55], [0.08, -0.5], [0, -0.42], [-0.08, -0.5], [-0.4, -0.55], [-0.72, -0.72], [-0.62, -0.42], [-0.25, -0.05]], 0.03,
        (x, y, e) => K.mix([0.2, 0.7, 0.72], [0.75, 0.97, 0.95], Math.min(1, e * 1.1)).map((v, i) => v * (0.92 + 0.08 * Math.sin(Math.atan2(y, x) * 18 + i)))), fin, 0, -L * 0.38, 0);
    fluke.rotation.x = -0.15;
    // little fins at the hips
    for (const s of [1, -1]) {
        const f = K.mesh(root, finGeo('mermaidSide', [[0, 0], [0.18, -0.08], [0.3, -0.3], [0.12, -0.24], [0, -0.12]], 0.02, (x, y, e) => K.mix([0.22, 0.68, 0.7], [0.7, 0.95, 0.95], e)), fin, 0.33 * s, -0.25, 0.05);
        f.scale.x = s;
        f.rotation.y = 0.4 * s;
    }
    root.position.set(0, 0, 0);
    g.add(root);
    const legs = [character.leftLegPivot, character.rightLegPivot].filter(Boolean);
    return {
        root,
        set(on, sweep = 0) {
            root.visible = on;
            for (const l of legs) l.visible = !on;
            root.rotation.x = 0.25 * sweep;
            low.rotation.x = 0.55 * sweep;
        },
        dispose() { root.parent?.remove(root); for (const l of legs) l.visible = true; },
    };
}

export class Mermaid {
    constructor(game) {
        this.game = game;
        this.tail = null;
        this.ph = 0;
        this._hy = null;
        this.wave = 0;
        this.change = null; // s into the change (≥ 0), −1 done, null: no potion
    }

    get active() { return !!this.game.potionFx?.has?.('mermaid'); }

    /** Every frame: the tail on / off, its sweep; on the land — the slow drag. */
    update(dt) {
        const g = this.game, ch = g.character;
        if (!ch) return;
        const on = this.active && !g.dragonForm?.active;
        if (on && !this.tail && this.change == null) {
            // drunk just now (its full time left): the change, ~10 s; loaded / come back to an old one: the tail at once
            const left = g.potionFx?.left?.mermaid || 0, full = 12 * 60;
            if (left > full - 2) this.change = 0;
            else { this.tail = attachTail(ch); this.change = -1; }
        }
        if (!on) { if (this.tail) { this.tail.dispose(); this.tail = null; } this.change = null; this._pain(-1); return; }
        if (this.change >= 0) { this._changing(dt); if (this.change >= 0) return; }
        const swimming = !!ch.swimming;
        const sp = swimming ? (g.swim?.motion?.speed || 0) : 0;
        this.ph += dt * (swimming ? 2 + sp * 1.6 : 0.8);
        this.tail.set(true, swimming ? Math.sin(this.ph) * (0.35 + 0.15 * Math.min(1, sp / 4)) : 0.06 * Math.sin(this.ph * 3));
        // on the land: no walking — it drags itself
        if (!swimming && ch.swimY == null) { ch.speedScale = MERMAID.LAND_K; ch.jumpAir = false; }
    }

    /**
     * The change (every frame of it): the legs cramp and shake, scales glint on them, the picture swims and the edges of the eyes go red
     * with pain in waves, −1 HP; in the last seconds the legs grow together into the tail. The hero can still move (no lock: in the water
     * he might drown — the water's breath is the potion's from the first moment: Swimming).
     */
    _changing(dt) {
        const g = this.game, ch = g.character, M = MERMAID;
        const t0 = this.change, t = (this.change += dt);
        const k = Math.min(1, t / M.CHANGE_S);
        // the words
        if (t0 === 0) g.hud?.setVoice?.('🧜 Ноги сводит судорогой… кожа горит', true);
        if (t0 < 4 && t >= 4) g.hud?.setVoice?.('🧜 Ноги покрываются чешуёй — их стягивает вместе…', true);
        if (t0 < M.CHANGE_S - M.TAIL_GROW_S && t >= M.CHANGE_S - M.TAIL_GROW_S) g.hud?.setVoice?.('🧜 Ноги срастаются в хвост!', true);
        // the pain: −1 HP when it bites (the Creative's immortal: no harm)
        if (t0 < 1.2 && t >= 1.2) this._hurt(M.PAIN);
        // the picture swims (Knockdown's dizziness) and the pain's red at the edges, in waves
        if (g.knock) { const s = 0.5 + 0.5 * Math.sin(t * 1.7); if (!(g.knock.dizzyLeft > 1.5)) { g.knock.dizzyLeft = g.knock.dizzyDur = 2.5; } g.knock.dizzyS = 0.55 * (0.45 + 0.55 * s) * (1 - 0.6 * Math.max(0, k - 0.85) / 0.15); }
        this._pain(Math.min(1, t / 1.5) * (0.55 + 0.45 * Math.sin(t * 3.4) ** 2) * (1 - Math.max(0, (t - M.CHANGE_S + 0.8) / 0.8)));
        // the legs shake; scales glint over them (teal and violet sparks), more and more
        const legs = [ch.leftLegPivot, ch.rightLegPivot].filter(Boolean);
        const shake = 0.12 * Math.min(1, t / 2);
        legs.forEach((l, i) => { l.rotation.z = (i ? -1 : 1) * Math.max(0, k - 0.3) * 0.12 + Math.sin(t * 31 + i * 2) * shake; });
        const fx = g.fx, p = ch.group.position;
        if (fx?.spark && Math.random() < dt * (6 + 30 * k)) {
            const side = Math.random() < 0.5 ? -0.3 : 0.3, y = p.y - 2 + Math.random() * 1.9;
            const c = Math.cos(ch.group.rotation.y), s = Math.sin(ch.group.rotation.y);
            fx.spark(_sp.set(p.x + side * c, y, p.z - side * s), Math.random() < 0.6 ? 0x5fe0d0 : 0xa080ff, 0.06 + Math.random() * 0.05, _sv.set((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6), 0.7);
        }
        // the tail: grows over the last seconds, the legs fade into it
        const grow = (t - (M.CHANGE_S - M.TAIL_GROW_S)) / M.TAIL_GROW_S;
        if (grow > 0 && !this.tail) this.tail = attachTail(ch);
        if (this.tail) {
            const e = Math.min(1, grow);
            this.tail.root.visible = true;
            this.tail.root.scale.set(0.55 + 0.45 * e, 0.25 + 0.75 * e * e, 0.55 + 0.45 * e);
            for (const l of legs) l.visible = e < 0.6;
        }
        if (t >= M.CHANGE_S) {
            this.change = -1;
            if (this.tail) this.tail.root.scale.set(1, 1, 1);
            for (const l of legs) l.rotation.z = 0;
            this._pain(-1);
            g.hud?.setVoice?.('🧜 Вместо ног — хвост! В воде водите туловищем вправо-влево, как рыба: чем дольше петляете, тем быстрее плывёте. Под водой дышите', true);
            g.sound?.playSea?.(p, 'tail', 0.6);
        }
    }

    _hurt(n) { changeHurt(this.game, n, 'mermaid'); }

    /** The pain's red at the edges of the eyes (k 0…1; < 0: gone) — TransformPain. */
    _pain(k) { painRed(k); }

    /**
     * The torso's sway from the camera (shoulder-widths a second; 0: not seen): the middle of the shoulders going left and right and
     * the shoulders rolling (one up, the other down) — the fish's wriggle. Counts the turns (left ↔ right) to tell it from a step aside.
     */
    _sway(dt) {
        const p = this.game.currentPose, ls = p?.leftShoulder, rs = p?.rightShoulder;
        if (!ls || !rs || !(dt > 0)) { this.swayV = Math.max(0, (this.swayV || 0) - dt * 2); return this.swayV; }
        const a = p.aspect || 4 / 3;
        const sw = Math.max(0.04, Math.hypot((ls.x - rs.x) * a, ls.y - rs.y));
        const sig = ((ls.x + rs.x) / 2) * a / sw + 0.7 * (ls.y - rs.y) / sw;
        const prev = this._sig;
        this._sig = sig;
        if (prev == null) return this.swayV || 0;
        const d = (sig - prev) / dt;
        if (!Number.isFinite(d) || Math.abs(d) > 30) return this.swayV || 0; // (a lost frame: the body jumped)
        const dir = Math.sign(d);
        if (Math.abs(d) > 0.2 && dir && dir !== this._dir) { this._dir = dir; this._turnT = 0; }
        this._turnT = (this._turnT ?? 9) + dt;
        const v = this._turnT < MERMAID.SWAY_TURN ? Math.abs(d) : 0;
        this.swayV = (this.swayV || 0) + (v - (this.swayV || 0)) * Math.min(1, dt * 3);
        return this.swayV;
    }

    /** In the water (Swimming._swim calls it): the fish's wriggle (the torso, or the raised hands waving) — the tail drives the body on. */
    swim(M, dt) {
        const g = this.game, ch = g.character;
        const up = ch.areBothHandsUp?.() || false;
        const v = ch.handRelVelocity;
        const vy = v ? (Math.abs(v.left?.y || 0) + Math.abs(v.right?.y || 0)) / 2 : 0;
        this.wave += ((up ? vy : 0) - this.wave) * Math.min(1, dt * 3);
        // the rhythm (the author 05.11: «чем больше он делает туда-сюда движений… тем быстрее он ускоряется; зависит от того, как много он
        // уже сделал движений и как быстро; хочет остановиться — не делает движений; делает медленно — небольшое замедление»):
        // it builds while the wriggle goes on (quicker for a quick one) and falls away when it stops or slows down
        const r = Math.max(this.wave / MERMAID.WAVE, this._sway(dt) / MERMAID.SWAY);
        const on = r > 1;
        if (on) this.flow = Math.min(1, (this.flow || 0) + MERMAID.FLOW_UP * Math.min(2.5, r) * dt);
        else this.flow = Math.max(0, (this.flow || 0) - MERMAID.FLOW_DOWN * (r > 0.4 ? 0.35 : 1) * dt);
        const f = this.flow;
        const top = SWIM.MAX_SPEED * (MERMAID.TAIL_MAX + (MERMAID.TAIL_TOP - MERMAID.TAIL_MAX) * f * f); // (the last of the speed comes late: «немало времени»)
        // the speed the wriggle makes now: a slower one — a lower speed, eased down to it; none — the water slows her (SwimMotion's drag)
        const want = r > 0.4 ? top * Math.min(1, 0.35 + 0.65 * Math.min(1, (r - 0.4) / 1.2)) : 0;
        if (want > M.speed) M.speed = Math.min(want, M.speed + MERMAID.THRUST * (1 + 6 * f) * Math.min(2, Math.max(0.5, r)) * dt);
        else if (want > 0) M.speed = Math.max(want, M.speed * Math.exp(-SWIM.DRAG * 0.6 * dt)); // (slower waves: eased down, streamlined)
        M.fish = true; // (SwimMotion: her way follows the head, she hardly floats up)
        if (on && M.speed > 1) M.sinceStroke = 0;
    }
}
