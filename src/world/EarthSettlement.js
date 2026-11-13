/** A landscaped rock sanctuary: vaulted cave hall, four homes cut into its sides, planted lightwell and real doors/chests. Worker-safe plan. */
import { BLOCK as B } from './Terrain.js';
export function buildEarthSettlement(p,rng,out){
 // Broad eroded hill: solid strata under a thin natural crown, all ordinary destructible terrain.
 for(let y=-1;y<=20;y++){
  const r=Math.sqrt(Math.max(0,1-(Math.max(0,y)/21)**2))*25;
  p.cyl(0,3,r,y,y,y>16?B.GRASS:y%5===0?B.DEEPSTONE:B.STONE);
 }
 // Large vaulted communal cave, then stepped arch courses rather than a rectangular ceiling.
 p.box(-11,11,0,8,-11,13,B.AIR);
 for(let y=9;y<=12;y++)p.box(-11+(y-8)*2,11-(y-8)*2,y,y,-9,11,B.AIR);
 p.box(-3,3,0,6,-24,-10,B.AIR);
 p.box(-3,3,-1,-1,-25,13,B.COBBLE);
 for(const side of [-1,1]){
  p.box(side*5,side*4,0,7,-20,-18,B.COBBLE);
  p.box(side*4,side*3,6,7,-20,-18,B.COBBLE);
  p.box(side*8,side*6,-1,-1,-23,-18,B.DIRT);
  p.box(side*8,side*6,0,0,-23,-18,B.FLOWERS);
  p.box(side*5,side*5,3,3,-21,-21,B.ARCANE_LAMP);
 }
 p.box(-3,3,7,8,-20,-18,B.COBBLE);
 const entry=p.node(0,-23,0,'yard'),hall=p.node(0,0,0,'yard');p.link(entry,hall);
 // An open roof above the garden admits sunlight; plants do not stand in the walking corridor.
 p.box(-3,3,12,24,3,8,B.AIR);
 for(const side of [-1,1]){
  p.box(side*9,side*7,-1,-1,-6,9,B.GRASS);
  for(let z=-5;z<=8;z+=3)p.box(side*8,side*8,0,0,z,z,B.FLOWERS);
  for(const z of [-8,11]){p.box(side*9,side*9,0,2,z,z,B.COBBLE);p.box(side*9,side*9,3,3,z,z,B.ARCANE_LAMP);}
 }
 // Low benches and a communal stone table, away from every route/doorway.
 p.box(-4,4,0,0,10,11,B.PLANKS_DARK);p.box(-2,2,0,1,6,7,B.COBBLE);
 for(const [side,z] of [[-1,-5],[1,-5],[-1,8],[1,8]]){
  const u=side*17,edge=side*12;
  p.box(u-4,u+4,0,6,z-4,z+4,B.AIR);
  p.box(Math.min(edge,u),Math.max(edge,u),0,5,z-1,z+1,B.AIR);
  p.box(u-4,u+4,-1,-1,z-4,z+4,B.COBBLE);
  const dn=p.node(edge,z,0,'door'),hn=p.node(u,z,0,'home');p.link(hall,dn);p.link(dn,hn);
  const door=p.pt(edge,z,0),inside=p.pt(u,z,0),chest={...p.pt(u+side*2,z+2,0),yaw:p.yaw(0),room:'earth'};
  const foot=p.pt(u-side*2,z+2,0),head=p.pt(u-side*2,z-1,0);
  out.houses.push({kind:'earthhome',rich:false,element:'earth',wizard:true,c:inside,r:6,door,inside,doorNode:dn,homeNode:hn,beds:1,
   doorRec:{...door,ry:p.yaw(side>0?-Math.PI/2:Math.PI/2),w:3,h:6},windows:[],chests:[chest],bedSpots:[{...foot,y:foot.y+1.2,yaw:Math.atan2(head.x-foot.x,head.z-foot.z),room:'earth'}]});
  // Bed platform, bookshelves, a lamp and a little fern box in each alcove.
  p.box(u-side*2,u-side*2,0,0,z-1,z+2,B.PLANKS_DARK);
  p.box(u-2,u+2,0,2,z-4,z-4,B.BOOKS);
  p.box(u+2,u+2,3,3,z-4,z-4,B.ARCANE_LAMP);
 }
 out.posts.push({...p.pt(0,-14,0),yaw:p.yaw(0)});
}
