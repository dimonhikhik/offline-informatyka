import { clone,localPoint,uid } from './model.js';
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const pointLimit=193;
const nodeTypes=new Set(['corner','smooth','symmetric']);
export const hasNodes=object=>['rect','ellipse','polygon','line','curve'].includes(object?.type);
const clampPoint=n=>Math.max(-2,Math.min(3,n));
const curveSegments=o=>(o.points.length-1)/3;
const typeAt=(o,index)=>o.nodeTypes?.[o.closed&&index===o.points.length-1?0:index/3]??'corner';
const typesOf=o=>Array.from({length:curveSegments(o)+(o.closed?0:1)},(_,i)=>typeAt(o,i*3));
function straightSegment(a,b){return [mix(a,b,1/3),mix(a,b,2/3),b];}

function reduceAnchors(o,maximum,keepIndex){
  const points=o.points;
  if(points.length<=maximum)return points.map((_,index)=>index);
  const kept=new Set([0,points.length-1]);
  if(keepIndex!=null)kept.add(keepIndex);
  while(kept.size<maximum){
    const ordered=[...kept].sort((a,b)=>a-b);
    let next,farthest=-1;
    for(let i=1;i<ordered.length;i++){
      const first=ordered[i-1],last=ordered[i],a=points[first],b=points[last];
      const dx=(b[0]-a[0])*o.w,dy=(b[1]-a[1])*o.h,size=dx*dx+dy*dy||1;
      for(let index=first+1;index<last;index++){
        const p=points[index],x=(p[0]-a[0])*o.w,y=(p[1]-a[1])*o.h;
        const t=Math.max(0,Math.min(1,(x*dx+y*dy)/size));
        const error=(x-t*dx)**2+(y-t*dy)**2;
        if(error>farthest){next=index;farthest=error;}
      }
    }
    kept.add(next);
  }
  return [...kept].sort((a,b)=>a-b);
}

function convertPolyline(o,keepIndex){
  const closed=o.type==='polygon';
  const indices=reduceAnchors(o,Math.floor((pointLimit-1)/3)+(closed?0:1),keepIndex);
  const points=indices.map(index=>o.points[index]),segments=points.length-(closed?0:1),cubic=[points[0]];
  for(let i=0;i<segments;i++)cubic.push(...straightSegment(points[i],points[(i+1)%points.length]));
  o.type='curve';o.closed=closed;o.points=cubic;
  return indices.indexOf(keepIndex)*3;
}

export function contour(o,asBezier=false){
  if(!hasNodes(o))throw new Error('Перетворити на контур можна геометричну фігуру або лінію.');
  if(o.type==='rect'){o.type='polygon';o.points=[[0,0],[1,0],[1,1],[0,1]];}
  if(o.type==='ellipse'){
    const k=.5522847498307936/2;
    o.type='curve';o.closed=true;
    o.points=[[1,.5],[1,.5+k],[.5+k,1],[.5,1],[.5-k,1],[0,.5+k],[0,.5],[0,.5-k],[.5-k,0],[.5,0],[.5+k,0],[1,.5-k],[1,.5]];
    o.nodeTypes=['smooth','smooth','smooth','smooth'];
  }
  if(asBezier&&['line','polygon'].includes(o.type))convertPolyline(o);
  return o;
}
function anchor(o,index){
  if(!Number.isInteger(index)||!o.points[index]||o.type==='curve'&&index%3!==0)throw new Error('Вибери вузол контуру.');
  if(o.type==='curve')return o.closed&&index===o.points.length-1?0:index;
  if(!['line','polygon'].includes(o.type))throw new Error('Спочатку перетвори фігуру на контур.');
  return convertPolyline(o,index);
}

function handles(o,index){
  const last=o.points.length-1;
  if(o.closed&&index===last)index=0;
  return [index>0?index-1:o.closed?last-1:null,index<last?index+1:null];
}

function alignHandles(o,index,driven,type,opposite){
  if(opposite==null||type==='corner')return;
  const a=o.points[index],p=o.points[driven],q=o.points[opposite];
  const dx=p[0]-a[0],dy=p[1]-a[1],length=Math.hypot(dx*o.w,dy*o.h);
  if(!length)return;
  const relative=type==='symmetric'?1:Math.hypot((q[0]-a[0])*o.w,(q[1]-a[1])*o.h)/length;
  o.points[opposite]=[clampPoint(a[0]-dx*relative),clampPoint(a[1]-dy*relative)];
}

export function setNodeType(o,index,type){
  if(!nodeTypes.has(type))throw new Error('Вибери тип вузла.');
  index=anchor(o,index);
  const types=typesOf(o);
  types[index/3]=type;o.nodeTypes=types;
  const [incoming,outgoing]=handles(o,index);
  if(incoming!=null&&outgoing!=null){
    const a=o.points[index],p=o.points[outgoing];
    if(p[0]!==a[0]||p[1]!==a[1])alignHandles(o,index,outgoing,type,incoming);
    else alignHandles(o,index,incoming,type,outgoing);
  }
  return index;
}

export function setSegmentType(o,index,curved){
  index=anchor(o,index);
  const last=o.points.length-1;
  const start=index===last?last-3:index,end=start+3;
  const a=o.points[start],b=o.points[end];
  let [p,q]=straightSegment(a,b);
  if(curved){
    const onLine=control=>Math.abs((b[0]-a[0])*(control[1]-a[1])-(b[1]-a[1])*(control[0]-a[0]))<1e-6;
    if(!onLine(o.points[start+1])||!onLine(o.points[start+2]))return index;
    const dx=(b[0]-a[0])*o.w,dy=(b[1]-a[1])*o.h;
    const offset=[-dy*.24/o.w,dx*.24/o.h];
    [p,q]=[p,q].map(([x,y])=>[clampPoint(x+offset[0]),clampPoint(y+offset[1])]);
  }
  o.points[start+1]=p;o.points[start+2]=q;
  const types=typesOf(o);
  types[start/3]='corner';
  types[o.closed&&end===last?0:end/3]='corner';
  o.nodeTypes=types;
  return index;
}

function split(p,t){const a=mix(p[0],p[1],t),b=mix(p[1],p[2],t),c=mix(p[2],p[3],t),d=mix(a,b,t),e=mix(b,c,t);return [p[0],a,d,mix(d,e,t),e,c,p[3]];}
export function insertNode(o,world,tolerance){
  contour(o);const q=localPoint(o,world),pos=[q.x/o.w,q.y/o.h];
  const distance=p=>Math.hypot((p[0]-pos[0])*o.w,(p[1]-pos[1])*o.h);
  const step=o.type==='curve'?3:1,count=o.type==='polygon'?o.points.length:o.points.length-1;
  let best={distance:Infinity};
  for(let i=0;i<count;i+=step){
    const p=o.type==='curve'?o.points.slice(i,i+4):[o.points[i],o.points[(i+1)%o.points.length]];
    let t;
    if(step===1){const dx=(p[1][0]-p[0][0])*o.w,dy=(p[1][1]-p[0][1])*o.h;t=((pos[0]-p[0][0])*o.w*dx+(pos[1]-p[0][1])*o.h*dy)/(dx*dx+dy*dy||1);}
    else{
      let nearest=Infinity,index=0;
      for(let j=0;j<=40;j++){const d=distance(split(p,j/40)[3]);if(d<nearest){nearest=d;index=j;}}
      let left=Math.max(0,(index-1)/40),right=Math.min(1,(index+1)/40);
      for(let j=0;j<18;j++){const a=(2*left+right)/3,b=(left+2*right)/3;if(distance(split(p,a)[3])<distance(split(p,b)[3]))right=b;else left=a;}t=(left+right)/2;
    }
    t=Math.max(.01,Math.min(.99,t));const part=step===3?split(p,t):[p[0],mix(p[0],p[1],t),p[1]],d=distance(part[step===3?3:1]);
    if(d<best.distance)best={distance:d,index:i,part};
  }
  if(best.distance>tolerance)throw new Error('Натисни ближче до контуру фігури — там з’явиться вузол.');
  if(o.points.length+step>pointLimit)throw new Error('Досягнуто межу: 193 точки на контур.');
  if(step===3){
    const types=typesOf(o);types.splice(best.index/3+1,0,'smooth');o.nodeTypes=types;
    o.points.splice(best.index,4,...best.part);
  }else o.points.splice(best.index+1,0,best.part[1]);
  return best.index+step;
}
export function moveNode(o,index,p){
  const old=o.points[index];
  if(!old)return;
  const next=[clampPoint(p.x/o.w),clampPoint(p.y/o.h)],dx=next[0]-old[0],dy=next[1]-old[1];
  o.points[index]=next;
  if(o.type!=='curve')return;
  const last=o.points.length-1;
  if(index%3===0){
    for(const i of handles(o,index))if(i!=null)o.points[i]=[clampPoint(o.points[i][0]+dx),clampPoint(o.points[i][1]+dy)];
    if(o.closed&&(index===0||index===last)){o.points[0]=[...next];o.points[last]=[...next];}
  }else{
    let node=index%3===1?index-1:index+1;
    if(o.closed&&node===last)node=0;
    const [incoming,outgoing]=handles(o,node);
    alignHandles(o,node,index,typeAt(o,node),index===incoming?outgoing:incoming);
  }
}
export function removeNode(o,index){
  if(!Number.isInteger(index)||!o.points[index])throw new Error('Спочатку натисни білий вузол, який хочеш видалити.');
  if(o.type!=='curve'){
    if(o.points.length<=(o.type==='polygon'?3:2))throw new Error('Для цієї фігури потрібні решта вузлів.');o.points.splice(index,1);return;
  }
  if(index%3!==0)throw new Error('Жовта точка керує вигином. Для видалення вибери білий вузол.');
  if(o.closed&&index===o.points.length-1)index=0;
  if(o.points.length<=(o.closed?10:4))throw new Error('Не можна видалити останні необхідні вузли.');
  const last=o.points.length-1;
  const types=typesOf(o);types.splice(index/3,1);o.nodeTypes=types;
  if(index===0){o.points.splice(0,3);if(o.closed)o.points[last-3]=[...o.points[0]];}
  else if(index===last)o.points.splice(last-2,3);
  else o.points.splice(index-1,3);
}

export function splitPath(o,index,atSegment=false){
  index=anchor(o,index);
  const points=o.points,types=typesOf(o),last=points.length-1;
  if(o.closed){
    const start=atSegment?index+3:index;
    o.points=[...points.slice(start),...points.slice(1,index+1)];
    o.nodeTypes=Array.from({length:(o.points.length-1)/3+1},(_,i)=>types[(start/3+i)%types.length]);
    o.closed=false;
    return;
  }
  let end=index,next=index;
  if(atSegment){
    end=index===last?last-3:index;
    next=end+3;
    if(last===3)throw new Error('Щоб розірвати на відрізку, потрібні принаймні два відрізки.');
  }else if(index===0||index===last)throw new Error('Для розриву вибери внутрішній вузол.');
  if(end===0){o.points=points.slice(next);o.nodeTypes=types.slice(next/3);return;}
  o.points=points.slice(0,end+1);o.nodeTypes=types.slice(0,end/3+1);
  if(next<last)return {...clone(o),id:uid(),points:points.slice(next),nodeTypes:types.slice(next/3)};
}

function worldPoint(o,p){
  const cx=o.w/2,cy=o.h/2;
  const dx=(p[0]*o.w-cx)*(o.flipX?-1:1),dy=(p[1]*o.h-cy)*(o.flipY?-1:1);
  const rad=o.angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  return [o.x+cx+c*dx-s*dy,o.y+cy+s*dx+c*dy];
}

function frameCurve(o,points){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  o.x=Math.min(...xs);o.y=Math.min(...ys);
  o.w=Math.max(1,Math.max(...xs)-o.x);o.h=Math.max(1,Math.max(...ys)-o.y);
  o.angle=0;o.flipX=false;o.flipY=false;
  o.points=points.map(([x,y])=>[(x-o.x)/o.w,(y-o.y)/o.h]);
}

function averaged(a,b){return [(a[0]+b[0])/2,(a[1]+b[1])/2];}

function offsetHandle(handle,from,to){
  return [clampPoint(handle[0]+to[0]-from[0]),clampPoint(handle[1]+to[1]-from[1])];
}

export function joinPath(first,firstIndex,second,secondIndex,merge=false){
  if([first,second].some(o=>o.closed||!['line','curve'].includes(o.type)))throw new Error('Для з’єднання потрібні кінці відкритих контурів.');
  const firstLast=first.points.length-1,secondLast=second.points.length-1;
  if(![0,firstLast].includes(firstIndex)||![0,secondLast].includes(secondIndex)||first===second&&firstIndex===secondIndex)throw new Error('Вибери два різні кінцеві вузли.');
  const firstLength=first.type==='curve'?first.points.length:(first.points.length-1)*3+1;
  const secondLength=second.type==='curve'?second.points.length:(second.points.length-1)*3+1;
  const length=first===second?firstLength+(merge?0:3):firstLength+secondLength+(merge?-1:2);
  if(length>pointLimit)throw new Error('З’єднаний контур перевищить межу в 193 точки.');
  if(first===second&&merge&&firstLength<7)throw new Error('Для замикання об’єднанням потрібні принаймні два відрізки.');
  contour(first,true);
  contour(second,true);
  if(first===second){
    const points=first.points,types=typesOf(first),last=points.length-1;
    if(merge){
      const end=averaged(points[0],points[last]);
      points[1]=offsetHandle(points[1],points[0],end);
      points[last-1]=offsetHandle(points[last-1],points[last],end);
      points[0]=end;points[last]=[...end];
      types[0]='corner';types.pop();
    }else{
      points.push(...straightSegment(points[last],points[0]));
      types[0]='corner';types[types.length-1]='corner';
    }
    first.closed=true;first.nodeTypes=types;
    return;
  }
  const pathData=o=>({points:o.points.map(p=>worldPoint(o,p)),types:typesOf(o)});
  const a=pathData(first),b=pathData(second);
  if(firstIndex===0){a.points.reverse();a.types.reverse();}
  if(secondIndex===secondLast){b.points.reverse();b.types.reverse();}
  const endA=a.points.at(-1),startB=b.points[0],extra=[];
  if(merge){
    const mid=averaged(endA,startB);
    for(const [points,index,from] of [[a.points,a.points.length-2,endA],[b.points,1,startB]]){
      points[index]=[points[index][0]+mid[0]-from[0],points[index][1]+mid[1]-from[1]];
    }
    a.points[a.points.length-1]=mid;a.types[a.types.length-1]='corner';
    b.points.shift();b.types.shift();
  }else{
    extra.push(...straightSegment(endA,startB).slice(0,2));
    a.types[a.types.length-1]='corner';b.types[0]='corner';
  }
  frameCurve(first,[...a.points,...extra,...b.points]);
  first.nodeTypes=[...a.types,...b.types];
}
