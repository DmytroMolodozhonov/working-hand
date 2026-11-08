/**
 * FishingRodModel.js — the fishing rod and a caught fish as things, drawn «like the gates» (docs/rules/texture-style.md).
 *
 * The rod (1 model unit = ITEM_SCALE.fishingRod m in the hand; along +Y: the butt at 0, the tip at TIP_Y = 2.1):
 *   - the cork grip (0.04–0.40) with its speckled, worn cork and nickel rings, a rubber butt cap;
 *   - the reel seat (0.40–0.52) and a spinning reel hung under the rod on −Z: a silver spool with the line wound on it, the rotor and the bail, the crank with its knob;
 *   - the blank in FOUR joined pieces (S1…S4, each a pivot — the rod BENDS under a fish: `userData.bend(dx, dz, k)` turns them, each a bit more than the one below),
 *     tapering from 1.6 to 0.4 cm, lacquered (three colours by the rod's uid: olive, burgundy, honey bamboo) with a long sheen, ferrule rings at the joints;
 *   - seven guides (a ring on a foot, silk-wrapped in a colour) down the −Z side, the line running through them from the reel to the tip (the pieces of the line
 *     are children of the segments, so they bend with the rod and never come apart at a joint);
 *   - `userData.tip` — an Object3D at the top guide: where the line leaves the rod (Fishing.js reads its world place), `userData.segs`, `userData.tipY`.
 * Cheap: unit geometries are shared, 5 small canvas textures are drawn once (none without a `document`: tests), materials are cached by colour (the three blanks).
 *
 * The fish (`fishItemModel`): the sea's own fish (ReefFish.js — the same shape and the same shader painting, 100 kinds), a thing in the hand: nose up, held by its middle.
 */
import * as THREE from 'three';
import { FISH_SPECIES, fishItemMesh } from '../fx/ReefFish.js';
import { FISHING } from './FishingRules.js';

function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const _tex = {};
function tex(name, w, h, draw, seed) {
    if (_tex[name] !== undefined) return _tex[name];
    if (typeof document === 'undefined') return (_tex[name] = null);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return (_tex[name] = null);
    draw(g, w, h, rng(seed));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return (_tex[name] = t);
}

/** Cork: warm pale base, dark and light granules of every size, a few pits, rings of wear and a long sheen. */
const corkTex = () => tex('cork', 64, 128, (g, W, H, r) => {
    g.fillStyle = '#d8b98a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) { const x = r() * W, y = r() * H, s = 0.6 + r() * 2.4; g.fillStyle = r() < 0.55 ? `rgba(90,52,20,${0.1 + r() * 0.3})` : `rgba(255,236,196,${0.12 + r() * 0.25})`; g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.6), r() * 3, 0, 6.3); g.fill(); }
    for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * H; g.fillStyle = 'rgba(50,28,10,0.45)'; g.beginPath(); g.arc(x, y, 0.8 + r() * 1.4, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,240,210,0.3)'; g.beginPath(); g.arc(x + 1, y + 1, 0.7, 0, 6.3); g.fill(); }
    for (let y = 8; y < H; y += 26 + r() * 10) { g.strokeStyle = 'rgba(70,40,14,0.22)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (r() - 0.5) * 3); g.stroke(); } // (the rings where the cork pieces are glued)
    const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0.18, 'rgba(255,255,255,0)'); sh.addColorStop(0.32, 'rgba(255,245,220,0.25)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(0.9, 'rgba(0,0,0,0.12)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
}, 41);

/** The blank: a pale base (the lacquer's colour tints it), fine lengthwise fibres, a darker back, a bright gloss line, tiny scratches and a few bamboo nodes. */
const blankTex = () => tex('blank', 32, 256, (g, W, H, r) => {
    g.fillStyle = '#e4dccb'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) { const x = r() * W; g.strokeStyle = r() < 0.6 ? `rgba(60,40,20,${0.06 + r() * 0.14})` : `rgba(255,255,245,${0.08 + r() * 0.16})`; g.lineWidth = 0.5 + r() * 1.1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 2, H); g.stroke(); }
    for (let n = 0; n < 5; n++) { const y = 20 + r() * (H - 40); g.fillStyle = 'rgba(70,45,20,0.28)'; g.fillRect(0, y, W, 2.2); g.fillStyle = 'rgba(255,245,220,0.3)'; g.fillRect(0, y + 2.2, W, 1.2); } // (nodes: a dark ring, a light edge)
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.6; const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 3 + r() * 9); g.stroke(); }
    const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0.12, 'rgba(0,0,0,0.25)'); sh.addColorStop(0.3, 'rgba(255,255,255,0.45)'); sh.addColorStop(0.42, 'rgba(255,255,255,0)'); sh.addColorStop(0.85, 'rgba(0,0,0,0.3)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
}, 42);

/** Brushed nickel / anodised metal: pale base, fine lathe lines round it, a bright band, dark edges, a few nicks. */
const metalTex = () => tex('nickel', 64, 64, (g, W, H, r) => {
    g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 1.4) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.15})` : `rgba(40,45,55,${0.05 + r() * 0.15})`; g.fillRect(0, y, W, 0.8); }
    for (let i = 0; i < 24; i++) { g.fillStyle = 'rgba(30,30,36,0.35)'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 0.8); }
    const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(0.28, 'rgba(255,255,255,0.5)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.4)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
}, 43);

/** The line wound on the spool: pale monofilament coils, side by side, each with its own shine. */
const coilTex = () => tex('coil', 64, 32, (g, W, H, r) => {
    g.fillStyle = '#d9dfd6'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 1.3) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.3})`; g.fillRect(0, y, W, 0.6); g.fillStyle = `rgba(70,85,70,${0.1 + r() * 0.2})`; g.fillRect(0, y + 0.7, W, 0.5); }
}, 44);

// ------------------------------------------------------------------ shared geometries and cached materials
const _geo = {};
const G = (key, make) => _geo[key] || (_geo[key] = Object.assign(make(), { userData: { shared: true } }));
const _mat = {};
const M = (key, make) => _mat[key] || (_mat[key] = Object.assign(make(), { userData: { shared: true } }));
const lam = (c, map) => M('l' + c + (map ? 'm' + map.id : ''), () => new THREE.MeshLambertMaterial({ color: c, map: map || null }));
const std = (c, map, rough = 0.35, metal = 0.0) => M('s' + c + rough + metal + (map ? 'm' + map.id : ''), () => new THREE.MeshStandardMaterial({ color: c, map: map || null, roughness: rough, metalness: metal }));

/** The three blanks (a rod's colour is one of them, by its uid). */
export const BLANKS = [
    { name: 'olive', color: 0x4d6a34, wrap: 0xd4a52a },
    { name: 'burgundy', color: 0x7a2432, wrap: 0xe8d9a0 },
    { name: 'bamboo', color: 0xc99a52, wrap: 0x6a1f1a },
];
const look01 = (uid, salt) => { let h = 2166136261; const s = String(uid || '') + salt; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
export const blankOf = (it) => BLANKS[Math.floor(look01(it?.uid, 'blank') * BLANKS.length)];

// the pieces of the blank: [bottom y, top y, bottom r, top r] (model units)
const PIECES = [[0.52, 0.98, 0.0165, 0.0135], [0.98, 1.45, 0.0135, 0.0105], [1.45, 1.82, 0.0105, 0.0075], [1.82, FISHING.TIP_Y, 0.0075, 0.0035]];
const GUIDE_Z = 0.026; // the guides stand off the blank on the −Z side
const GUIDES = [[0, 0.07, 0.034], [0, 0.46, 0.028], [1, 0.46, 0.025], [2, 0.3, 0.021], [2, 0.88, 0.017], [3, 0.4, 0.014], [3, 1.0, 0.011]]; // [piece, y rel to its bottom (share of the piece), ring radius] — the last is the tip's

/** A fishing rod. `it`: {uid}. */
export function fishingRodModel(it = {}) {
    const g = new THREE.Group();
    const B = blankOf(it);
    const cork = corkTex(), blank = blankTex(), nickel = metalTex(), coil = coilTex();
    const nickelM = std(0xe4e6ea, nickel, 0.28, 0.75), corkM = lam(0xffffff, cork), blankM = std(B.color, blank, 0.22, 0.05), wrapM = lam(B.wrap), darkM = lam(0x1d1b1a), lineM = lam(0xe8efe6);
    const cyl = (key, rt, rb, h, sides = 12) => G(key, () => new THREE.CylinderGeometry(rt, rb, h, sides));

    // the cork grip, its rings, the butt cap
    const grip = new THREE.Mesh(cyl('rodGrip', 0.031, 0.027, 0.36, 14), corkM); grip.position.y = 0.04 + 0.18; g.add(grip);
    const cap = new THREE.Mesh(cyl('rodCap', 0.03, 0.026, 0.045, 12), darkM); cap.position.y = 0.0225; g.add(cap);
    for (const y of [0.042, 0.40]) { const r = new THREE.Mesh(cyl('rodRing', 0.033, 0.033, 0.014, 14), nickelM); r.position.y = y; g.add(r); }
    // the reel seat: two nickel collars and a screwed hood
    const seat = new THREE.Mesh(cyl('rodSeat', 0.03, 0.03, 0.11, 12), nickelM); seat.position.y = 0.455; g.add(seat);
    const hood = new THREE.Mesh(cyl('rodHood', 0.032, 0.032, 0.02, 12), nickelM); hood.position.y = 0.52; g.add(hood);

    // the spinning reel under the rod (−Z): foot, body, spool with the line, rotor, bail, crank
    const reel = new THREE.Group(); reel.position.set(0, 0.45, -0.052); g.add(reel);
    const foot = new THREE.Mesh(G('reelFoot', () => new THREE.BoxGeometry(0.03, 0.09, 0.034)), nickelM); foot.position.set(0, 0, 0.015); reel.add(foot);
    const body = new THREE.Mesh(cyl('reelBody', 0.04, 0.047, 0.07, 14), std(0x2a2e36, null, 0.3, 0.6)); body.position.set(0, 0, -0.04); reel.add(body);
    const spool = new THREE.Mesh(cyl('reelSpool', 0.05, 0.046, 0.032, 16), nickelM); spool.position.set(0, 0.052, -0.04); reel.add(spool);
    const wound = new THREE.Mesh(cyl('reelCoil', 0.041, 0.041, 0.024, 16), M('coil', () => new THREE.MeshLambertMaterial({ color: 0xffffff, map: coil }))); wound.position.set(0, 0.052, -0.04); reel.add(wound);
    const rotor = new THREE.Mesh(cyl('reelRotor', 0.045, 0.036, 0.025, 16), std(0x2a2e36, null, 0.3, 0.6)); rotor.position.set(0, -0.03, -0.04); reel.add(rotor);
    const bail = new THREE.Mesh(G('reelBail', () => new THREE.TorusGeometry(0.052, 0.0035, 5, 14, Math.PI)), nickelM); bail.position.set(0, 0.035, -0.04); bail.rotation.x = Math.PI / 2; bail.rotation.z = 0.6; reel.add(bail);
    // the crank: an arm to the side, a cork knob
    const arm = new THREE.Mesh(G('reelArm', () => new THREE.BoxGeometry(0.075, 0.008, 0.012)), nickelM); arm.position.set(0.062, -0.005, -0.04); reel.add(arm);
    const knob = new THREE.Mesh(G('reelKnob', () => new THREE.SphereGeometry(0.013, 8, 6)), corkM); knob.position.set(0.1, -0.005, -0.04); reel.add(knob);
    const stem = new THREE.Mesh(cyl('reelStem', 0.0035, 0.0035, 0.05, 6), nickelM); stem.position.set(0.1, 0.02, -0.04); reel.add(stem);
    g.userData.reel = reel;

    // the blank in four pieces: each a pivot at its bottom (the rod bends there), each a lacquered tube, a nickel ferrule at the joint
    const segs = [];
    let parent = g, y0 = 0;
    PIECES.forEach(([ya, yb, rb, rt], i) => {
        const piv = new THREE.Group(); piv.position.y = ya - y0; parent.add(piv); piv.userData.rest = piv.position.y;
        const len = yb - ya;
        const tube = new THREE.Mesh(G('rodPiece' + i, () => new THREE.CylinderGeometry(rt, rb, len, 10, 1)), blankM); tube.position.y = len / 2; piv.add(tube);
        if (i) { const f = new THREE.Mesh(cyl('rodFerrule', rb * 1.18, rb * 1.18, 0.028, 10), nickelM); f.position.y = 0.012; piv.add(f); }
        segs.push(piv); parent = piv; y0 = ya;
    });
    // guides and the line between them (children of the pieces: they bend with the rod)
    const guidePts = []; // [piece index, local y, z]
    GUIDES.forEach(([pi, share, rr], k) => {
        const [ya, yb, rb, rt] = PIECES[pi], len = yb - ya, ly = len * share, rad = rb + (rt - rb) * share;
        const piv = segs[pi];
        // the silk wrap (a short thicker band), the foot (a little bar out from the blank), the ring (its plane across the rod: the line goes through it along the rod)
        const off = rr * 0.5 + 0.004, zc = -(rad + off);
        const wrap = new THREE.Mesh(cyl('rodWrap', rad + 0.0025, rad + 0.0025, 0.03, 10), wrapM); wrap.position.y = ly; piv.add(wrap);
        const footBar = new THREE.Mesh(G('guideFoot' + k, () => new THREE.BoxGeometry(0.005, 0.003, off)), nickelM); footBar.position.set(0, ly, -(rad + off / 2)); piv.add(footBar);
        const ring = new THREE.Mesh(G('guideRing' + k, () => new THREE.TorusGeometry(rr * 0.5, 0.0028, 5, 12)), nickelM);
        ring.position.set(0, ly, zc); ring.rotation.x = Math.PI / 2; piv.add(ring);
        guidePts.push({ pi, z: zc });
    });
    // the line: reel → first guide (children of the base), then guide to guide inside a piece; joints are shared by two pieces' ends (the ferrule's place)
    const seg = (parentObj, a, b) => {
        const d = new THREE.Vector3().subVectors(b, a), len = d.length();
        const m = new THREE.Mesh(G('lineUnit', () => new THREE.CylinderGeometry(0.0013, 0.0013, 1, 4)), lineM);
        m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, len, 1);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        parentObj.add(m);
    };
    // from the spool's top to the first guide (in the first piece's frame: its pivot at y 0.52)
    const first = guidePts[0], g0 = new THREE.Vector3(0, GUIDES[0][1] * (PIECES[0][1] - PIECES[0][0]) + 0.003, first.z);
    seg(segs[0], new THREE.Vector3(0, 0.45 + 0.07 - PIECES[0][0], -0.092), g0); // (from the reel's spool, up to the first guide)
    for (let i = 0; i + 1 < GUIDES.length; i++) {
        const A = GUIDES[i], Bb = GUIDES[i + 1];
        const pa = A[0], pb = Bb[0];
        const ya = A[1] * (PIECES[pa][1] - PIECES[pa][0]) + 0.003, yb2 = Bb[1] * (PIECES[pb][1] - PIECES[pb][0]) + 0.003;
        if (pa === pb) seg(segs[pa], new THREE.Vector3(0, ya, guidePts[i].z), new THREE.Vector3(0, yb2, guidePts[i + 1].z));
        else { // (over a joint: up to the top of the piece, then from the bottom of the next: both end at the pivot — the line is whole when it bends)
            const top = PIECES[pa][1] - PIECES[pa][0], zj = (guidePts[i].z + guidePts[i + 1].z) / 2;
            seg(segs[pa], new THREE.Vector3(0, ya, guidePts[i].z), new THREE.Vector3(0, top, zj));
            seg(segs[pb], new THREE.Vector3(0, 0, zj), new THREE.Vector3(0, yb2, guidePts[i + 1].z));
        }
    }
    // the tip: where the line leaves — an Object3D at the top guide
    const tip = new THREE.Object3D(); tip.position.set(0, GUIDES[GUIDES.length - 1][1] * (PIECES[3][1] - PIECES[3][0]) + 0.004, guidePts[guidePts.length - 1].z); segs[3].add(tip);
    const topCap = new THREE.Mesh(G('rodTop', () => new THREE.SphereGeometry(0.0055, 6, 5)), nickelM); topCap.position.set(0, tip.position.y, tip.position.z); segs[3].add(topCap);

    // bending: every piece turns about the axis perpendicular to `dir` (the way the tip is pulled, in the rod's XZ plane) — the higher, the more
    const BEND = [0.16, 0.24, 0.32, 0.36];
    const _ax = new THREE.Vector3(), _q = new THREE.Quaternion();
    g.userData.bend = (dx, dz, k) => {
        const n = Math.hypot(dx, dz);
        if (n < 1e-6 || k <= 1e-4) { for (const s of segs) s.quaternion.identity(); return; }
        _ax.set(dz / n, 0, -dx / n); // (y × dir: the turn that tips +Y towards dir)
        for (let i = 0; i < segs.length; i++) segs[i].quaternion.copy(_q.setFromAxisAngle(_ax, BEND[i] * k));
    };
    g.userData.segs = segs; g.userData.tip = tip; g.userData.tipY = FISHING.TIP_Y;
    g.userData.rodColor = B.name;
    return g;
}

// ------------------------------------------------------------------ the caught fish as a thing
/** A fish as an item model: nose up, held by its middle (GRIPPED.fish: like a bone across the palm). `it`: {species, len, cooked}. */
export function fishItemModel(it = {}) {
    const sp = FISH_SPECIES[Math.max(0, Math.min(FISH_SPECIES.length - 1, it.species | 0))];
    const g = new THREE.Group();
    const f = fishItemMesh(sp, it.len || sp.len, !!it.cooked);
    const wrap = new THREE.Group(); // (its long axis z → y: the nose up)
    wrap.rotation.x = Math.PI / 2;
    wrap.add(f);
    g.add(wrap);
    g.userData.fish = true;
    return g;
}
