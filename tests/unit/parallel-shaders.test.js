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
