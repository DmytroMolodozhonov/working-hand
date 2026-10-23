import { describe, it, expect } from 'vitest';
import { floorUnder } from '../../src/game/Levitation.js';

// A hall with a roof: the column's top (surfaceY) is the roof, the floor is the hall's floor.
const hall = { surfaceY: () => 14, groundY: () => 14, groundAt: (x, z, reach) => (reach < 14 ? 0 : 14) };

describe('Levitation: the floor under a thing indoors', () => {
    it('is the hall floor, not the roof (no lift to the roof by the throne)', () => {
        expect(floorUnder(hall, 0, 0, 3)).toBe(0);
    });
    it('is the roof only for a point up above it', () => {
        expect(floorUnder(hall, 0, 0, 20)).toBe(14);
    });
    it('falls back to the surface without a floor query', () => {
        expect(floorUnder({ surfaceY: () => 5 }, 0, 0, 3)).toBe(5);
    });
});
