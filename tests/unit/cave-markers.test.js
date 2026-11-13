import test from 'node:test';
import assert from 'node:assert/strict';
import { Hud } from '../../src/ui/Hud.js';

test('cave markers reflect crystal destruction and saved/network chest opening immediately', () => {
    const fills=[];
    const ctx=new Proxy({fillStyle:'',measureText:()=>({width:50}),fill(){fills.push(this.fillStyle);},fillRect(){fills.push(this.fillStyle);}}, {get:(t,k)=>k in t?t[k]:()=>{},set:(t,k,v)=>(t[k]=v,true)});
    const hud={_renderCaveWindow(){},caveImage:{canvas:{},cx:0,cz:0}};
    const cave={mem:{has:()=>true,ways:[]},chests:[{id:'chest',mesh:{position:{x:10,z:10}}}],opened:new Set(),crystalTaken:new Set(),crystals:new Map([['cave',{data:{x:20,z:20},list:[{id:'crystal'}]}]])};
    const draw=()=>{fills.length=0;Hud.prototype._drawCaveMap.call(hud,ctx,cave,{x:0,z:0},0,[],[],1,150,150);return [...fills];};
    let a=draw();assert.ok(a.includes('#5fd3ff'));assert.ok(a.includes('#c88a2e'));
    cave.crystalTaken.add('crystal');cave.opened.add('chest');
    a=draw();assert.equal(a.includes('#5fd3ff'),false);assert.equal(a.includes('#c88a2e'),false);assert.ok(a.includes('#7d7466'));
});
