// Exercise the actual r128 backport with a delayed driver (the headless GL has no KHR extension).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../vendor/three/three.module.js',import.meta.url),'utf8');
const begin=source.indexOf('\tthis.compileAsync = async function ( scene, camera )');
const end=source.indexOf('\n\t// Animation Loop',begin);
const install=new Function('extensions','programCache','_gl','_isContextLost',source.slice(begin,end));

function renderer({extension=true,lost=false}={}) {
    const calls=[],program={};let polls=0;
    const r={debug:{checkShaderErrors:true},compile(){calls.push(this.debug.deferShaderCompletion===true?'deferred':'finish');}};
    install.call(r,{get:()=>extension?{COMPLETION_STATUS_KHR:0x91b1}:null},{programs:[{program}]},{getProgramParameter(p,status){assert.equal(p,program);assert.equal(status,0x91b1);return ++polls>2;}},lost);
    return {r,calls};
}

test('parallel shader compilation waits without blocking, then finishes uniforms with diagnostics enabled',async()=>{
    const {r,calls}=renderer();let ticks=0;
    const timer=setInterval(()=>ticks++,1);
    try {await r.compileAsync({},{});}finally{clearInterval(timer);}
    assert.deepEqual(calls,['deferred','finish']);assert.ok(ticks>0);
    assert.equal(r.debug.deferShaderCompletion,undefined);assert.equal(r.debug.checkShaderErrors,true);
});

test('shader warm-up supports a driver without KHR and reports context loss',async()=>{
    const fallback=renderer({extension:false});await fallback.r.compileAsync({},{});
    assert.deepEqual(fallback.calls,['finish']);
    const lost=renderer({lost:true});await assert.rejects(lost.r.compileAsync({},{}),/context lost/);
    assert.deepEqual(lost.calls,['deferred']);assert.equal(lost.r.debug.deferShaderCompletion,undefined);
});

// The game's warm-up hands the card EVERY group's shaders first, then waits once (21.11: groups of 4 waited alone — the driver's threads stood idle).
test('the warm-up issues all sample groups deferred, skips the crumbed ones, then waits for all programs at once', async () => {
    const { Game } = await import('../../src/game/Game.js').catch(() => ({}));
    if (!Game) return; // (Game needs a browser for some imports — then the e2e bench --fake-khr covers it)
    const programs = [], polls = new Map(), seen = [];
    const r = { debug: {}, info: { programs }, getContext: () => gl,
        compile() { seen.push({ deferred: this.debug.deferShaderCompletion === true, n: zoo.children.length }); programs.push({ program: {} }); } };
    const gl = { getExtension: () => ({ COMPLETION_STATUS_KHR: 1 }), isContextLost: () => false, getProgramParameter: (p) => { const k = (polls.get(p) || 0) + 1; polls.set(p, k); return k > 2; } };
    const zoo = { children: [], add(...a) { this.children.push(...a); }, remove(...a) { this.children = this.children.filter((c) => !a.includes(c)); } };
    const b = Game.prototype._pwBatch.call({ renderer: r, scene: {}, camera: {} }, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4, { groups: new Set([4]) }, zoo);
    for (const _ of b.issue());
    assert.deepEqual(seen, [{ deferred: true, n: 4 }, { deferred: true, n: 1 }]);
    assert.equal(b.programs, 2); assert.equal(zoo.children.length, 0); assert.notEqual(r.debug.deferShaderCompletion, true);
    await b.wait();
    for (const p of programs) assert.ok(polls.get(p.program) >= 3);
    assert.equal(Game.prototype._pwBatch.call({ renderer: { ...r, getContext: () => ({ getExtension: () => null }) } }, [], 4, { groups: new Set() }, zoo), null);
});
