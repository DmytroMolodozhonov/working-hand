/**
 * PortalShader.js — the loading's whirlpool (PortalLoader.js): its shader and the law of its speed, shared by the page and by its own
 * drawing thread (portal.worker.js — the whirl is drawn there, so it turns smoothly while the world is being made in the page's thread).
 */

/**
 * How fast the passage runs (its clock's rate): it moves from the very first moment, quickens all the time — with the time spent
 * (even while the loading stands on one step) and with the progress — and rushes at the arrival (the author 06.11: «он стоит на
 * месте и только в конце движется; хочу, чтобы всегда двигался, всё время чуть-чуть ускорялся, всё больше засасывало, а в конце быстрее»).
 */
export function passageSpeed(elapsed, shown, out) {
    return 1.0 + Math.min(elapsed, 90) * 0.03 + shown * 2.2 + out * 7;
}

export const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

export const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uT, uOpen, uOut, uProg, uDir, uArms, uSeed;
uniform vec3 uC0, uC1, uC2, uC3;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++){ v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; } return v; }
vec3 pal(float t){ t = fract(t); return t < 0.333 ? mix(uC0, uC1, t * 3.0) : t < 0.666 ? mix(uC1, uC2, (t - 0.333) * 3.0) : mix(uC2, uC0, (t - 0.666) * 3.0); }
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(p), a = atan(p.y, p.x);
  float rush = uT * (0.9 + uOut * 3.0);
  // FALLING DOWN THE WHIRLPOOL'S THROAT (the author 06.11: «нет эффекта, что я падаю в этот туннель»). A tunnel's own coordinates:
  // the angle round it and its depth Z = 1/r (the eye far ahead, the walls near at the edges). The picture is laid on the walls at
  // W = Z + rush: as the clock runs, every mark of it comes nearer — out of the eye, growing, past the edges — that is falling forward.
  // The same W twists the angle (a screw): the walls turn as they rush past, so the arms, the nebula and the sparks all move as ONE
  // body (the earlier complaint: the drawing went one way and the whirl another).
  float Z = 0.3 / (r + 0.02);
  float W = Z + rush;
  float sw = a + uDir * 0.42 * W;
  float depth = W;
  vec2 q = vec2(cos(sw), sin(sw));
  float n1 = fbm(q * 1.6 + vec2(W * 0.35, -W * 0.12) + uSeed);
  float n2 = fbm(q * 3.1 - vec2(W * 0.7, W * 0.2) + uSeed * 1.7);
  float arms = 0.5 + 0.5 * sin(sw * uArms + n1 * 5.0);
  float band = smoothstep(0.25, 0.95, arms) * (0.55 + 0.6 * n2);
  vec3 col = pal(n1 * 0.9 + W * 0.03) * band * 1.25;
  // (the walls far ahead dim into the distance; the near ones bright — the depth one feels)
  col *= 0.35 + 0.65 * smoothstep(5.0, 0.8, Z);
  col += pal(n2 + 0.35) * pow(n2, 3.0) * 0.9;
  // the dark between the arms keeps a deep tint (never flat black)
  col += uC3 * 0.18 * (1.0 - band) * smoothstep(1.4, 0.1, r);
  // the eye: a white-hot core far ahead, breathing
  float eye = exp(-r * (9.0 - uProg * 3.5 - uOut * 5.0)) * (0.8 + 0.2 * sin(uT * 2.3) + uProg * 0.5); // (the light ahead grows as the world comes near)
  col += mix(uC1, vec3(1.0, 0.97, 0.9), 0.6) * eye * 1.6;
  // sparks and star streaks rushing inward (cells along the angle and the depth)
  vec2 sc = vec2(sw * 6.0 / 6.2831 * 8.0, W * 2.2); // (on the walls: they rush out of the eye and past, stretched along the fall)
  vec2 ci = floor(sc), cf = fract(sc) - 0.5;
  float hh = h21(ci + uSeed);
  float star = step(0.82 - uProg * 0.12, hh) * smoothstep(0.08, 0.0, abs(cf.x)) * smoothstep(0.45 + uProg * 0.4, 0.0, abs(cf.y + (hh - 0.5) * 0.4)) * smoothstep(0.02, 0.25, r);
  col += mix(vec3(1.0), uC2, 0.35) * star * (1.2 + uOut * 2.0);
  // the ring of runes' glow (the runes themselves are drawn over it): lit as far round as the loading has gone
  float ringR = 0.26 + uOut * 0.6;
  float ring = smoothstep(0.022, 0.0, abs(r - ringR));
  float ang = fract((a / 6.2831) + 0.25);
  col += uC2 * ring * (0.25 + 1.2 * step(ang, uProg)) * (1.0 - uOut);
  // the edges darker: the walls of the tunnel close round the eye
  col *= smoothstep(1.6, 0.25, r) * 0.85 + 0.15;
  // the arrival: the light floods out from the eye
  col = mix(col, vec3(1.0, 0.98, 0.93), smoothstep(0.35, 1.0, uOut) * smoothstep(1.2 * uOut + 0.05, 0.0, r) );
  col = mix(col, vec3(1.0, 0.98, 0.93), smoothstep(0.75, 1.0, uOut));
  // the pull: the swirl opens from the middle (outside it the menu is still seen)
  float op = pow(uOpen, 1.7) * 1.9;
  float open = smoothstep(op, op - 0.25, r);
  gl_FragColor = vec4(col, open);
}`;
