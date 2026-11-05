/**
 * SlashRules.js — «Sectura» («Сектура»), the cutting curse: pure rules (Slash.js plays them). The author 06.11: «режущее заклятие, в чёрную магию; 50 маны; дальность 10 м;
 * снимает 10–15 HP случайно; игрок должен взмахнуть палочкой и рассечь воздух; у персонажа течёт кровь; броня защищает; но он рассекает — как меч: голову, руку, ногу — магией».
 *
 * How it plays: say the word with the wand (the hand) raised and the hero's wand ARMS (a crimson edge of light along it, 4 s); the next real SWING of the wand (the wand's hand moving
 * fast SIDEWAYS — a thrust forward is no slash) lets go an invisible blade: a sheet of air in the plane of the wand's pointing and the swing's direction, 5 m wide, flying out
 * along the pointing up to RANGE (10 m; stopped by the first wall or a house's dome). The slash is as turned as the swing: a level swing cuts a person across at the height of the
 * wand, a swing from the top down cuts along. Whoever the sheet crosses is cut like by a sword (Dismember.js — the same bones, the same rule «the edge crosses the bone»): a limb or
 * the head comes off; where it hits no bone (the body, a shielded place) — a deep cut: 10–15 HP (armour takes its share) and a bleeding wound (−1 HP/s for 12 s; «Rescue»
 * stops it). Steel on the limb (a player's plate, a knight's armour) stops the severing — it is a wound then.
 *
 * Mana is paid at the SWING (50): no swing in 4 s — nothing is spent. The spell is black magic (DarkMagic.DARK_SPELLS).
 */
import { Vector3 } from 'three';

export const SLASH = {
    COST: 50,
    RANGE: 10, // m, the author
    DMG_MIN: 10, DMG_MAX: 15,
    ARM_WINDOW: 4, // s the wand stays armed
    GRACE: 0.18, // s after the word before a swing counts (the raising of the arm is no swing)
    SWING_SPEED: 9, // m/s — the wand hand's speed (the hero is ~3.5 m: a brisk swing of the arm)
    SIDE_SHARE: 0.55, // the share of the swing that must be sideways of the pointing (else it is a thrust)
    HALF_W: 2.6, // m: the sheet reaches this far each way of the swing
    THICK: 0.45, // m: its thickness (a body within this of the plane is cut)
    STEP: 2, // m of the flight per cut test (Dismember.sweepCut takes ≤ 8 sub-steps of 0.25)
    VIRT_SPEED: 40, // m/s: the virtual blade's speed (over the cut speed of any limb: the spell is sharp — «Sectura» cuts what a sword would)
    BLEED_RATE: 1, // HP/s of the wound's bleeding
    BLEED_TIME: 12, // s (the wound; a lost limb bleeds on its own — Dismember.BLEED)
    FLY_TIME: 0.32, // s the picture of the slash takes to fly the range
};

/** The damage of one slash on a body: a whole number 10…15. */
export function rollDamage(r = Math.random) {
    return SLASH.DMG_MIN + Math.min(SLASH.DMG_MAX - SLASH.DMG_MIN, Math.floor(r() * (SLASH.DMG_MAX - SLASH.DMG_MIN + 1)));
}

const _f = new Vector3(), _r = new Vector3(), _u = new Vector3(), _s = new Vector3();
const UP = new Vector3(0, 1, 0);

/** The axes of the sheet's roll: `right` ⟂ forward (level), `up` ⟂ both (out: unit vectors). */
export function rollAxes(f, outRight, outUp) {
    outRight.crossVectors(f, UP);
    if (outRight.lengthSq() < 1e-6) outRight.set(1, 0, 0); // (the wand straight up / down: any level side)
    outRight.normalize();
    outUp.crossVectors(outRight, f).normalize();
}

/**
 * The swing: the wand's pointing `f` (unit) and the hand's velocity `v` → {s (unit, ⟂ f: the swing's direction in the sheet), roll01 (0…1: the sheet's turn, the same for ±s), speed}
 * or null when it is too slow / a thrust (mostly along f).
 */
export function swingOf(f, v) {
    const speed = v.length();
    if (speed < SLASH.SWING_SPEED) return null;
    const along = v.dot(f);
    _s.copy(v).addScaledVector(f, -along);
    const side = _s.length();
    if (side < SLASH.SIDE_SHARE * speed) return null;
    _s.multiplyScalar(1 / side);
    rollAxes(f, _r, _u);
    let a = Math.atan2(_s.dot(_u), _s.dot(_r)); // the angle from «level right» turning to «up»
    if (a >= Math.PI / 2 - 1e-9) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI; // (the sheet has no sense: −s is the same sheet; a ∈ [−90°, 90°))
    return { s: _s.clone(), roll01: (a + Math.PI / 2) / Math.PI, speed };
}

/** The swing's direction `s` back from the forward `f` and the roll (0…1) — the same on every computer. */
export function swingFromRoll(f, roll01, out = new Vector3()) {
    rollAxes(f, _r, _u);
    const a = roll01 * Math.PI - Math.PI / 2;
    return out.copy(_r).multiplyScalar(Math.cos(a)).addScaledVector(_u, Math.sin(a)).normalize();
}

/** The network's direction: the forward scaled by 1 + roll01 (its length carries the roll). */
export function packDir(f, roll01, out = new Vector3()) { return out.copy(f).normalize().multiplyScalar(1 + Math.max(0, Math.min(0.999, roll01))); }
export function unpackDir(d, outF = new Vector3()) { const l = d.length(); outF.copy(d).multiplyScalar(1 / (l || 1)); return { f: outF, roll01: Math.max(0, Math.min(0.999, l - 1)) }; }

/** Is the point `p` (with a body radius `r`) inside the sheet of a slash from `o` along `f`, swinging `s`? → the distance along f, or −1. */
export function sheetHit(o, f, s, range, p, r, out = null) {
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
    const tf = dx * f.x + dy * f.y + dz * f.z;
    if (tf < -r || tf > range + r) return -1;
    const ts = dx * s.x + dy * s.y + dz * s.z;
    if (Math.abs(ts) > SLASH.HALF_W + r) return -1;
    // the sheet's normal n = f × s
    const nx = f.y * s.z - f.z * s.y, ny = f.z * s.x - f.x * s.z, nz = f.x * s.y - f.y * s.x;
    const tn = dx * nx + dy * ny + dz * nz;
    if (Math.abs(tn) > SLASH.THICK + r) return -1;
    return Math.max(0, tf);
}

/** The virtual blade's sweeps along the flight: [{e0a, e0b, e1a, e1b, dt}] — the edge (along s, 2·HALF_W long) moving forward `STEP` m per piece (arrays, world). */
export function bladeSweeps(o, f, s, range) {
    const out = [];
    const at = (t, k) => [o.x + f.x * t + s.x * SLASH.HALF_W * k, o.y + f.y * t + s.y * SLASH.HALF_W * k, o.z + f.z * t + s.z * SLASH.HALF_W * k];
    for (let t = 0; t < range - 1e-6; t += SLASH.STEP) {
        const t1 = Math.min(range, t + SLASH.STEP);
        out.push({ e0a: at(t, -1), e0b: at(t, 1), e1a: at(t1, -1), e1b: at(t1, 1), dt: (t1 - t) / SLASH.VIRT_SPEED, t0: t, t1 });
    }
    return out;
}

/**
 * Who the slash acts on and how (CLAUDE.md «кто/что × как действует»; the keys are the Duel._bodies kinds):
 *   'cut'  — a body with bones: the blade's edge cuts it as a sword would (Dismember.js: a limb / the head comes off), else a deep wound (10–15 HP, armour, bleeding);
 *   'hurt' — the creature's own damage (`hit(c, dmg, 'Slash', by)`: its own rules for «Slash» — they decide what a cut does to it);
 *   'none' — does not act (with the reason).
 */
export const SLASH_TARGETS = {
    p: { does: 'cut', why: 'игроки (и по сети): рассекает как меч — рука, нога, голова; броня и латы защищают; мой компьютер решает за меня' },
    z: { does: 'cut', why: 'зомби: рассекает как меч (конечности, голова); хост' },
    v: { does: 'cut', why: 'жители замков, рыцари, король, волшебники: как меч; латы рыцаря держат — тогда рана, и они узнают, кто это сделал' },
    c: { does: 'cut', why: 'моряки и команды кораблей: как меч (капитан Чёрные Усы — тоже); скелетам — кости (Sailors.pirateBoneDamage)' },
    a: { does: 'cut', why: 'животные: как меч (ноги, голова)' },
    s: { does: 'cut', why: 'гигантская паучиха: ноги, как меч' },
    t: { does: 'cut', why: 'живые деревья: рубит ветки-руки, как топор (дерево — не кровь)' },
    D: { does: 'hurt', why: 'дракон: чешуя — режущий удар ранит его 10–15 (DragonKinds решает по виду «Slash»)' },
    f: { does: 'hurt', why: 'феникс: ранит' },
    N: { does: 'hurt', why: 'болотные канарейки: ранит, лагерь мстит' },
    T: { does: 'hurt', why: 'Тароны: ранит' },
    C: { does: 'hurt', why: 'существа «Да пусть создастся»: ранит' },
    o: { does: 'hurt', why: 'умные совы: режущий удар ранит' },
    S: { does: 'hurt', why: 'невидимая птица Спенсера: любая настоящая рана убивает её' },
    I: { does: 'hurt', why: 'Ледяной замок (Королева, снеговики, ледяные): по правилам IceQueen.hit — лёд и холод у них свои' },
    P: { does: 'hurt', why: 'растения-существа: режет их' },
    b: { does: 'hurt', why: 'книга-птица: рассечённая падает книгой' },
    G: { does: 'none', why: 'призраки Замка призраков: бесплотны — лезвие проходит насквозь (как почти всё)' },
    g: { does: 'none', why: 'горгульи ада: камень и адское пламя — режущий воздух их не берёт' },
    Y: { does: 'none', why: 'Дьяволос: бессмертен, кроме божественного меча (DiabolosRules)' },
    F: { does: 'none', why: 'огненный змей: тело из огня — воздух проходит сквозь' },
};
