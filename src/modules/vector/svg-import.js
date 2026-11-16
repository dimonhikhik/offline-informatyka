import { DEFAULT_LAYER,FONT_FAMILIES,LIMIT,blank,shape,validate } from './model.js';

const svgNS='http://www.w3.org/2000/svg';
const identity=[1,0,0,1,0,0];
const supported=new Set(['rect','ellipse','circle','line','polygon','polyline','path','text']);
const ignored=new Set(['defs','metadata','title','desc','script','animate','animateTransform','set']);
const numberPattern=/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const error=detail=>new Error('Не вдалося імпортувати SVG: '+detail);
const limit=(value,min,max)=>Math.max(min,Math.min(max,value));
const numeric=(text,fallback=0)=>text==null||text===''?fallback:Number.parseFloat(text);
const alpha=(value,fallback=1)=>value==null?fallback:limit(numeric(value)/(value.endsWith('%')?100:1),0,1);
const finiteList=text=>(text?.match(numberPattern)??[]).map(Number);
const apply=([a,b,c,d,e,f],[x,y])=>[a*x+c*y+e,b*x+d*y+f];
function multiply([a,b,c,d,e,f],[g,h,i,j,k,l]){
  return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
}

function matrix(value){
  if(!value)return identity;
  let result=identity;
  const commands=[...value.matchAll(/([a-z]+)\s*\(([^()]*)\)/gi)];
  if(!commands.length||value.replace(/([a-z]+)\s*\([^()]*\)/gi,'').replace(/[\s,]/g,''))throw error('невідоме перетворення об’єкта.');
  for(const [,op,args] of commands){
    const n=finiteList(args);
    let next;
    if(op==='matrix'&&n.length===6)next=n;
    else if(op==='translate'&&(n.length===1||n.length===2))next=[1,0,0,1,n[0],n[1]??0];
    else if(op==='scale'&&(n.length===1||n.length===2))next=[n[0],0,0,n[1]??n[0],0,0];
    else if(op==='rotate'&&(n.length===1||n.length===3)){
      const a=n[0]*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a),x=n[1]??0,y=n[2]??0;
      next=[cos,sin,-sin,cos,x-x*cos+y*sin,y-x*sin-y*cos];
    }
    if(!next||!next.every(Number.isFinite))throw error('непідтримуване перетворення об’єкта.');
    result=multiply(result,next);
  }
  return result;
}

const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const lineTo=(a,b)=>[interpolate(a,b,1/3),interpolate(a,b,2/3),b];
const reflect=(p,center)=>[2*center[0]-p[0],2*center[1]-p[1]];
function arcTo(from,rx,ry,rotation,big,sweep,to){
  if(from[0]===to[0]&&from[1]===to[1])return [];
  rx=Math.abs(rx);ry=Math.abs(ry);
  if(!rx||!ry)return lineTo(from,to);
  const radians=rotation*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  const dx=(from[0]-to[0])/2,dy=(from[1]-to[1])/2,x=cos*dx+sin*dy,y=-sin*dx+cos*dy;
  const scale=Math.max(1,Math.hypot(x/rx,y/ry));
  rx*=scale;ry*=scale;
  const corrected=(x/rx)**2+(y/ry)**2;
  const factor=(big===sweep?-1:1)*Math.sqrt(Math.max(0,1/corrected-1));
  const ux=factor*rx*y/ry,uy=-factor*ry*x/rx;
  const cx=(from[0]+to[0])/2+cos*ux-sin*uy,cy=(from[1]+to[1])/2+sin*ux+cos*uy;
  const start=Math.atan2((y-uy)/ry,(x-ux)/rx),end=Math.atan2((-y-uy)/ry,(-x-ux)/rx);
  let turn=end-start;
  if(!sweep&&turn>0)turn-=2*Math.PI;
  if(sweep&&turn<0)turn+=2*Math.PI;
  const count=Math.ceil(Math.abs(turn)/(Math.PI/2)),delta=turn/count,result=[];
  const p=(u,v)=>[cx+cos*rx*u-sin*ry*v,cy+sin*rx*u+cos*ry*v];
  for(let i=0;i<count;i++){
    const a=start+i*delta,b=a+delta,k=4/3*Math.tan(delta/4);
    result.push(p(Math.cos(a)-k*Math.sin(a),Math.sin(a)+k*Math.cos(a)),
      p(Math.cos(b)+k*Math.sin(b),Math.sin(b)-k*Math.cos(b)),
      i===count-1?to:p(Math.cos(b),Math.sin(b)));
  }
  return result;
}

function pathPoints(value=''){
  const tokenPattern=/[MLHVCSQTAZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
  if(value.replace(tokenPattern,'').replace(/[\s,]/g,''))throw error('неправильний запис контуру.');
  const tokens=value.match(tokenPattern)??[];
  const counts={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  const points=[];
  let current=[0,0],command,previous,control,closed=false;
  for(let index=0;index<tokens.length;){
    if(/^[a-z]$/i.test(tokens[index]))command=tokens[index++];
    const op=command?.toUpperCase(),relative=op!==command;
    if(!op||closed||!points.length&&op!=='M')throw error('невідомий або порожній контур.');
    if(op==='Z'){
      if(current[0]!==points[0][0]||current[1]!==points[0][1])points.push(...lineTo(current,points[0]));
      closed=true;
      continue;
    }
    const count=counts[op],args=tokens.slice(index,index+count).map(Number);
    if(!count||args.length!==count||!args.every(Number.isFinite))throw error('неправильні координати контуру.');
    index+=count;
    const point=(x,y)=>relative?[current[0]+x,current[1]+y]:[x,y];
    let next=point(args[count-2],args[count-1]);
    if(op==='M'){
      if(points.length)throw error('складені контури з кількома підконтурами поки не підтримуються.');
      points.push(next);command=relative?'l':'L';
    }else if(op==='C'||op==='S'){
      const first=op==='C'?point(args[0],args[1]):'CS'.includes(previous)?reflect(control,current):current;
      control=point(args[count-4],args[count-3]);points.push(first,control,next);
    }else if(op==='Q'||op==='T'){
      control=op==='Q'?point(args[0],args[1]):'QT'.includes(previous)?reflect(control,current):current;
      points.push(interpolate(current,control,2/3),interpolate(next,control,2/3),next);
    }else if(op==='A'){
      points.push(...arcTo(current,args[0],args[1],args[2],args[3]!==0,args[4]!==0,next));
    }else{
      if(op==='H')next=[relative?current[0]+args[0]:args[0],current[1]];
      if(op==='V')next=[current[0],relative?current[1]+args[0]:args[0]];
      points.push(...lineTo(current,next));
    }
    current=next;previous=op;
    if(points.length>193)throw error('у контурі понад 193 контрольні точки.');
  }
  return {points,closed};
}

function pointShape(type,points,closed=false){
  if(points.length<(type==='polygon'?3:type==='curve'?4:2))throw error('об’єкт має замало точок.');
  if(points.length>193)throw error('в об’єкті понад 193 точки.');
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  const w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y);
  return shape(type,x,y,w,h,{closed,points:points.map(([px,py])=>[(px-x)/w,(py-y)/h])});
}

function properties(node){
  const fields=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin',
    'stroke-dasharray','opacity','color','font-family','font-size','font-weight','font-style','text-decoration',
    'text-anchor','letter-spacing','display','visibility','stop-color','stop-opacity','filter','mask','clip-path'];
  const values={};
  for(const key of fields)if(node.hasAttribute(key))values[key]=node.getAttribute(key);
  for(const part of (node.getAttribute('style')??'').split(';')){
    const i=part.indexOf(':'),key=part.slice(0,i).trim();
    if(i!==-1&&fields.includes(key))values[key]=part.slice(i+1).trim();
  }
  return values;
}

function positionAttribute(value,fallback,origin=0,size=1){
  if(value==null)return fallback;
  return value.endsWith('%')?origin+numeric(value)/100*size:numeric(value);
}

function gradientDefinition(chain,o,kind,viewport){
  const attr=key=>chain.find(node=>node.hasAttribute(key))?.getAttribute(key);
  const node=chain[0],radial=node.localName==='radialGradient',absolute=attr('gradientUnits')==='userSpaceOnUse';
  if(!radial&&node.localName!=='linearGradient')throw error('підтримуються лінійні та радіальні градієнти.');
  const [left,top,width,height]=absolute?viewport:[0,0,1,1];
  const x=(key,fraction)=>positionAttribute(attr(key),left+fraction*width,left,width);
  const y=(key,fraction)=>positionAttribute(attr(key),top+fraction*height,top,height);
  let points;
  if(radial){
    const distance=Math.hypot(width,height)/Math.SQRT2;
    const cx=x('cx',.5),cy=y('cy',.5),radius=positionAttribute(attr('r'),distance/2,0,distance);
    points=[cx,cy,cx+radius,cy];
  }else points=[x('x1',0),y('y1',0),x('x2',1),y('y2',0)];
  const transform=matrix(attr('gradientTransform'));
  function map(coords){
    const [x,y]=apply(transform,coords);
    return absolute?[(x-o.x)/o.w,(y-o.y)/o.h]:[x,y];
  }
  const [x1,y1]=map(points.slice(0,2)),[x2,y2]=map(points.slice(2));
  o[kind+'Vector']={x1:limit(x1,-2,3),y1:limit(y1,-2,3),x2:limit(x2,-2,3),y2:limit(y2,-2,3)};
  o[kind+'Mode']=radial?'radial':'linear';
  const spread=attr('spreadMethod');
  if(['repeat','reflect'].includes(spread))o[kind+'Spread']=spread;
}

function paint(o,kind,value,parsed,resolveColor,viewport){
  const reference=/^url\(\s*['"]?#([-.\w:]+)['"]?\s*\)$/i.exec(value);
  if(!reference){o[kind]=resolveColor(value);return;}
  let node=parsed.getElementById(reference[1]);
  if(!node)throw error('відсутній градієнт у файлі.');
  const chain=[];
  while(node&&chain.length<8&&!chain.includes(node)){
    chain.push(node);
    const href=node.getAttribute('href')??node.getAttributeNS('http://www.w3.org/1999/xlink','href');
    if(!href?.startsWith('#'))break;
    node=parsed.getElementById(href.slice(1));
  }
  gradientDefinition(chain,o,kind,viewport);
  const stopNodes=chain.map(item=>[...item.children].filter(child=>child.localName==='stop')).find(list=>list.length)??[];
  const stops=stopNodes.slice(0,24).map(stop=>{
    const offset=stop.getAttribute('offset')??'0',style=properties(stop);
    const color=resolveColor(style['stop-color']??'#000000');
    return {offset:alpha(offset,0),color:color==='none'?'#000000':color,opacity:color==='none'?0:alpha(style['stop-opacity'])};
  });
  if(!stops.length)throw error('у градієнті немає опорних точок.');
  if(stops.length===1)stops.push({offset:1,color:stops[0].color});
  o[kind]=stops[0].color;
  o[kind+'2']=stops.at(-1).color;
  o[kind+'Stops']=stops;
}

function textShape(node,style,x,y){
  if([...node.children].some(child=>child.localName!=='tspan'))throw error('непідтримувана структура тексту.');
  const text=(node.textContent??'').trim().slice(0,4000);
  if(!text)return null;
  const size=limit(numeric(style['font-size'],16),1,960);
  const fontFamily=style['font-family']?.split(',')[0].trim().replace(/^['"]|['"]$/g,'');
  const anchor=style['text-anchor']==='middle'?'middle':style['text-anchor']==='end'?'end':'start';
  const width=Math.max(size,text.length*size*.61);
  return shape('text',x-(anchor==='middle'?width/2:anchor==='end'?width:0),y-size*.82,width,size,{
    text,fontSize:size,fontFamily:Object.hasOwn(FONT_FAMILIES,fontFamily)?fontFamily:'Arial',
    fontWeight:/^(bold|[6-9]00)$/.test(style['font-weight'])?'bold':'normal',
    fontStyle:style['font-style']==='italic'?'italic':'normal',
    textDecoration:/^(underline|line-through)$/.test(style['text-decoration'])?style['text-decoration']:'none',
    textAlign:anchor,letterSpacing:limit(numeric(style['letter-spacing'],0)||0,-30,200)
  });
}

function geometry(node,style){
  const attr=(key,fallback)=>numeric(node.getAttribute(key),fallback);
  const x=attr('x'),y=attr('y'),w=attr('width'),h=attr('height'),cx=attr('cx'),cy=attr('cy');
  switch(node.localName){
    case 'rect':{
      if(w<=0||h<=0)return null;
      const rx=limit(attr('rx',attr('ry')),0,w/2),ry=limit(attr('ry',rx),0,h/2);
      if(!rx||!ry)return shape('rect',x,y,w,h);
      const bounds=pathPoints('M'+(x+rx)+' '+y+'H'+(x+w-rx)+'A'+rx+' '+ry+' 0 0 1 '+(x+w)+' '+(y+ry)
        +'V'+(y+h-ry)+'A'+rx+' '+ry+' 0 0 1 '+(x+w-rx)+' '+(y+h)+'H'+(x+rx)
        +'A'+rx+' '+ry+' 0 0 1 '+x+' '+(y+h-ry)+'V'+(y+ry)+'A'+rx+' '+ry+' 0 0 1 '+(x+rx)+' '+y+'Z');
      return pointShape('curve',bounds.points,bounds.closed);
    }
    case 'circle': case 'ellipse':{
      const rx=attr('rx',attr('r')),ry=attr('ry',attr('r'));
      return rx>0&&ry>0?shape('ellipse',cx-rx,cy-ry,rx*2,ry*2):null;
    }
    case 'line':return pointShape('line',[[attr('x1'),attr('y1')],[attr('x2'),attr('y2')]]);
    case 'polygon':case 'polyline':{
      const coords=finiteList(node.getAttribute('points')),points=[];
      if(coords.length%2)throw error('неповні координати багатокутника.');
      for(let i=0;i<coords.length;i+=2)points.push(coords.slice(i,i+2));
      const o=pointShape(node.localName==='polyline'?'line':'polygon',points);
      o.fillOpen=node.localName==='polyline';
      return o;
    }
    case 'path':{
      const {points,closed}=pathPoints(node.getAttribute('d')??'');
      const o=pointShape('curve',points,closed);
      o.fillOpen=!closed;
      return o;
    }
    case 'text':return textShape(node,style,x,y);
  }
}

function transformGeometry(o,[a,b,c,d,e,f]){
  const sx=Math.hypot(a,b),sy=Math.hypot(c,d);
  if(!sx||!sy)return false;
  const dot=(a*c+b*d)/(sx*sy);
  if(Math.abs(dot)>.0001)throw error('перекошені об’єкти поки не підтримуються.');
  const [x,y]=apply([a,b,c,d,e,f],[o.x+o.w/2,o.y+o.h/2]);
  o.angle=Math.atan2(b,a)*180/Math.PI;
  o.flipY=a*d-b*c<0;
  o.w=Math.max(1,o.w*sx);o.h=Math.max(1,o.h*sy);o.x=x-o.w/2;o.y=y-o.h/2;
  o.strokeWidth=limit(o.strokeWidth*Math.sqrt(sx*sy),0,50);
  if(o.fontSize!=null){o.fontSize=limit(o.fontSize*sy,1,960);o.letterSpacing=limit(o.letterSpacing*sx,-30,200);}
  return true;
}

export function readStandaloneSvg(parsed){
  const root=parsed.documentElement;
  if(root.localName!=='svg'||root.namespaceURI&&root.namespaceURI!==svgNS)throw error('файл не містить зображення SVG.');
  const box=finiteList(root.getAttribute('viewBox'));
  const [left,top,width,height]=box.length===4?box:[0,0,numeric(root.getAttribute('width'),960),numeric(root.getAttribute('height'),640)];
  if(!(width>0&&height>0))throw error('некоректні розміри зображення.');
  const scale=Math.min(2400/Math.max(width,height),Math.max(1,160/Math.min(width,height)));
  const doc={...blank(),width:limit(Math.round(width*scale),160,2400),height:limit(Math.round(height*scale),160,2400),transparent:true};
  const view=[scale,0,0,scale,(doc.width-width*scale)/2-left*scale,(doc.height-height*scale)/2-top*scale];
  let context;
  function resolveColor(value){
    if(value==='none'||value==='transparent')return 'none';
    if(/^#[a-f0-9]{6}$/i.test(value))return value;
    if(/^#[a-f0-9]{3}$/i.test(value))return '#'+[...value.slice(1)].map(char=>char+char).join('');
    if(!CSS.supports('color',value)||value==='currentColor')throw error('невідомий колір об’єкта.');
    context??=document.createElement('canvas').getContext('2d');
    context.fillStyle=value;
    if(/^#[a-f0-9]{6}$/i.test(context.fillStyle))return context.fillStyle;
    const [r,g,b]=finiteList(context.fillStyle);
    if(![r,g,b].every(Number.isFinite))throw error('непідтримувана палітра кольорів.');
    return '#'+[r,g,b].map(n=>limit(Math.round(n),0,255).toString(16).padStart(2,'0')).join('');
  }
  function walk(node,inherited,outer,opacity,depth){
    if(depth>48)throw error('забагато вкладених груп.');
    if(ignored.has(node.localName)||node.namespaceURI&&node.namespaceURI!==svgNS)return;
    const style={...inherited,...properties(node)};
    if(style.display==='none')return;
    if(['filter','mask','clip-path'].some(key=>style[key]&&style[key]!=='none'))throw error('фільтри та маски стороннього SVG поки не підтримуються.');
    opacity*=alpha(style.opacity);delete style.opacity;
    const transform=multiply(outer,matrix(node.getAttribute('transform')));
    if(node.localName==='svg'||node.localName==='g'){
      for(const child of node.children)walk(child,style,transform,opacity,depth+1);
      return;
    }
    if(style.visibility==='hidden')return;
    if(!supported.has(node.localName))throw error('непідтримуваний елемент '+node.localName+'.');
    if(doc.objects.length===LIMIT)throw error('зображення має більше ніж '+LIMIT+' об’єктів.');
    const o=geometry(node,style);
    if(!o)return;
    const fill=style.fill??'#000000',stroke=style.stroke??'none',currentColor=style.color??'#000000';
    const viewport=[left,top,width,height];
    paint(o,'fill',fill==='currentColor'?currentColor:fill,parsed,resolveColor,viewport);
    paint(o,'stroke',stroke==='currentColor'?currentColor:stroke,parsed,resolveColor,viewport);
    o.layer=DEFAULT_LAYER;
    o.opacity=opacity;
    o.fillOpacity=alpha(style['fill-opacity']);
    o.strokeOpacity=alpha(style['stroke-opacity']);
    o.strokeWidth=limit(numeric(style['stroke-width'],1),0,50);
    o.strokeCap=['butt','round','square'].includes(style['stroke-linecap'])?style['stroke-linecap']:'butt';
    o.strokeJoin=['miter','round','bevel'].includes(style['stroke-linejoin'])?style['stroke-linejoin']:'miter';
    const dash=finiteList(style['stroke-dasharray']);
    if(dash.length>1)o.strokeDash=dash.length>=4?'dash-dot':dash[0]<1.5*o.strokeWidth?'dot':'dash';
    if(transformGeometry(o,transform))doc.objects.push(o);
  }
  walk(root,{},view,1,0);
  if(!doc.objects.length)throw error('немає фігур або тексту для редагування.');
  return validate(doc);
}
