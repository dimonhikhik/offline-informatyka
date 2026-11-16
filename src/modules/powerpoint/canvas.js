import { el } from '../../components/ui.js';

const width=960,height=540,minSize=20;
const svgNamespace='http://www.w3.org/2000/svg';
const shapePaths={
  triangle:'M50 0 100 100H0Z',
  diamond:'M50 0 100 50 50 100 0 50Z',
  arrow:'M0 30H57V0L100 50 57 100V70H0Z',
  star:'M50 0 64 35 100 38 73 61 82 100 50 78 18 100 27 61 0 38 36 35Z'
};
const labels={
  text:'Текст',image:'Зображення',rect:'Прямокутник',roundRect:'Заокруглений прямокутник',
  ellipse:'Еліпс',triangle:'Трикутник',diamond:'Ромб',arrow:'Стрілка',
  line:'Лінія',star:'Зірка',table:'Таблиця'
};
const vertical={top:'flex-start',middle:'center',bottom:'flex-end'};
const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
const unit=value=>`${value/9.6}cqw`;

export function objectLabel(object,index=-1){
  const label=labels[object?.type]||'Об’єкт';
  if(object?.type==='text'){
    const text=String(object.text??'').trim().replace(/\s+/g,' ');
    if(text)return `${label} «${text.length>36?text.slice(0,36)+'…':text}»`;
  }
  return index<0?label:`${label} ${index+1}`;
}

function position(node,object){
  node.style.left=object.x/9.6+'%';
  node.style.top=object.y/5.4+'%';
  node.style.width=object.w/9.6+'%';
  node.style.height=object.h/5.4+'%';
}

function linkAddress(value){
  try{
    const url=new URL(value);
    return ['https:','http:','mailto:'].includes(url.protocol)?url.href:'';
  }catch{return '';}
}

function textContent(object){
  const text=el('div',{className:'slide-text-content'});
  Object.assign(text.style,{
    color:object.color,fontFamily:object.font||'Arial',
    fontSize:unit(object.size),fontWeight:object.bold?'700':'400',
    fontStyle:object.italic?'italic':'normal',textDecoration:object.underline?'underline':'none',
    textAlign:object.align,display:'flex',flexDirection:'column',justifyContent:vertical[object.valign]||vertical.top,
    width:'100%',height:'100%'
  });
  const value=String(object.text??'');
  const lines=value.split('\n');
  if(object.bullets==='bullet'||object.bullets==='number'){
    const list=el(object.bullets==='bullet'?'ul':'ol',{className:'slide-object-list'},
      ...lines.map(line=>el('li',{},line)));
    Object.assign(list.style,{margin:0,paddingInlineStart:'1.35em'});
    text.append(list);
  }else text.append(el('div',{},value));
  return text;
}

function tableContent(object){
  const table=el('table',{className:'slide-object-table'});
  Object.assign(table.style,{
    width:'100%',height:'100%',borderCollapse:'collapse',tableLayout:'fixed',
    color:object.color,fontFamily:object.font||'Arial',fontSize:unit(object.size),
    fontWeight:object.bold?'700':'400'
  });
  const rows=(object.cells||[]).map((row,rowIndex)=>{
    const header=object.head&&rowIndex===0;
    return el('tr',{},...row.map(value=>{
      const cell=el(header?'th':'td',header?{scope:'col'}:{},value);
      Object.assign(cell.style,{
        backgroundColor:header?object.fill:'#ffffff',border:`${unit(object.strokeWidth??1)} solid ${object.stroke}`,
        padding:'.24em .32em',textAlign:object.align||'left',verticalAlign:'middle',overflowWrap:'anywhere'
      });
      return cell;
    }));
  });
  table.append(el('tbody',{},...rows));
  return table;
}

function svg(name,attrs){
  const node=document.createElementNS(svgNamespace,name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  return node;
}

function shapeContent(object){
  const drawing=svg('svg',{class:'slide-figure',viewBox:'0 0 100 100',preserveAspectRatio:'none',
    width:'100%',height:'100%','aria-hidden':'true'});
  drawing.style.overflow='visible';
  let shape;
  switch(object.type){
    case 'ellipse':shape=svg('ellipse',{cx:50,cy:50,rx:50,ry:50});break;
    case 'line':shape=svg('path',{d:'M0 0 100 100','stroke-linecap':'round'});break;
    case 'roundRect':shape=svg('rect',{width:100,height:100,rx:12,ry:12});break;
    case 'rect':shape=svg('rect',{width:100,height:100});break;
    default:shape=svg('path',{d:shapePaths[object.type]||shapePaths.diamond});
  }
  shape.setAttribute('stroke',object.stroke);
  shape.setAttribute('fill',object.type==='line'?'none':object.fill);
  shape.setAttribute('stroke-linejoin','round');
  shape.setAttribute('vector-effect','non-scaling-stroke');
  shape.style.strokeWidth=unit(object.strokeWidth??1);
  drawing.append(shape);
  return drawing;
}

function objectNode(object,index,{interactive,links}){
  const node=el('div',{
    className:'slide-object'+(object.type==='text'?' slide-text':''),
    'data-object':index
  });
  position(node,object);
  node.style.transform=`rotate(${object.rotation??0}deg)`;
  let content;
  if(object.type==='text')content=textContent(object);
  else if(object.type==='image'){
    content=el('img',{src:object.src,alt:object.alt||'Зображення на слайді',draggable:'false'});
    content.style.objectFit=object.fit==='contain'||object.fit==='cover'?object.fit:'fill';
  }else if(object.type==='table'){
    content=tableContent(object);
    node.style.overflow='hidden';
  }
  else content=shapeContent(object);
  content.style.opacity=clamp(object.opacity??100,0,100)/100;
  const href=links?linkAddress(object.link):'';
  if(href){
    const anchor=el('a',{className:'slide-object-link',href,target:'_blank',rel:'noopener noreferrer'},content);
    if(object.type!=='text')anchor.setAttribute('aria-label',object.alt||objectLabel(object,index));
    Object.assign(anchor.style,{display:'block',width:'100%',height:'100%',color:'inherit'});
    node.append(anchor);
    node.style.touchAction='manipulation';
  }else{
    node.append(content);
    if(!interactive){node.style.pointerEvents='none';node.style.touchAction='auto';}
  }
  return node;
}

function selectionNode(object,index){
  const handle=el('span',{className:'slide-resize','data-resize':'true','aria-hidden':'true'});
  handle.style.pointerEvents='auto';
  const outline=el('div',{className:'slide-object slide-selection is-selected',
    'data-selected-object':index,'aria-hidden':'true'},handle);
  outline.style.pointerEvents='none';
  outline.style.transform=`rotate(${object.rotation??0}deg)`;
  position(outline,object);
  return outline;
}

export function renderSlide(stage,slide,{aspect='wide',selected=-1,interactive=false,links=false}={}){
  stage.dataset.slideAspect=aspect;
  stage.style.aspectRatio=aspect==='standard'?'4 / 3':'16 / 9';
  stage.style.background=slide.background;
  const objects=slide.objects.map((object,index)=>objectNode(object,index,{interactive,links}));
  if(interactive&&slide.objects[selected])objects.push(selectionNode(slide.objects[selected],selected));
  stage.replaceChildren(...objects);
}

function closestGuide(position,size,limit,peers,tolerance){
  let best=null;
  for(const line of peers){
    for(const offset of [0,size/2,size]){
      const snapped=line-offset,distance=Math.abs(snapped-position);
      if(snapped>=0&&snapped<=limit-size&&distance<=tolerance&&(!best||distance<best.distance)){
        best={snapped,line,distance};
      }
    }
  }
  return best;
}

function snapping(slide,index,axis){
  const length=axis==='x'?'w':'h',limit=axis==='x'?width:height;
  return [0,limit/2,limit,...slide.objects.flatMap((object,i)=>{
    if(i===index||object.rotation)return [];
    return [object[axis],object[axis]+object[length]/2,object[axis]+object[length]];
  })];
}

function moveBox(gesture,event,snap){
  const {from,scaleX,scaleY,slide,index}=gesture;
  const x=clamp(from.x+(event.clientX-gesture.anchorX)/scaleX,0,width-from.w);
  const y=clamp(from.y+(event.clientY-gesture.anchorY)/scaleY,0,height-from.h);
  if(!snap)return {box:{...from,x,y}};
  const horizontal=closestGuide(x,from.w,width,snapping(slide,index,'x'),5/scaleX);
  const vertical=closestGuide(y,from.h,height,snapping(slide,index,'y'),5/scaleY);
  return {
    box:{...from,x:horizontal?.snapped??x,y:vertical?.snapped??y},
    guideX:horizontal?.line,guideY:vertical?.line
  };
}

function resizeBox(gesture,event){
  const {from,scaleX,scaleY,object}=gesture;
  const angle=(object.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
  const localX=(cos*dx+sin*dy)/scaleX,localY=(-sin*dx+cos*dy)/scaleY;
  const maxW=angle?width:width-from.x,maxH=angle?height:height-from.y;
  let w=clamp(from.w+localX,minSize,maxW),h=clamp(from.h+localY,minSize,maxH);
  if((object.type==='image')!==event.shiftKey){
    const scaleWidth=(from.w+localX)/from.w,scaleHeight=(from.h+localY)/from.h;
    const factor=Math.abs(scaleWidth-1)>Math.abs(scaleHeight-1)?scaleWidth:scaleHeight;
    const scale=clamp(factor,Math.max(minSize/from.w,minSize/from.h),Math.min(maxW/from.w,maxH/from.h));
    w=from.w*scale;h=from.h*scale;
  }
  // Maintain the opposite corner when the handle rotates with the object.
  const deltaWidth=(w-from.w)*scaleX,deltaHeight=(h-from.h)*scaleY;
  const x=clamp(from.x+((cos-1)*deltaWidth-sin*deltaHeight)/2/scaleX,0,width-w);
  const y=clamp(from.y+(sin*deltaWidth+(cos-1)*deltaHeight)/2/scaleY,0,height-h);
  return {box:{x,y,w,h}};
}

export function bindSlideCanvas(stage,{getSlide,getSelected,onSelect,onCommit,onEdit,onDelete,getSnap=()=>true}){
  let gesture=null,lastTap=null;
  const live=session=>getSlide()===session.slide&&session.slide.objects[session.index]===session.object;

  function geometry(index,box){
    for(const node of stage.querySelectorAll(`[data-object="${index}"],[data-selected-object="${index}"]`)){
      position(node,box);
    }
  }
  function guides(x,y){
    for(const [axis,value] of [['x',x],['y',y]]){
      let line=stage.querySelector('.slide-measure-'+axis);
      if(!Number.isFinite(value)){line?.remove();continue;}
      if(!line){line=el('span',{className:`slide-measure slide-measure-${axis}`,'aria-hidden':'true'});stage.append(line);}
      if(axis==='x')line.style.left=value/9.6+'%';
      else line.style.top=value/5.4+'%';
    }
  }
  function cancel(){
    if(!gesture)return;
    const previous=gesture;gesture=null;
    if(previous.next&&live(previous))geometry(previous.index,previous.from);
    guides();
  }
  function pointerDown(event){
    if(event.isPrimary===false||event.button!==0||gesture)return;
    const tapped=event.target.closest('[data-object],[data-selected-object]');
    if(!tapped){lastTap=null;onSelect(-1);return;}
    const index=Number(tapped.dataset.object??tapped.dataset.selectedObject);
    const slide=getSlide(),object=slide.objects[index];
    if(!object)return;
    const resize=Boolean(event.target.closest('[data-resize]'));
    const before=stage.getBoundingClientRect();
    if(!before.width||!before.height)return;
    if(getSelected()!==index)onSelect(index);
    const rect=stage.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    gesture={
      pointer:event.pointerId,index,slide,object,resize,
      startX:event.clientX,startY:event.clientY,scaleX:rect.width/width,scaleY:rect.height/height,
      anchorX:rect.left+(event.clientX-before.left)*rect.width/before.width,
      anchorY:rect.top+(event.clientY-before.top)*rect.height/before.height,
      from:{x:object.x,y:object.y,w:object.w,h:object.h},next:null
    };
    stage.setPointerCapture(event.pointerId);
    if(event.cancelable)event.preventDefault();
    stage.focus({preventScroll:true});
  }
  function pointerMove(event){
    if(!gesture||event.pointerId!==gesture.pointer)return;
    if(!live(gesture)){cancel();return;}
    if(!gesture.next&&Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<(gesture.resize?2:5))return;
    const next=gesture.resize?resizeBox(gesture,event):moveBox(gesture,event,getSnap());
    gesture.next=next.box;
    geometry(gesture.index,next.box);
    guides(next.guideX,next.guideY);
  }
  function pointerUp(event){
    if(!gesture||event.pointerId!==gesture.pointer)return;
    const session=gesture;gesture=null;guides();
    if(!live(session))return;
    if(session.next){
      lastTap=null;
      const next=Object.fromEntries(Object.entries(session.next).map(([key,value])=>[key,Math.round(value*10)/10]));
      if(Object.keys(next).some(key=>next[key]!==session.from[key]))onCommit(session.index,next);
      else geometry(session.index,session.from);
    }else if(!session.resize){
      const now=performance.now();
      if(lastTap?.object===session.object&&now-lastTap.time<350&&Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<24){
        lastTap=null;
        onEdit?.(session.index);
      }else lastTap={object:session.object,time:now,x:event.clientX,y:event.clientY};
    }
  }
  function pointerCancel(event){if(gesture?.pointer===event.pointerId){lastTap=null;cancel();}}
  function keyDown(event){
    if(event.key==='Escape'&&gesture){event.preventDefault();cancel();return;}
    const index=getSelected(),object=getSlide().objects[index];
    if(!object||event.altKey||event.ctrlKey||event.metaKey)return;
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(directions[event.key]){
      const [x,y]=directions[event.key],step=event.shiftKey?10:1;
      const next={x:clamp(object.x+x*step,0,width-object.w),y:clamp(object.y+y*step,0,height-object.h)};
      event.preventDefault();
      if(object.x!==next.x||object.y!==next.y)onCommit(index,next);
    }else if(event.key==='Enter'){event.preventDefault();onEdit?.(index);}
    else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();onDelete?.(index);}
  }

  stage.addEventListener('pointerdown',pointerDown);
  stage.addEventListener('pointermove',pointerMove);
  stage.addEventListener('pointerup',pointerUp);
  stage.addEventListener('pointercancel',pointerCancel);
  stage.addEventListener('lostpointercapture',pointerCancel);
  stage.addEventListener('keydown',keyDown);
  return ()=>{
    cancel();
    stage.removeEventListener('pointerdown',pointerDown);
    stage.removeEventListener('pointermove',pointerMove);
    stage.removeEventListener('pointerup',pointerUp);
    stage.removeEventListener('pointercancel',pointerCancel);
    stage.removeEventListener('lostpointercapture',pointerCancel);
    stage.removeEventListener('keydown',keyDown);
  };
}
