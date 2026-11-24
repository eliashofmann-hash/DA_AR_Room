// Public model-viewer API only. Materials must belong to exactly one wall group.
export function installCutaway(viewer, settings, {isOverview=()=>true,onChange=()=>{}}={}) {
  const originals = new Map();
  const used = new Set();
  const groups = settings.groups.map(group=>{
    const materials=group.materials.flatMap(name=>{
      if(used.has(name))throw new Error(`Material in multiple wall groups: ${name}`);
      used.add(name);
      const matches=viewer.model.materials.filter(m=>m.name===name);
      if(!matches.length)throw new Error(`Missing wall material: ${name}`);
      for(const material of matches)originals.set(material,{rgba:Array.from(material.pbrMetallicRoughness.baseColorFactor),alphaMode:material.getAlphaMode(),cutoff:material.getAlphaCutoff()});
      return matches;
    });
    const length=Math.hypot(...group.outward);
    if(!length)throw new Error(`Invalid wall normal: ${group.id}`);
    const zoom=group.retain_until_zoom;
    if(zoom&&!(zoom.hide_below_ratio>0&&zoom.hide_below_ratio<zoom.restore_above_ratio&&zoom.restore_above_ratio<=1))throw new Error(`Invalid zoom thresholds: ${group.id}`);
    return {...group,normal:group.outward.map(v=>v/length),materials,hidden:null,zoomed:false};
  });
  let forceVisible=false,ar=false,pending=0,overviewRadius=viewer.getCameraOrbit().radius;
  const threshold=settings.hysteresis_m??0.002;
  function apply(group,hidden){
    if(group.hidden===hidden)return false;
    group.hidden=hidden;
    for(const material of group.materials){
      const original=originals.get(material);
      const rgba=[...original.rgba];
      if(hidden){
        // MASK avoids translucent walls, sorting ghosts and emissive remnants.
        rgba[3]=0;
        material.pbrMetallicRoughness.setBaseColorFactor(rgba);
        material.setAlphaCutoff(.5);
        material.setAlphaMode('MASK');
      }else{
        material.pbrMetallicRoughness.setBaseColorFactor(rgba);
        material.setAlphaCutoff(original.cutoff);
        material.setAlphaMode(original.alphaMode);
      }
    }
    return true;
  }
  function update(){
    pending=0;
    const orbit=viewer.getCameraOrbit(),target=viewer.getCameraTarget();
    const eye=[target.x+orbit.radius*Math.sin(orbit.phi)*Math.sin(orbit.theta),
      target.y+orbit.radius*Math.cos(orbit.phi),
      target.z+orbit.radius*Math.sin(orbit.phi)*Math.cos(orbit.theta)];
    for(const group of groups){
      const distance=group.normal.reduce((sum,n,i)=>sum+n*(eye[i]-group.point[i]),0);
      const staticMode=ar||(!isOverview()&&settings.overview_only);
      const nearSide=
        distance>threshold?true:distance < -threshold?false:group.hidden??distance>0;
      const zoom=group.retain_until_zoom;
      if(zoom&&!staticMode){
        const ratio=orbit.radius/overviewRadius;
        if(ratio<zoom.hide_below_ratio)group.zoomed=true;
        else if(ratio>zoom.restore_above_ratio)group.zoomed=false;
      }
      const retained=!!zoom&&!group.zoomed;
      const hidden=forceVisible?false:staticMode?!!group.static_hidden:retained?false:nearSide;
      apply(group,hidden);
    }
    onChange({eye,radius:orbit.radius,overviewRadius,zoomRatio:orbit.radius/overviewRadius,
      mode:ar?'ar-static':forceVisible?'all-visible':isOverview()?'automatic':'interior',
      groups:groups.map(g=>({id:g.id,label:g.label,hidden:g.hidden,retained:!!g.retain_until_zoom&&!g.zoomed}))});
  }
  function schedule(){if(!pending)pending=requestAnimationFrame(update);}
  viewer.addEventListener('camera-change',schedule);
  function onAR(event){ar=event.detail.status==='session-started'||event.detail.status==='object-placed';update();}
  viewer.addEventListener('ar-status',onAR);
  update();
  return {update,setOverviewRadius(value){
      if(!(Number.isFinite(value)&&value>0))throw new Error('Invalid overview radius');
      overviewRadius=value;for(const group of groups)group.zoomed=false;update();
    },setAllVisible(value){forceVisible=value;update();},
    prepareAR(){ar=true;update();},restoreBrowser(){ar=false;update();},
    dispose(){viewer.removeEventListener('camera-change',schedule);viewer.removeEventListener('ar-status',onAR);if(pending)cancelAnimationFrame(pending);for(const group of groups)apply(group,false);}};
}
