import { el } from '../../components/ui.js';

const svgNamespace = 'http://www.w3.org/2000/svg';
const kinds = new Set(['window','frame','label-frame','label','button','entry','text','check','radio',
  'combo','list','scale','spin','progress','separator','canvas']);
const boxKinds = new Set(['window','frame','label-frame']);
const inputKinds = new Set(['entry','text','spin','combo','list','scale']);
const text = (value, limit=10000) => typeof value === 'string' ? value.slice(0,limit) : '';
const scalar = value => ['string','number','boolean'].includes(typeof value) ? text(String(value)) : '';
function number(value, fallback=0, min=0, max=2400) {
  const result = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(result) ? Math.min(max, Math.max(min,result)) : fallback;
}
function color(value) {
  const candidate = text(value,50).trim();
  if (candidate === '') return '';
  const gray = /^gr[ae]y(\d{1,3})$/i.exec(candidate);
  if (gray) {
    const channel = Math.round(255 * number(gray[1],0,0,100) / 100);
    return 'rgb('+channel+','+channel+','+channel+')';
  }
  const known = /^[a-z]+(?: [a-z]+)*$/i.test(candidate) ? candidate.replaceAll(' ','') : candidate;
  if (/^(?:#[\da-f]{3}|#[\da-f]{6}|[a-z]{1,30})$/i.test(known) && !/^(inherit|unset|revert|currentcolor)$/i.test(known)) {
    return globalThis.CSS && !CSS.supports('color',known) ? '' : known;
  }
  return '';
}
function fontStyles(style, spec, usePoints=false) {
  const data = Array.isArray(spec) ? {family:spec[0],size:spec[1],detail:spec.slice(2).join(' ')} :
    (spec && typeof spec === 'object' ? {...spec} : {family:spec});
  const detail = ['detail','weight','slant'].map(key=>text(data[key],50)).join(' ');
  const family = text(data.family,80);
  style.fontFamily = /^[\p{L}\p{N} ,_-]+$/u.test(family) ? family : '';
  style.fontSize = data.size === undefined ? '' : Math.max(9,Math.min(84,Math.abs(number(data.size,12,-84,84)))) +
    (usePoints && Number(data.size)>0 ? 'pt' : 'px');
  style.fontWeight = /\bbold\b/.test(detail) ? '700' : '';
  style.fontStyle = /\bitalic\b/.test(detail) ? 'italic' : '';
  style.textDecoration = [data.underline || /\bunderline\b/.test(detail) ? 'underline' : '',
    data.overstrike || /\boverstrike\b/.test(detail) ? 'line-through' : ''].filter(Boolean).join(' ');
}
function pad(value) {
  return Array.isArray(value) ? [number(value[0],0,0,60),number(value[1],0,0,60)] :
    Array(2).fill(number(value,0,0,60));
}
function placeStyles(style, layout) {
  const [left,right]=pad(layout.padx), [top,bottom]=pad(layout.pady);
  style.margin=top+'px '+right+'px '+bottom+'px '+left+'px';
  style.position=layout.kind==='place'?'absolute':'';
  style.top=layout.kind==='place'?'calc('+number(layout.rely,0,-2,3)*100+'% + '+number(layout.y,0,-2400,2400)+'px)':'';
  style.left=layout.kind==='place'?'calc('+number(layout.relx,0,-2,3)*100+'% + '+number(layout.x,0,-2400,2400)+'px)':'';
  let transform='';
  if(layout.kind==='place'){
    const anchor=text(layout.anchor,8)||'nw';
    const dx=anchor.includes('w')?0:anchor.includes('e')&&anchor!=='center'?-100:-50;
    const dy=anchor.includes('n')&&anchor!=='center'?0:anchor.includes('s')?-100:-50;
    transform='translate('+dx+'%,'+dy+'%)';
  }
  style.transform=transform;
  if(layout.kind==='grid'){
    style.gridColumn=String(1+Math.floor(number(layout.column,0,0,24)))+' / span '+Math.floor(number(layout.columnspan,1,1,24));
    style.gridRow=String(1+Math.floor(number(layout.row,0,0,60)))+' / span '+Math.floor(number(layout.rowspan,1,1,24));
    const sticky=text(layout.sticky,8);
    style.justifySelf=sticky.includes('e')&&sticky.includes('w')?'stretch':sticky.includes('w')?'start':sticky.includes('e')?'end':'center';
    style.alignSelf=sticky.includes('n')&&sticky.includes('s')?'stretch':sticky.includes('n')?'start':sticky.includes('s')?'end':'center';
  }else{
    style.gridColumn=style.gridRow='';
    style.justifySelf='';
    const anchor=text(layout.anchor,8), side=text(layout.side,10);
    const fill=layout.fill==='both'||layout.fill===(side==='left'||side==='right'?'y':'x');
    style.alignSelf=fill?'stretch':anchor==='w'||anchor==='nw'||anchor==='sw'?'start':
      anchor==='e'||anchor==='ne'||anchor==='se'?'end':'center';
  }
  style.flexGrow=layout.kind==='pack'&&(layout.expand===true||Number(layout.expand)===1)?'1':'';
}
function writeChildren(parent, children) {
  for(const [index,child] of children.entries()){
    if(parent.children[index]!==child)parent.insertBefore(child,parent.children[index]??null);
  }
  while(parent.children.length>children.length)parent.lastElementChild.remove();
}
function svg(tag, attributes={}) {
  const node = document.createElementNS(svgNamespace,tag);
  for(const [key,value] of Object.entries(attributes))if(value!=='')node.setAttribute(key,String(value));
  return node;
}
function canvasShape(part) {
  const shape=text(part?.shape,10), options=part?.options??{}, coordinates=part?.coords;
  if(options.state==='hidden'||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>400)return null;
  const xy=coordinates.map(value=>number(value,0,-10000,10000));
  const [x,y,right,bottom]=xy, left=Math.min(x,right), top=Math.min(y,bottom), width=Math.abs(right-x), height=Math.abs(bottom-y);
  const fill=color(options.fill), outline=color(options.outline);
  const appearance={fill:fill||'none',stroke:outline||(options.outline===''?'none':'#162033'),
    'stroke-width':number(options.width,1,0,100)};
  let node;
  if(shape==='rectangle'&&xy.length>=4)node=svg('rect',{x:left,y:top,width,height,...appearance});
  if(shape==='oval'&&xy.length>=4)node=svg('ellipse',{cx:left+width/2,cy:top+height/2,rx:width/2,ry:height/2,...appearance});
  if((shape==='polygon'||shape==='line')&&xy.length>=4){
    const dash=Array.isArray(options.dash)?options.dash.slice(0,12).map(value=>number(value,1,0,100)).join(' '):'';
    node=svg(shape==='line'?'polyline':'polygon',{points:xy.join(' '),...appearance,fill:shape==='line'?'none':fill||'#162033',
      stroke:shape==='line'?fill||'#162033':outline||'none','stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':dash});
  }
  if(shape==='text'){
    const anchor=text(options.anchor,8);
    node=svg('text',{x,y,fill:fill||'#162033','text-anchor':anchor.includes('w')?'start':anchor.includes('e')?'end':'middle',
      'dominant-baseline':anchor.includes('n')?'hanging':anchor.includes('s')?'auto':'middle'});
    node.textContent=text(options.text);
    fontStyles(node.style,options.font,true);
  }
  return node;
}

export function createTkView(send) {
  const element=el('div',{className:'python-tk-view'});
  const windows=el('div',{className:'python-tk-windows'});
  const dialog=el('div',{className:'python-tk-dialog-slot'});
  element.append(windows,dialog);
  const records=new Map();
  let revision=0, dialogId=null;
  const emit=(id,event,details)=>send({type:'tk-event',id,event,...details});

  function mouseData(node,event){
    const box=node.getBoundingClientRect();
    const dimensions=node.viewBox?.baseVal;
    return {x:Math.round((event.clientX-box.left)*(dimensions?.width||box.width)/Math.max(1,box.width)),
      y:Math.round((event.clientY-box.top)*(dimensions?.height||box.height)/Math.max(1,box.height)),button:event.button+1};
  }

  function createRecord(id,kind){
    const outer=el('div',{className:'python-tk-widget python-tk-'+kind});
    const record={outer,kind};
    const input=(value,event='input',details={})=>{
      record.pending=++revision;
      emit(id,event,{value,revision,...details});
    };
    switch(kind){
      case 'window':{
        const title=el('strong',{className:'python-tk-title'});
        const close=el('button',{type:'button',className:'python-tk-close','aria-label':'Закрити вікно',
          onClick:()=>emit(id,'close')},'×');
        record.title=title;
        record.control=el('div',{className:'python-tk-content'});
        outer.append(el('div',{className:'python-tk-titlebar'},title,close),record.control);
        break;
      }
      case 'frame':
        record.control=el('div',{className:'python-tk-content'});outer.append(record.control);
        break;
      case 'label-frame':
        record.title=el('legend');record.control=el('div',{className:'python-tk-content'});
        outer.append(el('fieldset',{},record.title,record.control));break;
      case 'label':
        record.control=el('span',{className:'python-tk-label-text'});outer.append(record.control);break;
      case 'button':
        record.control=el('button',{type:'button',onClick:event=>emit(id,'invoke',mouseData(record.control,event))});
        outer.append(record.control);break;
      case 'check':
      case 'radio':
        record.control=el('input',{type:kind==='check'?'checkbox':'radio',onClick:()=>emit(id,'invoke')});
        record.title=el('span');outer.append(el('label',{},record.control,record.title));break;
      case 'entry':
      case 'spin':
      case 'text':{
        const options={'aria-label':'Поле введення',maxlength:10000,autocomplete:'off',spellcheck:'false',
          onInput:event=>input(event.target.value,'input',{cursor:event.target.selectionStart})};
        if(kind==='spin')Object.assign(options,{type:'number',inputmode:'decimal'});
        record.control=el(kind==='text'?'textarea':'input',options);outer.append(record.control);break;
      }
      case 'combo':
        record.control=el('select',{'aria-label':'Випадний список',onChange:event=>input(event.target.value,'change')});
        outer.append(record.control);break;
      case 'list':
        record.control=el('select',{'aria-label':'Список',
          onChange:event=>input([...event.target.selectedOptions].map(option=>Number(option.value)),'change')});
        outer.append(record.control);break;
      case 'scale':
        record.control=el('input',{type:'range','aria-label':'Повзунок',onInput:event=>input(Number(event.target.value))});
        outer.append(record.control);break;
      case 'progress':
        record.control=el('progress',{'aria-label':'Виконання'});outer.append(record.control);break;
      case 'separator':
        record.control=el('hr');outer.append(record.control);break;
      case 'canvas':{
        const canvas=svg('svg',{role:'img','aria-label':'Полотно',preserveAspectRatio:'none',tabindex:0});
        canvas.addEventListener('dblclick',event=>emit(id,'double',mouseData(canvas,event)));
        let lastDrag=0, pointer;
        canvas.addEventListener('pointerdown',event=>{
          pointer=event.pointerId;
          if(record.bound)emit(id,'pointer',mouseData(canvas,event));
        });
        canvas.addEventListener('pointerup',event=>{
          pointer=undefined;
          if(record.bound)emit(id,'pointer-release',mouseData(canvas,event));
        });
        canvas.addEventListener('pointercancel',()=>{pointer=undefined;});
        canvas.addEventListener('pointerleave',()=>{pointer=undefined;});
        canvas.addEventListener('pointermove',event=>{
          if(!record.bound||pointer!==event.pointerId||event.timeStamp-lastDrag<34)return;
          lastDrag=event.timeStamp;
          emit(id,'drag',mouseData(canvas,event));
        });
        record.control=canvas;outer.append(canvas);break;
      }
    }
    if(!['canvas','button','check','radio'].includes(kind))outer.addEventListener('click',event=>{
      if(record.bound&&event.target===record.control)emit(id,'pointer',mouseData(record.control,event));
    });
    if(boxKinds.has(kind))outer.addEventListener('click',event=>{
      if(record.bound&&event.target===outer)emit(id,'pointer',mouseData(outer,event));
    });
    const keys=(event,eventName)=>{
      if(kind==='window'&&event.target!==outer)return;
      event.stopPropagation();
      emit(id,eventName,{key:text(event.key,50)});
    };
    outer.addEventListener('keydown',event=>keys(event,'key'));
    outer.addEventListener('keyup',event=>keys(event,'release'));
    if(boxKinds.has(kind))outer.tabIndex=0;
    if(boxKinds.has(kind))record.pack={
      top:el('div',{className:'python-tk-pack-column'}),bottom:el('div',{className:'python-tk-pack-column'}),
      left:el('div',{className:'python-tk-pack-side'}),right:el('div',{className:'python-tk-pack-side python-tk-pack-right'}),
      middle:el('div',{className:'python-tk-pack-middle'})
    };
    return record;
  }

  function replaceOptions(record,values){
    const key=JSON.stringify(values);
    if(record.optionKey===key)return;
    record.optionKey=key;
    const control=record.control;
    control.replaceChildren(...values.map((value,index)=>el('option',{value:record.kind==='list'?index:value},value)));
  }

  function paint(record,model){
    const {outer,control,kind}=record, options=model.options??{}, layout=model.layout??{};
    const width=number(options.width,0,0,2400), height=number(options.height,0,0,2400);
    const background=color(options.background),foreground=color(options.foreground);
    const state=options.state, style=outer.style;
    style.color=foreground;
    style.backgroundColor=background;
    style.textAlign=options.justify==='left'?'left':options.justify==='right'?'right':'';
    style.cursor=options.cursor==='hand2'?'pointer':options.cursor==='crosshair'?'crosshair':'';
    style.borderWidth=options.borderwidth!==undefined?number(options.borderwidth,0,0,12)+'px':'';
    style.borderStyle=options.borderwidth?'solid':'';
    style.borderColor=options.relief==='flat'?'transparent':'';
    style.padding=options.padx!==undefined||options.pady!==undefined?
      number(options.pady,0,0,40)+'px '+number(options.padx,0,0,40)+'px':'';
    if(kind!=='window')placeStyles(style,layout);
    if(kind==='entry'||kind==='spin'||kind==='button'||kind==='label'||kind==='combo'||kind==='list'||kind==='text'){
      style.width=width?Math.min(width,120)+'ch':'';
    }else style.width=width?width+'px':'';
    style.minHeight=kind==='frame'&&height?height+'px':'';
    if(layout.width!==undefined||layout.relwidth!==undefined){
      style.width='calc('+number(layout.relwidth,0,0,3)*100+'% + '+number(layout.width,0,0,2400)+'px)';
    }
    if(layout.height!==undefined||layout.relheight!==undefined){
      style.height='calc('+number(layout.relheight,0,0,3)*100+'% + '+number(layout.height,0,0,2400)+'px)';
    }else style.height='';
    fontStyles(style,options.font,true);
    if(inputKinds.has(kind)||['button','check','radio'].includes(kind)){
      control.disabled=state==='disabled';
      if(['entry','text','spin'].includes(kind))control.readOnly=state==='readonly';
    }
    record.bound=model.bind===true;
    if(record.title&&kind!=='window')record.title.textContent=scalar(options.text);
    switch(kind){
      case 'window':
        record.title.textContent=text(model.title,500)||'Tkinter';
        style.width=number(model.width,width||380,160,1600)+'px';
        control.style.minHeight=height||model.height?
          Math.max(48,number(model.height,height,0,1600)-38)+'px':'';
        control.style.backgroundColor=background;
        break;
      case 'button':
      case 'label':
        control.textContent=scalar(options.text);
        if(kind==='label'){
          control.style.maxWidth=options.wraplength?number(options.wraplength,0,0,2400)+'px':'';
          const anchor=text(options.anchor,6);
          control.style.textAlign=anchor.includes('w')?'left':anchor!=='center'&&anchor.includes('e')?'right':'';
          control.style.minHeight=height?Math.min(height,20)+'lh':'';
        }else{
          control.style.backgroundColor=background;
          control.style.minHeight=height?'max(44px,'+Math.min(height,20)+'lh)':'';
        }
        break;
      case 'check':
      case 'radio':
        control.checked=Boolean(model.checked);
        break;
      case 'entry':
        if(control.type!==(options.show?'password':'text'))control.type=options.show?'password':'text';
        control.style.backgroundColor=background;
        break;
      case 'text':
        control.rows=Math.max(2,Math.min(20,height||4));
        control.style.backgroundColor=background;
        break;
      case 'combo':
        replaceOptions(record,['',...(Array.isArray(options.values)?options.values.slice(0,250).map(scalar):[])]);break;
      case 'list':
        control.multiple=options.selectmode==='multiple'||options.selectmode==='extended';
        control.size=Math.max(2,Math.min(16,height||5));
        replaceOptions(record,Array.isArray(model.items)?model.items.slice(0,250).map(scalar):[]);
        break;
      case 'spin':
      case 'scale':{
        const low=number(options.from,0,-1000000,1000000), high=number(options.to,100,-1000000,1000000);
        control.min=String(Math.min(low,high));control.max=String(Math.max(low,high));
        control.step=String(number(options.resolution,1,.001,100000));
        break;
      }
      case 'progress':
        control.max=number(options.maximum,100,.001,1000000);
        if(options.mode==='indeterminate')control.removeAttribute('value');
        else control.value=number(model.value,0,0,control.max);
        break;
      case 'canvas':{
        const w=width||300,h=height||180;
        control.setAttribute('viewBox','0 0 '+w+' '+h);
        control.setAttribute('width',String(w));control.setAttribute('height',String(h));
        style.width=w+'px';
        control.style.backgroundColor=background;
        if(Array.isArray(model.items))control.replaceChildren(...model.items.slice(0,550).map(canvasShape).filter(Boolean));
        else control.replaceChildren();
        break;
      }
    }
    if(inputKinds.has(kind)&&(!record.pending||number(model.revision,0,0,Number.MAX_SAFE_INTEGER)>=record.pending)){
      record.pending=undefined;
      if(kind==='list'){
        const selected=new Set(Array.isArray(model.selected)?model.selected:[]);
        for(const option of control.options)option.selected=selected.has(Number(option.value));
      }else {
        const value=scalar(model.value);
        if(control.value!==value)control.value=value;
      }
    }
    if(model.focus&&record.focus!==model.focus){
      record.focus=model.focus;
      queueMicrotask(()=>control.focus({preventScroll:true}));
    }
  }

  function childrenOf(record,model,walk){
    const parent=record.control;
    const source=Array.isArray(model.children)?model.children.slice(0,180):[];
    const children=source.map(child=>({model:child,node:walk(child)})).filter(child=>child.node);
    const isGrid=children.some(child=>child.model.layout?.kind==='grid');
    parent.classList.toggle('python-tk-grid',isGrid);
    parent.style.gridTemplateRows=parent.style.gridTemplateColumns='';
    if(isGrid){
      for(const [key,style] of [['row','gridTemplateRows'],['column','gridTemplateColumns']]){
        const tracks=model.tracks?.[key];
        const limit=key==='row'?60:24;
        let count=0;
        for(const child of children){
          if(child.model.layout?.kind!=='grid')continue;
          count=Math.max(count,number(child.model.layout[key],0,0,limit)+number(child.model.layout[key+'span'],1,1,24));
        }
        parent.style[style]=Array.from({length:count},(_,index)=>{
          const track=tracks?.[index],minimum=number(track?.minsize,0,0,800),weight=number(track?.weight,0,0,30);
          return 'minmax('+minimum+'px,'+(weight?weight+'fr':'auto')+')';
        }).join(' ');
      }
      writeChildren(parent,children.map(child=>child.node));
    }else{
      const packed={top:[],bottom:[],left:[],right:[]},placed=[];
      for(const child of children){
        if(child.model.layout?.kind==='place'){placed.push(child.node);continue;}
        const side=child.model.layout?.side;
        packed[Object.hasOwn(packed,side)?side:'top'].push(child.node);
      }
      for(const side of Object.keys(packed))writeChildren(record.pack[side],packed[side]);
      writeChildren(record.pack.middle,[record.pack.left,record.pack.right].filter(node=>node.children.length));
      writeChildren(parent,[record.pack.top,record.pack.middle,record.pack.bottom].filter(node=>node.children.length).concat(placed));
    }
  }
  function showDialog(model){
    const id=Number.isSafeInteger(model?.id)?model.id:null;
    if(id===dialogId)return;
    dialogId=id;
    windows.inert=id!==null;
    if(id===null){dialog.replaceChildren();return;}
    const box=el('div',{className:'python-tk-message',role:'alertdialog','aria-modal':'true',
      'aria-label':text(model.title,200)||'Повідомлення'},
      el('strong',{},text(model.title,200)||'Повідомлення'),el('p',{},text(model.message)));
    const actions=el('div',{className:'python-tk-message-buttons'});
    const labels={ok:'Гаразд',yes:'Так',no:'Ні'};
    const buttons=Array.isArray(model.buttons)?model.buttons.slice(0,3).filter(key=>Object.hasOwn(labels,key)):['ok'];
    for(const key of buttons.length?buttons:['ok']){
      actions.append(el('button',{type:'button',onClick:()=>emit(id,'dialog',{value:key})},labels[key]));
    }
    box.append(actions);dialog.replaceChildren(box);
    queueMicrotask(()=>{
      if(dialogId!==id)return;
      box.scrollIntoView?.({block:'nearest'});
      actions.firstElementChild?.focus({preventScroll:true});
    });
  }

  function update(model){
    const seen=new Set();
    function walk(node,depth=0){
      const id=node?.id,kind=node?.kind;
      if(depth>14||seen.size>=180||!Number.isSafeInteger(id)||id<1||seen.has(id)||!kinds.has(kind))return null;
      seen.add(id);
      let record=records.get(id);
      if(!record||record.kind!==kind){record=createRecord(id,kind);records.set(id,record);}
      paint(record,node);
      if(boxKinds.has(kind))childrenOf(record,node,child=>walk(child,depth+1));
      return record.outer;
    }
    const roots=Array.isArray(model?.windows)?model.windows.slice(0,8).filter(node=>node?.kind==='window'):[];
    writeChildren(windows,roots.map(root=>walk(root)).filter(Boolean));
    showDialog(model?.dialog);
    for(const id of records.keys())if(!seen.has(id))records.delete(id);
  }

  return {element,update,clear(){update(null);revision=0;}};
}
