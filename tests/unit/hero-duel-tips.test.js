import test from 'node:test';
import assert from 'node:assert/strict';
import { WIZ_RANKS, rankDuelPower, rankDuelRange, duelPower } from '../../src/game/WizardAI.js';
import { HERO } from '../../src/game/HeroSetup.js';
import { DUEL_RANK_ROWS } from '../../src/ui/HeroSettingsUi.js';

test('подсказки сил волшебников берутся из данных рангов', () => {
    for (const r of DUEL_RANK_ROWS) {
        const [lo, hi] = rankDuelRange(r.rank);
        assert.ok(lo < rankDuelPower(r.rank) && rankDuelPower(r.rank) < hi);
        assert.equal(rankDuelPower(r.rank), duelPower(WIZ_RANKS[r.rank].mana, 1, 0));
        assert.match(r.tip, /очков дуэльной силы/);
    }
    const p = DUEL_RANK_ROWS.map((r) => rankDuelPower(r.rank));
    assert.ok(rankDuelPower('novice') < rankDuelPower('adept') && rankDuelPower('adept') < rankDuelPower('teacher'));
    assert.ok(rankDuelPower('master') > rankDuelPower('elder'));
    assert.ok(HERO.MASTERY_MAX >= rankDuelRange('master')[1] && p.length === 5);
});
