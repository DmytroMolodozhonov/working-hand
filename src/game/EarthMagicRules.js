/** Earth is an elemental discipline, never an ordinary wizard strength rank. Pure layout/AI constants. */
export const EARTH = { ID:'creative-earth', X:26, Z:-22, HP:32, MANA:220, REGEN:1, START:20, DRAIN:1, LIFT_RATE:36, MAX:60, BLADE_COST:12, WALL_COST:5, COCOON_COST:15, THROW_COST:3, RANGE:32, LEASH:70 };
export const EARTH_PHASES = { lift:1.15, orbit:.55, wall:2.4, cocoon:3.5, blade:1.25, throw:1.1, punch:1.1, kick:1.25, sweep:1.45, hammer:1.6, rest:2 };
// Release times match the strike in EarthMagePose. Every event pays separately.
export const EARTH_STRIKES = {
 punch:[[.38,1],[.73,1]], kick:[[.61,2]], sweep:[[.56,2],[.91,2]], hammer:[[.95,4]], throw:[[.55,3]]
};
export const EARTH_ATTACKS=['punch','kick','sweep','hammer','throw'];
export const EARTH_MODES = Object.keys(EARTH_PHASES).map(k=>'earth'+k[0].toUpperCase()+k.slice(1));
export const ELEMENTAL_BARE_HAND = 'advanced';

// A closed voxel shell, not a mathematical invulnerability bubble. Shared faces meet exactly.
const inside=(x,y,z)=>x*x+y*y+z*z<=2.6*2.6;
export const EARTH_SHELL=[];
for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++){
 if(!inside(x,y,z))continue;
 if([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a,b,c])=>!inside(x+a,y+b,z+c)))EARTH_SHELL.push([x,y+.1,z]);
}
EARTH_SHELL.sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0]-b[0]);
export const WALL_COUNT=25;

/** Same lifted stones move into each form. Unit cubes meet edge-to-edge, never random ranks on a curved grid. */
export function earthSlot(i,form,angle,yaw,out={}){
 let x,y,z;
 if(form==='wall'&&i<WALL_COUNT){x=i%5-2;y=Math.floor(i/5)-1.9;z=-3.3;}
 else if(form==='cocoon'&&i<EARTH_SHELL.length){[x,y,z]=EARTH_SHELL[i];}
 else if(form==='punch'&&i<4){x=(i%2?1:-1)*2.6;y=.1+Math.floor(i/2)*.6;z=-2.5;}
 else if(form==='kick'&&i<6){x=(i%2?1:-1)*1.1;y=-1.1+Math.floor(i/2)*.5;z=-2.9;}
 else if(form==='sweep'&&i<8){const a=-1.3+i*.36;x=Math.sin(a)*4.5;y=.1+(i%2)*.4;z=-Math.cos(a)*4.5;}
 else if(form==='hammer'&&i<8){x=(i%4-1.5)*1.05;y=3.5+Math.floor(i/4)*1.05;z=-1.4;}
 else {const a=2.25*Math.sin(angle*.4+i*2.39996323),r=5.2+(i%3)*.7;x=Math.sin(a)*r;y=-.8+(i%5)*.85;z=Math.cos(a)*r;} // leave the casting stance and the forward strike lane visible
 const s=Math.sin(yaw),c=Math.cos(yaw);out.x=x*c+z*s;out.y=y;out.z=-x*s+z*c;return out;
}

/** Segment vs an oriented unit block; t in [0,1], null if no actual stone lies in the path. */
export function earthBlockHit(a,b,p,yaw=0,r=.505){
 const c=Math.cos(yaw),s=Math.sin(yaw),ax=a.x-p.x,az=a.z-p.z,bx=b.x-p.x,bz=b.z-p.z;
 const ox=ax*c-az*s,oy=a.y-p.y,oz=ax*s+az*c;
 const dx=bx*c-bz*s-ox,dy=b.y-p.y-oy,dz=bx*s+bz*c-oz;
 let lo=0,hi=1;
 for(let i=0;i<3;i++){
  const o=i===0?ox:i===1?oy:oz,d=i===0?dx:i===1?dy:dz;
  if(Math.abs(d)<1e-9){if(Math.abs(o)>r)return null;continue;}
  let t0=(-r-o)/d,t1=(r-o)/d;if(t0>t1){const swap=t0;t0=t1;t1=swap;}
  lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return null;
 }
 return lo;
}

export function earthSite(F){
 return {id:EARTH.ID,kind:'elemental',name:'Площадка мага земли',x:EARTH.X,z:EARTH.Z,F,zone:18,gx:0,gz:0,knights:0,population:1,color:0x71804c,
 houses:[],stalls:[],fields:[],posts:[],beds:[],chests:[],pens:[],graves:[],graveyards:[],rooms:[],nodes:[],edges:[],
 people:[{idx:1,seed:971206,role:'mage',element:'earth',name:'Терран',female:false,mana:EARTH.MANA,robe:false,look:earthLook()}]};
}
export function earthLook(){return {element:'earth',wizard:true,tool:'none',outfit:null,uniform:null,hat:'none',dress:false,dressColor:0x637046,shirt:0x637046,pants:0x3b4230,accent:0xc39a55,boots:0x413629,magicRobe:false};}
