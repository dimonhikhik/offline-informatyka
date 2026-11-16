import { DEFAULT_LAYER,objectTransform,paintMode,paintVector,validate } from './model.js';
import { readStandaloneSvg } from './svg-import.js';
export const NS='http://www.w3.org/2000/svg';
export function svg(tag,attrs={},...children) {
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))if(value!=null)node.setAttribute(key,String(value));
  node.append(...children);return node;
}
const paintId=(o,kind)=>`paint-${kind}-${o.id}`;
const reference=id=>`url(#${id})`;
const objectPaint=(o,kind)=>o[kind]!=='none'&&paintMode(o,kind)!=='solid'?reference(paintId(o,kind)):o[kind];
const secondary=(o,kind)=>o[kind+'2']==='none'?'#ffffff':o[kind+'2']??'#ffffff';
const stop=(offset,color,opacity)=>svg('stop',{offset,'stop-color':color,'stop-opacity':opacity});
function gradient(o,kind,mode){
  const {x1,y1,x2,y2}=paintVector(o,kind);
  const stops=o[kind+'Stops']??[{offset:0,color:o[kind]},{offset:1,color:secondary(o,kind)}];
  const attrs={id:paintId(o,kind),gradientUnits:'userSpaceOnUse',gradientTransform:`scale(${o.w} ${o.h})`,spreadMethod:o[kind+'Spread']??'pad'};
  return mode==='radial'
    ?svg('radialGradient',{...attrs,cx:x1,cy:y1,r:Math.max(.0001,Math.hypot(x2-x1,y2-y1))},...stops.map(s=>stop(s.offset,s.color,s.opacity)))
    :svg('linearGradient',{...attrs,x1,y1,x2,y2},...stops.map(s=>stop(s.offset,s.color,s.opacity)));
}
function pattern(o){
  const id=paintId(o,'fill'),color=secondary(o,'fill'),base=svg('rect',{width:16,height:16,fill:o.fill});
  let motif;
  switch(o.fillPattern){
    case 'checker': motif=svg('path',{d:'M0 0H8V8H0Z M8 8H16V16H8Z',fill:color});break;
    case 'dots': motif=svg('circle',{cx:8,cy:8,r:3,fill:color});break;
    case 'grid': motif=svg('path',{d:'M0 0H16 M0 0V16 M0 16H16 M16 0V16',stroke:color,'stroke-width':2,fill:'none'});break;
    default: motif=svg('path',{d:'M-4 4L4 -4 M-4 20L20 -4 M12 20L20 12',stroke:color,'stroke-width':3,fill:'none'});
  }
  return svg('pattern',{id,width:16,height:16,patternUnits:'userSpaceOnUse'},base,motif);
}
function mesh(o){
  const id=paintId(o,'fill');
  const [tl,tr,bl,br]=o.meshColors??[o.fill,secondary(o,'fill'),secondary(o,'fill'),o.fill];
  const band=(name,start,end)=>svg('linearGradient',{id:id+name},stop(0,start),stop(1,end));
  const unit={x:0,y:0,width:1,height:1};
  return [
    band('-top',tl,tr),band('-bottom',bl,br),
    svg('linearGradient',{id:id+'-alpha',x1:0,y1:0,x2:0,y2:1},stop(0,'#ffffff',1),stop(1,'#ffffff',0)),
    svg('mask',{id:id+'-mask',...unit,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse'},
      svg('rect',{...unit,fill:reference(id+'-alpha')})),
    svg('pattern',{id,width:1,height:1,patternUnits:'objectBoundingBox',viewBox:'0 0 1 1',preserveAspectRatio:'none'},
      svg('rect',{...unit,fill:reference(id+'-bottom')}),
      svg('rect',{...unit,fill:reference(id+'-top'),mask:reference(id+'-mask')}))
  ];
}
function textNode(o,attrs) {
  const textAttrs={
    ...attrs,y:0,'font-size':o.fontSize??o.h,'font-family':o.fontFamily??'Arial',
    'font-style':o.fontStyle,'font-weight':o.fontWeight,'text-decoration':o.textDecoration,
    'letter-spacing':o.letterSpacing,'text-anchor':o.textAlign??'start','xml:space':'preserve'
  };
  const at=o.textAlign==='middle'?o.w/2:o.textAlign==='end'?o.w:0;
  const size=o.fontSize??o.h,runs=o.textRuns??[];
  if(o.fontSize==null&&!o.text.includes('\n')&&!runs.length)
    return svg('text',{...textAttrs,x:at,y:size*.82,textLength:o.w,lengthAdjust:'spacingAndGlyphs'},o.text);
  const styleAttrs={fill:'fill',fontFamily:'font-family',fontSize:'font-size',fontWeight:'font-weight',fontStyle:'font-style',textDecoration:'text-decoration'};
  let start=0,y=0;
  const lines=o.text.split('\n').map(line=>{
    const end=start+line.length,overlap=runs.filter(run=>run.start<end&&run.end>start);
    const edges=[...new Set([start,end,...overlap.flatMap(run=>[Math.max(start,run.start),Math.min(end,run.end)])])].sort((a,b)=>a-b);
    const sizeForLine=Math.max(size,...overlap.map(run=>run.fontSize??size));
    const children=edges.slice(0,-1).map((from,i)=>{
      const to=edges[i+1],style={};
      for(const run of overlap)if(run.start<=from&&run.end>=to){
        for(const [key,attr] of Object.entries(styleAttrs))if(run[key]!=null)style[attr]=run[key];
      }
      return svg('tspan',style,o.text.slice(from,to));
    });
    const node=svg('tspan',{x:at,y:y+sizeForLine*.82},...children);
    start=end+1;y+=sizeForLine*(o.lineHeight??1.2);
    return node;
  });
  return svg('text',textAttrs,...lines);
}
function reliefEdge(name,dx,dy,color,opacity){
  return [
    svg('feOffset',{in:'SourceAlpha',dx,dy,result:name+'-offset'}),
    svg('feComposite',{in:'SourceAlpha',in2:name+'-offset',operator:'out',result:name+'-edge'}),
    svg('feFlood',{'flood-color':color,'flood-opacity':opacity,result:name+'-color'}),
    svg('feComposite',{in:name+'-color',in2:name+'-edge',operator:'in',result:name})
  ];
}
function effect(o){
  let region={x:'-40%',y:'-60%',width:'180%',height:'220%'};
  if(o.type!=='text'){
    const margin=14+o.strokeWidth/2;
    const x=[0,o.w,...o.points.map(p=>p[0]*o.w)],y=[0,o.h,...o.points.map(p=>p[1]*o.h)];
    const left=Math.min(...x),top=Math.min(...y);
    region={filterUnits:'userSpaceOnUse',x:left-margin,y:top-margin,
      width:Math.max(...x)-left+2*margin,height:Math.max(...y)-top+2*margin};
  }
  const filter=svg('filter',{id:`effect-${o.id}`,'color-interpolation-filters':'sRGB',...region});
  if(o.bevel){
    filter.append(...reliefEdge('highlight',1.6,1.6,'#ffffff',.7),...reliefEdge('shade',-1.6,-1.6,'#121229',.55),
      svg('feMerge',{result:'beveled'},...['SourceGraphic','shade','highlight'].map(source=>svg('feMergeNode',{in:source}))));
  }
  if(o.shadow)filter.append(svg('feDropShadow',{in:o.bevel?'beveled':'SourceGraphic',dx:4,dy:4,stdDeviation:3,
    'flood-color':o.shadowColor??'#000000','flood-opacity':.55}));
  return filter;
}
export function objectNode(o) {
  const outer=svg('g',{'data-id':o.id,transform:objectTransform(o),opacity:o.opacity,filter:o.shadow||o.bevel?reference(`effect-${o.id}`):undefined});
  const dash={dash:[4,2.5],dot:[.25,2], 'dash-dot':[4,2,.25,2]}[o.strokeDash];
  const attrs={fill:objectPaint(o,'fill'),stroke:objectPaint(o,'stroke'),'stroke-width':o.strokeWidth,
    'fill-opacity':o.fillOpacity,'stroke-opacity':o.strokeOpacity,
    'stroke-linejoin':o.strokeJoin??'round','stroke-linecap':o.strokeCap??'round',
    'stroke-dasharray':dash?.map(length=>length*Math.max(o.strokeWidth,1)).join(' ')};
  let node;
  if(o.type==='rect')node=svg('rect',{...attrs,width:o.w,height:o.h});
  if(o.type==='ellipse')node=svg('ellipse',{...attrs,cx:o.w/2,cy:o.h/2,rx:o.w/2,ry:o.h/2});
  if(o.type==='polygon')node=svg('polygon',{...attrs,points:o.points.map(([x,y])=>`${x*o.w},${y*o.h}`).join(' ')});
  if(o.type==='line')node=svg('polyline',{...attrs,fill:o.fillOpen?attrs.fill:'none',points:o.points.map(([x,y])=>`${x*o.w},${y*o.h}`).join(' ')});
  if(o.type==='curve') {
    const p=o.points.map(([x,y])=>`${x*o.w} ${y*o.h}`);
    let d=`M${p[0]}`;for(let i=1;i<p.length;i+=3)d+=` C${p[i]},${p[i+1]},${p[i+2]}`;
    node=svg('path',{...attrs,fill:o.closed||o.fillOpen?attrs.fill:'none',d:d+(o.closed?' Z':'')});
  }
  if(o.type==='text')node=textNode(o,attrs);
  outer.append(node);return outer;
}
export function artwork(doc) {
  const defs=svg('defs');
  for(const o of doc.objects){
    for(const kind of ['fill','stroke']){
      const mode=paintMode(o,kind);
      if(o[kind]==='none'||mode==='solid')continue;
      if(mode==='pattern')defs.append(pattern(o));
      else if(mode==='mesh')defs.append(...mesh(o));
      else defs.append(gradient(o,kind,mode));
    }
    if(o.shadow||o.bevel)defs.append(effect(o));
  }
  const nodes=[defs];
  if(!doc.transparent)nodes.push(svg('rect',{width:doc.width,height:doc.height,fill:doc.background,'pointer-events':'none'}));
  const layers=doc.layers??[{id:DEFAULT_LAYER,opacity:1}],objectsByLayer=new Map(layers.map(layer=>[layer.id,[]]));
  for(const object of doc.objects)if(!object.hidden)objectsByLayer.get(object.layer??layers[0].id)?.push(object);
  for(const layer of layers)if(!layer.hidden){
    const group=svg('g',{'data-layer':layer.id,opacity:layer.opacity??1});
    if(layer.image)group.append(svg('image',{width:doc.width,height:doc.height,href:layer.image,
      preserveAspectRatio:'xMidYMid meet','pointer-events':'none'}));
    group.append(...objectsByLayer.get(layer.id).map(objectNode));
    nodes.push(group);
  }
  return nodes;
}
export function serialize(doc) {
  const root=svg('svg',{xmlns:NS,width:doc.width,height:doc.height,viewBox:`0 0 ${doc.width} ${doc.height}`});
  root.append(svg('metadata',{id:'informatyka-project'},JSON.stringify(doc)),...artwork(doc));
  return new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml;charset=utf-8'});
}
export async function parseProject(blob) {
  const externalLimit=2*1024*1024,projectLimit=24*1024*1024;
  if(blob.size>projectLimit)throw new Error('SVG-проєкт має бути не більшим за 24 МБ.');
  if(blob.size>externalLimit&&!/id=["']informatyka-project["']/.test(await blob.slice(0,4096).text()))
    throw new Error('Сторонній SVG має бути не більшим за 2 МБ.');
  const source=await blob.text();
  if(/<!DOCTYPE[^>]*\[/.test(source))throw new Error('SVG з власними визначеннями XML-сутностей не підтримується.');
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml');
  if(parsed.querySelector('parsererror'))throw new Error('Не вдалося прочитати SVG.');
  const data=parsed.querySelector('metadata[id="informatyka-project"]');
  if(!data){
    if(blob.size>externalLimit)throw new Error('Сторонній SVG має бути не більшим за 2 МБ.');
    return readStandaloneSvg(parsed);
  }
  // Only validated model data is used; imported XML nodes never enter the page.
  let model;try{model=JSON.parse(data.textContent);}catch{throw new Error('Пошкоджені дані проєкту.');}
  return validate(model);
}
async function withSvgImage(doc,action) {
  const url=URL.createObjectURL(serialize(doc));
  try{
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Не вдалося підготувати зображення.'));image.src=url;});
    return await action(image);
  }finally{URL.revokeObjectURL(url);}
}
export function pngBlob(doc,scale=1) {
  return withSvgImage(doc,async image=>{
    const canvas=document.createElement('canvas');canvas.width=Math.round(doc.width*scale);canvas.height=Math.round(doc.height*scale);
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Браузер не надав доступ до експорту PNG.');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не вдалося створити PNG.')),'image/png'));
  });
}
export function sampleColor(doc,point){
  const x=Math.floor(point.x),y=Math.floor(point.y);
  if(x<0||y<0||x>=doc.width||y>=doc.height)return Promise.resolve();
  return withSvgImage(doc,image=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Піпетка недоступна в цьому браузері.');
    ctx.drawImage(image,x,y,1,1,0,0,1,1);
    const pixel=ctx.getImageData(0,0,1,1).data;
    if(pixel[3])return '#'+Array.from(pixel.slice(0,3),value=>value.toString(16).padStart(2,'0')).join('');
  });
}
