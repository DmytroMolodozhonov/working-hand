export default async function(h){
 const g=h.g,T=h.THREE;h.bare();g.paused=true;
 const cs=g.castleLife._runtime(g.castleLife.extra.get('creative-water'));if(!cs.awake)g.castleLife._wake(cs);const v=g.castleLife.byId.get('creative-water:1');
 v.foe=g.localId;v.fx=4;g.elementalMages.update(.1);h.cam([v.x+7,v.y+5,v.z-8],[v.x,v.y+2,v.z]);await h.shot('water-dome',{settle:0});
 v.fx=2;g.elementalMages.update(.1);await h.shot('water-shield',{settle:0});
 const ec=g.castleLife._runtime(g.castleLife.extra.get('creative-earth'));if(!ec.awake)g.castleLife._wake(ec);const e=g.castleLife.byId.get('creative-earth:1');e.foe=g.localId;
 const s=g.earthMages._start(e);s.blade=true;for(let i=0;i<100;i++){g.earthMages._gather(e,s,1/60);g.earthMages.update(1/60);g.groundVortex.update(1/60);}
 g.earthMages._phase(e,s,'wall');for(let i=0;i<100;i++){g.earthMages.update(1/60);g.groundVortex.update(1/60);}
 h.cam([e.x+7,e.y+5,e.z-10],[e.x,e.y+2,e.z]);await h.shot('earth-shield-plates',{settle:0});h.log('blade morph',s.B.filter(Boolean).map(b=>b.sharp));
}
