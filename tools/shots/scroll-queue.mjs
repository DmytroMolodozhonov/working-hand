// Real canvas layout, reveal cards, and the vendored parallel shader path.
export default async function(h) {
    const g=h.g,T=h.THREE;
    const {describeItem}=await import('/src/game/ItemTypes.js');
    const {pentagramTextLines}=await import('/src/game/PentagramText.js');
    const {paintParchment}=await import('/src/fx/ScrollArt.js');
    h.bare();g.paused=true;h.cam([0,0,6],[0,0,0]);g._updateCamera(0);
    for(const o of g.scene.children)if(!o.isLight)o.visible=false;
    const make=async(id)=>{
        const info=describeItem({kind:'scroll',stat:'pentagram',pent:id});
        g.wandMagic._showHologram(info,new T.Vector3(0,0,0));
        const mesh=g.wandMagic.holo.mesh;mesh.material.opacity=1;mesh.position.set(0,0,0);
        h.cam([0,0,6],[0,0,0]);
        await h.shot('reveal-'+id,{settle:0});
        const c=document.createElement('canvas');c.width=1024;c.height=768;
        paintParchment(c.getContext('2d'),c.width,c.height,{school:'arcane',compactPicture:true,title:info.title,lines:pentagramTextLines(id).map(text=>[{text,bold:false}]),note:'Сожгите свиток, если хотите запомнить это заклинание'});
        await window.__shotSave('paper-'+id,c.toDataURL('image/png'));
        g.wandMagic._closeHolo();
    };
    await make('soulseal');await make('grip');
    g.wandMagic._showHologram({title:'Очень длинное название обычного заклинания для проверки переноса строк',lines:['Проверка полного названия обычного свитка.']},new T.Vector3());
    const mesh=g.wandMagic.holo.mesh;mesh.position.set(0,0,0);mesh.material.opacity=1;
    h.cam([0,0,6],[0,0,0]);await h.shot('reveal-spell',{settle:0});g.wandMagic._closeHolo();
    const scene=new T.Scene(),cam=new T.PerspectiveCamera(60,1,.1,100);
    cam.position.z=4;scene.add(new T.AmbientLight(0xffffff));
    scene.add(new T.Mesh(new T.SphereGeometry(1,16,12),new T.MeshPhongMaterial({color:0xaabbee,defines:{ZNS_PARALLEL_SMOKE:1}})));
    let ticks=0;const timer=setInterval(()=>ticks++,1);const start=performance.now();
    await g.renderer.compileAsync(scene,cam);clearInterval(timer);
    g.renderer.render(scene,cam);
    h.log('parallel-compile',{extension:!!g.renderer.extensions.get('KHR_parallel_shader_compile'),ms:performance.now()-start,heartbeatTicks:ticks,programs:g.renderer.info.programs.length});
}
