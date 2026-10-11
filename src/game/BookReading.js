/**
 * BookReading.js — the spell book in the hands, like a real book.
 *
 * Nothing moves by itself: the book does what the hands and fingers do to it.
 *   - In one fist (by the spine) it is closed — an Items thing like any other.
 *   - The other (empty) hand takes it by the edge of the cover (closes on it): now
 *     each hand holds one half by its outer edge, and the book is exactly as open
 *     as the hands are apart (a hinge: φ = 2·asin(d / 2w)); tilt the hands — it tilts.
 *   - Open a hand: it lets go; the book stays open in the other hand (by its half's
 *     edge), and the free hand turns the pages: the index fingertip slides under the
 *     edge of a page and lifts it; the page rests on the finger and follows it;
 *     over the top it falls on by itself; let go before the middle — it falls back.
 *   - Take the free half again: both hands; bring them together: it closes, and
 *     letting one go leaves it closed in the other fist. Lower the holding arm: it closes.
 *   - Fingers never go through it: the free hand is stopped by the pages.
 * Reading a spread for a moment teaches its spell.
 */

import * as THREE from 'three';
import { BUILD_SPELLS } from './Builder.js';
import { BOOK, setBookAngle, pageHinge, makePageSheet, setPageSheet, disposePageSheet } from './BookModel.js';
import { frameFromHands, frameFromOneHand, viewRight, pageLimits, PageSheet, sheetLag } from './BookPhysics.js';
import { ITEM_SCALE } from './ItemTypes.js';

export const HOLD = {
    REACH: 0.32, // m from the book: a hand closing there takes it
    GRAB_CURL: 0.5, // fingers this closed: holding
    OPEN_CURL: 0.3, // … this open: let go
    GRAB_T: 0.2, // s closed in reach
    LET_GO_T: 0.3, // s open
    CLOSED_PHI: 0.35, // rad: the book counts as closed
    ONE_HAND_PHI: 2.6, // rad: an open book in one hand settles about so open
    LOWERED_T: 0.6, // s with the holding arm down: it closes
    BLEND_T: 0.25, // s: from the fist into both hands
    LEARN_T: 1.0, // s reading a spread
};
// a fingertip catches a page by its edge: the outer part of the page, close to it
const CATCH = { R0: 0.55, R1: 1.12, ABOVE: 0.16, BELOW: 0.13, LOST_IN: 0.1, LOST_OUT: 1.18 };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _box = new THREE.Box3();
const other = (s) => (s === 'left' ? 'right' : 'left');

// ------------------------------------------------------------ page art
function canvasPage(draw) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 360;
    const x = c.getContext('2d');
    x.fillStyle = '#f3ead2'; x.fillRect(0, 0, 256, 360);
    x.strokeStyle = '#c9b88f'; x.lineWidth = 3; x.strokeRect(8, 8, 240, 344);
    draw(x);
    return new THREE.CanvasTexture(c);
}

/** The first spread: the title and what is inside. */
export function drawTitlePage(side, spells) {
    return canvasPage((x) => {
        x.textAlign = 'center';
        if (side === 'left') {
            x.fillStyle = '#5a1a1a'; x.font = 'bold 26px serif';
            x.fillText('Книга', 128, 120); x.fillText('заклинаний', 128, 152);
            x.strokeStyle = '#8b6b3e'; x.lineWidth = 2;
            x.beginPath(); x.moveTo(60, 176); x.lineTo(196, 176); x.stroke();
            x.fillStyle = '#9b5bff';
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; x.fillRect(128 + Math.cos(a) * 34 - 3, 236 + Math.sin(a) * 34 - 3, 6, 6); }
            x.fillStyle = '#7a6a4a'; x.font = 'italic 15px serif';
            x.fillText('страницы листают пальцем', 128, 318);
        } else {
            x.fillStyle = '#5a1a1a'; x.font = 'bold 22px serif';
            x.fillText('Содержание', 128, 60);
            x.fillStyle = '#3a2a1a'; x.font = '18px serif'; x.textAlign = 'left';
            spells.forEach((s, i) => x.fillText(`${i + 1}. ${BUILD_SPELLS[s]?.name || s}`, 26, 110 + i * 34));
        }
    });
}

/** The running book's one spread: its quickness, written down. */
export function drawRunPage(side) {
    return canvasPage((x) => {
        x.textAlign = 'center';
        if (side === 'left') {
            x.fillStyle = '#5a1a1a'; x.font = 'bold 24px serif';
            x.fillText('Бегущая', 128, 110); x.fillText('книга', 128, 140);
            x.strokeStyle = '#d4af37'; x.lineWidth = 3;
            // two little running legs
            x.beginPath(); x.moveTo(110, 200); x.lineTo(96, 250); x.moveTo(146, 200); x.lineTo(166, 246); x.stroke();
            x.fillStyle = '#7a6a4a'; x.font = 'italic 15px serif';
            x.fillText('у неё одна страница', 128, 318);
        } else {
            x.fillStyle = '#5a1a1a'; x.font = 'bold 22px serif';
            x.fillText('Быстрота', 128, 70);
            x.fillStyle = '#3a2a1a'; x.font = '17px serif';
            ['Кто прочтёт эту', 'страницу, получит', 'мою быстроту:', 'бег на 30% быстрее,', 'пока он жив.'].forEach((t, i) => x.fillText(t, 128, 130 + i * 30));
            x.fillStyle = '#d4af37'; x.font = '30px serif';
            x.fillText('✦', 128, 310);
        }
    });
}

export class BookReading {
    /** @param {(spell: string, side: 'left'|'right') => THREE.Texture} drawPage */
    constructor(game, books, drawPage) {
        this.game = game;
        this.books = books;
        this.drawPage = drawPage;
        this.s = null; // the book out of the fist: {mode: 'two'|'one', …}
        this.readCam = null;
        this.input = null; // (tests) side → {G, curl, tip, up}: instead of the tracked hands
        this._grab = { left: 0, right: 0 };
        this._let = { left: 0, right: 0 };
        this._pf = { left: {}, right: {} };
        this._tipV = { left: new THREE.Vector3(), right: new THREE.Vector3() };
    }

    /** The hand that owns the book in Items, while it is open in the hands (no throwing then). */
    get readingSide() {
        return this.s ? this.s.owner : null;
    }

    /** Is this hand busy with the book (holding a cover)? — it doesn't take other things then. */
    handBusy(side) {
        const s = this.s;
        return !!s && (s.hold.left === side || s.hold.right === side);
    }

    get w() {
        return (BOOK.W + BOOK.T + BOOK.B) * (ITEM_SCALE.book || 1.6);
    }

    // ------------------------------------------------------------ the hands
    _hand(side) {
        if (this.input) return this.input(side);
        const g = this.game, ch = g.character;
        const f = g.weapons.palmFrame(side, this._pf[side]);
        const hand = ch.getActiveHands()[side];
        return { G: f.G, curl: ch.getGripCurl(side), tip: this._tip(hand, side), up: ch.isArmRaised(side), hand };
    }

    /** The end of the index finger as drawn (null: no fingers shown). */
    _tip(hand, side) {
        const seg = hand?.fingerMeshes?.index?.[2];
        if (!seg || !hand.group.visible) return null;
        seg.pivot.updateWorldMatrix(true, false);
        return seg.pivot.localToWorld(this._tipV[side].set(0, 0.14, 0));
    }

    /** Free for the book: holds nothing else. */
    _free(side) {
        const g = this.game;
        return !g.items.held[side] && !g.weapons.hands[side].held && !g.boards?.handBusy(side);
    }

    _eye(out) {
        const g = this.game, ch = g.character;
        ch.head.getWorldPosition(out);
        if (g.cameraMode === 'fpv') return out;
        const yaw = ch.group.rotation.y;
        return out.add(_v6.set(Math.sin(yaw) * 1.4, 1.1, Math.cos(yaw) * 1.4)); // (the body looks along −Z)
    }

    _setGrip(side, curl) {
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(curl);
    }

    /** Closing (or open) for a while: a hand that takes / lets go (the camera's fingers flicker). */
    _dwell(map, side, on, dt) {
        map[side] = on ? map[side] + dt : 0;
        return map[side];
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        const hb = g.items?.heldOf('book');
        if (!hb || g.combat?.dead) { this._end(!hb); this.readCam = null; return; }
        if (this.s && this.s.model !== hb.model) this._end(true);
        if (!this.s) { this._fist(hb, dt); this.readCam = null; return; }
        const s = this.s;
        s.owner = hb.side;
        if (s.mode === 'two') this._two(s, dt);
        else this._one(s, dt);
        if (!this.s) return;
        this._pages(s, dt);
        this._readCam(s);
    }

    /** Closed in one fist: the other hand may take it by the cover. */
    _fist(hb, dt) {
        const B = other(hb.side);
        if (!this._free(B) || !this.game.currentPose && !this.input) { this._grab[B] = 0; return; }
        const h = this._hand(B);
        _box.setFromObject(hb.model).expandByScalar(HOLD.REACH);
        const near = _box.containsPoint(h.G);
        if (this._dwell(this._grab, B, near && h.curl > HOLD.GRAB_CURL, dt) < HOLD.GRAB_T) return;
        this._grab[B] = 0;
        // both hands now: the one on the reader's left holds the left half
        const eye = this._eye(_v1);
        const right = viewRight(eye, hb.model.position, _v2);
        const hA = this._hand(hb.side);
        const aLeft = hA.G.dot(right) < h.G.dot(right);
        this.s = {
            mode: 'two', model: hb.model, item: hb.item, owner: hb.side,
            hold: { left: aLeft ? hb.side : B, right: aLeft ? B : hb.side },
            phi: 0, pos: hb.model.position.clone(), quat: hb.model.quaternion.clone(),
            from: { pos: hb.model.position.clone(), quat: hb.model.quaternion.clone(), t: 0 },
            pL: null, pR: null, spread: 0, sheet: null, readT: 0, lowT: 0,
        };
        this._setGrip(B, 0.55);
        this._initPages(this.s);
        this.game.hud.setVoice?.('📖 Разведите руки — книга раскроется. Чтобы листать, отпустите одну руку и подденьте пальцем край страницы', true);
    }

    /** Both hands hold the halves by their edges: as open as the hands are apart. */
    _two(s, dt) {
        const hl = this._hand(s.hold.left), hr = this._hand(s.hold.right);
        const k = Math.min(1, dt / 0.06); // (a little steadier than the camera)
        s.pL = s.pL ? s.pL.lerp(hl.G, k) : hl.G.clone();
        s.pR = s.pR ? s.pR.lerp(hr.G, k) : hr.G.clone();
        const eye = this._eye(_v1);
        const f = frameFromHands(s.pL, s.pR, eye, this.w, this._f || (this._f = {}));
        s.phi = f.phi;
        this._place(s, f.pos, f.quat, dt);
        // a hand that opens lets go of its half (or one pulled away past the edge)
        const tooFar = f.d > 2 * this.w + 0.45;
        for (const half of ['left', 'right']) {
            const side = s.hold[half], h = half === 'left' ? hl : hr;
            const open = this._dwell(this._let, side, h.curl < HOLD.OPEN_CURL, dt) >= HOLD.LET_GO_T;
            const away = tooFar && h.G.distanceTo(s.pos) > (half === 'left' ? hr : hl).G.distanceTo(s.pos);
            if (!open && !away) continue;
            this._let[side] = 0;
            this._letGo(s, half);
            return;
        }
    }

    /** One half's hand lets go: the book stays in the other hand (open), or closed in its fist. */
    _letGo(s, half) {
        const g = this.game;
        const gone = s.hold[half], keeps = s.hold[other(half)];
        if (s.owner === gone) g.items.moveHeld(gone, keeps); // (Items: the book is in the other hand now)
        s.owner = keeps;
        if (s.phi < HOLD.CLOSED_PHI) { this._end(false); return; } // closed: in the fist again
        this._setGrip(gone, null);
        s.mode = 'one';
        s.hold = { [half]: null, [other(half)]: keeps };
        s.half = other(half);
        s.lowT = 0;
        this._grab[gone] = 0;
    }

    /** Open in one hand (by its half's edge); the other hand is free for the pages. */
    _one(s, dt) {
        const H = s.hold[s.half];
        const h = this._hand(H);
        // (a book held open in one hand settles about so open)
        s.phi += (HOLD.ONE_HAND_PHI - s.phi) * Math.min(1, dt * 1.5);
        const eye = this._eye(_v1);
        s.pH = s.pH ? s.pH.lerp(h.G, Math.min(1, dt / 0.06)) : h.G.clone();
        const f = frameFromOneHand(s.pH, s.half, s.phi, eye, this.w, this._f1 || (this._f1 = {}));
        this._place(s, f.pos, f.quat, dt);
        // the holding arm lowered: it closes in that hand
        s.lowT = !h.up ? s.lowT + dt : 0;
        if (s.lowT >= HOLD.LOWERED_T) { this._end(false); return; }
        // the free hand: takes the free half by its edge again, or turns the pages
        const F = other(H);
        if (!this._free(F)) return;
        const fh = this._hand(F);
        const freeHalf = other(s.half);
        const edge = _v2.set((freeHalf === 'left' ? -1 : 1) * this.w * Math.sin(s.phi / 2), 0, this.w * Math.cos(s.phi / 2)).applyQuaternion(s.quat).add(s.pos);
        const near = fh.G.distanceTo(edge) < HOLD.REACH + 0.1;
        if (this._dwell(this._grab, F, near && fh.curl > HOLD.GRAB_CURL && s.sheet?.finger == null, dt) >= HOLD.GRAB_T) {
            this._grab[F] = 0;
            s.mode = 'two';
            s.hold = { [s.half]: H, [freeHalf]: F };
            s.pL = s.pR = null;
            s.from = { pos: s.model.position.clone(), quat: s.model.quaternion.clone(), t: 0 };
            this._setGrip(F, 0.55);
            return;
        }
        this._finger(s, fh, dt);
        this._pushOut(s, F, fh);
    }

    /** The book's pose: from the hands (blended in from the fist at first). */
    _place(s, pos, quat, dt) {
        const m = s.model;
        s.pos.copy(pos);
        s.quat.copy(quat);
        const fr = s.from;
        if (fr && fr.t < HOLD.BLEND_T) {
            fr.t += dt;
            const k = Math.min(1, fr.t / HOLD.BLEND_T);
            m.position.copy(fr.pos).lerp(pos, k);
            m.quaternion.copy(fr.quat).slerp(quat, k);
        } else {
            s.from = null;
            m.position.copy(pos);
            m.quaternion.copy(quat);
        }
        m.scale.setScalar(ITEM_SCALE.book || 1.6);
        setBookAngle(m, s.phi);
        m.updateMatrixWorld(true);
    }

    // ------------------------------------------------------------ pages
    _initPages(s) {
        const b = s.model.userData.book;
        const spells = s.item.spells || [];
        // (the running book: one spread only)
        s.tex = s.item.runbook ? [{ left: drawRunPage('left'), right: drawRunPage('right') }]
            : [{ left: drawTitlePage('left', spells), right: drawTitlePage('right', spells) }, ...spells.map((sp) => ({ left: this.drawPage(sp, 'left'), right: this.drawPage(sp, 'right') }))];
        s.matL = new THREE.MeshBasicMaterial({ map: s.tex[0].left });
        s.matR = new THREE.MeshBasicMaterial({ map: s.tex[0].right });
        s.paper = b.faceL.material;
        b.faceL.material = s.matL;
        b.faceR.material = s.matR;
        s.spread = Math.min(s.item.readAt || 0, s.tex.length - 1);
        this._faces(s, s.spread, s.spread);
    }

    _faces(s, left, right) {
        if (s.tex[left] && s.matL.map !== s.tex[left].left) { s.matL.map = s.tex[left].left; s.matL.needsUpdate = true; }
        if (s.tex[right] && s.matR.map !== s.tex[right].right) { s.matR.map = s.tex[right].right; s.matR.needsUpdate = true; }
    }

    /** The fingertip in the book: its angle round the spine, how far out, how high. */
    _fingerInBook(s, tip, u) {
        const local = s.model.worldToLocal(_v3.copy(tip));
        const hinge = pageHinge(s.phi, u, _v4);
        const x = local.x - hinge.x, z = local.z - hinge.z;
        return { beta: Math.atan2(z, x), r: Math.hypot(x, z), y: local.y, local };
    }

    /** The index fingertip of the free hand: slides under the edge of a page and lifts it. */
    _finger(s, fh, dt) {
        const tip = fh.tip;
        const { W, H, T } = BOOK;
        const sc = ITEM_SCALE.book || 1.6;
        const sh = s.sheet;
        if (sh) {
            if (!tip) { sh.touch(null, dt); return; }
            const fb = this._fingerInBook(s, tip, sh.progress(s.phi));
            const on = fb.r > CATCH.LOST_IN * W && fb.r < CATCH.LOST_OUT * W && Math.abs(fb.y) < H / 2 + 0.1;
            if (!on) sh.lost = true; // (once off the page it doesn't catch it again in the air)
            sh.touch(sh.lost ? null : fb.beta, dt);
            return;
        }
        if (!tip) return;
        // a page to catch: the top page on the right (forward) or on the left (back)
        const b = s.model.userData.book;
        for (const dir of [1, -1]) {
            if (dir > 0 && s.spread >= s.tex.length - 1) continue;
            if (dir < 0 && s.spread <= 0) continue;
            const half = dir > 0 ? b.R : b.L;
            const p = half.worldToLocal(_v5.copy(tip)); // (the half's frame: the page from its hinge along ±X, its face at z = T)
            const out = dir > 0 ? p.x : -p.x;
            const above = p.z - (T + 0.002);
            if (out < CATCH.R0 * W || out > CATCH.R1 * W || Math.abs(p.y) > H / 2 + 0.02) continue;
            if (above > CATCH.ABOVE * (1.6 / sc) || above < -CATCH.BELOW * (1.6 / sc)) continue;
            s.catchT = (s.catchT || 0) + dt;
            if (s.catchT < 0.05) return;
            s.catchT = 0;
            this._startSheet(s, dir);
            s.sheet.touch(this._fingerInBook(s, tip, dir > 0 ? 0 : 1).beta, dt);
            return;
        }
        s.catchT = 0;
    }

    _startSheet(s, dir) {
        const from = s.spread, to = s.spread + dir;
        // the sheet carries the page it was on its front and the page it becomes on its back
        const front = dir > 0 ? s.tex[from].right : s.tex[to].right;
        const back = dir > 0 ? s.tex[to].left : s.tex[from].left;
        const mesh = makePageSheet(front, back);
        s.model.add(mesh);
        const sh = new PageSheet(dir, s.phi);
        sh.mesh = mesh;
        sh.to = to;
        s.sheet = sh;
        // under it the next page shows already
        if (dir > 0) this._faces(s, from, to); else this._faces(s, to, from);
    }

    _pages(s, dt) {
        const sh = s.sheet;
        if (sh) {
            const landed = sh.step(dt, s.phi);
            const u = sh.progress(s.phi);
            pageHinge(s.phi, u, sh.mesh.position);
            setPageSheet(sh.mesh, sh.beta, sheetLag(sh, s.phi));
            if (landed) {
                const over = (sh.dir > 0 && landed === 'left') || (sh.dir < 0 && landed === 'right');
                if (over) { s.spread = sh.to; this.game.sound?.playPage?.(); }
                s.item.readAt = s.spread;
                s.model.remove(sh.mesh);
                disposePageSheet(sh.mesh);
                s.sheet = null;
                s.readT = 0;
                this._faces(s, s.spread, s.spread);
            }
        }
        // reading a spread (open, the pages towards the eyes) teaches its spell
        const spell = (s.item.spells || [])[s.spread - 1];
        const eye = this._eye(_v1);
        const n = _v2.set(0, 0, 1).applyQuaternion(s.quat);
        const facing = n.dot(_v3.subVectors(eye, s.pos).normalize());
        const reading = !s.sheet && s.phi > 2.0 && facing > 0.6;
        s.readT = reading ? s.readT + dt : 0;
        // the running book: reading its page gives its quickness — then it is gone in golden sparks
        if (s.item.runbook && s.readT > HOLD.LEARN_T && !s.item.used) {
            s.item.used = true;
            const g = this.game, side = s.owner, p = s.pos.clone();
            g.runner?.bless?.();
            for (let i = 0; i < 40; i++) g.fx?.spark(p, i % 2 ? 0xffd23f : 0xfff2a8, 0.12, _v4.set((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), 1);
            g.items?.releaseHand(side);
            this._end(true);
            return;
        }
        const learned = this.books.learned;
        if (spell && s.readT > HOLD.LEARN_T && !learned.has(spell)) {
            learned.add(spell);
            this.game.hud.toast?.(`📖 Изучено заклинание: «${BUILD_SPELLS[spell]?.name || spell}»`, 2500);
            this.game.fx?.lightFlash?.(s.pos, 0xffe9a8, 2, 0.3, 10);
        }
        if (!s.toldPages && s.mode === 'one' && s.phi > 2) {
            s.toldPages = true;
            this.game.hud.setVoice?.(`📖 Страница ${s.spread + 1} из ${s.tex.length}: подденьте пальцем край страницы и переведите её на другую сторону`, true);
        }
    }

    /**
     * The free hand can't go into the book: a fingertip or the palm inside the pages
     * is pushed back out of them (the hand springs back to the arm by itself).
     */
    _pushOut(s, side, fh) {
        const hand = fh.hand;
        if (!hand?.group?.visible || !hand.group.parent) return;
        const { W, H, T, B } = BOOK;
        const b = s.model.userData.book;
        const pts = this._handPoints(hand);
        let best = 0;
        const push = _v5.set(0, 0, 0);
        // which side of the book the hand came from: remembered while the whole hand was clear of it
        // (a finger poking into the pages backs out the way it came — the pages' side unless it came from behind)
        const mem = s.handFrom || (s.handFrom = {});
        for (const half of [b.L, b.R]) {
            half.updateWorldMatrix(true, false);
            let front = 0, back = 0;
            for (const p of pts) { const z = half.worldToLocal(_v3.copy(p)).z; if (z > T + 0.002) front++; else if (z < -B) back++; }
            if (front === pts.length) mem[side] = 1;
            else if (back === pts.length) mem[side] = -1;
        }
        const behind = mem[side] === -1;
        for (const half of [b.L, b.R]) {
            const sx = half === b.L ? -1 : 1;
            for (const p of pts) {
                const l = half.worldToLocal(_v3.copy(p));
                const x = sx * l.x;
                if (x < 0 || x > W || Math.abs(l.y) > H / 2 || l.z > T + 0.002 || l.z < -B) continue;
                const d = behind ? l.z + B : T + 0.002 - l.z;
                if (d <= best) continue;
                best = d;
                push.set(0, 0, behind ? -1 : 1).transformDirection(half.matrixWorld).multiplyScalar((d + 0.01) * half.getWorldScale(_v4).x);
            }
        }
        // (the page being turned rests on the finger: that is no push)
        if (!best || s.sheet?.finger != null) return;
        hand.group.parent.getWorldQuaternion(_q).invert();
        push.applyQuaternion(_q);
        hand.group.position.add(push.clampLength(0, 0.6));
        hand.group.updateMatrixWorld(true);
    }

    _handPoints(hand) {
        const out = this._pts || (this._pts = Array.from({ length: 6 }, () => new THREE.Vector3()));
        hand.palm.getWorldPosition(out[0]);
        let i = 1;
        for (const name of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
            const seg = hand.fingerMeshes?.[name]?.[2];
            if (seg) seg.pivot.localToWorld(out[i].set(0, 0.12, 0));
            else out[i].copy(out[0]);
            i++;
        }
        return out;
    }

    /** Third person: the camera over the shoulder to the open pages (first person: the eyes are there). */
    _readCam(s) {
        const g = this.game;
        if (g.cameraMode === 'fpv' || s.phi < 1.0) { this.readCam = null; return; }
        const w = this.w;
        const at = (this._at || (this._at = new THREE.Vector3())).copy(s.pos).addScaledVector(_v1.set(0, 0, 1).applyQuaternion(s.quat), w * Math.cos(s.phi / 2) * 0.5);
        const n = _v2.set(0, 0, 1).applyQuaternion(s.quat);
        const cam = g.camera;
        const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
        const vfov = THREE.MathUtils.degToRad(cam.fov);
        const dist = Math.max(2 * w / 0.7 / (2 * Math.tan(hfov / 2)), BOOK.H * (ITEM_SCALE.book || 1.6) / 0.7 / (2 * Math.tan(vfov / 2)));
        this.readCam = { at, from: (this._from || (this._from = new THREE.Vector3())).copy(at).addScaledVector(n, dist), k: Math.min(1, (s.phi - 1.0) * 1.2) };
    }

    // ------------------------------------------------------------ others see it
    /** For the others: [φ, who holds the left half, the right half (0 none, 1 left hand, 2 right), spread, page angle | −1, its way]. */
    netState() {
        const s = this.s;
        if (!s) return null;
        const c = (x) => (x === 'left' ? 1 : x === 'right' ? 2 : 0);
        const r = (v) => Math.round(v * 100) / 100;
        const sh = s.sheet;
        return [r(s.phi), c(s.hold.left), c(s.hold.right), s.spread, sh ? r(sh.beta) : -1, sh ? sh.dir : 0];
    }

    /** Where another player's hand closes on a thing (as Weapons.palmFrame G). */
    _gripOf(ch, side, out) {
        const grip = ch.getGripObject(side);
        grip.updateWorldMatrix(true, false);
        const e = grip.matrixWorld.elements;
        out.set(e[12], e[13], e[14]);
        if (grip.name === 'palm') {
            const Y = _v5.set(e[4], e[5], e[6]).normalize();
            const Z = _v6.set(e[8], e[9], e[10]).normalize();
            return out.addScaledVector(Y, 0.13).addScaledVector(Z, -0.135);
        }
        return out.addScaledVector(_v5.set(e[8], e[9], e[10]).normalize(), 0.25);
    }

    /** Another player's book open in their hands, its pages and the page they turn (st: netState). */
    placeRemote(ch, model, item, st) {
        const u = model.userData;
        if (!st) { this.releaseRemote(model); return false; }
        const [phi0, l, r, spread, beta, dir] = st;
        const sideOf = (c) => (c === 1 ? 'left' : c === 2 ? 'right' : null);
        const hl = sideOf(l), hr = sideOf(r);
        const eye = ch.head.getWorldPosition(_v1);
        const f = this._fr || (this._fr = {});
        if (hl && hr) frameFromHands(this._gripOf(ch, hl, _v2).clone(), this._gripOf(ch, hr, _v3), eye, this.w, f);
        else if (hl || hr) frameFromOneHand(this._gripOf(ch, hl || hr, _v2), hl ? 'left' : 'right', phi0, eye, this.w, f);
        else return false;
        model.position.copy(f.pos);
        model.quaternion.copy(f.quat);
        const phi = hl && hr ? f.phi : phi0;
        setBookAngle(model, phi);
        model.updateMatrixWorld(true);
        // the pages, as they read them
        let rr = u.remoteRead;
        if (!rr) {
            rr = u.remoteRead = { model, item };
            this._initPages(rr);
        }
        const from = Math.min(spread, rr.tex.length - 1);
        if (rr.sheet && (beta < 0 || rr.sheet.dir !== dir || rr.sheet.from !== from)) { model.remove(rr.sheet.mesh); disposePageSheet(rr.sheet.mesh); rr.sheet = null; }
        const to = from + dir;
        if (beta >= 0 && dir && rr.tex[to]) {
            if (!rr.sheet) {
                const mesh = makePageSheet(dir > 0 ? rr.tex[from].right : rr.tex[to].right, dir > 0 ? rr.tex[to].left : rr.tex[from].left);
                model.add(mesh);
                rr.sheet = { mesh, dir, from };
            }
            const { bR, bL } = pageLimits(phi);
            pageHinge(phi, bL - bR > 1e-4 ? (beta - bR) / (bL - bR) : 0, rr.sheet.mesh.position);
            setPageSheet(rr.sheet.mesh, beta, 0);
            if (dir > 0) this._faces(rr, from, to); else this._faces(rr, to, from);
        } else this._faces(rr, from, from);
        return true;
    }

    releaseRemote(model) {
        const rr = model.userData.remoteRead;
        if (!rr) return;
        model.userData.remoteRead = null;
        const b = model.userData.book;
        if (rr.sheet) { model.remove(rr.sheet.mesh); disposePageSheet(rr.sheet.mesh); }
        if (b) { b.faceL.material = rr.paper; b.faceR.material = rr.paper; }
        rr.matL.dispose(); rr.matR.dispose();
        for (const t of rr.tex) { t.left.dispose(); t.right.dispose(); }
        setBookAngle(model, 0);
    }

    /** Back into the fist (closed) — or the book is gone (thrown, in a slot, given away). */
    _end(gone) {
        const s = this.s;
        this.readCam = null;
        if (!s) return;
        this.s = null;
        const b = s.model.userData.book;
        if (s.sheet) { s.model.remove(s.sheet.mesh); disposePageSheet(s.sheet.mesh); }
        if (b) { b.faceL.material = s.paper; b.faceR.material = s.paper; }
        s.matL.dispose(); s.matR.dispose();
        for (const t of s.tex) { t.left.dispose(); t.right.dispose(); }
        if (!gone) setBookAngle(s.model, 0);
        // the hand that held only a cover lets the fingers go
        const g = this.game;
        for (const side of ['left', 'right']) if (side !== s.owner || gone) { if (!g.items.held[side] && !g.weapons.hands[side].held) this._setGrip(side, null); }
        if (g.hud._lastVoice?.startsWith?.('📖')) g.hud.setVoice('', false);
    }

    dispose() { this._end(true); }
}
