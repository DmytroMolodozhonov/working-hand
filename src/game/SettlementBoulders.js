/** Rounded, layered garden stones, one shared instanced draw for loaded earth homes.
 * They are solid scenery (not summoned/levitated ammunition). Blasts break them;
 * removed support makes them fall. Houses owns persistence and the near/far lifecycle.
 */
import * as T from 'three';
const MAX=128,_m=new T.Matrix4(),_p=new T.Vector3(),_q=new T.Quaternion(),_s=new T.Vector3();
export function earthBoulderLayout(def){
 const a=def.rot*Math.PI/2,c=Math.cos(a),s=Math.sin(a);
 return [[-10,-23,1.6,2.1,1.1],[10,-23,1.1,1.5,1.4],[-8,-3,.8,.7,.6],[8,5,1.1,1,.7],[-8,7,.55,.5,.7],[8,-7,.6,.8,.5]].map(([u,v,rx,h,rz],i)=>({id:def.id+':stone:'+i,x:def.x+u*c-v*s,z:def.z+u*s+v*c,base:def.F,rx,h,rz,yaw:a+i*.91}));
}
export function settlementStoneGeometry(){
 const geo=new T.IcosahedronGeometry(1,2),p=geo.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),w=1+.07*Math.sin(x*13+y*9+z*7)+.035*Math.sin(x*29-z*23);
  p.setXYZ(i,x*w,y*w,z*w);
  const vein=.5+.5*Math.sin(y*32+x*4+Math.sin(z*8)),grain=.5+.5*Math.sin(x*71+y*79+z*67),k=.36+vein*.13+grain*.05;
  colors.push(k*.95,k,k*.91);
 }
 geo.computeBoundingBox();const lo=geo.boundingBox.min.y,span=geo.boundingBox.max.y-lo,rx=Math.max(Math.abs(geo.boundingBox.min.x),geo.boundingBox.max.x),rz=Math.max(Math.abs(geo.boundingBox.min.z),geo.boundingBox.max.z);
 for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)/rx,(p.getY(i)-lo)/span,p.getZ(i)/rz);
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();geo.computeBoundingBox();return geo;
}
export class SettlementBoulders{
 constructor(game){this.game=game;this.active=new Map();this.broken=new Set();this.timer=0;this.dirty=false;
  this.mesh=new T.InstancedMesh(settlementStoneGeometry(),new T.MeshPhongMaterial({vertexColors:true,shininess:9}),MAX);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);game.scene.add(this.mesh);
 }
 box(r){const b=r.box;if(b!=null)this.game.collision.removeBox(b);const c=Math.abs(Math.cos(r.yaw)),s=Math.abs(Math.sin(r.yaw)),rx=c*r.rx+s*r.rz,rz=s*r.rx+c*r.rz;r.box=this.game.collision.addBox({minX:r.x-rx,maxX:r.x+rx,minY:r.y,maxY:r.y+r.h,minZ:r.z-rz,maxZ:r.z+rz,kind:'stone'});}
 remove(id){const r=this.active.get(id);if(!r)return;this.game.collision.removeBox(r.box);this.active.delete(id);this.dirty=true;}
 update(dt,homes){
  this.timer-=dt;
  if(this.timer<=0){this.timer=.25;const wanted=new Set(),defs=new Map();for(const r of homes.values())if(r.def.element==='earth')defs.set(r.def.id,r.def);
   for(const d of defs.values())for(const p of earthBoulderLayout(d)){wanted.add(p.id);if(this.broken.has(p.id)||this.active.has(p.id)||this.active.size>=MAX)continue;
    const floor=this.game.collision.groundAt(p.x,p.z,p.base+.2);if(!Number.isFinite(floor))continue;
    const r={...p,y:Math.min(p.base,floor),vy:0};this.active.set(r.id,r);this.box(r);this.dirty=true;
   }
   for(const [id,r] of this.active){if(!wanted.has(id)||this.broken.has(id)){this.remove(id);continue;}const data=this.game.terrain?.data;
    if(!data?.landMade||data.landMade(Math.round(r.x),Math.round(r.z)))r.floor=this.game.collision.groundAt(r.x,r.z,r.y+.2);
   }
  }
  for(const r of this.active.values())if(Number.isFinite(r.floor)&&r.floor<r.y-.02){r.vy-=22*dt;r.y=Math.max(r.floor,r.y+r.vy*dt);if(r.y<=r.floor)r.vy=0;this.box(r);this.dirty=true;}
  if(this.dirty){let i=0;for(const r of this.active.values()){_p.set(r.x,r.y,r.z);_s.set(r.rx,r.h,r.rz);_q.setFromAxisAngle(T.Object3D.DefaultUp,r.yaw);this.mesh.setMatrixAt(i++,_m.compose(_p,_q,_s));}this.mesh.count=i;this.mesh.instanceMatrix.needsUpdate=true;this.dirty=false;}
 }
 break(id,broadcast=true){if(this.broken.has(id))return;this.broken.add(id);this.remove(id);if(broadcast)this.game.net?.send?.({t:'srock',id},true);}
 blast(p,r){if(!this.game.authority)return;for(const [id,b] of this.active)if(Math.hypot(b.x-p.x,b.y+b.h*.5-p.y,b.z-p.z)<r+Math.max(b.rx,b.rz))this.break(id);}
 dispose(){for(const id of [...this.active.keys()])this.remove(id);this.game.scene.remove(this.mesh);this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
