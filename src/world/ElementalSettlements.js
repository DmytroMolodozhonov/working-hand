/** Generation 31: worker-safe settlements, using real destructible blocks and ordinary house records. */
import {BLOCK as B} from './Terrain.js';
export const SETTLEMENT_ELEMENT={earthvillage:'earth',watervillage:'water',airvillage:'air',firevillage:'fire'};
export const ELEMENTAL_SITE_NAMES={earth:'Каменная обитель магов земли',water:'Ледяная гавань магов воды',air:'Висячие сады магов воздуха',fire:'Обитель у огненного кратера'};

/** Doors 3×6, clear room height 7 m. All homes use the same furniture/door/loot lifecycle as other hamlets. */
function home(p,out,element,u,v,wall,roof,{round=false,metal=false,ice=false}={}){
 if(round){p.cyl(u,v,6,-2,7,wall);p.cyl(u,v,4.5,0,6,B.AIR);for(let y=8;y<=10;y++)p.cyl(u,v,6-(y-8)*1.5,y,y,roof);}
 else{p.box(u-5,u+5,-2,7,v-5,v+5,wall);p.box(u-4,u+4,0,6,v-4,v+4,B.AIR);for(let y=8;y<=10;y++)p.box(u-6+y-8,u+6-y+8,y,y,v-6,v+6,roof);}
 p.box(u-4,u+4,-1,-1,v-4,v+4,wall);p.box(u-1,u+1,0,5,v-6,v-4,B.AIR);
 const door=p.pt(u,v-5),inside=p.pt(u,v),dn=p.node(u,v-6,0,'door'),hn=p.node(u,v,0,'home');p.link(dn,hn);
 const chest={...p.pt(u+3,v+2),yaw:p.yaw(0),room:element};
 const foot=p.pt(u-3,v+2),head=p.pt(u-3,v-1);
 out.houses.push({kind:element+'home',element,wizard:true,rich:false,c:inside,r:7,door,inside,doorNode:dn,homeNode:hn,beds:1,
  doorRec:{...door,ry:p.yaw(0),w:3,h:6,metal,ice},windows:[],chests:[chest],bedSpots:[{...foot,y:foot.y+1.2,yaw:Math.atan2(head.x-foot.x,head.z-foot.z),room:element}]});
 // Shelves, a stone bed plinth, wall lamp and a stone table; nothing blocks the doorway.
 p.box(u-3,u-3,0,0,v-1,v+2,wall);p.box(u-3,u+3,0,2,v+4,v+4,element==='fire'?B.HELL_IRON:B.BOOKS);
 p.box(u,u,3,3,v+4,v+4,B.ARCANE_LAMP);p.box(u+2,u+3,0,1,v-1,v,wall);
 return dn;
}
function connect(p,center,u,v){const ids=p.line(0,v,u,v,0,5);p.link(center,ids[0]);return ids.at(-1);}

export function buildWaterSettlement(p,rng,out){
 // An asymmetric bedrock-rooted sea crag rather than a square floating platform.
 for(let y=-54;y<=-1;y++){const r=20+12*Math.sqrt((y+55)/54);p.cyl(-2,1,r,y,y,y<-5?B.STONE:B.DEEPSTONE);}
 p.cyl(9,-5,23,-8,-1,B.STONE);p.cyl(-13,9,19,-6,-1,B.STONE);
 for(let i=0;i<12;i++){const r=30+Math.floor(rng()*4),h=3+Math.floor(rng()*5);p.sector(0,0,r,r-2,i*Math.PI/6,(i+1)*Math.PI/6,0,h,B.ICE_DARK);}
 p.box(-3,3,0,8,-35,-27,B.AIR);
 for(const [x,z,h] of [[-25,-22,13],[25,-20,11],[-24,23,10],[25,21,15]]){
  p.cyl(x,z,3,-54,-1,B.STONE);p.cyl(x,z,4,-2,h,B.ICE_DARK);p.cyl(x,z,2,0,h-2,B.AIR);p.cyl(x,z,5,h,h+1,B.ICE_WALL,3);
 }
 // Connected real water canals. Dry bridges align with every walking route.
 for(const side of [-1,1]){p.box(side*11-1,side*11+1,-3,-2,-25,25,B.STONE);p.box(side*11-1,side*11+1,-1,-1,-25,25,B.WATER);
  for(const z of [-18,0,2])p.box(side*11-2,side*11+2,-1,-1,z-2,z+2,B.ICE);}
 p.cyl(0,19,5,-3,-2,B.STONE);p.cyl(0,19,4,-1,-1,B.WATER);
 const hall=p.node(0,0,0,'yard');p.link(hall,p.node(0,-27,0,'yard'));
 for(const [x,z] of [[-18,-10],[18,-10],[-18,10],[18,10]]){const dn=home(p,out,'water',x,z,B.ICE_WALL,B.ICE_DARK,{round:true,ice:true});p.link(connect(p,hall,x,z-8),dn);}
 out.posts.push({...p.pt(0,-23),yaw:p.yaw(0)});
}

export function buildAirSettlement(p,rng,out){
 // The natural hanging rock below is made by Terrain's existing island column generator.
 p.cyl(0,0,30,-3,-1,B.DIRT);p.cyl(0,0,30,-1,-1,B.GRASS);
 const hall=p.node(0,0,0,'yard');
 for(const [x,z] of [[-17,-10],[17,-10],[-17,10],[17,10]]){
  const dn=home(p,out,'air',x,z,B.CS_WHITE,B.ARCANE,{round:true});p.link(connect(p,hall,x,z-8),dn);
 }
 for(const side of [-1,1]){
  p.box(side*3,side*5,-1,-1,-23,23,B.CS_WHITE);
  for(const z of [-26,-9,11,25]){p.box(side*6,side*8,0,0,z-2,z+2,B.DIRT);p.box(side*6,side*8,1,1,z-2,z+2,B.FLOWERS);}
  // Planted balconies with stone brackets and trailing foliage, suspended from their own island.
  p.box(side*24,side*34,-2,-1,-3,3,B.CS_WHITE);p.box(side*32,side*34,0,0,-3,3,B.DIRT);
  p.box(side*32,side*34,1,1,-3,3,B.FLOWERS);p.box(side*32,side*33,-8,-3,-3,-3,B.LEAVES);
  p.box(side*25,side*25,0,4,-4,-4,B.CS_WHITE);p.box(side*25,side*25,5,5,-4,-4,B.ARCANE_LAMP);
 }
 p.cyl(0,21,5,-1,-1,B.CS_WHITE);p.cyl(0,21,3,0,0,B.DIRT);p.cyl(0,21,3,1,1,B.FLOWERS);
 // The communal route stays clear of the raised garden on the far terrace.
 const left=p.node(-6,0),right=p.node(6,0);p.link(hall,left);p.link(hall,right);
 out.posts.push({...p.pt(0,-24),yaw:p.yaw(0)});
}

export function buildFireSettlement(p,rng,out){
 // A real volcanic mountain: stratified flanks, a hollow crater and actual lava.
 for(let y=-1;y<=30;y++){
  const r=20-13*Math.max(0,y)/31,offset=Math.sin(y*.17)*1.4;
  p.cyl(offset,15,r,y,y,y%6===0?B.HELL_OBSIDIAN:B.HELL_BASALT);
 }
 p.cyl(0,15,5,24,32,B.AIR);p.cyl(0,15,4,24,27,B.HELL_LAVA);
 p.cyl(0,15,7,30,31,B.HELL_OBSIDIAN,5);
 const hall=p.node(0,-12,0,'yard');
 for(const [x,z] of [[-16,-21],[16,-21],[-27,0],[27,0]]){
  const dn=home(p,out,'fire',x,z,B.HELL_BRICK,B.HELL_OBSIDIAN,{metal:true});
  // The outer lanes keep residents away from the volcano, even after nightfall.
  if(z< -10){const junction=p.node(0,z-8),approach=p.node(x,z-8);p.link(hall,junction);p.link(junction,approach);p.link(approach,dn);}else{const elbow=p.node(x,-12);p.link(hall,elbow);p.link(elbow,dn);}
 }
 // A basalt ritual pavilion: the dormant Infernum drawing still needs its ordinary offering.
 p.box(-7,7,-2,-1,-34,-23,B.HELL_BASALT);
 for(const x of [-6,6])for(const z of [-33,-24])p.box(x,x,0,6,z,z,B.HELL_BRICK);
 p.box(-7,7,7,8,-34,-23,B.HELL_OBSIDIAN);
 out.ritual={...p.pt(0,-29),pent:'infernum',r:3};out.posts.push({...p.pt(0,-19),yaw:p.yaw(0)});
 out.fire=p.pt(0,-12);
}
export function buildElementalSettlement(p,rng,out,element){
 ({water:buildWaterSettlement,air:buildAirSettlement,fire:buildFireSettlement})[element](p,rng,out);
}
