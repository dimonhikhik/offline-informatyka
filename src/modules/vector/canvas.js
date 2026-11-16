import { contour,hasNodes,insertNode,moveNode } from './nodes.js';
import { bounds,clone,shape,localPoint,paintVector,LIMIT } from './model.js';
import { svg } from './svg.js';

const penTools=new Set(['polyline','bezier','polygon-pen']);
const freeTools=new Set(['pencil','calligraphy']);
const drawable=new Set(['rect','ellipse','line','polygon','curve','text']);
const pathLimit=193;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const towards=(a,b,value)=>({x:a.x+(b.x-a.x)*value,y:a.y+(b.y-a.y)*value});
const reflected=(a,b)=>({x:2*a.x-b.x,y:2*a.y-b.y});
function strokeColor(style){
  const color=style.stroke==='none'?style.fill:style.stroke;
  return !color||color==='none'?'#28354b':color;
}

function frame(o,points){
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  o.x=Math.min(...xs);o.y=Math.min(...ys);
  o.w=Math.max(1,Math.max(...xs)-o.x);o.h=Math.max(1,Math.max(...ys)-o.y);
  o.points=points.map(p=>[(p.x-o.x)/o.w,(p.y-o.y)/o.h]);
  return o;
}

function simplify(points,tolerance){
  if(points.length<=2)return points;
  const chosen=new Set([0,points.length-1]),queue=[[0,points.length-1]];
  while(queue.length){
    const [start,end]=queue.pop(),a=points[start],b=points[end];
    const dx=b.x-a.x,dy=b.y-a.y,size=dx*dx+dy*dy||1;
    let best=start,farthest=tolerance;
    for(let i=start+1;i<end;i++){
      const p=points[i],t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/size));
      const gap=distance(p,towards(a,b,t));
      if(gap>farthest){farthest=gap;best=i;}
    }
    if(best!==start){chosen.add(best);queue.push([start,best],[best,end]);}
  }
  return points.filter((_,i)=>chosen.has(i));
}

function calligraphyOutline(points,width){
  const left=[],right=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    const angle=Math.atan2(next.y-previous.y,next.x-previous.x);
    const nib=.25+.75*Math.abs(Math.sin(angle-Math.PI/6));
    const radius=width/2*nib*(p.pressure? .4+1.2*p.pressure : 1);
    const dx=-Math.sin(angle)*radius,dy=Math.cos(angle)*radius;
    left.push({x:p.x+dx,y:p.y+dy});
    right.push({x:p.x-dx,y:p.y-dy});
  }
  return [...left,...right.reverse()];
}

function cubicPoints(nodes,closed){
  const points=[nodes[0].point],count=nodes.length-(closed?0:1);
  for(let i=0;i<count;i++){
    const a=nodes[i],b=nodes[(i+1)%nodes.length];
    points.push(a.control??towards(a.point,b.point,1/3),b.control?reflected(b.point,b.control):towards(a.point,b.point,2/3),b.point);
  }
  return points;
}

function pathData(points){
  let d='M'+points[0].x+' '+points[0].y;
  for(let i=1;i<points.length;i+=3)d+=' C'+points.slice(i,i+3).map(p=>p.x+' '+p.y).join(' ');
  return d;
}

function insidePolygon(point,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

export function bindCanvas(canvas,viewport,api){
  let gesture,path,preview,lastTouch,lastTouchActivation;
  function point(e){
    const matrix=canvas.getScreenCTM();
    return matrix?new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()):{x:0,y:0};
  }
  function paintPreview(){
    preview?.remove();
    preview=undefined;
    if(!path&&!['free','area'].includes(gesture?.mode))return;
    const group=svg('g',{'pointer-events':'none','data-vector-preview':''});
    const unit=1/api.zoom();
    const marks={fill:'none',stroke:'#6953dc','stroke-width':1.8*unit,'stroke-dasharray':6*unit+' '+4*unit};
    const coords=points=>points.map(p=>p.x+','+p.y).join(' ');
    if(path){
      const nodes=gesture?.mode==='pen'?[...path.nodes,gesture.node]:path.nodes;
      const last=nodes.at(-1);
      if(nodes.length>1){
        if(path.tool==='bezier')group.append(svg('path',{...marks,d:pathData(cubicPoints(nodes,false))}));
        else group.append(svg('polyline',{...marks,points:coords(nodes.map(n=>n.point))}));
      }
      if(last&&path.hover&&!gesture)group.append(svg('line',{...marks,x1:last.point.x,y1:last.point.y,x2:path.hover.x,y2:path.hover.y}));
      for(const [i,node] of nodes.entries()){
        const p=node.point;
        group.append(svg('circle',{cx:p.x,cy:p.y,r:(i===0?7:4)*unit,fill:i===0?'#d7f89a':'#fff',stroke:'#6953dc','stroke-width':1.5*unit}));
        if(node===gesture?.node&&node.control){
          const c=node.control,m=reflected(p,c);
          group.append(svg('line',{...marks,x1:c.x,y1:c.y,x2:m.x,y2:m.y}));
          for(const t of [c,m])group.append(svg('circle',{cx:t.x,cy:t.y,r:4*unit,fill:'#f6cb69'}));
        }
      }
    }
    if(gesture?.mode==='free'){
      const g=gesture,width=Number(g.style.strokeWidth)||3;
      const color=strokeColor(g.style);
      if(g.tool==='calligraphy'&&g.samples.length>1)group.append(svg('polygon',{points:coords(calligraphyOutline(g.samples,width)),fill:color,opacity:g.style.opacity}));
      else if(g.samples.length>1)group.append(svg('polyline',{points:coords(g.samples),fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round',opacity:g.style.opacity}));
    }
    if(gesture?.mode==='area'&&gesture.end){
      const g=gesture;
      const style={...marks,fill:'#6953dc','fill-opacity':.11};
      if(g.lasso)group.append(svg('polygon',{...style,points:coords(g.samples)}));
      else group.append(svg('rect',{...style,x:Math.min(g.start.x,g.end.x),y:Math.min(g.start.y,g.end.y),width:Math.abs(g.end.x-g.start.x),height:Math.abs(g.end.y-g.start.y)}));
    }
    if(group.childNodes.length){canvas.append(group);preview=group;}else preview=undefined;
  }
  function pathChanged(){
    api.pathChanged?.(path?.nodes.length??0);
    paintPreview();
  }
  function clearGesture(restore=true){
    const g=gesture;
    if(!g)return;
    gesture=undefined;
    if(restore&&g.before){api.restore(g.before);api.render();}
    if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);
  }
  function cancel(){
    clearGesture();
    path=undefined;lastTouch=undefined;
    pathChanged();
  }
  function pointerCancel(e){
    if(gesture?.id!==e.pointerId)return;
    clearGesture();
    paintPreview();
  }
  function begin(e,data){
    gesture={id:e.pointerId,...data};
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function canDraw(){
    if(api.canDraw?.()===false)return false;
    if(api.doc().objects.length<LIMIT)return true;
    api.notify('На полотні може бути до 300 об’єктів.');
    return false;
  }
  function addObject(o,before=clone(api.doc()),switchTool=false){
    api.doc().objects.push(o);
    api.select(o.id);
    if(switchTool)api.setTool('select');
    api.commit(before);
    api.render();
    if(api.doc().objects.some(item=>item.id===o.id))api.objectAdded?.(o.id);
  }
  function finishPath(close=false){
    if(!path||gesture?.mode==='pen')return false;
    const closed=close||path.tool==='polygon-pen';
    const count=path.nodes.length;
    const needed=closed&&path.tool!=='bezier'?3:2;
    if(count<needed){
      api.notify('Додай ще '+(needed-count)+' вузол, щоб завершити контур.');
      return false;
    }
    if(!canDraw())return false;
    const style=api.style(),type=path.tool==='bezier'?'curve':closed?'polygon':'line';
    const points=type==='curve'?cubicPoints(path.nodes,closed):path.nodes.map(n=>n.point);
    if(points.length>pathLimit){
      api.notify('Досягнуто межу кількості вузлів контуру.');
      return false;
    }
    const o=frame(shape(type,0,0,1,1,style),points);
    if(type==='curve'){
      o.closed=closed;o.nodeTypes=path.nodes.map(node=>node.control?'symmetric':'corner');
    }
    path=undefined;pathChanged();
    addObject(o);
    return true;
  }
  function penDown(e,p,tool){
    if(!canDraw())return;
    if(path?.nodes.length>=(tool==='bezier'?2:3)&&distance(p,path.nodes[0].point)<12/api.zoom()){
      finishPath(true);e.preventDefault();return;
    }
    path??={tool,nodes:[]};
    const max=tool==='bezier'?64:pathLimit;
    if(path.nodes.length>=max){api.notify('Заверши контур, щоб додати наступний.');return;}
    path.hover=undefined;
    canvas.focus({preventScroll:true});
    begin(e,{mode:'pen',node:{point:p}});
    paintPreview();
  }
  function sampled(g,e){
    const p=point(e),last=g.samples.at(-1);
    if(distance(p,last)<2/api.zoom())return;
    g.samples.push({x:p.x,y:p.y,pressure:e.pointerType==='pen'?e.pressure:0});
    if(g.samples.length>=1200)g.samples=simplify(g.samples,2/api.zoom());
    if(g.samples.length>=1200)g.samples=g.samples.filter((_,i)=>i%2===0);
  }
  function down(e){
    if(e.button!==0||gesture||api.blocked())return;
    const p=point(e),doc=api.doc(),tool=api.tool(),adding=Boolean(e.shiftKey||api.multiSelect?.());
    if(tool==='hand'){
      begin(e,{mode:'pan',client:[e.clientX,e.clientY],scroll:[viewport.scrollLeft,viewport.scrollTop]});
      return;
    }
    if(penTools.has(tool)){penDown(e,p,tool);return;}
    if(freeTools.has(tool)){
      if(!canDraw())return;
      begin(e,{mode:'free',tool,style:api.style(),samples:[{x:p.x,y:p.y,pressure:e.pointerType==='pen'?e.pressure:0}]});
      return;
    }
    const handle=e.target.closest('[data-handle]'),target=e.target.closest('[data-id]');
    const item=target?doc.objects.find(o=>o.id===target.getAttribute('data-id')):undefined;
    if(tool==='select-area'||tool==='lasso'||tool==='select'&&!item&&!handle){
      begin(e,{mode:'area',add:adding,lasso:tool==='lasso',start:p,samples:[p]});
      return;
    }
    if(tool==='add-node'){
      const [hit]=api.selected();
      if(!hasNodes(hit)){api.notify('Вибери фігуру та натисни на її контур.');return;}
      const before=clone(doc);
      try{
        const node=insertNode(hit,p,20/api.zoom());
        if(api.commit(before)){api.setNode(node);api.setTool('nodes');}
        api.render();
      }catch(error){api.restore(before);api.render();api.notify(error.message);}
      e.preventDefault();return;
    }
    if(['select','nodes','gradient'].includes(tool)){
      if(handle){
        const chosen=api.selected(),mode=handle.getAttribute('data-handle');
        if(chosen.length!==1)return;
        const node=Number(handle.getAttribute('data-node'));
        if(mode==='node')api.setNode(node,adding);
        begin(e,{mode,node,before:clone(doc),start:p,original:clone(chosen[0]),paint:handle.getAttribute('data-paint'),endpoint:handle.getAttribute('data-endpoint')});
      }else if(item&&!item.locked){
        if(tool==='nodes'){
          api.select(item.id,false,true);
          api.render();e.preventDefault();return;
        }
        if(adding||!api.selected().some(o=>o.id===item.id))api.select(item.id,adding);
        if(!api.selected().some(o=>o.id===item.id)){api.render();return;}
        if(tool!=='select'){api.render();e.preventDefault();return;}
        begin(e,{mode:'move',before:clone(doc),start:p,objectId:item.id,originals:clone(api.selected())});
      }else{
        if(!adding)api.select(null);
        api.render();return;
      }
    }else if(drawable.has(tool)){
      if(!canDraw())return;
      const before=clone(doc),o=shape(tool,p.x,p.y,1,1,api.style());
      if(tool==='text'){o.w=240;o.h=48;o.strokeWidth=0;o.stroke='none';}
      doc.objects.push(o);api.select(o.id);
      begin(e,{mode:'draw',before,start:p,objectId:o.id});
    }else return;
    api.render();
  }
  function move(e){
    if(!gesture){
      if(path&&e.pointerType!=='touch'){path.hover=point(e);paintPreview();}
      return;
    }
    if(gesture.id!==e.pointerId)return;
    const g=gesture;
    if(g.mode==='pan'){
      viewport.scrollLeft=g.scroll[0]-(e.clientX-g.client[0]);viewport.scrollTop=g.scroll[1]-(e.clientY-g.client[1]);
      return;
    }
    if(g.mode==='free'){
      const samples=e.getCoalescedEvents?.();
      for(const sample of samples?.length?samples:[e])sampled(g,sample);
      paintPreview();e.preventDefault();return;
    }
    const p=point(e);
    if(g.mode==='pen'){
      if(path.tool==='bezier'&&distance(p,g.node.point)>3/api.zoom())g.node.control=p;
      paintPreview();e.preventDefault();return;
    }
    if(g.mode==='area'){
      if(!g.end&&distance(p,g.start)<5/api.zoom())return;
      g.end=p;
      if(g.lasso&&distance(p,g.samples.at(-1))>3/api.zoom())g.samples.push(p);
      paintPreview();e.preventDefault();return;
    }
    const dx=p.x-g.start.x,dy=p.y-g.start.y,doc=api.doc();
    if(g.mode==='draw'){
      const o=doc.objects.find(o=>o.id===g.objectId);
      let width=dx,height=dy;
      if(e.shiftKey&&o.type==='line'){
        const length=Math.hypot(dx,dy),step=Math.PI/4,angle=Math.round(Math.atan2(dy,dx)/step)*step;
        width=Math.cos(angle)*length;height=Math.sin(angle)*length;
      }else if(e.shiftKey&&['rect','ellipse','polygon'].includes(o.type)){
        const size=Math.max(Math.abs(dx),Math.abs(dy));
        width=Math.sign(dx||1)*size;height=Math.sign(dy||1)*size;
      }
      o.x=Math.min(g.start.x,g.start.x+width);o.y=Math.min(g.start.y,g.start.y+height);
      o.w=Math.max(1,Math.abs(width));o.h=Math.max(1,Math.abs(height));
      if(o.type==='line')o.points=[
        [(g.start.x-o.x)/o.w,(g.start.y-o.y)/o.h],
        [(g.start.x+width-o.x)/o.w,(g.start.y+height-o.y)/o.h]
      ];
      if(o.type==='text'&&Math.abs(width)<5&&Math.abs(height)<5){o.w=240;o.h=48;}
    }
    if(g.mode==='move')for(const original of g.originals){
      const o=doc.objects.find(item=>item.id===original.id);
      o.x=Math.max(-9000,Math.min(9000,original.x+dx));
      o.y=Math.max(-9000,Math.min(9000,original.y+dy));
    }
    if(g.mode==='resize'){
      const o=doc.objects.find(item=>item.id===g.original.id),a=g.original,r=a.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
      const q=localPoint(a,p),start=localPoint(a,g.start),fx=a.flipX?-1:1,fy=a.flipY?-1:1;
      const nextWidth=a.w+q.x-start.x,nextHeight=a.h+q.y-start.y;
      if(e.shiftKey){
        const ratio=Math.max(nextWidth/a.w,nextHeight/a.h);
        o.w=Math.max(5,Math.min(5000,a.w*ratio));o.h=Math.max(5,Math.min(5000,a.h*ratio));
      }else{o.w=Math.max(5,Math.min(5000,nextWidth));o.h=Math.max(5,Math.min(5000,nextHeight));}
      const dw=o.w-a.w,dh=o.h-a.h;
      o.x=a.x+((c*fx-1)*dw-s*fy*dh)/2;o.y=a.y+(s*fx*dw+(c*fy-1)*dh)/2;
    }
    if(g.mode==='node'){
      if(!g.nodeStart){
        if(distance(g.start,p)<3/api.zoom())return;
        const original=contour({...g.original});
        const [x,y]=original.points[g.node];
        const start=localPoint(original,g.start);
        g.nodeStart={x:x*original.w-start.x,y:y*original.h-start.y};
      }
      const o=doc.objects.find(item=>item.id===g.original.id);
      const local=localPoint(o,p);
      moveNode(contour(o),g.node,{x:local.x+g.nodeStart.x,y:local.y+g.nodeStart.y});
    }
    if(g.mode==='rotate'){
      const o=doc.objects.find(item=>item.id===g.original.id),cx=o.x+o.w/2,cy=o.y+o.h/2;
      const start=Math.atan2(g.start.y-cy,g.start.x-cx),next=Math.atan2(p.y-cy,p.x-cx);
      const angle=g.original.angle+(next-start)*180/Math.PI;
      o.angle=((e.shiftKey?Math.round(angle/15)*15:angle)%360+540)%360-180;
    }
    if(g.mode==='gradient'&&['fill','stroke'].includes(g.paint)&&['1','2'].includes(g.endpoint)){
      const o=doc.objects.find(item=>item.id===g.original.id),q=localPoint(o,p),key=g.paint+'Vector';
      const vector={...paintVector(o,g.paint)};
      vector['x'+g.endpoint]=Math.max(-2,Math.min(3,q.x/o.w));
      vector['y'+g.endpoint]=Math.max(-2,Math.min(3,q.y/o.h));o[key]=vector;
    }
    api.render(false);e.preventDefault();
  }
  function finishFree(g,e){
    sampled(g,e);
    const calligraphy=g.tool==='calligraphy',max=calligraphy?Math.floor(pathLimit/2):pathLimit;
    const style=g.style,width=Number(style.strokeWidth)||3,color=strokeColor(style);
    const solid={fill:color,stroke:'none',strokeWidth:0,gradient:false,fillMode:'solid',strokeMode:'solid'};
    if(g.samples.length<2){
      const p=g.samples[0],size=Math.max(1,width);
      addObject(shape('ellipse',p.x-size/2,p.y-size/2,size,size,{...style,...solid}));
      return;
    }
    if(calligraphy){
      const samples=g.samples.length>max?Array.from({length:max},(_,i)=>g.samples[Math.round(i*(g.samples.length-1)/(max-1))]):g.samples;
      addObject(frame(shape('polygon',0,0,1,1,{...style,...solid}),calligraphyOutline(samples,Math.max(4,width))));
      return;
    }
    let tolerance=.8/api.zoom(),points=simplify(g.samples,tolerance);
    while(points.length>max){tolerance*=1.5;points=simplify(g.samples,tolerance);}
    if(style.stroke==='none'||!style.strokeWidth)Object.assign(style,{stroke:color,strokeWidth:width,strokeMode:'solid'});
    addObject(frame(shape('line',0,0,1,1,style),points));
  }
  function finishArea(g){
    if(!g.end||g.lasso&&g.samples.length<3){
      if(!g.add){api.select(null);api.render();}
      return;
    }
    const left=Math.min(g.start.x,g.end.x),right=Math.max(g.start.x,g.end.x);
    const top=Math.min(g.start.y,g.end.y),bottom=Math.max(g.start.y,g.end.y);
    const ids=api.doc().objects.filter(o=>{
      if(o.hidden||o.locked)return false;
      const b=bounds(o);
      if(!g.lasso)return b.x<=right&&b.x+b.w>=left&&b.y<=bottom&&b.y+b.h>=top;
      return insidePolygon({x:b.x+b.w/2,y:b.y+b.h/2},g.samples);
    }).map(o=>o.id);
    api.selectArea?.(ids,g.add);
    api.render();
  }
  function activateByTouch(g,e){
    if(e.pointerType!=='touch'||g.mode!=='move'||!api.objectActivated)return;
    if(distance(g.start,point(e))>=5/api.zoom()){lastTouch=undefined;return;}
    if(lastTouch?.id===g.objectId&&e.timeStamp-lastTouch.at<420&&distance(lastTouch.point,g.start)<12/api.zoom()){
      lastTouch=undefined;
      lastTouchActivation={id:g.objectId,at:e.timeStamp};
      api.objectActivated(g.objectId);
    }else lastTouch={id:g.objectId,at:e.timeStamp,point:g.start};
  }
  function up(e){
    if(!gesture||gesture.id!==e.pointerId)return;
    const g=gesture;
    if(!['pan','free','pen'].includes(g.mode))move(e);
    clearGesture(false);
    if(g.mode==='pan')return;
    if(g.mode==='free'){finishFree(g,e);paintPreview();return;}
    if(g.mode==='area'){finishArea(g);paintPreview();return;}
    if(g.mode==='pen'){
      const previous=path.nodes.at(-1);
      if(previous&&distance(previous.point,g.node.point)<5/api.zoom()){
        if(path.nodes.length>1&&e.timeStamp-path.lastTap<450)finishPath();
      }else path.nodes.push(g.node);
      if(path)path.lastTap=e.timeStamp;
      pathChanged();
      return;
    }
    if(g.mode==='draw'){
      const o=api.doc().objects.find(o=>o.id===g.objectId);
      if(o.w<5&&o.h<5){
        o.w=160;o.h=o.type==='line'?1:110;
        if(o.type==='line')o.points=[[0,0],[1,0]];
      }
      api.setTool('select');
    }
    api.commit(g.before);api.render();
    if(g.mode==='draw'&&api.doc().objects.some(o=>o.id===g.objectId))api.objectAdded?.(g.objectId);
    activateByTouch(g,e);
  }
  function finishByClick(e){
    if(path&&penTools.has(api.tool())){e.preventDefault();finishPath();return;}
    if(api.tool()!=='select'||!api.objectActivated)return;
    const id=e.target.closest('[data-id]')?.getAttribute('data-id');
    if(id&&(lastTouchActivation?.id!==id||e.timeStamp-lastTouchActivation.at>420))api.objectActivated(id);
  }
  function finishByKey(e){
    if(e.key==='Enter'&&path){e.preventDefault();finishPath();}
  }
  const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:pointerCancel,lostpointercapture:pointerCancel,dblclick:finishByClick,keydown:finishByKey};
  for(const [event,callback] of Object.entries(listeners))canvas.addEventListener(event,callback);
  return {
    cancel,finishPath,hasPath:()=>Boolean(path?.nodes.length),active:()=>Boolean(gesture||path?.nodes.length),
    dispose(){
      cancel();
      for(const [event,callback] of Object.entries(listeners))canvas.removeEventListener(event,callback);
    }
  };
}
