/**
 * index.html must stay well-formed: an unclosed <div> in the menu once put
 * the game's canvas inside the (hidden) menu — a black screen in the game.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('index.html: every <div> is closed; the game canvas is a direct child of <body>', () => {
    const open = (html.match(/<div\b/g) || []).length;
    const close = (html.match(/<\/div>/g) || []).length;
    assert.equal(open, close, `${open} <div> vs ${close} </div>`);
    // walk the tags: the depth at the game canvas must be 0 (directly in body)
    let depth = 0;
    const re = /<(\/?)div\b|<canvas id="game-canvas"/g;
    let m, atCanvas = null;
    while ((m = re.exec(html))) {
        if (m[0].startsWith('<canvas')) { atCanvas = depth; break; }
        depth += m[1] ? -1 : 1;
    }
    assert.equal(atCanvas, 0, 'the game canvas is not inside any <div>');
});
