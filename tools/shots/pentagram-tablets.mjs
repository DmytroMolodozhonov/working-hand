// Real item models and the actual pause-menu renderer; no duplicate UI or item mechanics.
export default async function(h) {
 const g=h.g,T=h.THREE;
 const {makeItemModel,describeItem}=await import('/src/game/ItemTypes.js');
 const {renderMagicTab,figureIds}=await import('/src/ui/Codex.js');
 h.bare();g.paused=true;
 for(const o of g.scene.children)if(!o.isLight)o.visible=false;
 const models=[];
 for(const [i,it] of [{kind:'scroll',stat:'pentagram',pent:'life'},{kind:'scroll',stat:'pentagram',pent:'devil'},{kind:'scroll',stat:'pentagram',pent:'enchant'},{kind:'scroll',stat:'spell',spell:'Bombardo'}].entries()){
  const m=makeItemModel(it);m.position.set((i-1.5)*.65,0,0);g.scene.add(m);models.push(m);
 }
 h.cam([0,.35,2.4],[0,.13,0]);await h.shot('tablets-and-spell-scroll',{settle:0});
 for(const m of models)m.visible=false;
 g.wandMagic._showHologram(describeItem({kind:'scroll',stat:'pentagram',pent:'soulseal'}),new T.Vector3());
 g.wandMagic.holo.mesh.position.set(0,0,0);g.wandMagic.holo.mesh.material.opacity=1;
 h.cam([0,0,6],[0,0,0]);await h.shot('tablet-reveal',{settle:0});g.wandMagic._closeHolo();
 // Restore the actual menu hidden by bare(), then use its own tab handlers and rendering.
 for(const el of document.querySelectorAll('[style]'))if(el.style.visibility==='hidden')el.style.visibility='';
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
 document.querySelector('[data-pause-tab="pause-spells"]').click();
 const ids={bar:'pause-magic-sections',spells:'pause-magic-spells',potions:'pause-magic-potions',pents:'pause-magic-pentagrams',cats:'pause-spell-cats',grid:'pause-spells-grid',pgrid:'pause-pentagrams-grid',vgrid:'pause-potions-grid',pcats:'pause-pentagram-cats',vcats:'pause-potion-cats'};
 const wait=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 renderMagicTab(ids,null,null,new Set(['life','devil']),'pentagrams');
 for(let i=0;i<40;i++)await wait();
 const grid=document.getElementById(ids.pgrid);
 if(grid.querySelectorAll('.pent-card').length!==2)throw Error('Unknown pentagrams leaked');
 await h.page('known-pentagrams',0);
 renderMagicTab(ids,null,null,new Set(figureIds()),'pentagrams');
 for(let i=0;i<40;i++)await wait();
 const pics=[...grid.querySelectorAll('.pent-pic')];
 for(const p of pics){const r=p.getBoundingClientRect();if(Math.abs(r.width-r.height)>1)throw Error('Stretched pentagram');}
 const pane=document.getElementById('pause-spells');
 const box=document.querySelector('#pause-menu .pause-box');let writes=0;
 const mo=new MutationObserver(ms=>writes+=ms.length);mo.observe(box.querySelector('.ar-frame'),{attributes:true,subtree:true});
 for(let i=0;i<90;i++){pane.scrollTop=(i%30)/29*(pane.scrollHeight-pane.clientHeight);await wait();}
 mo.disconnect();
 if(writes)throw Error('Frame redrawn while scrolling: '+writes);
 if(getComputedStyle(box).clipPath!=='none')throw Error('Pause menu still uses parent SVG clipping');
 await h.page('pentagrams-scrolled',0);
 h.log('tablet checks',{cards:pics.length,round:true,frameWrites:writes,scrollRange:pane.scrollHeight-pane.clientHeight,clip:getComputedStyle(box).clipPath,models:models.map(m=>({name:m.name,meshes:m.children.length}))});
}
