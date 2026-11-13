import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/game/Game.js';

test('loading yields to the UI while waiting for shader completion and between renders', async () => {
    let finish, ticks=0, reached=false;
    const wait=new Promise(r=>finish=r), progress=[];
    const g={*_prewarmRun(asyncCompile){
        assert.equal(asyncCompile,true);
        yield {of:4,wait};reached=true;
        yield {of:4};yield {of:4};
    }};
    const timer=setInterval(()=>ticks++,1);
    const run=Game.prototype.prewarmAsync.call(g,n=>progress.push(n));
    try {
        await new Promise(r=>setTimeout(r,20));
        assert.equal(reached,false,'do not render a program which is still linking');
        assert.ok(ticks>0,'the UI event loop remains alive');
        finish();await run;
        assert.equal(progress.at(-1),1);assert.equal(reached,true);
        assert.ok(progress.length>=4);
    } finally {clearInterval(timer);}
});

test('a failed async compilation closes the generator and restores its scene state', async () => {
    let cleaned=false;
    const g={*_prewarmRun(){try{yield {wait:Promise.reject(new Error('context lost'))};}finally{cleaned=true;}}};
    await assert.rejects(Game.prototype.prewarmAsync.call(g),/context lost/);
    assert.equal(cleaned,true);
});
