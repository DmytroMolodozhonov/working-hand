import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberStartupFailure,readStartupFailure,clearStartupFailure,startupFailureText,STARTUP_FAILURE_KEY} from '../../src/ui/StartupFailure.js';
test('startup error survives reload until a successful entry, independently of saved worlds',()=>{
 const data=new Map([['world-save','important']]),store={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k),removeItem:k=>data.delete(k)};
 const r=rememberStartupFailure(store,new Error('startup sentinel'),{mode:'creative',gen:30,hero:{spawn:'start'}},1000);
 assert.equal(readStartupFailure(store).message,'startup sentinel');assert.match(startupFailureText(r),/creative/);assert.ok(data.has(STARTUP_FAILURE_KEY));clearStartupFailure(store);assert.equal(readStartupFailure(store),null);assert.equal(data.get('world-save'),'important');
});
test('bad or unavailable diagnostic storage never becomes another startup error',()=>{
 const store={setItem(){throw Error('full');},getItem(){return '{broken';},removeItem(){throw Error('blocked');}};
 assert.equal(rememberStartupFailure(store,Error('first')).message,'first');assert.equal(readStartupFailure(store),null);assert.doesNotThrow(()=>clearStartupFailure(store));
});
