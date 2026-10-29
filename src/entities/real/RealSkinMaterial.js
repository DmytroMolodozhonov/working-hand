/**
 * RealSkinMaterial.js — how the «Реалистичный» hero's skin, eyes, teeth and clothes look, drawn by the video card
 * (one Phong material, the game's lights and fog; everything else is the shader's: no pictures to load or keep).
 *
 *   skin   — its colour with tiny variation (pores, a little mottling), redder where the blood shows (cheeks, nose,
 *            ears, knuckles, knees: the mesh's `flush`), darker in creases (`ao`), the lips, the nails (glossy), the
 *            mouth's inside, the eyebrows (hair strokes along the brow's arc), freckles and a blush if the face has them;
 *   eyes   — sclera with faint veins, the iris (fibres, a dark rim), the pupil, a wet highlight;
 *   clothes — the top, the bottoms, the shoes of the look: where each covers is measured on the mesh (along the arm,
 *            the leg, the torso's height), each covering place is pushed out a little (cloth over the body) with folds
 *            — at the elbows and the knees as deep as they bend now — and its own weave and pattern (denim twill,
 *            knit, stripes, a hoodie's pocket and strings, a jacket's lapels, a tie, a tunic's belt…);
 *   dark magic — veins and stains growing with the level (DarkMagic.darkLook), «Империус» — white burning eyes.
 *
 * One program for every such hero (the per-hero colours are uniforms): compiled on the loading screen (Game.prewarm).
 */
import * as THREE from 'three';
import { ANAT } from './RealRig.js';

const NOISE = /* glsl */`
float rh3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(rh3(i), rh3(i + vec3(1, 0, 0)), f.x), mix(rh3(i + vec3(0, 1, 0)), rh3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(rh3(i + vec3(0, 0, 1)), rh3(i + vec3(1, 0, 1)), f.x), mix(rh3(i + vec3(0, 1, 1)), rh3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { return 0.55 * vn3(p) + 0.3 * vn3(p * 2.03 + 7.1) + 0.15 * vn3(p * 4.1 + 3.3); }
`;

const VERT_PARS = /* glsl */`
attribute vec4 aInfo;
attribute vec4 aMix;
attribute vec4 aLimb;
uniform vec4 uTop, uTopX, uBot, uBotX, uShoe, uBend;
varying vec3 vRest;
varying vec4 vInfo;
varying vec4 vMix;
varying vec4 vLimb;
varying vec3 vCover;
`;

/** Where the clothes cover (metres, + inside) and the cloth pushed out over the body, before the bones move it. */
const VERT_MAIN = /* glsl */`
vRest = position; vInfo = aInfo; vMix = aMix; vLimb = aLimb;
float hh = position.y + 2.0;
float armK = aLimb.x, legK = aLimb.z;
bool piece = aInfo.x > 2.5; // (the eyes, the teeth, the tongue, the hats: not dressed)
// the top: the torso's band, the sleeves, below the crotch only when it is long
float neckR = length(vec2(position.x, (position.z - 0.02) * 1.25));
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
float fold = (sin(position.y * 37.0 + sin(position.x * 11.0 + position.z * 7.0) * 2.0) * 0.5 + 0.5) * 0.004 * max(cT, cB);
float side = position.x < 0.0 ? 1.0 : 0.0;
float elbowW = exp(-pow((aLimb.y - 0.526) * 8.0, 2.0)) * armK;
fold += (sin(aLimb.y * 120.0 + position.z * 30.0) * 0.5 + 0.5) * 0.012 * mix(uBend.y, uBend.x, side) * elbowW * cT;
float kneeW = exp(-pow((aLimb.w - 0.486) * 8.0, 2.0)) * legK;
fold += (sin(aLimb.w * 105.0 + position.x * 25.0) * 0.5 + 0.5) * 0.013 * mix(uBend.w, uBend.z, side) * kneeW * cB;
vec3 dirN = normal;
if (cS > 0.5 && dirN.y < -0.3) dirN = normalize(vec3(dirN.x, -0.12, dirN.z)); // (a sole stays on the floor)
transformed += dirN * (infl + fold * step(0.001, infl));
// the pointed shoes' toes, forward
transformed.z -= uShoe.w * cS * smoothstep(0.62, 1.12, aLimb.w) * smoothstep(-0.2, -0.45, position.z);
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uSkin, uLip, uIris, uBrow, uTopC, uTopC2, uBotC, uShoeC, uHatC, uHatC2;
uniform vec4 uTop, uBot, uShoe, uFx, uLook;
varying vec3 vRest;
varying vec4 vInfo;
varying vec4 vMix;
varying vec4 vLimb;
varying vec3 vCover;
float rSpec = 0.0, rGloss = 0.0, rBump = 0.0;
vec3 rEmit = vec3(0.0);
${NOISE}
const vec3 EYE_R = vec3(${ANAT.eye[0]}, ${ANAT.eye[1]}, ${ANAT.eye[2]});
float stripe(float x, float w) { return smoothstep(0.5 - w, 0.5, abs(fract(x) - 0.5) + 0.0); }
vec3 skinAt(vec3 p) {
    vec3 c = uSkin;
    float n1 = vn3(p * 70.0), n2 = vn3(p * 210.0), n3 = fbm3(p * 9.0);
    c *= 0.93 + 0.1 * n3 + 0.035 * n1 - 0.03 * n2;
    c = mix(c, c * vec3(1.08, 0.78, 0.74), clamp(vInfo.z * 0.6, 0.0, 1.0));
    // freckles over the nose and cheeks (and shoulders)
    if (uFx.z > 0.0) {
        float fr = smoothstep(0.78, 0.86, vn3(p * 120.0)) * smoothstep(0.35, 0.0, abs(p.y - 2.05)) * step(p.z, -0.12);
        c = mix(c, c * vec3(0.72, 0.55, 0.45), fr * uFx.z * 0.8);
    }
    if (uFx.w > 0.0) c = mix(c, c * vec3(1.1, 0.7, 0.68), uFx.w * 0.6 * exp(-pow((abs(p.x) - 0.1) / 0.05, 2.0) - pow((p.y - 2.02) / 0.04, 2.0)) * step(p.z, -0.12));
    rBump = n2 * 0.6 + n1 * 0.4; // (pores)
    return c;
}
vec3 eyeAt(vec3 p) {
    vec3 e = EYE_R; e.x *= sign(p.x);
    vec3 d = normalize(p - e);
    float ca = -d.z;
    float ang = acos(clamp(ca, -1.0, 1.0));
    float phi = atan(d.y, d.x);
    vec3 sclera = vec3(0.93, 0.9, 0.87) * (0.92 + 0.08 * vn3(d * 9.0));
    float vein = smoothstep(0.7, 1.0, vn3(vec3(phi * 4.0, ang * 14.0, 1.0))) * smoothstep(0.55, 1.4, ang);
    sclera = mix(sclera, vec3(0.8, 0.35, 0.33), vein * 0.35);
    float iris = 1.0 - smoothstep(0.48, 0.53, ang);
    float pupil = 1.0 - smoothstep(0.15, 0.18, ang);
    float fib = 0.82 + 0.18 * (vn3(vec3(phi * 9.0, ang * 22.0, 2.0)) * 0.6 + 0.4 * sin(phi * 31.0 + vn3(vec3(phi * 5.0, ang * 40.0, 4.0)) * 9.0)) * smoothstep(0.16, 0.3, ang);
    fib *= 1.0 + 0.35 * smoothstep(0.3, 0.17, ang) * (0.5 + 0.5 * vn3(vec3(phi * 14.0, 1.0, 3.0))); // (the lighter ring round the pupil)
    vec3 ic = uIris * fib * (1.0 - 0.45 * smoothstep(0.38, 0.52, ang)) * (1.0 + 0.4 * (1.0 - smoothstep(0.2, 0.32, ang)));
    vec3 c = mix(sclera, ic, iris);
    c = mix(c, vec3(0.02), pupil);
    if (uFx.y > 0.5) { c = mix(c, vec3(1.0), 0.85); rEmit = vec3(1.4, 1.45, 1.6) * (0.6 + 0.4 * iris); }
    rSpec = 1.0; rGloss = 90.0;
    return c;
}
vec3 clothKnit(vec3 c, vec3 p, float scale) {
    float k = vn3(p * scale) * 0.6 + vn3(p * scale * 2.7) * 0.4;
    rBump = k;
    return c * (0.9 + 0.16 * k);
}
/** The top: its own cloth and pattern (Appearance.TOPS). */
vec3 topAt(vec3 p, float armK) {
    float t = uTop.x, hh = p.y + 2.0;
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
    vec3 c;
    if (zn == 3.0) c = eyeAt(p);
    else if (zn == 4.0) { c = vec3(0.86, 0.83, 0.74) * (0.9 + 0.1 * vn3(p * 300.0)) * mix(0.45, 1.0, smoothstep(-0.2, -0.245, p.z)) * (0.8 + 0.2 * smoothstep(0.004, 0.0, abs(fract(p.x * 52.0) - 0.5) - 0.42)); rSpec = 0.5; rGloss = 50.0; }
    else if (zn == 5.0) { c = vec3(0.72, 0.36, 0.38) * (0.85 + 0.2 * vn3(p * 250.0)); rSpec = 0.4; rGloss = 30.0; }
    else if (zn >= 7.0 && zn < 8.5) { c = (zn < 7.5 ? uHatC : uHatC2); c = clothKnit(c, p, 200.0); }
    else if (zn >= 8.5 && zn < 9.5) { c = clothKnit(uTopC, p, 220.0) * 0.92; }
    else if (zn >= 9.5 && zn < 10.5) { c = botAt(p, 1.0); }
    else if (zn >= 10.5 && zn < 11.5) { c = vec3(0.08, 0.07, 0.07); rSpec = 0.9; rGloss = 70.0; } // glasses' frame
    else if (zn >= 11.5 && zn < 12.5) { c = vec3(0.85, 0.68, 0.24); rSpec = 0.9; rGloss = 60.0; } // gold (a buckle, a clasp)
    else {
        c = skinAt(p);
        // the lips, the nails, the mouth's inside (soft-edged places of the skin)
        vec3 lip = uLip * (0.9 + 0.12 * vn3(p * vec3(300.0, 60.0, 300.0)));
        c = mix(c, lip, clamp(vMix.x, 0.0, 1.0));
        rSpec = mix(rSpec, 0.35, vMix.x); rGloss = mix(rGloss, 40.0, vMix.x);
        c = mix(c, mix(uSkin, vec3(1.0, 0.92, 0.9), 0.55) * vec3(1.0, 0.93, 0.92), clamp(vMix.y, 0.0, 1.0));
        rSpec = mix(rSpec, 0.7, vMix.y); rGloss = mix(rGloss, 60.0, vMix.y);
        c = mix(c, vec3(0.42, 0.12, 0.13), clamp(vMix.z, 0.0, 1.0));
        // the eyebrows: hairs along each brow's arc — thick and rising at the inner end, thin and flat at the tail
        float ax = abs(p.x);
        if (p.y > 2.17 && p.y < 2.27 && p.z < -0.15 && ax > 0.012 && ax < 0.175) {
            float u = clamp((ax - 0.02) / 0.145, 0.0, 1.0);
            float yb = 2.214 + 0.017 * sin(u * 2.9) - 0.012 * u;
            float w = mix(0.0165, 0.0045, u * u);
            float edge = 1.0 - smoothstep(0.5, 1.0, abs(p.y - yb) / w + 0.3 * vn3(p * 320.0) - 0.15);
            edge *= smoothstep(0.012, 0.028, ax) * (1.0 - smoothstep(0.95, 1.0, u));
            float ang = mix(1.25, 0.12, u);
            float tt = -ax * sin(ang) + p.y * cos(ang);
            float strand = 1.0 - smoothstep(0.0, 0.4, abs(fract(tt * 1300.0 + vn3(p * 600.0) * 2.5) - 0.5));
            c = mix(c, uBrow * (0.75 + 0.35 * vn3(p * 900.0)), clamp(edge * (0.5 + 0.5 * strand), 0.0, 1.0) * 0.95);
        }
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
    float ao = clamp(vInfo.y, 0.0, 1.0);
    reflectedLight.indirectDiffuse *= mix(0.45, 1.0, ao);
    reflectedLight.directDiffuse *= mix(0.7, 1.0, ao);
    float zn = floor(vInfo.x + 0.5);
    if (zn < 0.5) reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.07, 0.025, 0.018) * ao; // (light through the skin: warmer shadows)
    #if NUM_DIR_LIGHTS > 0
    if (rSpec > 0.0) {
        vec3 V = normalize(vViewPosition);
        vec3 Hh = normalize(directionalLights[0].direction + V);
        reflectedLight.directSpecular += directionalLights[0].color * rSpec * pow(max(dot(normal, Hh), 0.0), rGloss) * 0.6;
    }
    #endif
    totalEmissiveRadiance += rEmit;
}
`;

const BUMP = /* glsl */`
{
    // the skin's pores, the cloth's weave: a little light and shade from the pattern itself
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
});

/** A new skin material for one hero (its colours and clothes in `.userData.u`); the program is shared. */
export function realSkinMaterial() {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x1c1a18, shininess: 14, skinning: true });
    const u = SHARED_UNIFORMS();
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
    m.customProgramCacheKey = () => 'real-skin-1';
    m.name = 'real-skin';
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
 * The hair (and a beard, the lashes): a dense under-layer and two layers of strands over it (the mesh has three
 * copies, `aMix.w` = 0…2, each pushed out a little), every strand along the way the hair lies (`aMix.xyz`), with a
 * light streak along the strands (Kajiya–Kay) that moves as the head turns. The lashes: a fringe whose hairs are cut
 * out by the shader.
 */
export function realHairMaterial() {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 4, skinning: true, side: THREE.DoubleSide });
    const u = { uHair: { value: new THREE.Color(0x4a3728) }, uLash: { value: new THREE.Color(0x221510) } };
    m.userData.u = u;
    m.extensions = { derivatives: true };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nattribute vec4 aMix;\nvarying vec3 vRest;\nvarying vec4 vInfo;\nvarying vec4 vMix;\nvarying vec3 vT;\nvarying vec3 vNb;')
            .replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n#ifdef USE_SKINNING\nvT = normalize(normalMatrix * (skinMatrix * vec4(aMix.xyz, 0.0)).xyz);\n#else\nvT = normalize(normalMatrix * aMix.xyz);\n#endif')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vInfo = aInfo; vMix = aMix; vNb = normal;\nif (aInfo.x < 13.5 || aInfo.x > 14.5) transformed += normal * aMix.w * 0.0055;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uHair, uLash;\nvarying vec3 vRest;\nvarying vec4 vInfo;\nvarying vec4 vMix;\nvarying vec3 vT;\nvarying vec3 vNb;\nfloat hStr = 0.0;\n' + NOISE)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    float zn = floor(vInfo.x + 0.5);
    if (zn == 14.0) {
        // the lashes: thin hairs, thinner to their tips
        float u = vMix.x * 46.0 + vn3(vec3(vMix.x * 90.0, 1.0, 2.0)) * 0.6, v = vMix.y;
        float w = mix(0.32, 0.06, v);
        if (abs(fract(u) - 0.5) > w || v > 0.97) discard;
        diffuseColor.rgb = uLash;
    } else {
        vec3 fl = normalize(vMix.xyz + vec3(1e-4));
        vec3 across = normalize(cross(fl, normalize(vNb)));
        float s = dot(vRest, across), a = dot(vRest, fl);
        float layer = vMix.w;
        float clump = vn3(vec3(s * 34.0, a * 5.0, layer * 3.0));
        float str = fract(s * 240.0 + clump * 4.0 + vn3(vRest * 30.0) * 2.0);
        float hair = 1.0 - smoothstep(0.18, 0.5, abs(str - 0.5));
        float cover = layer < 0.5 ? 1.0 : (layer < 1.5 ? 0.55 : 0.3);
        if (layer > 0.5 && hair * (0.6 + 0.8 * clump) < 1.0 - cover) discard;
        float shade = 0.62 + 0.38 * hair + 0.3 * (clump - 0.5) + 0.1 * layer + 0.12 * (vn3(vec3(s * 12.0, a * 2.0, 5.0)) - 0.5);
        vec3 c = uHair * shade;
        if (zn == 15.0) c *= 0.92;
        diffuseColor.rgb = c;
        hStr = hair;
    }
}`)
            .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
    float ao = clamp(vInfo.y, 0.0, 1.0);
    reflectedLight.indirectDiffuse *= mix(0.4, 1.0, ao) * (0.85 + 0.1 * vMix.w);
    reflectedLight.directDiffuse *= mix(0.65, 1.0, ao);
    #if NUM_DIR_LIGHTS > 0
    vec3 V = normalize(vViewPosition), L = directionalLights[0].direction, Hh = normalize(L + V);
    float th = dot(normalize(vT), Hh);
    float sp = pow(sqrt(max(0.0, 1.0 - th * th)), 80.0) * 0.25 + pow(sqrt(max(0.0, 1.0 - (th + 0.2) * (th + 0.2))), 18.0) * 0.12;
    reflectedLight.directSpecular += directionalLights[0].color * (sp * (0.6 + 0.6 * hStr)) * mix(vec3(1.0), diffuseColor.rgb * 2.0, 0.5) * ao;
    #endif
}`);
    };
    m.customProgramCacheKey = () => 'real-hair-1';
    m.name = 'real-hair';
    return m;
}
