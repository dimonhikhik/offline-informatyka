export const LIMIT = 300;
export const DEFAULT_LAYER = 'vector-1';
export const MAX_LAYERS = 40;
const IMAGE_LIMIT = 9000000;
export const labels = {rect:'Прямокутник',ellipse:'Еліпс',line:'Лінія',polygon:'Багатокутник',curve:'Крива',text:'Текст'};
export const FONT_FAMILIES = {
  'sans-serif':'Без зарубок',serif:'Із зарубками',monospace:'Моноширинний',
  Arial:'Arial',Georgia:'Georgia','Times New Roman':'Times New Roman','Courier New':'Courier New',Verdana:'Verdana'
};
export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>v.toString(16).padStart(2,'0')).join('');
export const blank = () => ({format:'informatyka-vector',version:1,width:960,height:640,background:'#ffffff',transparent:false,
  layers:[{id:DEFAULT_LAYER,name:'Векторний шар 1',hidden:false,locked:false,opacity:1}],objects:[]});
export function shape(type,x,y,w,h,style) {
  const points = type==='polygon' ? Array.from({length:5},(_,i)=>[.5+.5*Math.cos(-Math.PI/2+i*2*Math.PI/5),.5+.5*Math.sin(-Math.PI/2+i*2*Math.PI/5)]) : type==='curve'?[[0,1],[0,0],[1,1],[1,0]] : [[0,0],[1,1]];
  return {id:uid(),type,label:labels[type],x,y,w,h,angle:0,fill:'#b69aef',stroke:'#28354b',strokeWidth:3,
    opacity:1,gradient:false,fill2:'#79aaff',text:'Моя ідея',points,group:'',layer:DEFAULT_LAYER,hidden:false,locked:false,...style};
}
export function objectTransform(object) {
  const cx=object.w/2,cy=object.h/2;
  let value=`translate(${object.x} ${object.y}) rotate(${object.angle} ${cx} ${cy})`;
  if(object.flipX||object.flipY){
    value+=` translate(${cx} ${cy}) scale(${object.flipX?-1:1} ${object.flipY?-1:1}) translate(${-cx} ${-cy})`;
  }
  return value;
}
export function paintMode(object,kind) {
  return object[kind+'Mode']??(kind==='fill'&&object.gradient?'linear':'solid');
}
export function paintVector(object,kind) {
  return object[kind+'Vector']??(paintMode(object,kind)==='radial'?{x1:.5,y1:.5,x2:1,y2:.5}:{x1:0,y1:0,x2:1,y2:1});
}
export function bounds(object) {
  const r=object.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),cx=object.x+object.w/2,cy=object.y+object.h/2;
  const corners=[[-object.w/2,-object.h/2],[object.w/2,-object.h/2],[object.w/2,object.h/2],[-object.w/2,object.h/2]].map(([x,y])=>[cx+x*c-y*s,cy+x*s+y*c]);
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
export function combined(objects) {
  const list=objects.map(bounds);if(!list.length)return null;
  const x=Math.min(...list.map(b=>b.x)),y=Math.min(...list.map(b=>b.y));
  return {x,y,w:Math.max(...list.map(b=>b.x+b.w))-x,h:Math.max(...list.map(b=>b.y+b.h))-y};
}
export function localPoint(object,p) {
  const r=-object.angle*Math.PI/180,dx=p.x-object.x-object.w/2,dy=p.y-object.y-object.h/2;
  const x=dx*Math.cos(r)-dy*Math.sin(r),y=dx*Math.sin(r)+dy*Math.cos(r);
  return {x:object.w/2+(object.flipX?-x:x),y:object.h/2+(object.flipY?-y:y)};
}
export function validate(raw) {
  const fail=()=>{throw new Error('Файл містить непідтримуваний або пошкоджений векторний проєкт.');};
  const num=(n,min,max)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)fail();return n;};
  const str=(s,max)=>{if(typeof s!=='string'||s.length>max)fail();return s;};
  const color=(c,allowNone=true)=>{if(typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c)&&(!allowNone||c!=='none'))fail();return c;};
  const choice=(value,options)=>{if(!options.includes(value))fail();return value;};
  const idValue=(value,max=40)=>{if(!/^[a-z0-9-]+$/i.test(str(value,max)))fail();return value;};
  const vector=value=>{
    if(value==null)return;
    return {x1:num(value.x1,-2,3),y1:num(value.y1,-2,3),x2:num(value.x2,-2,3),y2:num(value.y2,-2,3)};
  };
  const stops=values=>{
    if(values==null)return;
    if(!Array.isArray(values)||values.length<2||values.length>24)fail();
    return values.map(stop=>({offset:num(stop?.offset,0,1),color:color(stop?.color,false),
      opacity:stop.opacity==null?undefined:num(stop.opacity,0,1)})).sort((a,b)=>a.offset-b.offset);
  };
  const textStyle=o=>({
    fontFamily:choice(o.fontFamily??'Arial',Object.keys(FONT_FAMILIES)),
    fontSize:o.fontSize==null?undefined:num(o.fontSize,1,960),
    fontWeight:choice(o.fontWeight??'normal',['normal','bold']),
    fontStyle:choice(o.fontStyle??'normal',['normal','italic']),
    textDecoration:choice(o.textDecoration??'none',['none','underline','line-through']),
  });
  const textRuns=(runs,text)=>{
    if(runs==null)return;
    if(!Array.isArray(runs)||runs.length>250)fail();
    return runs.map(run=>{
      const start=num(run?.start,0,text.length),end=num(run?.end,start+1,text.length);
      if(!Number.isInteger(start)||!Number.isInteger(end))fail();
      return {start,end,fill:run.fill==null?undefined:color(run.fill),
        fontFamily:run.fontFamily==null?undefined:choice(run.fontFamily,Object.keys(FONT_FAMILIES)),
        fontSize:run.fontSize==null?undefined:num(run.fontSize,1,960),
        fontWeight:run.fontWeight==null?undefined:choice(run.fontWeight,['normal','bold']),
        fontStyle:run.fontStyle==null?undefined:choice(run.fontStyle,['normal','italic']),
        textDecoration:run.textDecoration==null?undefined:choice(run.textDecoration,['none','underline','line-through'])};
    });
  };
  if(raw?.format!=='informatyka-vector'||raw.version!==1||!Array.isArray(raw.objects)||raw.objects.length>LIMIT)fail();
  const inputLayers=raw.layers??blank().layers,layerIds=new Set();
  if(!Array.isArray(inputLayers)||!inputLayers.length||inputLayers.length>MAX_LAYERS)fail();
  let imageBytes=0;
  const layers=inputLayers.map(layer=>{
    const id=idValue(layer?.id);
    if(layerIds.has(id))fail();
    layerIds.add(id);
    const name=str(layer.name,80).trim();
    if(!name)fail();
    const image=layer.image;
    if(image!==undefined){
      if(typeof image!=='string'||!image.startsWith('data:image/png;base64,iVBORw0KGgo')||!/^[a-z0-9+/]*={0,2}$/i.test(image.slice(22)))fail();
      imageBytes+=image.length;
      if(imageBytes>IMAGE_LIMIT)fail();
    }
    return {id,name,hidden:layer.hidden===true,locked:layer.locked===true,opacity:num(layer.opacity??1,0,1),image};
  });
  const ids=new Set();
  const objects=raw.objects.map(o=>{
    if(!o || !Object.hasOwn(labels,o.type))fail();
    const id=idValue(o.id);if(ids.has(id))fail();ids.add(id);
    const layer=o.layer??layers[0].id;
    if(!layerIds.has(layer))fail();
    if(!Array.isArray(o.points)||o.points.length<2||o.points.length>193 || o.type==='curve'&&(o.points.length<4||(o.points.length-1)%3!==0))fail();
    const closed=o.closed===true,fillMode=choice(paintMode(o,'fill'),['solid','linear','radial','pattern','mesh']);
    let nodeTypes,meshColors;
    if(o.type==='curve'&&o.nodeTypes!=null){
      if(!Array.isArray(o.nodeTypes)||o.nodeTypes.length>(o.points.length-1)/3+(closed?0:1))fail();
      nodeTypes=o.nodeTypes.map(value=>choice(value,['corner','smooth','symmetric']));
    }
    if(o.meshColors!=null){
      if(!Array.isArray(o.meshColors)||o.meshColors.length!==4)fail();
      meshColors=o.meshColors.map(value=>color(value,false));
    }
    const text=str(o.text,4000);
    const textFields=o.type==='text'?{
      ...textStyle(o),textAlign:choice(o.textAlign??'start',['start','middle','end']),
      letterSpacing:num(o.letterSpacing??0,-30,200),lineHeight:num(o.lineHeight??1.2,.5,4),textRuns:textRuns(o.textRuns,text)
    }:{};
    return {
      id,layer,type:o.type,closed,fillOpen:o.fillOpen===true,label:str(o.label,80),x:num(o.x,-10000,10000),y:num(o.y,-10000,10000),
      w:num(o.w,1,10000),h:num(o.h,1,10000),angle:num(o.angle,-360,360),flipX:o.flipX===true,flipY:o.flipY===true,
      fill:color(o.fill),fill2:color(o.fill2),fillOpacity:num(o.fillOpacity??1,0,1),fillMode,fillStops:stops(o.fillStops),fillVector:vector(o.fillVector),
      fillSpread:choice(o.fillSpread??'pad',['pad','reflect','repeat']),
      fillPattern:choice(o.fillPattern??'diagonal',['diagonal','grid','dots','checker']),meshColors,
      stroke:color(o.stroke),stroke2:color(o.stroke2??'#79aaff'),strokeOpacity:num(o.strokeOpacity??1,0,1),strokeWidth:num(o.strokeWidth,0,50),
      strokeMode:choice(paintMode(o,'stroke'),['solid','linear','radial']),strokeStops:stops(o.strokeStops),strokeVector:vector(o.strokeVector),
      strokeSpread:choice(o.strokeSpread??'pad',['pad','reflect','repeat']),
      strokeDash:choice(o.strokeDash??'solid',['solid','dash','dot','dash-dot']),
      strokeCap:choice(o.strokeCap??'round',['butt','round','square']),
      strokeJoin:choice(o.strokeJoin??'round',['miter','round','bevel']),
      opacity:num(o.opacity,0,1),gradient:fillMode==='linear',bevel:o.bevel===true,shadow:o.shadow===true,shadowColor:color(o.shadowColor??'#000000',false),
      text,...textFields,group:str(o.group,40),hidden:o.hidden===true,locked:o.locked===true,nodeTypes,
      points:o.points.map(p=>{if(!Array.isArray(p)||p.length!==2)fail();return [num(p[0],-2,3),num(p[1],-2,3)];})
    };
  });
  return {format:raw.format,version:1,width:num(raw.width,160,2400),height:num(raw.height,160,2400),background:color(raw.background),transparent:raw.transparent===true,layers,objects};
}
