export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const wake=element=>{const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-'+element));if(!cs.awake)g.castleLife._wake(cs);return g.castleLife.byId.get('creative-'+element+':1');};
 const earth=wake('earth'),fire=wake('fire');g.spells.hooks.explode=()=>{throw Error('Fireball called explosion');};
 const shoot=v=>{v.fx=0;const o=new T.Vector3(v.x,v.y+2,v.z-12);g.spells.cast('Fireball',o,new T.Vector3(0,0,1),'right',g.localId);};
 shoot(earth);for(let i=0;i<12;i++)g.spells.update(1/60);
 h.cam([earth.x+8,earth.y+5,earth.z-8],[earth.x,earth.y+2,earth.z-3]);await h.shot('fireball-flight',{settle:0});
 for(let i=0;i<90;i++)g.spells.update(1/60);
 const burning=v=>[...g.burning.list.values()].some(b=>b.kind==='v'&&b.id===v.id);
 h.log('ignition',{target:earth.id,burning:burning(earth)});if(!burning(earth))throw Error('Fireball did not ignite ordinary mage');
 shoot(fire);for(let i=0;i<90;i++)g.spells.update(1/60);
 h.log('fire immunity',{target:fire.id,burning:burning(fire),hp:fire.hp});if(burning(fire)||fire.hp!==fire.maxHp)throw Error('Fire mage was not fireproof');
 const base=g.collision.groundY(10,-15);g.spells.cast('Fireball',new T.Vector3(10,base+5,-15),new T.Vector3(0,-1,0),'right',g.localId);
 for(let i=0;i<30;i++)g.spells.update(1/60);
 h.log('ground afterburn',{count:g.spells._fireballEmbers?.size});if(!g.spells._fireballEmbers?.size)throw Error('Fireball residue vanished on landing');
 g.fx.update?.(1/60);h.cam([16,base+4,-21],[10,base+.5,-15]);await h.shot('fireball-afterburn',{settle:0});
 for(let i=0;i<210;i++)g.spells.update(1/60);if(g.spells._fireballEmbers.size)throw Error('Fireball residue accumulated');

}
