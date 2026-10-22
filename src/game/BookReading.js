/**
 * BookReading.js — the spell book in the hands, like a real book.
 *
 * Nothing moves by itself: the book does what the hands and fingers do to it.
 *   - In one hand it is closed: an edge of it deep in the web between the thumb and the
 *     fingers, the covers between the palm and the thumb (the fore-edge towards the other
 *     hand — so the hand holds the fore-edge or the spine). The fingers close on the
 *     covers only until they touch them (SimplifiedHand.fitGrip).
 *   - The other (empty) hand comes OPEN to the covers' edge and closes on it (a fist arriving,
 *     or a pointing hand — the index out — takes nothing): now each hand holds one half by
 *     its outer edge (low on it), and the book is exactly as open as the hands are apart
 *     (a hinge: φ = 2·asin((d/2 − t) / w)); it tilts as the hands' fingers do. Pulled wider
 *     than the book, it lies flat between them; spread the arms wide — the cover slips out
 *     of the second hand's fingers.
 *   - Open a hand: it lets go; the book stays open in the other hand, its half held rigidly
 *     (it turns with that hand); the free hand turns the pages: the index fingertip slides
 *     under the edge of a page and lifts it; the page rests on the finger and follows it;
 *     over the top it falls on by itself; let go before the middle — it falls back.
 *   - The holding hand opens palm up: the book lies on the palm; it falls only from an
 *     opened stretched arm. Closing the hand on it holds it where it lies.
 *   - Take the free half again: both hands; bring them together: it closes, and
 *     letting one go leaves it closed in the other hand. Lower the holding arm: it closes.
 *   - Fingers never go through it: the free hand is pushed back out of the pages. The free
 *     hand is never tied to the book: it touches, lifts a page, takes a cover — or goes away.
 * The pose comes from the hands only — the same in both camera modes.
 * Reading a spread for a moment teaches its spell.
 */

import * as THREE from 'three';
import { BUILD_SPELLS } from './Builder.js';
import { WARD_SPELLS, WARD_NAMES, isWardSpell } from './HouseWards.js';
import { BOOK, setBookAngle, pageHinge, makePageSheet, setPageSheet, disposePageSheet } from './BookModel.js';
import { frameFromHands, frameFromOneHand, viewRight, pageLimits, PageSheet, sheetLag, edgeInBook, halfQuat, bookFromHinge, frameOnPalm } from './BookPhysics.js';
import { BOOK_POINTS, Steady } from '../entities/SimplifiedHand.js';
import { ITEM_SCALE } from './ItemTypes.js';
import { loreOf } from './LoreBooks.js';
import { lorePages } from './LorePages.js';

export const HOLD = {
    REACH: 0.32, // m from the edge of the covers (the fore-edge): a hand closing there takes it
    GRAB_CURL: 0.5, // fingers this closed (the index too — Character.getHoldCurl): holding
    OPEN_CURL: 0.3, // … this open: let go
    GRAB_T: 0.2, // s closed in reach
    LET_GO_T: 0.3, // s open
    CLOSED_PHI: 0.35, // rad: the book counts as closed
    ONE_HAND_PHI: 2.6, // rad: an open book in one hand settles about so open
    LOWERED_T: 0.6, // s with the holding arm down: it closes
    BLEND_T: 0.25, // s: the book turns from how the fist held it to how both hands hold it
    SLIDE_T: 0.3, // s: an open hand under it — it settles onto the palm
    LEARN_T: 1.0, // s reading a spread
    GRIP_Y: -0.21, // m: the hands hold the edges below the middle (the book's own y)
    PUSH_MAX: 0.15, // m: the most a hand is held back out of the pages in a frame
    SLIP: 1.0, // m: hands this much further apart than the open book reaches (arms spread wide) — the cover slips out of the second hand…
    SLIP_T: 0.3, // …after this long (s) (a little wider it just lies flat between them: nothing lets go by accident)
};
// a fingertip catches a page by its edge: the outer part of the page, close to it
// (a fingertip hovering over the page, or anywhere on it, catches nothing: only at the very edge, on it)
const CATCH = { R0: 0.72, R1: 1.1, ABOVE: 0.07, BELOW: 0.1, T: 0.1, LOST_IN: 0.1, LOST_OUT: 1.18 };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qI = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const other = (s) => (s === 'left' ? 'right' : 'left');
const _seg = new THREE.Vector3();
/** How far p is from the segment a–b. */
function distToSegment(p, a, b) {
    const ab = _seg.subVectors(b, a), L = ab.lengthSq();
    const t = L > 0 ? Math.max(0, Math.min(1, (p.x - a.x) * ab.x / L + (p.y - a.y) * ab.y / L + (p.z - a.z) * ab.z / L)) : 0;
    return Math.hypot(a.x + ab.x * t - p.x, a.y + ab.y * t - p.y, a.z + ab.z * t - p.z);
}

/** A spell's name for a book's pages («Флайн» is in the swift book-bird's book only). */
export const bookSpellName = (sp) => (sp === 'Flight' ? 'Флайн' : BUILD_SPELLS[sp]?.name || WARD_NAMES[sp] || sp);

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
        const ward = spells.some(isWardSpell); // (the book of protection: its group «Защита дома»)
        if (side === 'left' && ward) {
            x.fillStyle = '#1b2f7a'; x.font = 'bold 26px serif';
            x.fillText('Защита', 128, 110); x.fillText('дома', 128, 142);
            // a silver shield
            x.fillStyle = '#c9d6e2'; x.strokeStyle = '#1b2f7a'; x.lineWidth = 3;
            x.beginPath(); x.moveTo(98, 180); x.lineTo(158, 180); x.lineTo(158, 214); x.quadraticCurveTo(158, 248, 128, 266); x.quadraticCurveTo(98, 248, 98, 214); x.closePath(); x.fill(); x.stroke();
            x.fillStyle = '#7a6a4a'; x.font = 'italic 15px serif';
            x.fillText('три заклинания — одна группа', 128, 318);
        } else if (side === 'left') {
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
            spells.forEach((s, i) => x.fillText(`${i + 1}. ${bookSpellName(s)}`, 26, 110 + i * 34));
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

/** A spread of a book of history: each page painted when it is first shown (LorePages.js). */
class LoreSpread {
    constructor(l, r) { this._d = [l, r]; this._t = [null, null]; }
    _get(i) { return this._t[i] || (this._t[i] = new THREE.CanvasTexture(this._d[i]())); }
    get left() { return this._get(0); }
    get right() { return this._get(1); }
    dispose() { for (const t of this._t) t?.dispose(); this._t = [null, null]; }
}
/** A book of history's spreads: its pages two by two. */
function loreSpreads(book) {
    const pages = lorePages(book);
    const out = [];
    for (let i = 0; i < pages.length; i += 2) out.push(new LoreSpread(pages[i], pages[i + 1]));
    return out;
}
/** A spread's textures given back (a book of history's: only the pages that were painted). */
const disposeSpread = (t) => (t.dispose ? t.dispose() : (t.left.dispose(), t.right.dispose()));

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
        this._armed = { left: false, right: false }; // came open: a hand that closes now takes it
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

    /** A half's width (its hinge → its outer edge) and its hinge from the middle of the spine (world). */
    get w() {
        return BOOK.W * (ITEM_SCALE.book || 1.6);
    }

    get t() {
        return BOOK.T * (ITEM_SCALE.book || 1.6);
    }

    // ------------------------------------------------------------ the hands
    /**
     * A hand as the book feels it: G — where a held edge lies in it (deep in the web
     * between the thumb and the index finger, half a cover's thickness in front of the
     * palm), f — the palm (P, X, Y: to the fingers, Z: the back, T: to the thumb, q),
     * curl, the index tip, the arm up / stretched.
     */
    _hand(side) {
        if (this.input) return this.input(side);
        const g = this.game, ch = g.character;
        const f = g.weapons.palmFrame(side, this._pf[side]);
        (f.T || (f.T = new THREE.Vector3())).copy(f.X).multiplyScalar(f.thumb);
        const hand = ch.getActiveHands()[side];
        const drawn = !!(hand?.palm && hand.group.visible && ch.getGripObject(side) === hand.palm);
        const G = this._palmPoint(f, BOOK_POINTS.edgeX, BOOK_POINTS.edgeY, BOOK_POINTS.face - this._halfThick() / 2, f.E || (f.E = new THREE.Vector3()));
        return { G, f, curl: ch.getGripCurl(side), grip: ch.getHoldCurl?.(side), tip: this._tip(hand, side), up: ch.isArmRaised(side), ext: ch.isArmExtended?.(side), hand: drawn ? hand : null };
    }

    /** How closed a hand is round a cover: the index too (a pointing hand holds nothing). */
    _closed(h) {
        return h.grip ?? h.curl;
    }

    /**
     * Does this hand take a cover now? Only one that came OPEN and closes at the edge, for a
     * moment (a fist arriving, a pointing finger, a hand passing by — nothing).
     */
    _takes(side, h, near, dt) {
        const c = this._closed(h);
        if (c < HOLD.OPEN_CURL) this._armed[side] = true;
        else if (!near && c > HOLD.GRAB_CURL) this._armed[side] = false;
        const yes = this._dwell(this._grab, side, near && c > HOLD.GRAB_CURL && this._armed[side], dt) >= HOLD.GRAB_T;
        if (yes) { this._grab[side] = 0; this._armed[side] = false; }
        return yes;
    }

    /** A hand eased steadily (a still hand's tremble smoothed, a real move followed at once). */
    _steady(s, key, p, dt) {
        const st = s.steady || (s.steady = {});
        if (!s[key] || !st[key]) { st[key] = new Steady({ minCutoff: 2, beta: 10 }); s[key] = p.clone(); return s[key]; }
        const a = st[key].alpha(dt > 0 ? s[key].distanceTo(p) / dt : 0, dt);
        return s[key].lerp(p, a);
    }

    /** A point given in the palm's own frame (a right hand's; a left one is its mirror). */
    _palmPoint(f, x, y, z, out) {
        return out.copy(f.P).addScaledVector(f.T, -x).addScaledVector(f.Y, y).addScaledVector(f.Z, z);
    }

    /** One half's thickness (the pages and the board), world. */
    _halfThick() {
        return (BOOK.T + BOOK.B) * (ITEM_SCALE.book || 1.6);
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

    /** Where the reader looks from: the eyes (the same in both camera modes — the hands decide, not the camera). */
    _eye(out) {
        return this.game.character.head.getWorldPosition(out);
    }

    _setGrip(side, curl, pose = null) {
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(curl, pose);
    }

    /** Closing (or open) for a while: a hand that takes / lets go (the camera's fingers flicker). */
    _dwell(map, side, on, dt) {
        map[side] = on ? map[side] + dt : 0;
        return map[side];
    }

    /** The fingers of a hand holding the book close on it until they touch it (never into it). */
    _fitHand(side, boxes) {
        const hand = this.game.character.getActiveHands?.()[side];
        if (!hand?.fitGrip) return;
        hand.setGrip(0.55, 'book');
        hand.fitGrip(boxes);
    }

    /** The closed book as a box (for the fingers). */
    _closedBoxes(m) {
        const { W, H, T, B } = BOOK;
        const c = this._cb || (this._cb = [{ inv: new THREE.Matrix4(), min: new THREE.Vector3(), max: new THREE.Vector3(), scale: 1 }]);
        c[0].inv.copy(m.matrixWorld).invert();
        c[0].min.set(-(T + B), -H / 2, 0);
        c[0].max.set(T + B, H / 2, W);
        c[0].scale = m.scale.x;
        return c;
    }

    /** The two halves (their pages and boards) as boxes. */
    _openBoxes(m) {
        const { W, H, T, B } = BOOK;
        const b = m.userData.book;
        const c = this._ob || (this._ob = [0, 1].map(() => ({ inv: new THREE.Matrix4(), min: new THREE.Vector3(), max: new THREE.Vector3(), scale: 1 })));
        [b.L, b.R].forEach((half, i) => {
            half.updateWorldMatrix(true, false);
            c[i].inv.copy(half.matrixWorld).invert();
            c[i].min.set(i ? 0 : -W, -H / 2, -B);
            c[i].max.set(i ? W : 0, H / 2, T);
            c[i].scale = m.scale.x;
        });
        return c;
    }

    /**
     * The closed book in one hand (Items asks every frame): an edge of it deep in the web
     * between the thumb and the fingers, the covers between the palm and the thumb, the
     * hand on the lower part of it — like a book carried in life. Which edge: the one that
     * leaves the fore-edge (where the covers open) towards the other hand — the fore-edge
     * itself when the thumb is on that side, else the spine. Returns true when it placed it.
     */
    holdClosed(side, h, dt) {
        if (this.s) return this.s.model === h.model; // (open in the hands: placed below)
        const g = this.game, m = h.model;
        if (!g.weapons?.palmFrame) return false;
        const f = g.weapons.palmFrame(side, this._pfc || (this._pfc = {}));
        const T = (f.T || (f.T = new THREE.Vector3())).copy(f.X).multiplyScalar(f.thumb);
        if (h.bookSpine == null) {
            // (decided when it comes into the hand: towards the middle of the body is the other hand's side)
            const mid = g.character.group.position;
            h.bookSpine = T.x * (mid.x - f.P.x) + T.z * (mid.z - f.P.z) < 0;
        }
        // the covers lie flat on the palm; in the palm's plane the book stands as upright as it
        // can (it turns in the grip as a held book does; a palm turned up or down: along the fingers)
        const F = _v5.copy(f.Z).negate();
        const Yb = _v6.set(0, 1, 0).addScaledVector(F, -F.y);
        if (Yb.lengthSq() < 0.09) Yb.addScaledVector(f.Y, 0.3 - Math.sqrt(Yb.lengthSq()));
        Yb.addScaledVector(F, -Yb.dot(F)).normalize();
        // Z: from the spine to the fore-edge (towards the thumb: the fore-edge in the web; away: the spine)
        const Z = _v1.copy(T).addScaledVector(Yb, -T.dot(Yb));
        if (Z.lengthSq() < 1e-4) Z.crossVectors(Yb, F).multiplyScalar(Math.sign(Z.dot(T)) || 1);
        Z.normalize().multiplyScalar(h.bookSpine ? -1 : 1);
        const X = _v2.crossVectors(Yb, Z);
        _m4.makeBasis(X, Yb, Z);
        _q.setFromRotationMatrix(_m4);
        if (!h.q) h.q = _q.clone(); else h.q.slerp(_q, Math.min(1, dt * 28));
        m.quaternion.copy(h.q);
        const sc = m.scale.x;
        const E = this._palmPoint(f, BOOK_POINTS.edgeX, BOOK_POINTS.edgeY, BOOK_POINTS.face - this._halfThick(), _v3);
        m.position.copy(E).sub(_v4.set(0, HOLD.GRIP_Y, h.bookSpine ? -BOOK.B * sc : BOOK.W * sc).applyQuaternion(h.q));
        m.updateMatrixWorld(true);
        h.gripped = true;
        this._fitHand(side, this._closedBoxes(m));
        return true;
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

    /** Closed in one fist: the other hand may take it by the covers' edge (the fore-edge). */
    _fist(hb, dt) {
        const B = other(hb.side);
        if (!this._free(B) || !this.game.currentPose && !this.input) { this._grab[B] = 0; this._armed[B] = false; return; }
        const h = this._hand(B);
        const m = hb.model;
        m.updateMatrixWorld(true);
        const { W, H } = BOOK;
        const a = m.localToWorld(_v3.set(0, -H / 2, W)), b = m.localToWorld(_v4.set(0, H / 2, W));
        const near = distToSegment(h.G, a, b) < HOLD.REACH;
        if (!this._takes(B, h, near, dt)) return;
        // both hands now: each holds a half by its outer edge — the one on the reader's left
        // the left half; the book turns from how the fist held it into how both hands hold it
        const eye = this._eye(_v1);
        const right = viewRight(eye, m.position, _v2);
        const hA = this._hand(hb.side);
        const aLeft = hA.G.dot(right) < h.G.dot(right);
        const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
        const lim = H * m.scale.x / 2 - 0.1;
        const gy = Math.max(-lim, Math.min(lim, (_v5.subVectors(hA.G, m.position).dot(Y) + _v6.subVectors(h.G, m.position).dot(Y)) / 2));
        this.s = {
            mode: 'two', model: m, item: hb.item, owner: hb.side,
            hold: { left: aLeft ? hb.side : B, right: aLeft ? B : hb.side },
            phi: 0, pos: m.position.clone(), quat: m.quaternion.clone(), gy,
            from: { pos: m.position.clone(), quat: m.quaternion.clone(), t: 0 },
            pL: null, pR: null, spread: 0, sheet: null, readT: 0, lowT: 0, support: false, slipT: 0,
        };
        this._setGrip(B, 0.55, 'book');
        this._initPages(this.s);
        this.game.hud.setVoice?.('📖 Разведите руки — книга раскроется. Чтобы листать, отпустите одну руку и подденьте пальцем край страницы', true);
    }

    /** Which way the hands' fingers point (both together; each hand's sign as before). */
    _handsY(s, hs) {
        const Y = this._hy || (this._hy = new THREE.Vector3());
        Y.set(0, 0, 0);
        for (const h of hs) {
            const y = h.f?.Y || h.Y;
            if (y) Y.addScaledVector(y, s.hyPrev && y.dot(s.hyPrev) < 0 ? -1 : 1);
        }
        return Y.lengthSq() > 1e-6 ? Y.normalize() : null;
    }

    /**
     * Both hands hold the halves by their outer edges: the book is as open as the hands are
     * apart, tilted as the hands are (the edges lie along their fingers).
     */
    _two(s, dt) {
        const hl = this._hand(s.hold.left), hr = this._hand(s.hold.right);
        // (eased by speed: a still hand's tremble is gone, a real move is followed at once)
        this._steady(s, 'pL', hl.G, dt);
        this._steady(s, 'pR', hr.G, dt);
        const eye = this._eye(_v1);
        // upright to the eyes, turned on by however the hands have turned since they took it
        // (bend the wrists — it tilts with them)
        const up = frameFromHands(s.pL, s.pR, eye, this.w, this._f0 || (this._f0 = {}), { gy: s.gy, t: this.t });
        let Y = null;
        const hy = this._handsY(s, [hl, hr]);
        if (hy) {
            if (!s.hy0) s.hy0 = hy.clone();
            Y = _v2.copy(up.Y).applyQuaternion(_q2.setFromUnitVectors(s.hy0, hy));
            s.hyPrev = (s.hyPrev || new THREE.Vector3()).copy(hy);
        }
        const f = frameFromHands(s.pL, s.pR, eye, this.w, this._f || (this._f = {}), { Y, gy: s.gy, t: this.t });
        s.phi = f.phi;
        this._place(s, f.pos, f.quat, dt);
        const boxes = this._openBoxes(s.model);
        this._fitHand(s.hold.left, boxes);
        this._fitHand(s.hold.right, boxes);
        // a hand that opens (or points its index) lets go of its half
        for (const half of ['left', 'right']) {
            const side = s.hold[half], h = half === 'left' ? hl : hr;
            if (this._dwell(this._let, side, this._closed(h) < HOLD.OPEN_CURL, dt) < HOLD.LET_GO_T) continue;
            this._let[side] = 0;
            this._letGo(s, half);
            return;
        }
        // the hands further apart than the open book reaches: the cover slips out of the second
        // hand's fingers (a book doesn't stretch, nor follow a hand that has gone away)
        const far = hl.G.distanceTo(hr.G) > 2 * (this.w + this.t) + HOLD.SLIP;
        s.slipT = far ? s.slipT + dt : 0;
        if (s.slipT >= HOLD.SLIP_T) {
            s.slipT = 0;
            this._letGo(s, s.hold.left === s.owner ? 'right' : 'left');
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
        const kept = other(half);
        s.mode = 'one';
        s.hold = { [half]: null, [kept]: keeps };
        s.half = kept;
        s.lowT = 0;
        s.support = false;
        this._grab[gone] = 0;
        this._armed[gone] = false;
        this._let[keeps] = 0;
        this._rig(s, this._hand(keeps));
    }

    /** The palm of a hand (P, q) — or, with no palm known, its grip with no turn. */
    _palm(h) {
        return h.f ? { P: h.f.P, q: h.f.q } : { P: h.G, q: h.q || _qI };
    }

    /** The held half as it is now, kept rigidly in that hand from now on (as a thing in the fingers): its turn and its hinge. */
    _rig(s, h) {
        const { P, q } = this._palm(h);
        const inv = _q2.copy(q).invert();
        const hq = halfQuat(s.quat, s.half, s.phi, _q);
        const hinge = _v3.set(s.half === 'left' ? -this.t : this.t, 0, 0).applyQuaternion(s.quat).add(s.pos);
        s.rig = { q: inv.clone().multiply(hq), h: hinge.sub(P).applyQuaternion(inv).clone() };
    }

    /** Open in one hand: its half held rigidly by the edge — or lying on the open palm; the other hand is free for the pages. */
    _one(s, dt) {
        const g = this.game;
        const H = s.hold[s.half];
        const h = this._hand(H);
        // (a book held open in one hand settles about so open)
        s.phi += (HOLD.ONE_HAND_PHI - s.phi) * Math.min(1, dt * 1.5);
        const { P, q } = this._palm(h);
        const f1 = this._f1 || (this._f1 = {});
        const F = h.f ? _v5.copy(h.f.Z).negate() : null; // where the palm looks
        if (s.support && F) {
            const Yp = h.f.Y;
            frameOnPalm(P, Yp, F, 0.07 + BOOK.B * (ITEM_SCALE.book || 1.6) + 0.01, f1);
        } else {
            const hq = _q.copy(q).multiply(s.rig.q);
            const hinge = _v4.copy(s.rig.h).applyQuaternion(q).add(P);
            bookFromHinge(hinge, hq, s.half, s.phi, this.t, f1);
        }
        this._place(s, f1.pos, f1.quat, dt);
        this._fitHand(H, this._openBoxes(s.model));
        // the holding hand opens: on an open palm turned up the book lies on it; a stretched
        // arm that opens drops it (the only way it falls); otherwise the fingers keep it
        const open = this._dwell(this._let, H, h.curl < HOLD.OPEN_CURL, dt) >= HOLD.LET_GO_T;
        const palmUp = F ? F.y > 0.5 : !!h.palmUp;
        if (!s.support && open) {
            if (palmUp) {
                s.support = true;
                s.from = { pos: s.model.position.clone(), quat: s.model.quaternion.clone(), t: 0, T: HOLD.SLIDE_T };
            } else if (h.ext) {
                this._let[H] = 0;
                this._end(false);
                g.items._throw(H, new THREE.Vector3());
                return;
            }
        } else if (s.support) {
            if (open && !palmUp && h.ext) { this._let[H] = 0; this._end(false); g.items._throw(H, new THREE.Vector3()); return; }
            // the fingers close on it again: it is held where it lies
            if (this._dwell(this._grab, H, h.curl > HOLD.GRAB_CURL, dt) >= HOLD.GRAB_T) {
                this._grab[H] = 0;
                s.support = false;
                this._rig(s, h);
            }
        }
        // the holding arm lowered: it closes in that hand
        s.lowT = !h.up ? s.lowT + dt : 0;
        if (s.lowT >= HOLD.LOWERED_T) { this._end(false); return; }
        // the free hand: takes the free half by its edge again, or turns the pages
        const Fr = other(H);
        if (!this._free(Fr)) return;
        const fh = this._hand(Fr);
        const freeHalf = other(s.half);
        // (its outer edge, top to bottom: the hand closes on it there — and only there)
        const hs = BOOK.H * (ITEM_SCALE.book || 1.6) / 2;
        const ea = edgeInBook(freeHalf, s.phi, this.w, -hs, this.t, _v2).applyQuaternion(s.quat).add(s.pos);
        const eb = edgeInBook(freeHalf, s.phi, this.w, hs, this.t, _v6).applyQuaternion(s.quat).add(s.pos);
        const near = !s.support && s.sheet?.finger == null && distToSegment(fh.G, ea, eb) < HOLD.REACH;
        if (this._takes(Fr, fh, near, dt)) {
            s.mode = 'two';
            s.slipT = 0;
            s.hold = { [s.half]: H, [freeHalf]: Fr };
            s.pL = s.pR = null; s.steady = null;
            s.hy0 = s.hyPrev = null;
            s.from = { pos: s.model.position.clone(), quat: s.model.quaternion.clone(), t: 0 };
            this._setGrip(Fr, 0.55, 'book');
            return;
        }
        this._finger(s, fh, dt);
        this._pushOut(s, Fr, fh);
    }

    /** The book's pose: from the hands (turned in from how it was at first). */
    _place(s, pos, quat, dt) {
        const m = s.model;
        s.pos.copy(pos);
        s.quat.copy(quat);
        const fr = s.from;
        const T = fr?.T || HOLD.BLEND_T;
        if (fr && fr.t < T) {
            fr.t += dt;
            const k = Math.min(1, fr.t / T);
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
        const lore = loreOf(s.item); // (a book of the world's history: only text and pictures — LoreBooks.js)
        s.tex = lore ? loreSpreads(lore)
            : s.item.runbook ? [{ left: drawRunPage('left'), right: drawRunPage('right') }]
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
            if (s.catchT < CATCH.T) return;
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
        if (s.item.runbook && !s.item.wild && s.readT > HOLD.LEARN_T && !s.item.used) { // (a wild one has nothing left to give)
            s.item.used = true;
            const g = this.game, side = s.owner, p = s.pos.clone();
            g.runner?.bless?.();
            for (let i = 0; i < 40; i++) g.fx?.spark(p, i % 2 ? 0xffd23f : 0xfff2a8, 0.12, _v4.set((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), 1);
            g.items?.releaseHand(side);
            this._end(true);
            return;
        }
        const learned = this.books.learned;
        // (the swift book's «Флайн» is not learned by reading: only by burning the book)
        if (spell === 'Flight' && s.readT > HOLD.LEARN_T && !s.toldBurn) {
            s.toldBurn = true;
            if (!this.game.bonus?.flight) this.game.hud.setVoice?.('📘 «Флайн» выучит тот, кто сожжёт эту книгу: держите её в одной руке и скажите «Инферно» (или поднесите к огню)', true);
        }
        if (spell && spell !== 'Flight' && s.readT > HOLD.LEARN_T && !learned.has(spell)) {
            if (isWardSpell(spell)) {
                // «Защита дома» is one group: a page of it read — all three are known
                for (const sp of WARD_SPELLS) learned.add(sp);
                this.game.hud.setVoice?.(`📘🛡️ Изучена группа «Защита дома»: ${WARD_SPELLS.map((sp) => '«' + bookSpellName(sp) + '»').join(', ')}`, true);
                this.game.fx?.lightFlash?.(s.pos, 0x8fc8ff, 2, 0.4, 10);
            } else {
                learned.add(spell);
                this.game.hud.toast?.(`📖 Изучено заклинание: «${bookSpellName(spell)}»`, 2500);
                this.game.fx?.lightFlash?.(s.pos, 0xffe9a8, 2, 0.3, 10);
            }
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
        hand.group.position.add(push.clampLength(0, HOLD.PUSH_MAX));
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
        if (hl && hr) frameFromHands(this._gripOf(ch, hl, _v2).clone(), this._gripOf(ch, hr, _v3), eye, this.w, f, { gy: HOLD.GRIP_Y, t: this.t });
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
        for (const t of rr.tex) disposeSpread(t);
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
        for (const t of s.tex) disposeSpread(t);
        if (!gone) setBookAngle(s.model, 0);
        // the hand that held only a cover lets the fingers go
        const g = this.game;
        for (const side of ['left', 'right']) if (side !== s.owner || gone) { if (!g.items.held[side] && !g.weapons.hands[side].held) this._setGrip(side, null); }
        if (g.hud._lastVoice?.startsWith?.('📖')) g.hud.setVoice('', false);
    }

    dispose() { this._end(true); }
}
