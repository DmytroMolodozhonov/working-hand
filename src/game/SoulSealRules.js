/** A witness may seal a dead black mage's old life, never an unwitnessed stranger. */
import { darkLevel } from './DarkMagic.js';
import { hashString } from '../core/math.js';
import { seededRng } from './WizardMind.js';

export const SOUL_SEAL = { CREATE: 50, RITE: 75, TIME: 90, DARK_MIN: 5, REACH: 2.8, FIND: 60, MEMORY_MS: 600000 };
export const SEALED_WHY = 'Тело было подвергнуто ритуалу. Вернуть силу этой жизни больше невозможно.';
export const SEAL_CHANCE = { novice: 0.2, adept: 0.5, teacher: 0.85, elder: 0.85, master: 1, savior: 1 };
export function knowsSoulSeal(v) {
    if (v.savior != null || v.role === 'savior' || v.role === 'master') return true;
    const rank = v.rank || v.entry?.rank || ({ student: 'novice', teacher: 'teacher' }[v.role]) || 'adept';
    return seededRng(hashString(String(v.id) + ':soul-seal'))() < (SEAL_CHANCE[rank] ?? 0.5);
}
export function sealable(b) { return !!b && b.k === 'p' && !!b.lg && !b.seal && darkLevel(b.lg.dark) >= SOUL_SEAL.DARK_MIN; }
export const SEAL_TARGETS = {
    players: 'only their corpse or bones, with a legacy of at least five black-magic levels; blocks legacy recovery, never ordinary respawn',
    castlePeople: 'a free, capable wizard who actually witnessed the crime can perform the rite',
    creatures: 'living creatures, non-player corpses, animals and bosses are unaffected',
    items: 'NPCs collect the victim’s remaining dropped belongings after completing the rite',
    ground: 'a white drawing on the existing surface under the corpse; never edits blocks or destroys the body',
    spells: 'does not block ordinary spells; the mark on the corpse permanently blocks Give Me My Power',
};
