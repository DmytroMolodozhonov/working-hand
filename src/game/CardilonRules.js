/** Cardilon is instant, known from birth, and spends an already raised ordinary hand shield. */
import { REACT_LAG, reactLevel } from './WizardMind.js';
export const CARDILON = { COST: 7, MAX_COST: 15, RANGE: 48, MISS: 4, FX_TIME: 1.35 };
export const cardilonCost = (power) => power > 1 ? CARDILON.MAX_COST : CARDILON.COST;
export const ordinaryShield = (s) => !!s && s.type === 1 && s.left > 0 && !s.gods && !s.tent;
export function cardilonDelay(v) {
    const range = REACT_LAG[reactLevel(v.rank || v.role)];
    return 0.18 + 0.28 * (v.reactLag?.t ?? (range.min + range.max) * 0.5);
}
/** A real incoming trajectory, not a bomb already past the defender or moving away. */
export function incomingBomb(b, p) {
    const dx = p.x - b.p.x, dy = p.y - b.p.y, dz = p.z - b.p.z;
    const speed2 = b.v.lengthSq();
    if (speed2 < 1) return false;
    const dot = dx * b.v.x + dy * b.v.y + dz * b.v.z;
    const distance2 = dx * dx + dy * dy + dz * dz;
    return dot > 0 && distance2 <= CARDILON.RANGE ** 2 && distance2 - dot * dot / speed2 < (CARDILON.MISS + (b.power > 1 ? 2 : 0)) ** 2;
}
export const CARDILON_TARGETS = {
    players: 'Any player with ordinary Protection can capture an incoming Bombardo; host confirms the capture, the shield is consumed and mana is paid once.',
    wizards: 'Every NPC wizard knows it; rank reaction and speaking time, facing, sight and mana determine whether the projectile reaches him first.',
    Bombardo: 'Captured without any external explosion, damage, shove, terrain edits or success reward for an explosion that never happened.',
    BombardoMaxima: 'Same spell, automatically 15 mana instead of 7; a larger enclosing shell.',
    shields: 'Only an existing ordinary magical hand Protection. Maxima, gods, tentative gesture shields and physical shields cannot be spent.',
    creatures: 'Zombies, villagers, animals, sailors, spider, living trees, book birds, dragons, ice creatures, Black Moustache, skeletons and every other creature receive no direct effect or splash.',
    world: 'No effect on ships, loose/held items, bodies, buildings, enchanted stone, god gifts, water or terrain; intervening walls, doors and wards stop the interception.',
    otherSpells: 'No effect on duel beams or other projectiles; no Cardilon Maxima variant.',
    space: 'Works in space: the magical shield needs no air.',
};
