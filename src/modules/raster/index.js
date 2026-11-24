import { el, download } from '../../components/ui.js';
import { bindWheelZoom } from '../../components/wheel-zoom.js';
import { createAutosave } from '../../core/storage/autosave.js';
import { storageError } from '../../core/storage/database.js';
import { guideFor } from '../../practice/guide.js';
import { shapeMask, combineMasks, colorMask, fillPixels, gradientPixels } from './pixels.js';
import { encodeRaster,decodeTiff } from './formats.js';

const projectExtension = '.raster.json';
const maxSide = 2400;
const maxLayers = 10;
const pixelBudget = 14000000;
const undoBudget = 44000000;
const rasterExtensions = /\.(?:png|jpe?g|gif|bmp|webp|tiff?)$/i;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const button = (label, action, attrs={}) => el('button', {type:'button',onClick:action,...attrs}, label);
const option = (value, label) => el('option', {value}, label);

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

function copySurface(source) {
  const canvas = surface(source.width, source.height);
  canvas.getContext('2d').drawImage(source,0,0);
  return canvas;
}

function layer(name, width, height, background, opacity=1) {
  const canvas = surface(width,height);
  if(background && opacity) {
    const ctx=canvas.getContext('2d');
    ctx.globalAlpha=opacity;
    ctx.fillStyle=background;
    ctx.fillRect(0,0,width,height);
  }
  return {name,canvas,opacity:1,visible:true};
}

function checkDimensions(width,height,count) {
  if(![width,height].every(v=>Number.isInteger(v)&&v>=1&&v<=maxSide)
    || !Number.isInteger(count)||count<1||count>maxLayers||width*height*count>pixelBudget) {
    throw new Error('Зменш розмір або кількість шарів. Межа для однієї сторони — 2400 пікселів, для шарів — 10.');
  }
}

function documentFor(width=960,height=640,dpi=100,count=2,background='#ffffff',opacity=1) {
  checkDimensions(width,height,count);
  const layers=[layer('Тло',width,height,background,opacity)];
  while(layers.length<count) layers.push(layer('Шар малювання '+layers.length,width,height));
  return {width,height,dpi,layers};
}

function loadImage(url) {
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Не вдалося відкрити зображення. Перевір, чи браузер підтримує його формат.'));
    image.src=url;
  });
}

async function withBitmap(blob,filename,action) {
  let decodeError,decoded;
  if(/\.tiff?$/i.test(filename)){
    try{decoded=await decodeTiff(blob,maxSide);}
    catch(error){decodeError=error;}
  }
  if(decoded){
    const {width,height,dpi,pixels}=decoded,canvas=surface(width,height),ctx=canvas.getContext('2d');
    const image=ctx.createImageData(width,height);image.data.set(pixels);ctx.putImageData(image,0,0);
    return action(canvas,width,height,dpi);
  }
  const url=URL.createObjectURL(blob);
  try {
    const image=await loadImage(url).catch(error=>{throw decodeError??error;});
    return action(image,image.naturalWidth,image.naturalHeight,100);
  } finally { URL.revokeObjectURL(url); }
}

function imageDocument(blob,filename){
  return withBitmap(blob,filename,(image,width,height,dpi)=>{
    const doc=documentFor(width,height,dpi,1,'#ffffff',0);
    doc.layers[0].name='Зображення';
    doc.layers[0].canvas.getContext('2d').drawImage(image,0,0);
    return doc;
  });
}

async function readProject(blob) {
  const invalid=()=>new Error('Це пошкоджений або непідтримуваний растровий проєкт.');
  let raw;
  try{raw=JSON.parse(await blob.text());}catch{throw invalid();}
  if(raw?.format!=='informatyka-raster'||raw.version!==1||!Array.isArray(raw.layers)
    ||!Number.isInteger(raw.dpi)||raw.dpi<1||raw.dpi>1200)throw invalid();
  const {width,height,dpi}=raw;
  checkDimensions(width,height,raw.layers.length);
  const layers=[];
  for(const entry of raw.layers){
    if(!entry||typeof entry.name!=='string'||entry.name.length>80||!(entry.opacity>=0&&entry.opacity<=1)
      ||typeof entry.opacity!=='number'||typeof entry.png!=='string'||!entry.png.startsWith('data:image/png;base64,'))throw invalid();
    const image=await loadImage(entry.png);
    if(image.naturalWidth!==width||image.naturalHeight!==height)throw invalid();
    const item=layer(entry.name,width,height);
    item.opacity=entry.opacity;
    item.visible=entry.visible!==false;
    item.canvas.getContext('2d').drawImage(image,0,0);
    layers.push(item);
  }
  return {width,height,dpi,layers};
}

function pngData(canvas) {
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>{
      if(!blob){reject(new Error('Не вдалося закодувати шар.'));return;}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Не вдалося прочитати шар.'));
      reader.onload=()=>resolve(reader.result);
      reader.readAsDataURL(blob);
    },'image/png');
  });
}

async function projectBlob(snapshot,cache){
  const layers=await Promise.all(snapshot.layers.map(async item=>{
    if(!cache.has(item.canvas)){
      cache.set(item.canvas,pngData(item.canvas).catch(error=>{cache.delete(item.canvas);throw error;}));
    }
    return {name:item.name,opacity:item.opacity,visible:item.visible,png:await cache.get(item.canvas)};
  }));
  return new Blob([JSON.stringify({format:'informatyka-raster',version:1,width:snapshot.width,height:snapshot.height,dpi:snapshot.dpi,layers})],{type:'application/json'});
}

export function blankRasterProject(){return projectBlob(documentFor(),new WeakMap());}

function colorBytes(hex, opacity=1) {
  const rgb=Number.parseInt(hex.slice(1),16);
  return [rgb>>16,rgb>>8&255,rgb&255,Math.round(opacity*255)];
}

function bounds(points,width,height) {
  const a=points[0],b=points.at(-1);
  const x=clamp(Math.floor(Math.min(a.x,b.x)),0,width);
  const y=clamp(Math.floor(Math.min(a.y,b.y)),0,height);
  return {x,y,w:clamp(Math.ceil(Math.max(a.x,b.x)),0,width)-x,
    h:clamp(Math.ceil(Math.max(a.y,b.y)),0,height)-y};
}

function maskBounds(mask,width,height) {
  let left=width,right=-1,top=height,bottom=-1;
  for(let y=0,i=0;y<height;y++)for(let x=0;x<width;x++,i++)if(mask[i]){
    if(x<left)left=x;if(x>right)right=x;
    if(y<top)top=y;if(y>bottom)bottom=y;
  }
  return right<0?null:{x:left,y:top,w:right-left+1,h:bottom-top+1};
}

function pattern(ctx, mode, color, background) {
  const tile=surface(12,12),brush=tile.getContext('2d');
  brush.fillStyle=background;brush.fillRect(0,0,12,12);
  brush.fillStyle=brush.strokeStyle=color;
  if(mode==='dots'){
    brush.beginPath();brush.arc(6,6,2.5,0,Math.PI*2);brush.fill();
  }else{
    brush.lineWidth=2;brush.beginPath();
    brush.moveTo(-3,3);brush.lineTo(9,15);brush.moveTo(3,-3);brush.lineTo(15,9);brush.stroke();
  }
  return ctx.createPattern(tile,'repeat');
}

function strokeBrush(ctx,tool,a,b,settings) {
  ctx.strokeStyle=ctx.fillStyle=settings.foreground;
  ctx.lineWidth=settings.size;
  ctx.lineCap=ctx.lineJoin='round';
  if(tool==='brush'&&settings.brush==='soft'){
    const radius=settings.size/2;
    const steps=Math.min(240,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/Math.max(2,radius/2)));
    for(let i=0;i<=steps;i++){
      const progress=steps?i/steps:0,x=a.x+(b.x-a.x)*progress,y=a.y+(b.y-a.y)*progress;
      const dab=ctx.createRadialGradient(x,y,0,x,y,radius);
      dab.addColorStop(0,settings.foreground);dab.addColorStop(1,settings.foreground+'00');
      ctx.fillStyle=dab;ctx.fillRect(x-radius,y-radius,settings.size,settings.size);
    }
    return;
  }
  if(tool==='brush'&&settings.brush==='square')ctx.lineCap='square';
  if(tool==='pencil'){
    let x=Math.floor(a.x),y=Math.floor(a.y);
    const endX=Math.floor(b.x),endY=Math.floor(b.y),dx=Math.abs(endX-x),dy=-Math.abs(endY-y);
    const sx=x<endX?1:-1,sy=y<endY?1:-1;
    const radius=Math.floor(settings.size/2);
    for(let error=dx+dy;;){
      ctx.fillRect(x-radius,y-radius,settings.size,settings.size);
      if(x===endX&&y===endY)break;
      const twice=2*error;
      if(twice>=dy){error+=dy;x+=sx;}
      if(twice<=dx){error+=dx;y+=sy;}
    }
  }else if(a.x===b.x&&a.y===b.y){
    if(tool==='brush'&&settings.brush==='square')ctx.fillRect(a.x-settings.size/2,a.y-settings.size/2,settings.size,settings.size);
    else{ctx.beginPath();ctx.arc(a.x,a.y,settings.size/2,0,Math.PI*2);ctx.fill();}
  }else{
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
}

function drawShape(ctx, tool, points, settings) {
  const a=points[0],b=points.at(-1);
  const closable=['rect','ellipse','polygon'].includes(tool)&&(tool!=='polygon'||points.length>2);
  const signX=b.x<a.x?-1:1,signY=b.y<a.y?-1:1;
  const dx=settings.shapeW?settings.shapeW*signX:b.x-a.x;
  const dy=settings.shapeH?settings.shapeH*signY:b.y-a.y;
  ctx.beginPath();
  if(tool==='rect')ctx.rect(a.x,a.y,dx,dy);
  else if(tool==='ellipse')ctx.ellipse(a.x+dx/2,a.y+dy/2,Math.abs(dx)/2,Math.abs(dy)/2,0,0,Math.PI*2);
  else {
    ctx.moveTo(a.x,a.y);
    for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
    if(closable)ctx.closePath();
  }
  if(closable&&settings.fill!=='none'){
    ctx.fillStyle=['stripes','dots'].includes(settings.fill)?pattern(ctx,settings.fill,settings.foreground,settings.background)
      :settings[settings.fill];
    ctx.fill();
  }
  if(settings.outline!=='none'){
    ctx.strokeStyle=settings[settings.outline];ctx.lineWidth=settings.size;
    ctx.lineJoin=ctx.lineCap='round';ctx.stroke();
  }
}

function maskSurface(mask,width,height,edges=false) {
  const canvas=surface(width,height),ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
  for(let y=0,i=0;y<height;y++)for(let x=0;x<width;x++,i++)if(mask[i]){
    const pixel=i*4;
    if(edges){
      const border=x===0||x===width-1||y===0||y===height-1
        ||!mask[i-1]||!mask[i+1]||!mask[i-width]||!mask[i+width];
      if(!border)continue;
      image.data[pixel]=image.data[pixel+1]=image.data[pixel+2]=(x+y)%8<4?20:245;
    }
    image.data[pixel+3]=255;
  }
  ctx.putImageData(image,0,0);
  return canvas;
}

function clippedSurface(source,mask,remove=false) {
  const canvas=copySurface(source),ctx=canvas.getContext('2d');
  ctx.globalCompositeOperation=remove?'destination-out':'destination-in';
  ctx.drawImage(mask,0,0);
  return canvas;
}

function paintTransform(ctx,contents,box,dx,dy,angle,scaleX,scaleY) {
  const x=box.x+box.w/2,y=box.y+box.h/2;
  ctx.save();ctx.translate(x+dx,y+dy);ctx.rotate(angle*Math.PI/180);ctx.scale(scaleX,scaleY);
  ctx.drawImage(contents,-x,-y);ctx.restore();
}

const toolGroups=[
  {title:'Малювання',tools:[
    ['brush','●','Пензель'],['pencil','✎','Олівець'],['eraser','▱','Гумка'],
    ['bucket','◩','Заливка'],['gradient','▨','Градієнт'],['eyedropper','⌾','Піпетка']
  ]},
  {title:'Фігури',tools:[
    ['line','╱','Пряма'],['rect','▭','Прямокутник'],['ellipse','○','Еліпс'],
    ['polygon','⬠','Багатокутник'],['polyline','⌁','Ламана']
  ]},
  {title:'Виділення',tools:[
    ['select-rect','⬚','Прямокутне'],['select-ellipse','◌','Еліптичне'],['select-lasso','✿','Ласо'],
    ['select-wand','✦','Чарівна паличка'],['select-color','◈','За кольором']
  ]},
  {title:'Зміни',tools:[
    ['move','✥','Пересунути'],['transform','⟲','Перетворити'],['crop','⌗','Обрізати'],['hand','✋','Рука']
  ]}
];
const shortcuts={b:'brush',p:'pencil',e:'eraser',i:'eyedropper',g:'gradient',v:'move',h:'hand',r:'rect',o:'ellipse',m:'select-rect',l:'select-lasso',c:'crop'};

const isBrush=tool=>['brush','pencil','eraser'].includes(tool);
const isShape=tool=>['line','rect','ellipse','polygon','polyline'].includes(tool);
const isPath=tool=>['polyline','polygon'].includes(tool);

export function mount(root,{filesystem:fs,notify,fileId,rememberWork,resume}){
  let doc=documentFor(),record,active=doc.layers.length-1,zoom=1,tool='brush',group=0;
  let displayedGroup=-1,panelTab='style',autoFit=true;
  let selection=null,selectionClip=null,selectionOutline=null,path=[],gesture=null;
  let undo=[],redo=[],busy=false,disposed=false,frame,resizeFrame,loading=Promise.resolve();
  const pngCache=new WeakMap();
  const settings={foreground:'#27354b',background:'#ffffff',size:7,opacity:1,brush:'round',outline:'foreground',fill:'none',
    shapeW:0,shapeH:0,mode:'replace',tolerance:0,gradientType:'linear'};
  const lastToolByGroup=toolGroups.map(item=>item.tools[0][0]);
  const host=el('section',{className:'raster-editor raster-studio','aria-label':'Растровий редактор'});
  const name=el('input',{className:'raster-name',value:'Мій малюнок','aria-label':'Назва малюнка',maxlength:145});
  const status=el('p',{className:'raster-status','aria-live':'polite'},'Автозбереження на пристрої');
  const documentInfo=el('span',{className:'raster-document-info'});
  const toolLabel=el('p',{className:'raster-tool-label'});
  const selectionInfo=el('p',{className:'raster-hint','aria-live':'polite'});
  const panelBodies=new Map(),panelButtons=[];
  const zoomLabel=el('output',{'aria-label':'Масштаб'},'100%');
  const stage=el('div',{className:'raster-stage'});
  const canvas=el('canvas',{tabindex:0,role:'img','aria-label':'Полотно растрового малюнка'});
  const guide=el('canvas',{className:'raster-guide','aria-hidden':'true'});
  const viewport=el('div',{className:'raster-viewport'},stage);
  const layerList=el('div',{className:'raster-layer-list'});
  const toolPanel=el('div',{className:'raster-tool-panel'});
  const modeBar=el('div',{className:'raster-tool-modes',role:'group','aria-label':'Групи інструментів'});
  const tools=el('div',{className:'raster-tools',role:'toolbar','aria-label':'Інструменти малювання'});
  const getPosition=()=>({zoom,active,top:viewport.scrollTop,left:viewport.scrollLeft});
  const current=()=>doc.layers[active];
  stage.append(canvas,guide);

  function projectName(){
    const value=name.value.trim().replace(/\.raster\.json$/i,'');
    if(!value||/[\\/\x00-\x1f]/.test(value))throw new Error('Введи назву без слешів.');
    return value;
  }

  const autosave=createAutosave(async()=>{
    const snapshot=doc,filename=projectName()+projectExtension;
    const blob=await projectBlob(snapshot,pngCache);
    record=await fs.saveFile({...record,moduleId:'raster',name:filename,blob});
    if(!disposed)rememberWork?.(record,{position:getPosition()});
  },(phase,error)=>{
    if(disposed)return;
    status.textContent={dirty:'Є зміни…',saving:'Зберігаємо…',saved:'Збережено на пристрої'}[phase]||'Не збережено. '+storageError(error);
  });

  function retainHistory(){
    const visited=new Set();
    let bytes=0;
    for(let i=undo.length-1;i>=0;i--){
      for(const item of undo[i].doc.layers)if(!visited.has(item.canvas)){
        visited.add(item.canvas);bytes+=item.canvas.width*item.canvas.height*4;
      }
      if(i<undo.length-1&&(bytes>undoBudget||undo.length-i>25)){undo.splice(0,i+1);break;}
    }
  }

  function mutate(action){
    if(disposed)return;
    const previous={doc,active};
    doc={...doc,layers:doc.layers.map(item=>({...item}))};
    try{action();}
    catch(error){doc=previous.doc;active=previous.active;notify(storageError(error));return;}
    undo.push(previous);redo=[];retainHistory();
    autosave.change();redraw();
  }

  function travel(from,to){
    if(!from.length||busy)return;
    cancelGesture();
    const previous=from.pop();
    to.push({doc,active});doc=previous.doc;active=previous.active;
    setSelection(null);autosave.change();redraw();
  }

  async function run(action,flush=true){
    if(busy||disposed)return;
    cancelGesture();
    busy=true;host.inert=true;
    try{if(flush)await autosave.flush();await action();}
    catch(error){if(!disposed)notify(storageError(error));}
    finally{busy=false;if(!disposed)host.inert=false;}
  }

  function setSelection(mask){
    const box=mask?maskBounds(mask,doc.width,doc.height):null;
    selection=box?mask:null;selectionClip=selectionOutline=null;
    const selectionActive=Boolean(selection);
    clearSelection.disabled=!selectionActive;
    cropSelection.disabled=!selectionActive;
    eraseSelection.disabled=!selectionActive;
    selectionInfo.textContent=box?'Виділено '+box.w+' × '+box.h+' пкс':'Виділення немає. Окресли область на полотні або виділи все.';
    invertSelection.disabled=!selectionActive;
    schedulePaint();
  }

  function selectArea(mask){setSelection(combineMasks(selection,mask,settings.mode));}

  function selectionSurface(){
    if(selection&&!selectionClip)selectionClip=maskSurface(selection,doc.width,doc.height);
    return selectionClip;
  }

  function moveData(){
    const item=current();
    const box=selection?maskBounds(selection,doc.width,doc.height):{x:0,y:0,w:doc.width,h:doc.height};
    if(!box)return;
    const mask=selectionSurface(),contents=mask?clippedSurface(item.canvas,mask):item.canvas;
    const base=mask?clippedSurface(item.canvas,mask,true):null;
    return {box,mask,contents,base};
  }

  function composeTransform(target,data,dx,dy,angle=0,scaleX=1,scaleY=1){
    const ctx=target.getContext('2d');
    ctx.clearRect(0,0,doc.width,doc.height);
    if(data.base)ctx.drawImage(data.base,0,0);
    paintTransform(ctx,data.contents,data.box,dx,dy,angle,scaleX,scaleY);
  }

  function applyTransform(data,dx,dy,angle=0,scaleX=1,scaleY=1){
    if(!data||!dx&&!dy&&!angle&&scaleX===1&&scaleY===1)return;
    const result=surface(doc.width,doc.height);
    composeTransform(result,data,dx,dy,angle,scaleX,scaleY);
    if(data.mask){
      const mask=surface(doc.width,doc.height),ctx=mask.getContext('2d');
      paintTransform(ctx,data.mask,data.box,dx,dy,angle,scaleX,scaleY);
      const rgba=ctx.getImageData(0,0,doc.width,doc.height).data,next=new Uint8Array(doc.width*doc.height);
      for(let i=0;i<next.length;i++)next[i]=rgba[i*4+3]>=128?1:0;
      setSelection(next);
    }
    mutate(()=>{current().canvas=result;});
  }

  function crop(box){
    if(!box||box.w<1||box.h<1||box.w===doc.width&&box.h===doc.height)return;
    mutate(()=>{
      for(const item of doc.layers){
        const target=surface(box.w,box.h);
        target.getContext('2d').drawImage(item.canvas,box.x,box.y,box.w,box.h,0,0,box.w,box.h);
        item.canvas=target;
      }
      doc.width=box.w;doc.height=box.h;setSelection(null);
      path=[];updatePathCommands();
    });
    fit();
  }

  function applyPixels(callback){
    mutate(()=>{
      const output=copySurface(current().canvas),ctx=output.getContext('2d',{willReadFrequently:true});
      const image=ctx.getImageData(0,0,doc.width,doc.height);
      callback(image);
      ctx.putImageData(image,0,0);current().canvas=output;
    });
  }

  function applyArtwork(art,gestureTool,target,settingsSnapshot){
    const ctx=target.getContext('2d');
    ctx.clearRect(0,0,doc.width,doc.height);
    ctx.drawImage(current().canvas,0,0);
    const mask=selectionSurface(),artContext=art.getContext('2d');
    if(mask){
      artContext.save();artContext.globalCompositeOperation='destination-in';artContext.drawImage(mask,0,0);artContext.restore();
    }
    ctx.save();ctx.globalAlpha=settingsSnapshot.opacity;
    if(gestureTool==='eraser')ctx.globalCompositeOperation='destination-out';
    ctx.drawImage(art,0,0);ctx.restore();
  }

  function shapeArtwork(key,points,style){
    const art=surface(doc.width,doc.height);
    drawShape(art.getContext('2d'),key,points,style);
    return art;
  }

  function commitArtwork(art,key,style){
    const output=surface(doc.width,doc.height);
    applyArtwork(art,key,output,style);
    mutate(()=>{current().canvas=output;});
  }

  function flatten(target,activePreview){
    const ctx=target.getContext('2d');
    ctx.clearRect(0,0,doc.width,doc.height);
    for(const [i,item] of doc.layers.entries())if(item.visible){
      ctx.globalAlpha=item.opacity;
      ctx.drawImage(i===active&&activePreview?activePreview:item.canvas,0,0);
    }
    ctx.globalAlpha=1;
  }

  function paintGuide(ctx){
    if(selection){
      selectionOutline??=maskSurface(selection,doc.width,doc.height,true);
      if(!gesture?.movement)ctx.drawImage(selectionOutline,0,0);
    }
    const unit=1/zoom;
    ctx.strokeStyle='#3155b1';
    ctx.lineWidth=Math.max(unit*1.6,1);
    ctx.setLineDash([5*unit,3*unit]);
    const points=gesture?.points;
    if(points&&['crop','select-rect','select-ellipse','select-lasso','gradient'].includes(gesture.tool)){
      const {x,y,w,h}=bounds(points,doc.width,doc.height);
      ctx.beginPath();
      if(['crop','select-rect'].includes(gesture.tool))ctx.rect(x,y,w,h);
      else if(gesture.tool==='select-ellipse')ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
      else{
        ctx.moveTo(points[0].x,points[0].y);
        for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
        if(gesture.tool==='select-lasso')ctx.closePath();
      }
      ctx.stroke();
    }
    if(path.length){
      ctx.setLineDash([4*unit,3*unit]);
      ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);
      for(const point of path.slice(1))ctx.lineTo(point.x,point.y);
      if(tool==='polygon'&&path.length>2)ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      for(const point of path){
        ctx.beginPath();ctx.arc(point.x,point.y,3*unit,0,Math.PI*2);
        ctx.fillStyle='#ffffff';ctx.fill();ctx.stroke();
      }
    }
  }

  function paint(){
    if(disposed)return;
    let preview;
    if(gesture?.movement){
      preview=gesture.preview;
      const {x,y}=gesture.points[0],last=gesture.points.at(-1);
      composeTransform(preview,gesture.movement,Math.round(last.x-x),Math.round(last.y-y));
    }else if(gesture?.art){
      const {tool,art,points,style}=gesture;
      if(isShape(tool)){
        const ctx=art.getContext('2d');
        ctx.clearRect(0,0,doc.width,doc.height);drawShape(ctx,tool,points,style);
      }
      preview=gesture.preview;applyArtwork(art,tool,preview,style);
    }
    flatten(canvas,preview);
    const ctx=guide.getContext('2d');
    ctx.save();ctx.clearRect(0,0,doc.width,doc.height);paintGuide(ctx);ctx.restore();
  }

  function schedulePaint(){
    if(frame!==undefined)return;
    frame=requestAnimationFrame(()=>{frame=undefined;paint();});
  }

  function setZoom(next){
    zoom=clamp(next,.05,12);
    stage.style.width=(doc.width*zoom)+'px';
    stage.style.height=(doc.height*zoom)+'px';
    zoomLabel.value=Math.round(zoom*100)+'%';
    schedulePaint();
  }

  function fit(){
    const style=getComputedStyle(viewport);
    const width=viewport.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const height=viewport.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    autoFit=true;
    if(width>0&&height>0)setZoom(Math.min(1,width/doc.width,height/doc.height));
  }

  function changeZoom(value){
    cancelGesture();autoFit=false;setZoom(value);
  }

  function redraw(){
    for(const item of [canvas,guide])if(item.width!==doc.width||item.height!==doc.height){
      item.width=doc.width;item.height=doc.height;
    }
    if(autoFit)fit();else setZoom(zoom);
    undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
    documentInfo.textContent=doc.width+' × '+doc.height+' пкс · '+doc.dpi+' dpi';
    pageWidth.value=doc.width;pageHeight.value=doc.height;pageDpi.value=doc.dpi;
    renderLayers();schedulePaint();
  }

  function position(event){
    const rect=canvas.getBoundingClientRect();
    return {x:clamp((event.clientX-rect.left)*doc.width/rect.width,0,doc.width),
      y:clamp((event.clientY-rect.top)*doc.height/rect.height,0,doc.height)};
  }

  function pixelPosition(point){
    return {x:clamp(Math.floor(point.x),0,doc.width-1),y:clamp(Math.floor(point.y),0,doc.height-1)};
  }

  function activeImage(){
    return current().canvas.getContext('2d').getImageData(0,0,doc.width,doc.height);
  }

  function applyTap(key,point){
    const {x,y}=pixelPosition(point);
    if(key==='eyedropper'){
      paint();
      const rgba=canvas.getContext('2d').getImageData(x,y,1,1).data;
      if(!rgba[3]){notify('Тут прозорий піксель.');return;}
      settings.foreground='#'+Array.from(rgba.slice(0,3),n=>n.toString(16).padStart(2,'0')).join('');
      syncColors();
    }else if(key==='bucket'){
      applyPixels(image=>fillPixels(image,x,y,colorBytes(settings.foreground,settings.opacity),{selection,tolerance:settings.tolerance}));
    }else if(key.startsWith('select-')){
      selectArea(colorMask(activeImage(),x,y,{contiguous:key==='select-wand',tolerance:settings.tolerance}));
    }else if(isPath(key)){
      if(path.length>=240){notify('Заверши контур перед додаванням нових точок.');return;}
      const last=path.at(-1);
      if(!last||Math.hypot(last.x-point.x,last.y-point.y)>2/zoom)path.push(point);
      updatePathCommands();schedulePaint();
    }
  }

  function updatePathCommands(){
    finish.hidden=cancelPath.hidden=!isPath(tool);
    finish.disabled=path.length<(tool==='polygon'?3:2);
    cancelPath.disabled=!path.length;
    pathCommands.hidden=!isPath(tool)||!path.length;
  }

  function finishPath(){
    if(!isPath(tool)||path.length<(tool==='polygon'?3:2))return;
    const style={...settings};
    commitArtwork(shapeArtwork(tool,path,style),tool,style);
    path=[];updatePathCommands();schedulePaint();
  }

  function startGesture(event){
    if(busy||disposed||gesture||event.button!==0||!event.isPrimary)return;
    if(event.currentTarget===viewport&&event.target===canvas)return;
    if(!current().visible&&(isBrush(tool)||isShape(tool)||['bucket','gradient','move','transform'].includes(tool))){
      notify('Покажи активний шар, щоб редагувати його.');return;
    }
    event.preventDefault();
    canvas.focus({preventScroll:true});
    const point=position(event);
    if(tool==='eyedropper'||tool==='bucket'||tool==='select-wand'||tool==='select-color'||isPath(tool)){
      applyTap(tool,point);return;
    }
    gesture={tool,owner:event.currentTarget,id:event.pointerId,points:[point,point],style:{...settings}};
    if(tool==='hand')gesture.pan={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
    else if(tool==='move'||tool==='transform'){
      gesture.movement=moveData();
      if(!gesture.movement){gesture=null;return;}
      gesture.preview=surface(doc.width,doc.height);
    }else if(isBrush(tool)||isShape(tool)){
      gesture.art=surface(doc.width,doc.height);
      gesture.preview=surface(doc.width,doc.height);
      if(isBrush(tool))strokeBrush(gesture.art.getContext('2d'),tool,point,point,gesture.style);
    }
    gesture.owner.setPointerCapture(event.pointerId);
    schedulePaint();
  }

  function updateGesture(event){
    if(!gesture||gesture.id!==event.pointerId||event.currentTarget!==gesture.owner)return;
    if(gesture.pan){
      viewport.scrollLeft=gesture.pan.left+gesture.pan.x-event.clientX;
      viewport.scrollTop=gesture.pan.top+gesture.pan.y-event.clientY;
      return;
    }
    const point=position(event),last=gesture.points.at(-1);
    if(isBrush(gesture.tool)){
      if(last.x===point.x&&last.y===point.y)return;
      strokeBrush(gesture.art.getContext('2d'),gesture.tool,last,point,gesture.style);
    }
    if(gesture.tool==='select-lasso'){
      if(gesture.points.length<1500&&Math.hypot(point.x-last.x,point.y-last.y)>=1)gesture.points.push(point);
    }else gesture.points[1]=point;
    schedulePaint();
  }

  function cancelGesture(){
    if(!gesture)return;
    const {owner,id}=gesture;gesture=null;
    if(owner.hasPointerCapture(id))owner.releasePointerCapture(id);
    schedulePaint();
  }

  function endGesture(event){
    if(!gesture||gesture.id!==event.pointerId||event.currentTarget!==gesture.owner)return;
    updateGesture(event);
    const {tool:key,points,style,art,movement}=gesture;
    const a=points[0],b=points.at(-1);
    cancelGesture();
    if(isBrush(key))commitArtwork(art,key,style);
    else if(isShape(key)){
      if(Math.hypot(b.x-a.x,b.y-a.y)>1||style.shapeW&&style.shapeH)commitArtwork(shapeArtwork(key,points,style),key,style);
    }else if(key==='gradient'){
      if(Math.hypot(b.x-a.x,b.y-a.y)>1)applyPixels(image=>gradientPixels(image,a,b,colorBytes(style.foreground,style.opacity),
        colorBytes(style.background,style.opacity),{selection,radial:style.gradientType==='radial'}));
    }else if(key==='move'||key==='transform'){
      applyTransform(movement,Math.round(b.x-a.x),Math.round(b.y-a.y));
    }else if(key==='crop')crop(bounds(points,doc.width,doc.height));
    else if(key.startsWith('select-'))selectArea(shapeMask(doc.width,doc.height,key.slice(7),points));
  }

  function listenPointer(target){
    target.addEventListener('pointerdown',startGesture);
    target.addEventListener('pointermove',updateGesture);
    target.addEventListener('pointerup',endGesture);
    for(const type of ['pointercancel','lostpointercapture'])target.addEventListener(type,event=>{
      if(gesture?.id===event.pointerId&&event.currentTarget===gesture.owner)cancelGesture();
    });
  }

  listenPointer(canvas);
  viewport.addEventListener('pointerdown',event=>{if(tool==='hand')startGesture(event);});
  viewport.addEventListener('pointermove',updateGesture);
  viewport.addEventListener('pointerup',endGesture);
  for(const type of ['pointercancel','lostpointercapture'])viewport.addEventListener(type,event=>{
    if(gesture?.id===event.pointerId&&event.currentTarget===gesture.owner)cancelGesture();
  });
  canvas.addEventListener('dblclick',finishPath);

  function toolButton(key,icon,label){
    const shortcut=Object.keys(shortcuts).find(letter=>shortcuts[letter]===key)?.toUpperCase();
    return el('button',{type:'button','data-raster-tool':key,'aria-pressed':String(tool===key),
      title:shortcut?label+' ('+shortcut+')':label,'aria-keyshortcuts':shortcut,onClick:()=>chooseTool(key)},
      el('span',{className:'raster-tool-icon','aria-hidden':'true'},icon),el('span',{},label));
  }

  function chooseTool(key){
    if(tool!==key){cancelGesture();tool=key;path=[];}
    lastToolByGroup[group]=key;
    canvas.style.cursor=key==='hand'?'grab':key==='move'||key==='transform'?'move':'crosshair';
    viewport.classList.toggle('is-pan',key==='hand');
    if(key==='transform')openPanel('style');
    for(const panel of toolPanel.querySelectorAll('[data-tools]')){
      panel.hidden=!panel.dataset.tools.split(' ').some(flag=>
        flag===key||flag==='brush'&&isBrush(key)||flag==='shape'&&isShape(key)||flag==='selection'&&key.startsWith('select-'));
    }
    const [,mark,label]=toolGroups.flatMap(item=>item.tools).find(([id])=>id===key);
    toolLabel.textContent=label;
    toolContext.replaceChildren(el('b',{'aria-hidden':'true'},mark),el('span',{},label));
    toolContext.setAttribute('aria-label','Параметри: '+label);
    drawTools();updatePathCommands();schedulePaint();
  }

  function drawTools(){
    if(displayedGroup!==group){
      tools.replaceChildren(...toolGroups[group].tools.map(([key,icon,label])=>toolButton(key,icon,label)));
      tools.scrollLeft=0;displayedGroup=group;
    }
    for(const control of tools.children)control.setAttribute('aria-pressed',String(control.dataset.rasterTool===tool));
    for(const [i,control] of [...modeBar.children].entries())control.setAttribute('aria-pressed',String(i===group));
  }

  const undoButton=button('↶',()=>travel(undo,redo),{'aria-label':'Скасувати',title:'Скасувати (Ctrl+Z)'});
  const redoButton=button('↷',()=>travel(redo,undo),{'aria-label':'Повторити',title:'Повторити (Ctrl+Shift+Z)'});
  const finish=button('✓ Завершити',finishPath,{className:'primary'});
  const cancelPath=button('Скасувати контур',()=>{path=[];updatePathCommands();schedulePaint();});
  const clearSelection=button('Зняти виділення',()=>setSelection(null),{disabled:true});
  const cropSelection=button('Обрізати до виділення',()=>{if(selection)crop(maskBounds(selection,doc.width,doc.height));},{disabled:true});
  const eraseSelection=button('Очистити виділене',()=>{
    if(!selection)return;
    const clip=selectionSurface();
    mutate(()=>{current().canvas=clippedSurface(current().canvas,clip,true);});
  },{disabled:true});
  const invertSelection=button('Інвертувати виділення',()=>{
    if(selection)setSelection(selection.map(value=>value?0:1));
  },{disabled:true});
  const foreground=el('input',{type:'color',value:settings.foreground,'aria-label':'Передній колір',
    onInput:event=>{settings.foreground=event.target.value;syncColors();}});
  const background=el('input',{type:'color',value:settings.background,'aria-label':'Колір тла інструмента',
    onInput:event=>{settings.background=event.target.value;}});
  const syncColors=()=>{
    foreground.value=settings.foreground;background.value=settings.background;
    for(const control of palette.children)control.setAttribute('aria-pressed',String(control.dataset.color===settings.foreground));
  };
  const size=el('input',{type:'number',min:1,max:250,value:settings.size,'aria-label':'Розмір пензля й контуру',
    onChange:event=>{settings.size=Math.round(clamp(Number(event.target.value)||7,1,250));event.target.value=settings.size;}});
  const colorControls=el('div',{className:'raster-color-controls'},
    el('div',{className:'raster-fields raster-color-fields'},
      el('label',{},'Основний колір',foreground),el('label',{},'Другий колір',background),
      el('label',{className:'raster-size'},'Товщина, пкс',size)),
    el('div',{className:'raster-color-actions'},
      button('⇄',()=>{[settings.foreground,settings.background]=[settings.background,settings.foreground];syncColors();},
        {'aria-label':'Поміняти кольори місцями',title:'Поміняти кольори місцями'}),
      button('Чорний / білий',()=>{settings.foreground='#000000';settings.background='#ffffff';syncColors();})));
  const palette=el('div',{className:'raster-palette','aria-label':'Палітра кольорів'},
    ...['#000000','#ffffff','#ef4444','#f97316','#facc15','#22c55e','#14b8a6','#0ea5e9','#3b82f6','#a855f7','#ec4899','#78350f']
      .map(color=>button('',()=>{settings.foreground=color;syncColors();},{className:'raster-swatch',style:'--swatch:'+color,
        'data-color':color,'aria-label':'Колір '+color,title:color,'aria-pressed':'false'})));
  const toolContext=button('',()=>openPanel('style'),{className:'raster-context-button',title:'Параметри інструмента'});
  const mainTools=el('div',{className:'raster-quick'},
    el('div',{className:'raster-zoom'},undoButton,redoButton,button('−',()=>changeZoom(zoom/1.25),{'aria-label':'Зменшити масштаб'}),
      zoomLabel,button('+',()=>changeZoom(zoom*1.25),{'aria-label':'Збільшити масштаб'}),
      button('⊡',fit,{'aria-label':'Умістити полотно',title:'Умістити полотно'}),
      button('1:1',()=>changeZoom(1),{'aria-label':'Масштаб 100%',title:'Масштаб 100%'})),toolContext);

  function enumField(key,label,values){
    const select=el('select',{'aria-label':label,onChange:event=>{settings[key]=event.target.value;}},
      ...values.map(([value,title])=>option(value,title)));
    select.value=settings[key];
    return el('label',{},label,select);
  }

  function numberField(key,label,min,max){
    return el('label',{},label,el('input',{type:'number',min,max,value:settings[key],'aria-label':label,
      onChange:event=>{
        settings[key]=clamp(Number(event.target.value)||0,min,max);
        event.target.value=settings[key];
      }}));
  }

  function params(keys,...fields){
    return el('div',{className:'raster-fields','data-tools':keys},fields);
  }

  function transformField(label,value,min,max){
    const input=el('input',{type:'number',min,max,value,'aria-label':label});
    return {input,field:el('label',{},label,input)};
  }

  const offsetX=transformField('Зміщення X',0,-maxSide,maxSide),offsetY=transformField('Зміщення Y',0,-maxSide,maxSide);
  const angle=transformField('Обертання, °',0,-360,360);
  const widthPercent=transformField('Ширина, %',100,1,500),heightPercent=transformField('Висота, %',100,1,500);
  function submitTransform(){
    const number=({input})=>clamp(Number(input.value),Number(input.min),Number(input.max));
    if(!current().visible){notify('Покажи активний шар, щоб редагувати його.');return;}
    applyTransform(moveData(),Math.round(number(offsetX)),Math.round(number(offsetY)),number(angle),
      number(widthPercent)/100,number(heightPercent)/100);
    for(const item of [offsetX,offsetY,angle,widthPercent,heightPercent])item.input.value=item.input.defaultValue;
  }
  const opacity=el('input',{type:'range',min:0,max:100,value:100,'aria-label':'Непрозорість інструмента',
    onInput:event=>{settings.opacity=Number(event.target.value)/100;}});
  const opacityField=el('label',{},'Непрозорість',opacity);
  toolPanel.append(
    params('brush shape gradient bucket',opacityField),
    params('brush',enumField('brush','Набір пензлів',[['round','Круглий'],['square','Квадратний'],['soft','М’який']])),
    params('shape',
      enumField('outline','Контур',[['none','Без контуру'],['foreground','Передній колір'],['background','Колір тла']]),
      enumField('fill','Заповнення',[['none','Без кольору'],['foreground','Передній колір'],['background','Колір тла'],
        ['stripes','Смуги'],['dots','Крапки']])),
    params('rect ellipse',numberField('shapeW','Ширина (0 — довільна)',0,maxSide),numberField('shapeH','Висота (0 — довільна)',0,maxSide)),
    params('gradient',enumField('gradientType','Тип градієнта',[['linear','Лінійний'],['radial','Радіальний']])),
    params('selection',enumField('mode','Режим виділення',[['replace','Заміна'],['add','Додавання'],['intersect','Перетин'],['subtract','Віднімання']])),
    params('bucket select-wand select-color',numberField('tolerance','Допуск кольору',0,255)),
    params('transform move',offsetX.field,offsetY.field,angle.field,widthPercent.field,heightPercent.field,
      button('Застосувати',submitTransform,{className:'primary'})),
    params('hand',el('p',{className:'muted'},'Перетягуй полотно.')),
    params('crop',el('p',{className:'muted'},'Окресли нові межі полотна.')),
    params('eyedropper',el('p',{className:'muted'},'Торкнися кольору на полотні.')),
    params('polygon polyline',el('p',{},'Позначай вершини на полотні. Натисни «Завершити» або Enter, щоб намалювати контур.'))
  );
  for(const [i,item] of toolGroups.entries()){
    modeBar.append(button(item.title,()=>{
      if(group===i)return;
      group=i;chooseTool(lastToolByGroup[i]);
    },{'aria-pressed':String(i===group)}));
  }

  function switchLayer(index){
    if(index===active)return;
    cancelGesture();path=[];active=index;updatePathCommands();redraw();
  }

  function addLayer(){
    mutate(()=>{
      checkDimensions(doc.width,doc.height,doc.layers.length+1);
      doc.layers.splice(++active,0,layer('Шар '+(doc.layers.length+1),doc.width,doc.height));
    });
  }

  function shiftLayer(direction){
    const to=active+direction;
    if(to<0||to>=doc.layers.length)return;
    mutate(()=>{
      [doc.layers[active],doc.layers[to]]=[doc.layers[to],doc.layers[active]];
      active=to;
    });
  }

  function removeLayer(){
    if(doc.layers.length===1)return;
    mutate(()=>{doc.layers.splice(active,1);active=Math.min(active,doc.layers.length-1);});
  }

  const addLayerButton=button('+ Шар',addLayer);
  const layerDown=button('↓',()=>shiftLayer(-1),{'aria-label':'Опустити шар',title:'Опустити шар'});
  const layerUp=button('↑',()=>shiftLayer(1),{'aria-label':'Підняти шар',title:'Підняти шар'});
  const deleteLayer=button('×',removeLayer,{'aria-label':'Видалити шар',title:'Видалити шар'});
  const layerName=el('input',{type:'text',maxlength:80,'aria-label':'Назва шару',
    onChange:event=>mutate(()=>{current().name=event.target.value.trim()||'Шар';})});
  const layerOpacity=el('input',{type:'range',min:0,max:100,'aria-label':'Непрозорість шару',
    onChange:event=>mutate(()=>{current().opacity=Number(event.target.value)/100;})});
  const layersTitle=el('h3',{className:'raster-layers-title'},'Шари');
  const layersPanel=el('div',{className:'raster-layers'},layersTitle,
    el('div',{className:'raster-layer-actions'},addLayerButton,layerDown,layerUp,deleteLayer),
    layerList,el('div',{className:'raster-fields raster-layer-fields'},
      el('label',{},'Назва шару',layerName),el('label',{},'Непрозорість',layerOpacity)));

  function renderLayers(){
    layersTitle.textContent='Шари · '+doc.layers.length;
    layerList.replaceChildren(...doc.layers.map((item,index)=>{
      const thumb=surface(48,36);
      thumb.className='raster-layer-thumb';thumb.setAttribute('aria-hidden','true');
      const ratio=Math.min(48/doc.width,36/doc.height);
      thumb.getContext('2d').drawImage(item.canvas,(48-doc.width*ratio)/2,(36-doc.height*ratio)/2,doc.width*ratio,doc.height*ratio);
      return el('div',{className:'raster-layer-row'+(active===index?' is-selected':'')},
      button([thumb,el('span',{className:'raster-layer-name'},item.name)],()=>switchLayer(index),
        {className:'raster-layer-select','aria-pressed':String(active===index),'aria-label':'Вибрати шар '+item.name}),
      button(item.visible?'◉':'○',()=>mutate(()=>{doc.layers[index].visible=!doc.layers[index].visible;}),
        {'aria-label':(item.visible?'Сховати ':'Показати ')+item.name,title:item.visible?'Сховати':'Показати'})
      );
    }).reverse());
    addLayerButton.disabled=doc.layers.length>=maxLayers||doc.width*doc.height*(doc.layers.length+1)>pixelBudget;
    layerDown.disabled=active===0;layerUp.disabled=active===doc.layers.length-1;deleteLayer.disabled=doc.layers.length<2;
    layerName.value=current().name;layerOpacity.value=Math.round(current().opacity*100);
  }

  function useDocument(next,title,stored,savedPosition){
    const extension=/\.raster\.json$/i.test(title)?/\.raster\.json$/i:rasterExtensions;
    const cleanTitle=title.replace(extension,'').replace(/[\\/\x00-\x1f]/g,' ').trim().slice(0,145)||'Мій малюнок';
    doc=next;record=stored;name.value=cleanTitle;
    active=Number.isInteger(savedPosition?.active)?clamp(savedPosition.active,0,doc.layers.length-1):doc.layers.length-1;
    undo=[];redo=[];path=[];
    setSelection(null);updatePathCommands();redraw();
    if(Number.isFinite(savedPosition?.zoom)){autoFit=false;setZoom(savedPosition.zoom);}else fit();
    if(Number.isFinite(savedPosition?.top))viewport.scrollTop=savedPosition.top;
    if(Number.isFinite(savedPosition?.left))viewport.scrollLeft=savedPosition.left;
    if(record){
      rememberWork?.(record,{position:getPosition()});
      status.textContent='Роботу відкрито';
    }else autosave.change();
  }

  async function openFile(blob,filename,stored){
    if(blob.size>80000000)throw new Error('Файл завеликий. Межа — 80 МБ.');
    if(/\.raster\.json$/i.test(filename))useDocument(await readProject(blob),filename,stored,stored?resume?.position:undefined);
    else if(rasterExtensions.test(filename))useDocument(await imageDocument(blob,filename),filename,undefined);
    else throw new Error('Вибери растровий проєкт або зображення PNG, JPG, GIF, BMP, WEBP чи TIFF.');
  }

  function newDocument(){
    const width=transformField('Ширина, пкс',960,1,maxSide);
    const height=transformField('Висота, пкс',640,1,maxSide);
    const dpi=transformField('Роздільність, dpi',100,1,1200);
    const count=transformField('Кількість шарів',2,1,maxLayers);
    const alpha=transformField('Непрозорість тла, %',100,0,100);
    const color=el('input',{type:'color',value:'#ffffff','aria-label':'Колір тла'});
    const error=el('p',{className:'raster-dialog-error',role:'alert'});
    const dialog=el('dialog',{className:'raster-dialog'});
    const create=button('Створити',()=>{
      const resolution=Number(dpi.input.value),opacity=Number(alpha.input.value);
      if(!Number.isInteger(resolution)||resolution<1||resolution>1200||opacity<0||opacity>100){
        error.textContent='Перевір роздільність і непрозорість тла.';return;
      }
      try{
        const next=documentFor(Number(width.input.value),Number(height.input.value),resolution,Number(count.input.value),color.value,opacity/100);
        dialog.close();
        run(async()=>useDocument(next,'Мій малюнок'));
      }catch(failure){error.textContent=failure.message;}
    },{className:'primary'});
    dialog.append(el('h2',{},'Новий малюнок'),
      el('div',{className:'raster-fields'},width.field,height.field,dpi.field,count.field,
        el('label',{},'Колір тла',color),alpha.field),error,
      el('div',{className:'raster-layer-actions'},button('Скасувати',()=>dialog.close()),create));
    dialog.addEventListener('close',()=>dialog.remove());
    host.append(dialog);dialog.showModal();
  }

  const imageInput=el('input',{type:'file',hidden:true,accept:'.raster.json,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff',
    onChange:event=>{
      const file=event.target.files[0];event.target.value='';
      if(file)run(()=>openFile(file,file.name));
    }});
  const layerInput=el('input',{type:'file',hidden:true,accept:'.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff',
    onChange:event=>{
      const file=event.target.files[0];event.target.value='';
      if(!file)return;
      run(async()=>{
        if(!rasterExtensions.test(file.name))throw new Error('Вибери растрове зображення.');
        if(file.size>80000000)throw new Error('Файл завеликий. Межа — 80 МБ.');
        checkDimensions(doc.width,doc.height,doc.layers.length+1);
        await withBitmap(file,file.name,(image,width,height)=>{
          if(width*height>30000000)throw new Error('Зменш зображення перед додаванням.');
          const item=layer(file.name.slice(0,80),doc.width,doc.height);
          const scale=Math.min(1,doc.width/width,doc.height/height);
          item.canvas.getContext('2d').drawImage(image,0,0,Math.max(1,width*scale),Math.max(1,height*scale));
          mutate(()=>{doc.layers.splice(++active,0,item);});
        });
      });
    }});
  const save=button('✓',()=>run(async()=>{
    if(!record&&!autosave.dirty())autosave.change();
    await autosave.flush();
  },false),{className:'primary','aria-label':'Зберегти',title:'Зберегти (Ctrl+S)'});
  name.addEventListener('input',()=>autosave.change());
  const formats=[['png','PNG','png'],['jpeg','JPEG','jpg'],['bmp','BMP','bmp'],['gif','GIF','gif'],['tiff','TIFF','tif']];
  const exportFormat=el('select',{'aria-label':'Формат зображення'},...formats.map(([value,label])=>option(value,label)));
  const rasterExport=button('Експорт',()=>run(async()=>{
    const [format,,extension]=formats.find(([value])=>value===exportFormat.value);
    const output=surface(doc.width,doc.height);
    flatten(output);
    download(await encodeRaster(output,format,{dpi:doc.dpi}),projectName()+'.'+extension);
  },false));
  const assignment=guideFor(fileId);
  const vectorLink=el('a',{href:'#editor/vector',className:'button raster-vector-link'},'Вектор');
  mainTools.append(vectorLink);
  const fileMenu=el('details',{className:'raster-file-menu'},el('summary',{},'Файл'),
    el('div',{className:'raster-file-actions'},
      button('Новий малюнок',newDocument),button('Відкрити…',()=>imageInput.click()),
      button('Зображення як шар',()=>layerInput.click()),
      button('Завантажити проєкт',()=>run(async()=>download(await projectBlob(doc,pngCache),projectName()+projectExtension),false)),
      el('a',{href:'#editor/vector',className:'button'},'Векторний редактор'),
      el('div',{className:'raster-file-export'},exportFormat,rasterExport)));
  fileMenu.addEventListener('click',event=>{if(event.target.closest('button,a'))fileMenu.open=false;});

  const top=el('header',{className:'raster-header'},
    el('a',{href:'#catalog',className:'button','aria-label':'До каталогу'},'←'),
    name,save,fileMenu,assignment,imageInput,layerInput);
  const selectAll=button('Виділити все',()=>setSelection(new Uint8Array(doc.width*doc.height).fill(1)));
  const selectionCommands=el('div',{className:'raster-selection-actions'},selectAll,clearSelection,invertSelection,eraseSelection,cropSelection,
    button('Пересунути виділене',()=>activateTool('move')),button('Розмір і поворот…',()=>{activateTool('transform');openPanel('style');}));
  const pageWidth=el('input',{type:'number',min:1,max:maxSide,'aria-label':'Ширина полотна, пкс'});
  const pageHeight=el('input',{type:'number',min:1,max:maxSide,'aria-label':'Висота полотна, пкс'});
  const pageDpi=el('input',{type:'number',min:1,max:1200,'aria-label':'Роздільність полотна, dpi'});
  const resizeMode=el('select',{'aria-label':'Зміна розміру'},option('canvas','Межі полотна'),option('scale','Масштабувати зображення'));
  function applyPageSize(){
    const width=Number(pageWidth.value),height=Number(pageHeight.value),dpi=Number(pageDpi.value);
    try{
      checkDimensions(width,height,doc.layers.length);
      if(!Number.isInteger(dpi)||dpi<1||dpi>1200)throw new Error('Роздільність має бути від 1 до 1200 dpi.');
    }catch(error){notify(error.message);return;}
    if(width===doc.width&&height===doc.height&&dpi===doc.dpi)return;
    cancelGesture();path=[];
    mutate(()=>{
      if(width!==doc.width||height!==doc.height){
        for(const item of doc.layers){
          const output=surface(width,height),ctx=output.getContext('2d');
          if(resizeMode.value==='scale')ctx.drawImage(item.canvas,0,0,width,height);
          else ctx.drawImage(item.canvas,0,0);
          item.canvas=output;
        }
      }
      doc.width=width;doc.height=height;doc.dpi=dpi;setSelection(null);updatePathCommands();
    });
    fit();
  }
  const pagePanel=el('div',{},el('div',{className:'raster-fields'},
    el('label',{},'Ширина, пкс',pageWidth),el('label',{},'Висота, пкс',pageHeight),
    el('label',{},'Роздільність, dpi',pageDpi),el('label',{},'Зміна розміру',resizeMode)),
    el('p',{className:'raster-hint'},'«Межі полотна» залишає малюнок у лівому верхньому куті та обрізає зайве. «Масштабувати зображення» змінює розмір усього малюнка.'),
    button('Застосувати розмір',applyPageSize,{className:'primary'}),
    el('p',{className:'raster-hint'},'До 2400 пкс на сторону. Зміни можна скасувати кнопкою ↶.'),
    button('Новий малюнок…',newDocument));
  panelBodies.set('style',el('div',{},colorControls,palette,toolPanel));
  panelBodies.set('actions',el('div',{},selectionInfo,selectionCommands));
  panelBodies.set('layers',layersPanel);
  panelBodies.set('page',pagePanel);
  const panelNav=el('nav',{className:'raster-panel-tabs','aria-label':'Розділи налаштувань'});
  const mobileNav=el('nav',{className:'raster-mobile-tabs','aria-label':'Панелі растрового редактора'});
  function openPanel(id,open=true){
    panelTab=id;host.classList.toggle('raster-panel-open',open);
    for(const [key,body] of panelBodies)body.hidden=key!==id;
    for(const {key,control,mobile} of panelButtons){
      control.setAttribute('aria-pressed',String(key===id&&(!mobile||open)));
      if(mobile)control.setAttribute('aria-expanded',String(key===id&&open));
    }
  }
  function closePanel(focus=false){openPanel(panelTab,false);if(focus)canvas.focus({preventScroll:true});}
  function activateTool(key){
    group=toolGroups.findIndex(item=>item.tools.some(([id])=>id===key));
    chooseTool(key);
  }
  for(const [id,label] of [['style','Параметри'],['actions','Дії'],['layers','Шари'],['page','Полотно']]){
    const body=panelBodies.get(id);
    body.classList.add('raster-panel-body');body.id='raster-panel-'+id;body.setAttribute('aria-label',label);
    for(const [target,mobile] of [[panelNav,false],[mobileNav,true]]){
      const control=button(label,()=>openPanel(id),{'data-raster-panel':id,'aria-controls':body.id});
      panelButtons.push({key:id,control,mobile});target.append(control);
    }
  }
  const inspector=el('aside',{className:'raster-inspector','aria-label':'Налаштування малюнка'},
    el('header',{className:'raster-panel-header'},toolLabel,button('×',()=>closePanel(true),
      {className:'raster-panel-close','aria-label':'Закрити панель',title:'Закрити панель'})),panelNav,...panelBodies.values());
  const pathCommands=el('div',{className:'raster-path-actions',hidden:true},finish,cancelPath);
  const workspace=el('div',{className:'raster-workspace'},mainTools,viewport,pathCommands);
  host.append(top,el('div',{className:'raster-tool-shelf'},modeBar,tools),
    el('div',{className:'raster-layout'},workspace,inspector),mobileNav,
    el('footer',{className:'raster-status-bar'},documentInfo,status));
  root.append(host);document.body.classList.add('raster-focus-mode');
  const removeWheelZoom=bindWheelZoom(viewport,stage,{current:()=>zoom,zoom:changeZoom,blocked:()=>busy||Boolean(gesture)});
  const viewportObserver=new ResizeObserver(()=>{
    if(disposed||!autoFit)return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{if(!disposed&&autoFit)fit();});
  });
  viewportObserver.observe(viewport);
  const setHeight=()=>host.style.setProperty('--raster-height',`${window.visualViewport?.height||innerHeight}px`);
  setHeight();window.addEventListener('resize',setHeight);window.visualViewport?.addEventListener('resize',setHeight);
  const unload=event=>{if(busy||autosave.dirty()){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  host.addEventListener('keydown',event=>{
    if(busy)return;
    if(event.target.closest('dialog'))return;
    if(event.key==='Escape'&&!gesture&&!path.length&&host.classList.contains('raster-panel-open')){
      event.preventDefault();closePanel(true);return;
    }
    const command=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(command&&key==='s'){event.preventDefault();save.click();return;}
    if(event.target.closest('input,select,textarea'))return;
    if(!command&&!event.altKey&&Object.hasOwn(shortcuts,key)){
      const next=shortcuts[key];
      group=toolGroups.findIndex(item=>item.tools.some(([id])=>id===next));
      event.preventDefault();chooseTool(next);return;
    }
    if(command&&key==='z'){event.preventDefault();event.shiftKey?travel(redo,undo):travel(undo,redo);}
    if(command&&key==='y'){event.preventDefault();travel(redo,undo);}
    if(command&&key==='a'){event.preventDefault();selectAll.click();}
    if(command&&(key==='+'||key==='=')){event.preventDefault();changeZoom(zoom*1.25);}
    if(command&&key==='-'){event.preventDefault();changeZoom(zoom/1.25);}
    if(command&&key==='0'){event.preventDefault();fit();}
    if(event.key==='Delete'&&selection){event.preventDefault();eraseSelection.click();}
    if(event.key==='Escape'){
      if(gesture)cancelGesture();
      else if(path.length)cancelPath.click();
      else setSelection(null);
    }
    if(event.key==='Enter'&&isPath(tool)&&!event.target.closest('button')){
      event.preventDefault();finishPath();
    }
  });
  openPanel('style',false);syncColors();setSelection(null);chooseTool(tool);redraw();
  resizeFrame=requestAnimationFrame(()=>{if(!record)fit();});
  if(fileId)loading=run(async()=>{
    const file=await fs.getFile(fileId);
    if(!file)throw new Error('Файл уже видалено.');
    await openFile(file.blob,file.name,file);
  },false);

  return {
    getResumePosition(id){if(record?.id===id)return getPosition();},
    async canLeave(){
      await loading;
      if(busy){notify('Дочекайся завершення операції з малюнком.');return false;}
      cancelGesture();
      try{await autosave.flush();return true;}
      catch{return confirm('Малюнок не збережено. Вийти без останніх змін?');}
    },
    dispose(){
      disposed=true;viewportObserver.disconnect();removeWheelZoom();cancelGesture();cancelAnimationFrame(frame);cancelAnimationFrame(resizeFrame);autosave.dispose();
      document.body.classList.remove('raster-focus-mode');
      window.removeEventListener('beforeunload',unload);window.removeEventListener('resize',setHeight);
      window.visualViewport?.removeEventListener('resize',setHeight);
    }
  };
}
