/**
 * RealSkinMaterial.js — how the «Реалистичный» hero's skin, eyes and clothes look, drawn by the video card (one Phong
 * material, the game's lights and fog; everything else is the shader's: no pictures to load or keep).
 *
 * The WORLD's style, not a photo's (the author found the «real» skin creepy): soft facets (each facet of the low-poly
 * skin shaded a little on its own — `FACET`), colour in little «pixels» like the blocks' and the villagers' (`TEXEL`
 * cells, each its own shade), a small palette, no pores, no wet eyes, no teeth.
 *
 *   skin   — its colour in pixels, warmer where the blood shows (cheeks, nose, ears, knuckles, knees: the mesh's
 *            `flush`), darker in creases (`ao`), flat lips, plain nails, the mouth's dark inside, blocky eyebrows, a
 *            dark line over each eye (the lashes' line), freckles and a blush if the face has them;
 *   eyes   — a cartoon eye: white, a big iris in two tones, a black pupil, a square pixel highlight;
 *   clothes — the top, the bottoms, the shoes of the look: where each covers is measured on the mesh (along the arm,
 *            the leg, the torso's height), each covering place is pushed out a little (cloth over the body) with folds
 *            — at the elbows and the knees as deep as they bend now — and its own weave and pattern (denim twill,
 *            knit, stripes, a hoodie's pocket and strings, a jacket's lapels, a tie, a tunic's belt…);
 *   dark magic — veins and stains growing with the level (DarkMagic.darkLook), «Империус» — white burning eyes.
 *
 * One program for every such hero (the per-hero colours are uniforms): compiled on the loading screen (Game.prewarm).
 */
import * as THREE from 'three';
import { ANAT, HEADX, BODYX, FLOOR } from './RealRig.js';

const NOISE = /* glsl */`
float rh3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(rh3(i), rh3(i + vec3(1, 0, 0)), f.x), mix(rh3(i + vec3(0, 1, 0)), rh3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(rh3(i + vec3(0, 0, 1)), rh3(i + vec3(1, 0, 1)), f.x), mix(rh3(i + vec3(0, 1, 1)), rh3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { return 0.55 * vn3(p) + 0.3 * vn3(p * 2.03 + 7.1) + 0.15 * vn3(p * 4.1 + 3.3); }
`;

/** The head's and the torso's old measures (RealRig.HEADX / BODYX): the patterns are read in them. */
const MAPS = /* glsl */`
const vec3 HX_C = vec3(${HEADX.C[0].toFixed(4)}, ${HEADX.C[1].toFixed(4)}, ${HEADX.C[2].toFixed(4)});
const vec3 HX_S = vec3(${HEADX.S[0].toFixed(4)}, ${HEADX.S[1].toFixed(4)}, ${HEADX.S[2].toFixed(4)});
const float BX_KT = ${((BODYX.top - BODYX.hip) / (BODYX.oldTop - BODYX.oldHip)).toFixed(5)};
float toOldH(float h) { return h <= ${BODYX.hip.toFixed(3)} ? h * ${(BODYX.oldHip / BODYX.hip).toFixed(5)} : ${BODYX.oldHip.toFixed(3)} + (h - ${BODYX.hip.toFixed(3)}) / BX_KT; }
`;

const VERT_PARS = /* glsl */`${MAPS}
attribute vec4 aInfo;
attribute vec4 aMix;
attribute vec4 aLimb;
uniform vec4 uTop, uTopX, uBot, uBotX, uShoe, uBend;
varying vec3 vRest;
varying vec4 vInfo;
varying vec4 vMix;
varying vec4 vLimb;
varying vec3 vCover;
uniform vec4 uArm;
`;

/** Where the clothes cover (metres, + inside) and the cloth pushed out over the body, before the bones move it. */
const VERT_MAIN = /* glsl */`
vInfo = aInfo; vMix = aMix; vLimb = aLimb;
// (the old measures: the torso's heights and widths for the clothes, the head's own for the face)
float hh = toOldH(position.y + 2.0);
vec3 pb = vec3(position.x * mix(${(1 / BODYX.x).toFixed(5)}, ${(0.24 / ANAT.hip[0]).toFixed(5)}, aLimb.z), hh - 2.0, position.z / mix(${BODYX.z.toFixed(3)}, 1.0, aLimb.z));
vRest = aInfo.w > 0.5 ? HX_C + (position - HX_C) / HX_S : pb;
float armK = aLimb.x, legK = aLimb.z;
bool piece = aInfo.x > 2.5; // (the eyes, the teeth, the tongue, the hats: not dressed)
// the top: the torso's band, the sleeves, below the crotch only when it is long
float neckR = length(vec2(pb.x, (pb.z - 0.02) * 1.25));
float sTop = mix(min(hh - uTop.z, max(uTop.w - hh, neckR - 0.2 - (uTop.w - 3.6) * 0.5)), (uTop.y - aLimb.y) * 1.9, armK);
if (aInfo.w > 0.5 && hh > 3.6) sTop = min(sTop, 3.6 - hh); // (the head's own mesh: only its neck's foot)
sTop = mix(sTop, (hh - uTop.z) - (uTop.z > 2.15 ? 9.0 : 0.0), legK);
if (aLimb.y > 1.0 && armK > 0.5) sTop = -1.0;
// the bottoms: below the waist, down the legs
float sBot = mix(uBot.z - hh, (uBot.y - aLimb.w) * 2.1, legK);
if (armK > 0.5 || aLimb.w > 1.0) sBot = -1.0;
// the shoes: the feet and up the shin as high as they are
float sShoe = uShoe.y < 0.0 ? -1.0 : (aLimb.w > 1.0 ? 1.0 : (aLimb.w - (1.0 - uShoe.y)) * 2.1);
if (legK < 0.5) sShoe = -1.0;
if (piece) { sTop = -1.0; sBot = -1.0; sShoe = -1.0; }
vCover = vec3(sTop, sBot, sShoe);
float cT = smoothstep(-0.004, 0.004, sTop) * step(0.5, uTop.x + 1.0);
float cB = smoothstep(-0.004, 0.004, sBot);
float cS = smoothstep(-0.004, 0.004, sShoe);
float infl = max(max(cT * uTopX.x, cB * uBotX.x * (1.0 + uBot.w * aLimb.w * aLimb.w * legK)), cS * uShoe.z);
if (cT > 0.01 && cB > 0.01) infl += 0.006; // (one layer over the other)
// folds: a soft drape everywhere on the cloth, deep rings where the elbows and knees bend
float fold = (sin(pb.y * 37.0 + sin(pb.x * 11.0 + pb.z * 7.0) * 2.0) * 0.5 + 0.5) * 0.005 * max(cT, cB);
float side = position.x < 0.0 ? 1.0 : 0.0;
float elbowW = exp(-pow((aLimb.y - 0.526) * 8.0, 2.0)) * armK;
fold += (sin(aLimb.y * 90.0 + position.z * 22.0) * 0.5 + 0.5) * 0.02 * mix(uBend.y, uBend.x, side) * elbowW * cT;
float kneeW = exp(-pow((aLimb.w - 0.486) * 8.0, 2.0)) * legK;
fold += (sin(aLimb.w * 80.0 + position.x * 20.0) * 0.5 + 0.5) * 0.02 * mix(uBend.w, uBend.z, side) * kneeW * cB;
vec3 dirN = normal;
if (cS > 0.5 && dirN.y < -0.3) dirN = normalize(vec3(dirN.x, -0.12, dirN.z)); // (a sole stays on the floor)
transformed += dirN * (infl + fold * step(0.001, infl));
// the pointed shoes' toes, forward
transformed.z -= uShoe.w * cS * smoothstep(0.62, 1.12, aLimb.w) * smoothstep(-0.2, -0.45, pb.z);
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uSkin, uLip, uIris, uBrow, uTopC, uTopC2, uBotC, uShoeC, uHatC, uHatC2;
uniform vec4 uTop, uBot, uShoe, uFx, uLook, uArm, uCut, uFaceA, uFaceB, uFaceC, uFaceS;
uniform vec3 uSteel, uTrim, uGlow;
${MAPS}
varying vec3 vRest;
varying vec4 vInfo;
varying vec4 vMix;
varying vec4 vLimb;
varying vec3 vCover;
float rSpec = 0.0, rGloss = 0.0, rBump = 0.0, rMetal = 0.0;
vec3 rEmit = vec3(0.0);
${NOISE}
const vec3 EYE_R = vec3(${ANAT.eye[0]}, ${ANAT.eye[1]}, ${ANAT.eye[2]});
/** The world's «pixels»: a cell of the skin's / the cloth's own surface (in the old measures: ~2 cm on the head, ~3 cm on
 * the body as drawn) and its own shade — the blocks' and the villagers' textures are made so. */
const float TEXEL = 46.0;
float px(vec3 p) { return rh3(floor(p * TEXEL) + 0.5); }
vec3 skinAt(vec3 p) {
    vec3 c = uSkin;
    float t = px(p), n3 = vn3(floor(p * 9.0) * 0.7);
    c *= 0.985 + 0.012 * t + 0.015 * n3; // (almost flat, as the standard's)
    if (vInfo.w < 0.5) c = mix(c, c * vec3(1.04, 0.9, 0.86), clamp(floor(vInfo.z * 4.0 + 0.5) / 4.0 * 0.5, 0.0, 1.0)); // (knuckles, knees a little warmer; the face is the pixel face)
    rBump = 0.0; // (no pores: the world's skin is smooth)
    return c;
}
/**
 * The standard hero's face (Appearance.drawFace: 16 × 16 pixels on the head's front, the look's eyes and mouth) —
 * painted here and alive: the eyes blink and look, the brows rise and frown, the mouth smiles, opens, says «о»
 * (uFaceA: blinkL, blinkR, gazeX, gazeY; uFaceB: smile, jaw, wide, brows up; uFaceC: frown, squint; uFaceS: the
 * look's eye style, mouth style, freckles, blush). q — the head's drawn rest place.
 */
float fpx(float iu, float iv, float x, float y, float w, float h) { return step(x, iu) * step(iu, x + w - 0.5) * step(y, iv) * step(iv, y + h - 0.5); }
vec3 faceAt(vec3 q, vec3 c) {
    if (q.z > -0.52) return c;
    float iu = floor((0.6 - q.x) / 1.2 * 16.0), iv = floor((${(4.7 + FLOOR).toFixed(3)} - q.y) / 1.2 * 16.0);
    float es = uFaceS.x, ms = uFaceS.y;
    vec3 white = vec3(1.0), dark = vec3(0.133), lip = vec3(0.612, 0.29, 0.29), inside = vec3(0.353, 0.122, 0.122);
    // the skin's edge a little darker (as the standard's)
    if (iv > 14.5) c *= 0.88; else if (iu < 0.5 || iu > 14.5) c *= 0.94;
    // the brows: up a pixel when raised; the inner ends down when frowning (and on the angry face)
    float by = 4.0 - step(0.4, uFaceB.w);
    float angry = max(step(2.5, es) * step(es, 3.5), step(0.45, uFaceC.x));
    float kind = step(3.5, es) * step(es, 4.5) * (1.0 - angry);
    float brow = fpx(iu, iv, 3.0, by, 3.0, 1.0) + fpx(iu, iv, 10.0, by, 3.0, 1.0);
    brow += angry * (fpx(iu, iv, 5.0, by + 1.0, 1.0, 1.0) + fpx(iu, iv, 10.0, by + 1.0, 1.0, 1.0));
    brow += kind * (fpx(iu, iv, 3.0, by - 1.0, 1.0, 1.0) + fpx(iu, iv, 12.0, by - 1.0, 1.0, 1.0));
    if (brow > 0.5) return uBrow;
    // the eyes (the canvas' left one is the hero's right)
    float gx = uFaceA.z > 0.35 ? 1.0 : (uFaceA.z < -0.35 ? -1.0 : 0.0);
    float gy = uFaceA.w < -0.35 ? 1.0 : 0.0;
    for (int k = 0; k < 2; k++) {
        float x0 = k == 0 ? 3.0 : 10.0;
        float blink = k == 0 ? uFaceA.y : uFaceA.x;
        if (blink > 0.55 || (es > 1.5 && es < 2.5)) { if (fpx(iu, iv, x0, 7.0, 3.0, 1.0) > 0.5) return dark; continue; }
        float big = step(4.5, es);
        float wh = uFaceC.y > 0.5 ? 1.0 : 2.0 + big;
        float wy = uFaceC.y > 0.5 ? 7.0 : 6.0;
        // the pupil: two pixels, where the eye looks
        float base = k == 0 ? 1.0 : 0.0;
        float px0 = x0 + clamp(base + gx, 0.0, 1.0);
        float py0 = wy + (big > 0.5 ? 1.0 : 0.0) + gy * (wh > 2.5 ? 1.0 : 0.0);
        float pw = (es > 2.5 && es < 4.5) ? 1.0 : 2.0;
        if (es > 0.5 && es < 1.5) {
            if (fpx(iu, iv, px0, wy, 2.0, 2.0) > 0.5) return fpx(iu, iv, px0, wy, 1.0, 1.0) > 0.5 ? white : uIris;
            continue;
        }
        if (fpx(iu, iv, px0, py0, pw, (es > 3.5 && es < 4.5) ? 2.0 : min(2.0, wh)) > 0.5) return (big > 0.5 && fpx(iu, iv, px0, py0, 1.0, 1.0) > 0.5) ? vec3(0.0) : uIris;
        if (fpx(iu, iv, x0, wy, 3.0, wh) > 0.5) return white;
        if (es > 3.5 && es < 4.5 && fpx(iu, iv, x0, 8.0, 3.0, 1.0) > 0.5) return c * 0.85;
    }
    // the mouth: the look's own at rest; the face's when it smiles, is sad, opens, says «о»
    float sm = uFaceB.x, jaw = uFaceB.y, wide = uFaceB.z;
    float m = ms;
    if (sm > 0.35) m = 0.0; else if (sm < -0.3) m = 3.0;
    if (jaw > 0.25) m = wide < -0.4 ? 4.0 : 5.0;
    if (m < 0.5) { if (fpx(iu, iv, 5.0, 11.0, 6.0, 1.0) + fpx(iu, iv, 4.0, 10.0, 1.0, 1.0) + fpx(iu, iv, 11.0, 10.0, 1.0, 1.0) > 0.5) return lip; }
    else if (m < 1.5) { if (fpx(iu, iv, 6.0, 11.0, 4.0, 1.0) > 0.5) return lip; }
    else if (m < 2.5) { if (fpx(iu, iv, 6.0, 11.0, 4.0, 1.0) > 0.5) return white; if (fpx(iu, iv, 5.0, 11.0, 6.0, 2.0) > 0.5) return inside; }
    else if (m < 3.5) { if (fpx(iu, iv, 6.0, 12.0, 4.0, 1.0) + fpx(iu, iv, 5.0, 11.0, 1.0, 1.0) + fpx(iu, iv, 10.0, 11.0, 1.0, 1.0) > 0.5) return lip; }
    else if (m < 4.5) { if (fpx(iu, iv, 7.0, 11.0, 2.0, jaw > 0.6 ? 3.0 : 2.0) > 0.5) return inside; }
    else {
        // open: the dark mouth, taller with the jaw, wider with a wide mouth; the lip's corners
        float w = wide > 0.4 ? 8.0 : 6.0, x = 8.0 - w / 2.0, h = jaw > 0.6 ? 3.0 : 2.0;
        if (fpx(iu, iv, x, 11.0, w, h) > 0.5) return inside;
        if (fpx(iu, iv, x - 1.0, 11.0, 1.0, 1.0) + fpx(iu, iv, x + w, 11.0, 1.0, 1.0) > 0.5) return lip;
    }
    // freckles, a blush (the look's)
    if (uFaceS.z > 0.5 && (fpx(iu, iv, 3.0, 9.0, 1.0, 1.0) + fpx(iu, iv, 5.0, 10.0, 1.0, 1.0) + fpx(iu, iv, 11.0, 9.0, 1.0, 1.0) + fpx(iu, iv, 12.0, 10.0, 1.0, 1.0)) > 0.5) return c * 0.75;
    if (uFaceS.w > 0.5 && (fpx(iu, iv, 2.0, 9.0, 2.0, 1.0) + fpx(iu, iv, 12.0, 9.0, 2.0, 1.0)) > 0.5) return mix(c, vec3(1.0, 0.35, 0.35), 0.45);
    return c;
}
/** Plate steel: brushed along its length, the lames' grooves across the belly, a trim along the plate's edge, rivets on it. */
vec3 steelAt(vec3 p, float edge) {
    vec3 c = uSteel * 0.72;
    float hh = p.y + 2.0;
    c *= 0.84 + 0.14 * vn3(vec3(p.x * 30.0, p.y * 420.0, p.z * 30.0)) + 0.07 * vn3(p * 22.0);
    if (hh < 2.98 && hh > 2.42 && vLimb.x < 0.5 && vLimb.z < 0.5) c *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.01, abs(fract(hh * 9.0) - 0.5) - 0.46));
    float trim = 1.0 - smoothstep(0.018, 0.03, edge);
    c = mix(c, uTrim, trim);
    float rv = 1.0 - smoothstep(0.004, 0.007, length(vec2(fract((p.x + p.z) * 16.0) - 0.5, (edge - 0.045) * 16.0) / 16.0));
    c = mix(c, uSteel * 1.25, rv * step(0.032, edge));
    rSpec = 1.1; rGloss = 64.0; rMetal = 1.0;
    rEmit += uGlow * 0.12;
    rBump = vn3(vec3(p.x * 30.0, p.y * 420.0, p.z * 30.0)) * 0.3;
    return c;
}
/** A mage's robe: soft heavy cloth, little stars on a magic one, gold bands at the hem, cuffs and collar on a better one. */
vec3 robeAt(vec3 p, float edge) {
    vec3 c = uTopC * (0.88 + 0.12 * vn3(p * 180.0) + 0.06 * vn3(p * 9.0));
    rBump = vn3(p * 180.0) * 0.6;
    if (uArm.w > 1.5) {
        vec3 g = floor(p * 9.0), f = fract(p * 9.0) - 0.5;
        float on = step(0.86, rh3(g));
        float star = on * (1.0 - smoothstep(0.02, 0.06, min(abs(f.x) * (abs(f.y) + 0.15), abs(f.y) * (abs(f.x) + 0.15)) + length(f) * 0.08));
        c = mix(c, vec3(1.0, 0.93, 0.62), star * 0.9);
        rEmit += vec3(1.0, 0.85, 0.4) * star * 0.25 + uGlow * 0.06;
    }
    if (uLook.y > 0.5) { float band = 1.0 - smoothstep(0.03, 0.045, edge); c = mix(c, uTrim, band); if (band > 0.5) { rSpec = 0.7; rGloss = 40.0; } }
    return c;
}
vec3 clothKnit(vec3 c, vec3 p, float scale) {
    // the cloth in pixels (each its own shade) with a faint weave inside them
    float k = px(p), w = vn3(p * scale);
    rBump = w * 0.25;
    return c * (0.9 + 0.12 * k + 0.05 * w);
}
/** The top: its own cloth and pattern (Appearance.TOPS). */
vec3 topAt(vec3 p, float armK) {
    float t = uTop.x, hh = p.y + 2.0;
    if (uArm.w > 0.5) return robeAt(p, vCover.x); // (a robe over everything)
    if (uArm.y > 0.5) return steelAt(p, vCover.x); // (the breastplate, the arms' plates)
    bool front = p.z < 0.0;
    vec3 c = uTopC;
    vec3 shirt = vec3(0.93, 0.93, 0.9);
    // (the sleeves of a vest and of a shirt with a tie: the white shirt's)
    if ((t == 3.0 || t == 9.0) && armK > 0.5) c = shirt;
    if (t == 9.0 && armK < 0.5) c = abs(p.x) < 0.035 + 0.02 * smoothstep(3.55, 3.0, hh) && front && hh < 3.58 && hh > 2.75 ? uTopC : shirt; // the tie
    if (t == 3.0 && armK < 0.5 && front && abs(p.x) < 0.05 + 0.12 * smoothstep(3.2, 3.62, hh) && hh > 2.6) c = shirt; // the vest's V over the shirt
    if (t == 4.0 && armK < 0.5 && front && abs(p.x) < 0.09 && hh > 2.45) c = shirt; // the open jacket
    if (t == 4.0 && armK < 0.5 && front && abs(abs(p.x) - 0.11) < 0.03 && hh > 3.25) c *= 0.75; // its lapels
    c = clothKnit(c, p, t == 6.0 ? 220.0 : 260.0);
    if (t == 6.0) { float y = mix(hh * 7.0, vLimb.y * 18.0, armK); c = mix(c, uTopC2, step(0.5, fract(y))); } // stripes
    if (t == 1.0 && front && armK < 0.5) {
        // the hoodie: the pocket and its seam, the strings
        float pk = step(abs(p.x), 0.2) * step(2.62, hh) * step(hh, 2.92);
        c *= 1.0 - 0.18 * pk;
        c *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.006, abs(abs(p.x) - 0.2))) * step(2.62, hh) * step(hh, 2.92);
        if (abs(abs(p.x) - 0.05) < 0.008 && hh > 3.25 && hh < 3.6) c = mix(c, vec3(0.92), 0.85);
    }
    if (t == 7.0) {
        // the tunic's belt and its buckle
        float belt = step(abs(hh - 2.68), 0.05);
        c = mix(c, vec3(0.32, 0.2, 0.11) * (0.85 + 0.2 * vn3(p * 90.0)), belt);
        if (belt > 0.5 && front && abs(p.x) < 0.05) { c = vec3(0.85, 0.68, 0.24); rSpec = 0.8; rGloss = 40.0; }
    }
    if (t == 8.0 && front && abs(p.x) < 0.04 && abs(hh - 3.55) < 0.04) { c = vec3(0.85, 0.68, 0.24); rSpec = 0.8; rGloss = 40.0; } // the cloak's clasp
    if (t == 3.0 && front && armK < 0.5 && abs(p.x) < 0.012 && fract(hh * 6.0) < 0.12 && hh > 2.6 && hh < 3.4) c = vec3(0.12); // buttons
    // collar and hems: a ribbed band
    float rib = smoothstep(0.035, 0.0, abs(vCover.x - 0.02));
    c *= 1.0 - 0.12 * rib * (0.5 + 0.5 * sin((p.x + p.z) * 400.0));
    return c;
}
vec3 botAt(vec3 p, float legK) {
    float t = uBot.x, hh = p.y + 2.0;
    if (uArm.z > 0.5 && legK > 0.5) return steelAt(p, vCover.y); // (the greaves)
    vec3 c = uBotC;
    if (t == 0.0) {
        // denim: a diagonal twill, the outer seam, lighter wear on the thighs and knees
        float tw = sin((p.y * 0.7 + p.x * 0.7 + p.z * 0.7) * 900.0) * 0.5 + 0.5;
        c *= 0.86 + 0.14 * tw + 0.08 * vn3(p * 40.0);
        c = mix(c, c * 1.25 + 0.05, smoothstep(0.55, 0.9, vn3(p * 6.0)) * 0.35 * legK);
        float seam = 1.0 - smoothstep(0.0, 0.01, abs(abs(p.x) - (0.24 + 0.1 * (2.3 - hh) * 0.075 + 0.17)));
        c = mix(c, vec3(0.75, 0.55, 0.25), seam * 0.6 * legK);
        rBump = tw;
    } else if (t == 6.0) {
        // the kilt's tartan
        float a = step(0.5, fract(p.x * 9.0)), b = step(0.5, fract(p.y * 9.0));
        c = mix(c, c * 0.55, (a + b) * 0.35);
        c = mix(c, vec3(0.85, 0.75, 0.3), (1.0 - smoothstep(0.0, 0.012, abs(fract(p.x * 4.5) - 0.5))) * 0.4);
    } else if (t == 5.0) {
        c = mix(c, uTopC2, step(0.5, fract(mix(hh * 8.0, vLimb.w * 16.0, legK))));
    } else c = clothKnit(c, p, t == 7.0 ? 340.0 : 240.0);
    if (t == 3.0 && p.z < 0.0) c *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.006, abs(abs(p.x) - (0.24 + (2.26 - hh) * 0.075)))) * legK; // a pressed crease
    if (t == 4.0 && legK > 0.5) { float pk = step(abs(abs(p.x) - 0.42 + (hh - 1.8) * 0.05), 0.07) * step(1.55, hh) * step(hh, 1.85); c *= 1.0 - 0.22 * pk; } // the cargo pockets
    // the waistband
    c *= 1.0 - 0.15 * smoothstep(0.04, 0.0, abs(vCover.y - 0.03)) * (1.0 - legK);
    return c;
}
vec3 shoeAt(vec3 p) {
    float t = uShoe.x, hh = p.y + 2.0;
    if (uArm.z > 0.5) return steelAt(p, vCover.z); // (steel shoes with the greaves)
    vec3 c = uShoeC;
    float sole = step(hh, 0.06);
    if (t == 0.0 || t == 8.0) { c = mix(c, vec3(0.95), sole); if (p.z < 0.0 && hh > 0.1 && hh < 0.22 && fract(p.z * 40.0) < 0.3) c = vec3(0.92); } // sneakers: the white sole, the laces
    else c = mix(c, vec3(0.12, 0.1, 0.09), sole);
    if (t == 2.0) { float strap = step(0.55, fract(p.z * 9.0)) * step(0.05, hh); if (strap < 0.5 && hh > 0.06) c = skinAt(p); } // sandals' straps over the skin
    if (t == 4.0) { rSpec = 0.6; rGloss = 60.0; } // rubber
    if (t == 3.0 || t == 5.0 || t == 1.0) { rSpec = 0.35; rGloss = 35.0; } // leather
    if (t == 7.0) c = clothKnit(c, p, 120.0) * 1.05; // slippers
    return c;
}
`;

const FRAG_COLOR = /* glsl */`
{
    vec3 p = vRest;
    float zn = floor(vInfo.x + 0.5);
    // a cut-off limb (LimbSurgery): nothing past the cut along that arm / leg; the head cut — nothing over the neck's
    // foot; the inside seen through the cut is the wound (the back faces: this material is two-sided only then)
    if (uCut.x < 50.0 || uCut.y < 50.0 || uCut.z < 50.0 || uCut.w < 50.0) {
        float cA = p.x < 0.0 ? uCut.x : uCut.y, cL = p.x < 0.0 ? uCut.z : uCut.w;
        if (vLimb.x > 0.5 && vLimb.y > cA) discard;
        if (vLimb.z > 0.5 && vLimb.w > cL) discard;
    }
    if (uLook.z > 0.5 && vInfo.w < 0.5 && p.y + 2.0 > 3.62 && vLimb.x < 0.5) discard; // (the head is off)
    vec3 c;
    if (!gl_FrontFacing) c = vec3(0.55, 0.07, 0.06) * (0.85 + 0.2 * px(p));
    else if (zn >= 7.0 && zn < 8.5) { c = (zn < 7.5 ? uHatC : uHatC2); c = clothKnit(c, p, 200.0); }
    else if (zn >= 8.5 && zn < 9.5) { c = uArm.w > 0.5 ? robeAt(p, 1.0) : clothKnit(uTopC, p, 220.0) * 0.92; }
    else if (zn >= 15.5 && zn < 16.5) { c = steelAt(p, 1.0); }
    else if (zn >= 16.5 && zn < 17.5) { c = uTrim * (0.85 + 0.15 * vn3(p * 90.0)); rSpec = 1.0; rGloss = 60.0; rMetal = 1.0; rEmit += uGlow * 0.15; }
    else if (zn >= 9.5 && zn < 10.5) { c = botAt(p, 1.0); }
    else if (zn >= 10.5 && zn < 11.5) { c = vec3(0.08, 0.07, 0.07); rSpec = 0.9; rGloss = 70.0; } // glasses' frame
    else if (zn >= 11.5 && zn < 12.5) { c = vec3(0.85, 0.68, 0.24); rSpec = 0.9; rGloss = 60.0; } // gold (a buckle, a clasp)
    else {
        c = skinAt(p);
        c = mix(c, mix(uSkin, vec3(1.0, 0.94, 0.92), 0.5), step(0.5, vMix.y)); // (plain light nails)
        if (vInfo.w > 0.5) c = faceAt(HX_C + (p - HX_C) * HX_S, c);
        // the clothes over the skin: the shoes, then the top (unless tucked in), then the bottoms
        float sT = step(0.0, vCover.x) * step(0.5, uTop.x + 1.0), sB = step(0.0, vCover.y), sS = step(0.0, vCover.z);
        if (sS > 0.5) c = shoeAt(p);
        else if (sT > 0.5 && sB > 0.5) c = uLook.x > 0.5 ? topAt(p, vLimb.x) : botAt(p, vLimb.z); // (a shirt tucked in: the trousers over it)
        else if (sT > 0.5) c = topAt(p, vLimb.x);
        else if (sB > 0.5) c = botAt(p, vLimb.z);
        // dark magic: stains, then veins, then the skin blackening
        if (uFx.x > 0.0) {
            float st = smoothstep(1.0 - uFx.x * 0.6, 1.0, fbm3(p * 7.0));
            float vein = 1.0 - smoothstep(0.0, 0.018 * uFx.x, abs(fbm3(p * 13.0) - 0.5));
            c = mix(c, vec3(0.06, 0.03, 0.08), clamp(st * 0.8 + vein * smoothstep(0.25, 0.6, uFx.x) * 0.75 + smoothstep(0.75, 1.0, uFx.x) * 0.4, 0.0, 0.9));
        }
    }
    diffuseColor.rgb = c;
}
`;

const FRAG_LIGHT = /* glsl */`
{
    // (the creases' shade; the head's flat faces almost none — its big triangles would streak it)
    float ao = mix(1.0, clamp(vInfo.y, 0.0, 1.0), vInfo.w > 0.5 ? 0.25 : 1.0);
    reflectedLight.indirectDiffuse *= mix(0.45, 1.0, ao);
    reflectedLight.directDiffuse *= mix(0.7, 1.0, ao);
    float zn = floor(vInfo.x + 0.5);
    #if NUM_DIR_LIGHTS > 0
    if (rSpec > 0.0) {
        vec3 V = normalize(vViewPosition);
        vec3 Hh = normalize(directionalLights[0].direction + V);
        reflectedLight.directSpecular += directionalLights[0].color * rSpec * pow(max(dot(normal, Hh), 0.0), rGloss) * 0.6;
    }
    #endif
    if (rMetal > 0.0) {
        // (polished steel: the sky over it, the ground under it, mirrored — no picture needed)
        float sky = 0.5 + 0.5 * normal.y;
        reflectedLight.indirectSpecular += mix(vec3(0.16, 0.14, 0.12), vec3(0.85, 0.92, 1.05), smoothstep(0.2, 0.9, sky)) * 0.9 * diffuseColor.rgb;
        reflectedLight.directDiffuse *= 0.45;
        reflectedLight.indirectDiffuse *= 0.5;
    }
    totalEmissiveRadiance += rEmit;
}
`;

const BUMP = /* glsl */`
{
    // flat block faces stay flat (the big triangles of a flat face would shade in streaks otherwise); the hands softer
    vec3 fN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    if (dot(fN, normal) < 0.0) fN = -fN;
    normal = normalize(mix(normal, fN, vLimb.y > 1.0 ? 0.4 : 0.85));
}
{
    // the cloth's weave: a little light and shade from the pattern itself
    float hgt = rBump * 0.00035;
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    float hx = dFdx(hgt), hy = dFdy(hgt);
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1);
    vec3 g = sign(det) * (hx * r1 + hy * r2);
    vec3 nn = normalize(abs(det) * normal - g);
    if (abs(det) > 1e-12) normal = nn;
}
`;

const SHARED_UNIFORMS = () => ({
    uSkin: { value: new THREE.Color(0xffdbb4) }, uLip: { value: new THREE.Color(0xb5655f) }, uIris: { value: new THREE.Color(0x3b6ea5) },
    uBrow: { value: new THREE.Color(0x4a3728) }, uTopC: { value: new THREE.Color(0x3498db) }, uTopC2: { value: new THREE.Color(0xffffff) },
    uBotC: { value: new THREE.Color(0x2c3e50) }, uShoeC: { value: new THREE.Color(0x333333) }, uHatC: { value: new THREE.Color(0x8e2b2b) },
    uHatC2: { value: new THREE.Color(0x4a1515) },
    uTop: { value: new THREE.Vector4(0, 0.45, 2.55, 3.62) }, uTopX: { value: new THREE.Vector4(0.022, 0, 0, 0) },
    uBot: { value: new THREE.Vector4(0, 1, 2.68, 0) }, uBotX: { value: new THREE.Vector4(0.028, 0, 0, 0) },
    uShoe: { value: new THREE.Vector4(0, 0, 0.032, 0) }, uBend: { value: new THREE.Vector4() },
    uFx: { value: new THREE.Vector4() }, uLook: { value: new THREE.Vector4(1, 0, 0, 0) },
    uArm: { value: new THREE.Vector4() }, uCut: { value: new THREE.Vector4(99, 99, 99, 99) },
    uFaceA: { value: new THREE.Vector4() }, uFaceB: { value: new THREE.Vector4() }, uFaceC: { value: new THREE.Vector4() }, uFaceS: { value: new THREE.Vector4() }, uSteel: { value: new THREE.Color(0xb8c2cc) }, uTrim: { value: new THREE.Color(0x8a94a0) }, uGlow: { value: new THREE.Color(0x000000) },
});

/**
 * A new skin material for one hero (its colours and clothes in `.userData.u`); the program is shared. `{cut: true}` —
 * the same, two-sided (worn while a limb or the head is cut off: the wound shows through the cut), sharing `u`.
 */
export function realSkinMaterial({ cut = false, u = null } = {}) {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x0c0b0a, shininess: 8, skinning: true, side: cut ? THREE.DoubleSide : THREE.FrontSide });
    u = u || SHARED_UNIFORMS();
    m.userData.u = u;
    m.extensions = { derivatives: true };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\n' + VERT_PARS)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
            .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
            .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP)
            .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_LIGHT);
    };
    m.customProgramCacheKey = () => (cut ? 'real-skin-2c' : 'real-skin-2');
    m.name = cut ? 'real-skin-cut' : 'real-skin';
    return m;
}

/** The shadow's stand-in (the far mesh: unseen, it only casts the shadow). */
let _proxyMat = null;
export function realProxyMaterial() {
    if (!_proxyMat) {
        _proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, skinning: true });
        _proxyMat.name = 'real-shadow-proxy';
        _proxyMat.userData.shared = true;
    }
    return _proxyMat;
}

// ------------------------------------------------------------------ hair
/**
 * The hair (and a beard): thick locks in the world's cut style — the colour in pixels, darker cut lines between the
 * layers of the locks along the way the hair lies (`aMix.xyz`), soft facets, a faint sheen. No single hairs, no lashes.
 */
export function realHairMaterial() {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 4, skinning: true });
    const u = { uHair: { value: new THREE.Color(0x4a3728) }, uLash: { value: new THREE.Color(0x221510) } };
    m.userData.u = u;
    m.extensions = { derivatives: true };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nattribute vec4 aMix;\nvarying vec3 vRest;\nvarying vec4 vInfo;\nvarying vec4 vMix;\n' + MAPS)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = HX_C + (position - HX_C) / HX_S; vInfo = aInfo; vMix = aMix;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uHair, uLash;\nvarying vec3 vRest;\nvarying vec4 vInfo;\nvarying vec4 vMix;\n' + NOISE)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    float zn = floor(vInfo.x + 0.5);
    vec3 fl = normalize(vMix.xyz + vec3(1e-4));
    // the locks in layers like the blocks' strata: a darker cut under each layer, each pixel its own shade, the ends
    // of the locks (along the way they lie) a little lighter
    float a = vRest.y * 26.0 + rh3(vec3(floor(vRest.x * 22.0), 1.0, floor(vRest.z * 22.0)) + 0.5) * 0.55;
    float cutLine = step(fract(a), 0.1);
    float t = rh3(floor(vRest * 46.0) + 0.5);
    vec3 c = uHair * (0.94 + 0.08 * t) * (1.0 - 0.18 * cutLine);
    if (zn == 15.0) c *= 0.92;
    diffuseColor.rgb = c;
}`)
            .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
    float ao = clamp(vInfo.y, 0.0, 1.0);
    reflectedLight.indirectDiffuse *= mix(0.45, 1.0, ao);
    reflectedLight.directDiffuse *= mix(0.7, 1.0, ao);
    #if NUM_DIR_LIGHTS > 0
    vec3 V = normalize(vViewPosition), Hh = normalize(directionalLights[0].direction + V);
    reflectedLight.directSpecular += directionalLights[0].color * pow(max(dot(normal, Hh), 0.0), 24.0) * 0.08 * ao;
    #endif
}`);
    };
    m.customProgramCacheKey = () => 'real-hair-2';
    m.name = 'real-hair';
    return m;
}
