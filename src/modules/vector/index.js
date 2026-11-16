import { el,download } from '../../components/ui.js';
import { bindWheelZoom } from '../../components/wheel-zoom.js';
import { createAutosave } from '../../core/storage/autosave.js';
import { storageError } from '../../core/storage/database.js';
import { guideFor } from '../../practice/guide.js';
import { blank,clone,uid,combined,LIMIT,MAX_LAYERS,validate,objectTransform,paintVector } from './model.js';
import { svg,artwork,serialize,parseProject,pngBlob,sampleColor } from './svg.js';
import { bindCanvas } from './canvas.js';
import { contour,hasNodes,removeNode,setNodeType,setSegmentType,splitPath,joinPath } from './nodes.js';
import { alignSelection,distributeSelection,moveStack,reflectSelection } from './composition.js';
import { formatPanel,editVectorText } from './format-panel.js';

const button=(text,onClick,attrs={})=>el('button',{type:'button',onClick,...attrs},text);
const icon=(mark,label,onClick,attrs={})=>button(mark,onClick,{title:label,'aria-label':label,...attrs});
const href=(label,target,attrs={})=>el('a',{className:'button',href:target,...attrs},label);
const section=(title,...body)=>el('details',{},el('summary',{},title),...body);
const actionRow=(...actions)=>el('div',{className:'vector-small-actions'},...actions);
const safeName=value=>value.trim().replace(/[\\/\x00-\x1f]/g,' ').trim();
const toolChoices=[
  ['select','↖','Вибір'],['select-area','▧','Рамка'],['lasso','⌕','Ласо'],['hand','✋','Рука'],
  ['rect','▭','Прямокутник'],['ellipse','○','Еліпс'],['line','╱','Пряма'],
  ['polyline','⟋','Ламана'],['polygon-pen','⬠','Багатокутник'],['polygon','⬟','П’ятикутник'],['pencil','✎','Олівець'],
  ['bezier','∿','Безьє'],['calligraphy','✒','Каліграфія'],['text','Т','Текст'],['nodes','◇','Вузли'],['eyedropper','◉','Піпетка']
];
const toolGroups=[
  ['selection','Вибір',['select','select-area','lasso','hand']],
  ['shapes','Фігури',['rect','ellipse','polygon-pen','polygon','text']],
  ['paths','Лінії',['line','polyline','pencil','bezier','calligraphy']],
  ['editing','Редагування',['nodes','eyedropper']]
];
const shortcuts={v:'select',h:'hand',r:'rect',e:'ellipse',b:'bezier',n:'nodes',t:'text'};

export function mount(root,{filesystem:fs,notify,fileId,rememberWork,resume}) {
  let doc=blank(),committed=clone(doc),record,zoom=1,tool='select',busy=false,disposed=false,gestures;
  let layerId=doc.layers[0].id,selectedIds=new Set(),undo=[],redo=[],activeNode=null,markedNode,clipboard=[];
  let multiSelect=false,editingPaint,panelTab='style',textDialog;
  const nodeSelection=new Set();
  const defaults={fill:'#b69aef',fill2:'#79aaff',fillMode:'solid',fillSpread:'pad',fillPattern:'diagonal',
    stroke:'#28354b',stroke2:'#79aaff',strokeMode:'solid',strokeSpread:'pad',strokeWidth:3,
    strokeDash:'solid',strokeCap:'round',strokeJoin:'round',opacity:1,bevel:false,shadow:false,shadowColor:'#000000'};
  const host=el('section',{className:'vector-editor vector-studio','aria-label':'Векторний редактор'});
  const name=el('input',{value:'Мій малюнок.svg',maxlength:180,'aria-label':'Назва малюнка'});
  const status=el('p',{className:'vector-status','aria-live':'polite'},'Автозбереження на пристрої');
  const canvas=svg('svg',{viewBox:'0 0 960 640',tabindex:0,role:'img','aria-label':'Векторне полотно'});
  const viewport=el('div',{className:'vector-viewport'},canvas);
  const zoomLabel=el('output',{},'100%');
  const layer=()=>doc.layers.find(item=>item.id===layerId)??doc.layers[0];
  const selectable=object=>!object.hidden&&!object.locked&&doc.layers.some(item=>item.id===object.layer&&!item.hidden&&!item.locked);
  const selected=()=>doc.objects.filter(object=>selectedIds.has(object.id)&&selectable(object));
  const getPosition=()=>({zoom,layerId,scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop});
  function filename(){
    const value=name.value.trim();
    const output=/\.svg$/i.test(value)?value:value+'.svg';
    if(!value||output.length>180||safeName(value)!==value)throw new Error('Введи назву до 180 символів без слешів.');
    return output;
  }

  const autosave=createAutosave(async()=>{
    record=await fs.saveFile({...record,name:filename(),blob:serialize(committed),moduleId:'vector'});
    rememberWork?.(record,{position:getPosition()});
  },(phase,error)=>{
    if(!disposed)status.textContent={dirty:'Є зміни…',saving:'Зберігаємо…',saved:'Збережено на пристрої'}[phase]??storageError(error);
  },750);
  function commit(before){
    if(JSON.stringify(before)===JSON.stringify(doc))return false;
    try{doc=validate(doc);}
    catch{doc=before;notify('Зміна виходить за межі малюнка.');return false;}
    undo.push(before);
    while(undo.length>40||undo.length>1&&undo.reduce((n,state)=>n+state.layers.reduce((sum,item)=>sum+(item.image?.length??0),0),0)>18000000)undo.shift();
    redo=[];committed=clone(doc);autosave.change();return true;
  }
  function change(action){
    if(busy||disposed)return;
    gestures?.cancel();
    const before=clone(doc);
    try{action();commit(before);}catch(error){doc=before;notify(storageError(error));}
    render();
  }
  async function run(action,{flush=true}={}){
    if(busy||disposed)return;
    gestures.cancel();busy=true;host.inert=true;
    try{if(flush)await autosave.flush();await action();}
    catch(error){if(!disposed)notify(storageError(error));}
    finally{busy=false;if(!disposed){host.inert=false;render();}}
  }
  function clearNodes(){activeNode=null;nodeSelection.clear();}
  function setNode(index,add=false){
    if(!add)nodeSelection.clear();
    if(index==null){activeNode=null;return;}
    if(add&&nodeSelection.has(index))nodeSelection.delete(index);else nodeSelection.add(index);
    activeNode=nodeSelection.has(index)?index:[...nodeSelection].at(-1)??null;
  }
  function select(id,add=false,withinGroup=false){
    if(!id||!selectedIds.has(id))clearNodes();
    if(!add)selectedIds.clear();
    const object=doc.objects.find(item=>item.id===id&&selectable(item));
    if(!object)return;
    const group=object.group&&!withinGroup?doc.objects.filter(item=>item.group===object.group&&selectable(item)):[object];
    const remove=add&&selectedIds.has(id);
    for(const item of group)remove?selectedIds.delete(item.id):selectedIds.add(item.id);
    if(!add)layerId=object.layer;
  }
  function selectArea(ids,add=false){
    clearNodes();
    if(!add)selectedIds.clear();
    const hit=doc.objects.filter(object=>ids.includes(object.id)&&selectable(object));
    const groups=new Set(hit.map(object=>object.group).filter(Boolean));
    for(const item of doc.objects){
      if(selectable(item)&&(ids.includes(item.id)||groups.has(item.group)))selectedIds.add(item.id);
    }
  }
  function canDraw(){
    if(layer().hidden||layer().locked||layer().image){notify('Вибери видимий розблокований векторний шар.');return false;}
    return true;
  }
  const toolButtons=new Map(),groupButtons=new Map();
  function setTool(value){
    if(value==='select'&&(tool==='nodes'||tool==='add-node')){
      const [object]=selected();
      if(object?.group)select(object.id);
      clearNodes();
    }
    tool=value;
    if(value!=='gradient')editingPaint=undefined;
    for(const [key,control] of toolButtons)control.setAttribute('aria-pressed',String(tool===key));
    canvas.style.cursor=value==='hand'?'grab':['select','nodes'].includes(value)?'default':'crosshair';
  }
  const tools=el('div',{className:'vector-tools','aria-label':'Інструменти'});
  function activateTool(key){
    gestures?.cancel();setTool(key);
    if(key==='nodes')closePanel();
    render();
  }
  for(const [key,mark,label] of toolChoices){
    const shortcut=Object.keys(shortcuts).find(letter=>shortcuts[letter]===key)?.toUpperCase();
    const control=button(el('span',{},el('b',{'aria-hidden':'true'},mark),label),()=>activateTool(key),
      {'aria-pressed':key===tool,'aria-keyshortcuts':shortcut,title:shortcut?label+' ('+shortcut+')':label});
    toolButtons.set(key,control);tools.append(control);
  }
  const multiple=icon('✓+','Вибирати кілька',()=>{
    multiSelect=!multiSelect;multiple.setAttribute('aria-pressed',String(multiSelect));
  },{'aria-pressed':'false'});
  tools.append(multiple);
  const toolTabs=el('div',{className:'vector-tool-tabs','aria-label':'Групи інструментів'});
  function showToolGroup(group){
    const visible=toolGroups.find(([id])=>id===group)[2];
    for(const [id,control] of toolButtons)control.hidden=!visible.includes(id);
    for(const [id,control] of groupButtons)control.setAttribute('aria-pressed',String(id===group));
    multiple.hidden=group!=='selection';
    tools.scrollLeft=0;
  }
  for(const [key,label] of toolGroups){
    const control=button(label,()=>showToolGroup(key));
    groupButtons.set(key,control);toolTabs.append(control);
  }
  showToolGroup('shapes');
  const finish=button('✓ Завершити',()=>gestures.finishPath());
  const pathActions=el('div',{className:'vector-path-actions',hidden:true},finish,
    button('Закрити контур',()=>gestures.finishPath(true)),icon('×','Скасувати контур',()=>gestures.cancel()));
  function pathChanged(count){pathActions.hidden=!count;}

  function setZoom(value){
    zoom=Math.max(.0625,Math.min(5,value));
    canvas.style.width=doc.width*zoom+'px';
    canvas.style.height=doc.height*zoom+'px';
    zoomLabel.textContent=Math.round(zoom*100)+'%';
  }
  function fit(){
    const style=getComputedStyle(viewport);
    const w=viewport.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const h=viewport.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    if(w>0&&h>0)setZoom(Math.min(1,w/doc.width,h/doc.height));
  }
  function toText(object){
    if(!object||object.type!=='text'||!selectable(object)||textDialog?.open)return;
    textDialog=editVectorText(host,object,style=>change(()=>{
      const actual=doc.objects.find(item=>item.id===object.id);
      if(actual)Object.assign(actual,style);
    }));
  }
  function renderCanvas(){
    canvas.setAttribute('viewBox','0 0 '+doc.width+' '+doc.height);
    setZoom(zoom);
    canvas.replaceChildren(...artwork(doc));
    const locked=new Set(doc.objects.filter(object=>!selectable(object)).map(object=>object.id));
    for(const node of canvas.querySelectorAll('[data-id]'))if(locked.has(node.dataset.id))node.setAttribute('data-canvas-locked','');
    const items=selected(),box=combined(items),overlay=svg('g',{'data-selection':'true'});
    const unit=1/zoom;
    if(box)overlay.append(svg('rect',{x:box.x,y:box.y,width:box.w,height:box.h,fill:'none',stroke:'#6552db',
      'stroke-width':unit,'stroke-dasharray':5*unit+' '+3*unit,'pointer-events':'none'}));
    if(items.length===1){
      const object=items[0],{w,h}=object;
      const group=svg('g',{transform:objectTransform(object)});
      if((tool==='nodes'||tool==='add-node')&&hasNodes(object)){
        const path=contour({...object}),curve=path.type==='curve',last=path.points.length-1,anchors=[];
        const owner=index=>{
          const remainder=index%3;
          const anchor=remainder===1?index-1:remainder===2?index+1:index;
          return path.closed&&anchor===last?0:anchor;
        };
        path.points.forEach(([x,y],index)=>{
          if(curve&&path.closed&&index===last)return;
          const control=curve&&index%3!==0;
          if(control){
            if(activeNode===null||owner(index)!==owner(activeNode))return;
            const [ax,ay]=path.points[owner(index)];
            group.append(svg('line',{x1:ax*w,y1:ay*h,x2:x*w,y2:y*h,stroke:'#e18745','stroke-width':unit,'pointer-events':'none'}));
          }
          const handle=svg('circle',{cx:x*w,cy:y*h,r:(control?6.5:9.5)*unit,
            fill:nodeSelection.has(index)?'#c5f277':control?'#f2c46d':'#ffffff',
            stroke:'#6350dc','stroke-width':2*unit,'data-handle':'node','data-node':index,
            'data-node-kind':control?'tangent':'anchor','pointer-events':tool==='add-node'?'none':'all'});
          if(control)group.append(handle);else anchors.push(handle);
        });
        group.append(...anchors);
      }else if(tool==='gradient'&&editingPaint){
        const {x1,y1,x2,y2}=paintVector(object,editingPaint);
        group.append(svg('line',{x1:x1*w,y1:y1*h,x2:x2*w,y2:y2*h,stroke:'#402299','stroke-width':2*unit,'pointer-events':'none'}));
        for(const [index,x,y] of [[1,x1,y1],[2,x2,y2]])group.append(svg('circle',{
          cx:x*w,cy:y*h,r:11*unit,fill:'#f8d96b',stroke:'#402299','stroke-width':2*unit,
          'data-handle':'gradient','data-paint':editingPaint,'data-endpoint':index
        }));
      }else if(tool==='select'){
        group.append(svg('line',{x1:w/2,y1:0,x2:w/2,y2:-22*unit,stroke:'#6350dc','stroke-width':unit,'pointer-events':'none'}),
          svg('circle',{cx:w/2,cy:-26*unit,r:9*unit,fill:'#fff',stroke:'#6350dc','stroke-width':2*unit,'data-handle':'rotate'}),
          svg('rect',{x:w-9*unit,y:h-9*unit,width:18*unit,height:18*unit,rx:3*unit,fill:'#fff',
            stroke:'#6350dc','stroke-width':2*unit,'data-handle':'resize'}));
      }
      overlay.append(group);
    }
    canvas.append(overlay);
  }
  function render(full=true){
    renderCanvas();
    if(!full)return;
    undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
    const items=selected();
    selectionLabel.textContent=items.length===1?items[0].label:items.length?'Вибрано: '+items.length:layer().name;
    formats.sync();syncGeometry();renderLayers();pageFields();syncNodeControls(items);
  }
  function travel(direction){
    if(busy)return;
    gestures.cancel();
    const source=direction==='undo'?undo:redo,other=direction==='undo'?redo:undo;
    if(!source.length)return;
    other.push(clone(doc));doc=source.pop();layerId=layer().id;
    committed=clone(doc);selectedIds.clear();clearNodes();autosave.change();render();
  }

  const selectionLabel=el('p',{className:'vector-selection-label'});
  const panelBodies=new Map(),panelButtons=[];
  const panel=el('aside',{className:'vector-inspector','aria-label':'Властивості малюнка'});
  function openPanel(tab,show=true){
    panelTab=tab;
    for(const [id,body] of panelBodies)body.hidden=id!==tab;
    for(const [id,control] of panelButtons)control.setAttribute('aria-pressed',String(id===tab));
    host.classList.toggle('vector-panel-open',show);
  }
  const phoneNav=el('div',{className:'vector-mobile-tabs','aria-label':'Панелі'});
  const panelNav=el('div',{className:'vector-panel-tabs'});
  const closePanel=()=>openPanel(panelTab,false);
  for(const [id,label] of [['style','Стиль'],['actions','Дії'],['layers','Шари'],['page','Полотно']]){
    for(const target of [panelNav,phoneNav]){
      const control=button(label,()=>openPanel(id));
      panelButtons.push([id,control]);target.append(control);
    }
  }
  const formats=formatPanel({defaults,selected,change,editDirection:kind=>{
    editingPaint=kind;setTool('gradient');closePanel();render();
  }});
  panelBodies.set('style',formats.pane);

  const fromSelection=(label,action)=>button(label,()=>change(()=>{
    const items=selected();
    if(!items.length)throw new Error('Спочатку вибери об’єкт.');
    action(items);
  }));
  function remove(objects){
    const ids=new Set(objects.map(object=>object.id));
    doc.objects=doc.objects.filter(object=>!ids.has(object.id));selectedIds.clear();clearNodes();
  }
  function paste(objects,sameLayer){
    if(!objects.length)throw new Error('Скопіюй об’єкт для вставлення.');
    if(!canDraw()&&!sameLayer)return;
    if(doc.objects.length+objects.length>LIMIT)throw new Error('Максимум '+LIMIT+' об’єктів.');
    const groups=new Map();
    const copies=objects.map(source=>{
      const object=clone(source);
      object.id=uid();object.x=Math.min(10000,object.x+18);object.y=Math.min(10000,object.y+18);
      if(object.group){if(!groups.has(object.group))groups.set(object.group,uid());object.group=groups.get(object.group);}
      if(!sameLayer)object.layer=layer().id;
      return object;
    });
    doc.objects.push(...copies);selectedIds=new Set(copies.map(object=>object.id));clearNodes();
  }
  function clip(mode){
    change(()=>{
      if(mode==='paste'){paste(clipboard,false);return;}
      const items=selected();
      if(!items.length)throw new Error('Спочатку вибери об’єкти.');
      clipboard=clone(items);
      if(mode==='cut')remove(items);else notify('Об’єкти скопійовано.');
    });
  }
  const geometry=new Map();
  function geometryField(key,label,type,attrs={}){
    const input=el('input',{type,...attrs,onChange:()=>{
      if(!input.validity.valid||input.value==='')return syncGeometry();
      change(()=>{for(const object of selected())object[key]=type==='number'?Number(input.value):input.value;});
    }});
    geometry.set(key,input);
    return el('label',{},label,input);
  }
  const editText=button('Текст…',()=>toText(selected()[0]));
  function syncGeometry(){
    const items=selected(),item=items.length===1?items[0]:undefined;
    for(const [key,input] of geometry){input.disabled=!item;input.value=item?.[key]??'';}
    editText.disabled=item?.type!=='text';
  }
  const arrange=section('Вирівнювання і розподіл',actionRow(
    ...[['x',0,'Ліворуч'],['x',.5,'Центр ↔'],['x',1,'Праворуч'],['y',0,'Угорі'],['y',.5,'Центр ↕'],['y',1,'Унизу']]
      .map(([axis,amount,label])=>fromSelection(label,items=>alignSelection(items,axis,amount,doc)))),
    actionRow(...[['x',false,'Центри ↔'],['y',false,'Центри ↕'],['x',true,'Проміжки ↔'],['y',true,'Проміжки ↕']]
      .map(([axis,gaps,label])=>fromSelection(label,items=>distributeSelection(items,axis,gaps)))));
  const ordering=section('Порядок і групи',actionRow(
    ...[['top','На передній план'],['forward','На крок уперед'],['back','На крок назад'],['bottom','На задній план']]
      .map(([mode,label])=>fromSelection(label,items=>moveStack(doc,new Set(items.map(object=>object.id)),mode))),
    fromSelection('Згрупувати',items=>{
      if(items.length<2)throw new Error('Вибери щонайменше два об’єкти.');
      const id=uid();for(const object of items)object.group=id;
    }),
    fromSelection('Розгрупувати',items=>{
      const groups=new Set(items.map(object=>object.group).filter(Boolean));
      for(const object of doc.objects)if(groups.has(object.group))object.group='';
    })));
  function nodeAction(label,action){
    return fromSelection(label,items=>{
      if(items.length!==1)throw new Error('Вибери одну фігуру.');
      action(contour(items[0]));
    });
  }
  function needNode(){
    if(activeNode===null)throw new Error('Торкнися вузла на полотні.');
    return activeNode;
  }
  function toggleNodeInsertion(){
    if(tool==='add-node'){setTool('nodes');render();return;}
    const items=selected();
    if(items.length!==1||!hasNodes(items[0])){notify('Вибери одну фігуру.');return;}
    gestures.cancel();setTool('add-node');closePanel();render();
  }
  function deletePickedNode(object){removeNode(object,needNode());clearNodes();}
  const addNode=button('+ Вузол',toggleNodeInsertion);
  const deleteNode=nodeAction('− Вузол',deletePickedNode);
  const nodeHint=el('span',{className:'vector-node-hint','aria-live':'polite'});
  const nodeControls=el('div',{className:'vector-node-controls',hidden:true,'aria-label':'Редагування вузлів'},
    addNode,deleteNode,icon('⋯','Дії з вузлами',()=>{openPanel('actions');nodes.open=true;nodes.scrollIntoView({block:'nearest'});}),
    nodeHint);
  function syncNodeControls(items){
    const editing=tool==='nodes'||tool==='add-node';
    nodeControls.hidden=!editing;
    if(!editing)return;
    const object=items.length===1&&hasNodes(items[0])?items[0]:null;
    addNode.disabled=!object;
    addNode.setAttribute('aria-pressed',String(tool==='add-node'));
    deleteNode.disabled=!object||activeNode===null||((object.type==='curve'||object.type==='ellipse')&&activeNode%3!==0);
    nodeHint.textContent=tool==='add-node'?'Торкнися контуру':object?'':'Торкнися фігури';
  }
  const nodes=section('Вузли та сегменти',actionRow(
    fromSelection('У контур',items=>{for(const object of items)contour(object,true);clearNodes();setTool('nodes');closePanel();}),
    button('+ Вставити',toggleNodeInsertion),
    nodeAction('− Видалити',deletePickedNode),
    ...[['corner','Кутовий'],['smooth','Гладкий'],['symmetric','Симетричний']].map(([type,label])=>
      nodeAction(label,object=>setNode(setNodeType(object,needNode(),type)))),
    nodeAction('Прямий сегмент',object=>setNode(setSegmentType(object,needNode(),false))),
    nodeAction('Кривий сегмент',object=>setNode(setSegmentType(object,needNode(),true))),
    ...[[false,'Розірвати у вузлі'],[true,'Розірвати на сегменті']].map(([segment,label])=>nodeAction(label,object=>{
      const extra=splitPath(object,needNode(),segment);
      if(extra){if(doc.objects.length>=LIMIT)throw new Error('Досягнуто межі об’єктів.');doc.objects.push(extra);}
      clearNodes();
    })),
    nodeAction('Позначити кінець',object=>{markedNode={id:object.id,index:needNode()};notify('Кінець позначено. Вибери другий.');}),
    ...[[false,'З’єднати відрізком'],[true,'Об’єднати вузли']].map(([merge,label])=>nodeAction(label,object=>{
      const first=markedNode?doc.objects.find(item=>item.id===markedNode.id&&selectable(item)):object;
      const index=markedNode?.index??[...nodeSelection].find(index=>index!==activeNode);
      if(!first||index==null)throw new Error('Познач перший кінець і вибери другий.');
      joinPath(first,index,object,needNode(),merge);
      if(first!==object)doc.objects=doc.objects.filter(item=>item.id!==object.id);
      selectedIds=new Set([first.id]);markedNode=undefined;clearNodes();
    }))));
  const objectActions=el('div',{},actionRow(button('Копіювати',()=>clip('copy')),button('Вирізати',()=>clip('cut')),
    button('Вставити',()=>clip('paste')),fromSelection('Дублювати',items=>paste(items,true)),fromSelection('Видалити',remove),editText),
    section('Розмір і положення',el('div',{className:'vector-fields'},
      geometryField('x','X','number',{min:-10000,max:10000,step:'any'}),geometryField('y','Y','number',{min:-10000,max:10000,step:'any'}),
      geometryField('w','Ширина','number',{min:1,max:10000,step:'any'}),geometryField('h','Висота','number',{min:1,max:10000,step:'any'}),
      geometryField('angle','Кут','number',{min:-360,max:360,step:'any'}),geometryField('label','Назва','text',{maxlength:80})),
      actionRow(fromSelection('Віддзеркалити ↔',items=>reflectSelection(items,'x')),fromSelection('Віддзеркалити ↕',items=>reflectSelection(items,'y')))),
    arrange,ordering,nodes);
  panelBodies.set('actions',objectActions);

  const layerList=el('div',{className:'vector-layer-list'}),objectsList=el('div',{className:'vector-layers'});
  const layerName=el('input',{'aria-label':'Назва шару',maxlength:80,onChange:()=>change(()=>{
    if(layerName.value.trim())layer().name=layerName.value.trim();
  })});
  const layerOpacity=el('input',{type:'range',min:0,max:100,step:1,'aria-label':'Непрозорість шару',
    onChange:()=>change(()=>{layer().opacity=Number(layerOpacity.value)/100;})});
  function replaceLayer(index){
    change(()=>{
      const current=doc.layers.indexOf(layer()),next=current+index;
      if(next<0||next>=doc.layers.length)return;
      [doc.layers[current],doc.layers[next]]=[doc.layers[next],doc.layers[current]];
    });
  }
  function renderLayers(){
    const current=layer();
    layerName.value=current.name;layerOpacity.value=Math.round(current.opacity*100);
    layerList.replaceChildren(...[...doc.layers].reverse().map(item=>el('div',{
      className:'vector-layer'+(item.id===current.id?' is-selected':'')},
      button((item.image?'▧ ':'')+item.name,()=>{layerId=item.id;render();},{className:'vector-layer-name','aria-pressed':item.id===current.id}),
      icon(item.hidden?'○':'●',item.hidden?'Показати шар':'Сховати шар',()=>change(()=>{item.hidden=!item.hidden;})),
      icon(item.locked?'🔒':'◇',item.locked?'Розблокувати шар':'Заблокувати шар',()=>change(()=>{item.locked=!item.locked;})))));
    objectsList.replaceChildren(...doc.objects.filter(object=>object.layer===current.id).reverse().map(object=>el('div',
      {className:'vector-layer'+(selectedIds.has(object.id)?' is-selected':'')},
      el('input',{type:'checkbox',checked:selectedIds.has(object.id),disabled:!selectable(object),'aria-label':'Вибрати '+object.label,
        onChange:()=>{select(object.id,true);render();}}),
      button(object.label,()=>{select(object.id);render();},{className:'vector-layer-name',disabled:!selectable(object)}),
      icon(object.hidden?'○':'●',object.hidden?'Показати об’єкт':'Сховати об’єкт',()=>change(()=>{object.hidden=!object.hidden;})),
      icon(object.locked?'🔒':'◇',object.locked?'Розблокувати об’єкт':'Заблокувати об’єкт',()=>change(()=>{object.locked=!object.locked;})))));
  }
  panelBodies.set('layers',el('div',{},layerList,el('div',{className:'vector-fields'},
    el('label',{},'Назва',layerName),el('label',{},'Непрозорість',layerOpacity)),
    actionRow(button('+ Шар',()=>change(()=>{
      if(doc.layers.length>=MAX_LAYERS)throw new Error('Максимум '+MAX_LAYERS+' шарів.');
      layerId=uid();doc.layers.push({id:layerId,name:'Векторний шар '+(doc.layers.length+1),hidden:false,locked:false,opacity:1});
      selectedIds.clear();
    })),button('↑ Вище',()=>replaceLayer(1)),button('↓ Нижче',()=>replaceLayer(-1)),
    fromSelection('Перенести вибране сюди',items=>{if(canDraw())for(const object of items)object.layer=layer().id;}),
    button('Видалити шар',()=>change(()=>{
      if(doc.layers.length===1)throw new Error('Залиш хоча б один шар.');
      if(doc.objects.some(object=>object.layer===layerId)&&!confirm('Видалити шар разом з об’єктами?'))return;
      doc.objects=doc.objects.filter(object=>object.layer!==layerId);
      doc.layers=doc.layers.filter(item=>item.id!==layerId);
      layerId=layer().id;selectedIds.clear();clearNodes();
    }))),section('Об’єкти шару',objectsList)));

  const pageW=el('input',{type:'number',min:160,max:2400,'aria-label':'Ширина полотна'}),
    pageH=el('input',{type:'number',min:160,max:2400,'aria-label':'Висота полотна'});
  const background=el('input',{type:'color','aria-label':'Колір фону',onChange:()=>change(()=>{doc.background=background.value;})});
  const transparent=el('input',{type:'checkbox','aria-label':'Прозорий фон',onChange:()=>change(()=>{doc.transparent=transparent.checked;})});
  const pagePanel=el('div',{});
  function pageFields(){pageW.value=doc.width;pageH.value=doc.height;background.value=doc.background==='none'?'#ffffff':doc.background;transparent.checked=doc.transparent;}
  const undoButton=icon('↶','Скасувати дію',()=>travel('undo')),redoButton=icon('↷','Повторити дію',()=>travel('redo'));
  pagePanel.append(el('div',{className:'vector-fields'},el('label',{},'Ширина',pageW),el('label',{},'Висота',pageH),
    el('label',{},'Колір фону',background),el('label',{},'Прозорий фон',transparent)),
    button('Застосувати',()=>change(()=>{
      if(!pageW.value||!pageH.value||!pageW.validity.valid||!pageH.validity.valid)throw new Error('Розмір полотна від 160 до 2400 пікселів.');
      doc.width=Number(pageW.value);doc.height=Number(pageH.value);fit();
    })));
  panelBodies.set('page',pagePanel);
  panel.append(el('header',{className:'vector-panel-header'},selectionLabel,icon('×','Закрити панель',closePanel,{className:'vector-panel-close'})),
    panelNav,...panelBodies.values());
  function reset(next,stored,filename,position){
    doc=next;committed=clone(doc);record=stored;name.value=filename;
    layerId=doc.layers.some(item=>item.id===position?.layerId)?position.layerId:doc.layers[0].id;
    selectedIds.clear();clearNodes();markedNode=undefined;undo=[];redo=[];setTool('select');
    if(Number.isFinite(position?.zoom))setZoom(position.zoom);else fit();
    if(Number.isFinite(position?.scrollLeft))viewport.scrollLeft=position.scrollLeft;
    if(Number.isFinite(position?.scrollTop))viewport.scrollTop=position.scrollTop;
    if(stored)rememberWork?.(stored,{position:getPosition()});else autosave.change();
  }
  const input=el('input',{type:'file',accept:'.svg,image/svg+xml',hidden:true,onChange:()=>{
    const file=input.files[0];input.value='';
    if(file)run(async()=>reset(await parseProject(file),undefined,file.name));
  }});
  const imageInput=el('input',{type:'file',accept:'.png,.jpg,.jpeg,.gif,.bmp,.webp',hidden:true,onChange:()=>{
    const file=imageInput.files[0];imageInput.value='';
    if(!file)return;
    run(async()=>{
      if(doc.layers.length>=MAX_LAYERS||file.size>20000000)throw new Error('Зменш файл до 20 МБ або звільни місце для шару.');
      const url=URL.createObjectURL(file);
      try{
        const bitmap=new Image();
        await new Promise((resolve,reject)=>{
          bitmap.onload=resolve;bitmap.onerror=()=>reject(new Error('Не вдалося прочитати зображення.'));bitmap.src=url;
        });
        if(bitmap.naturalWidth*bitmap.naturalHeight>30000000)throw new Error('Зменш зображення перед імпортуванням.');
        const surface=document.createElement('canvas');
        const scale=Math.min(1,doc.width/bitmap.naturalWidth,doc.height/bitmap.naturalHeight);
        surface.width=Math.max(1,Math.round(bitmap.naturalWidth*scale));
        surface.height=Math.max(1,Math.round(bitmap.naturalHeight*scale));
        surface.getContext('2d').drawImage(bitmap,0,0,surface.width,surface.height);
        const image=surface.toDataURL('image/png');
        const before=clone(doc);
        doc.layers.unshift({id:uid(),name:safeName(file.name).slice(0,80)||'Растрове тло',opacity:1,hidden:false,locked:false,image});
        commit(before);
      }finally{URL.revokeObjectURL(url);}
    });
  }});
  const fileMenu=el('details',{className:'vector-file-menu'},el('summary',{},'Файл'),el('div',{className:'vector-file-actions'},
    button('+ Новий',()=>run(()=>reset(blank(),undefined,'Мій малюнок.svg'))),
    button('Відкрити SVG',()=>input.click()),
    button('Растрове зображення як шар',()=>imageInput.click()),
    button('Експорт SVG',()=>run(()=>download(serialize(doc),filename()),{flush:false})),
    button('Експорт шару SVG',()=>run(()=>{
      const item=layer(),title=safeName(item.name)||'Шар';
      download(serialize({...doc,transparent:true,layers:[item],objects:doc.objects.filter(object=>object.layer===item.id)}),title+'.svg');
    },{flush:false})),
    button('Експорт PNG',()=>run(async()=>download(await pngBlob(doc),filename().replace(/\.svg$/i,'.png')),{flush:false})),
    href('Растровий редактор','#editor/raster')));
  fileMenu.addEventListener('click',event=>{if(event.target.closest('button,a'))fileMenu.open=false;});
  const save=()=>run(async()=>{if(!record&&!autosave.dirty())autosave.change();await autosave.flush();},{flush:false});
  const top=el('header',{className:'vector-topbar'},href('←','#catalog',{'aria-label':'До каталогу'}),name,
    icon('✓','Зберегти',save,{className:'primary'}),fileMenu,guideFor(fileId),input,imageInput);
  name.addEventListener('input',()=>autosave.change());
  const zoomBar=el('div',{className:'vector-zoom'},undoButton,redoButton,
    icon('−','Зменшити масштаб',()=>setZoom(zoom/1.25)),zoomLabel,icon('+','Збільшити масштаб',()=>setZoom(zoom*1.25)),
    icon('⊡','Умістити полотно',fit),href('Растр','#editor/raster',{className:'button vector-switch'}));
  const workspace=el('div',{className:'vector-workspace'},zoomBar,viewport,pathActions,nodeControls);
  host.append(top,el('div',{className:'vector-tool-shelf'},toolTabs,tools),el('div',{className:'vector-layout'},workspace,panel),phoneNav,status);
  root.append(host);document.body.classList.add('vector-focus-mode');
  gestures=bindCanvas(canvas,viewport,{doc:()=>doc,tool:()=>tool,style:()=>({...defaults,layer:layer().id}),
    selected,select,selectArea,multiSelect:()=>multiSelect,canDraw,setTool,render,commit,zoom:()=>zoom,
    setNode,restore:value=>{doc=value;},blocked:()=>busy,notify,pathChanged,
    objectAdded:id=>toText(doc.objects.find(item=>item.id===id)),
    objectActivated:id=>toText(doc.objects.find(item=>item.id===id))});
  const removeWheelZoom=bindWheelZoom(viewport,canvas,{current:()=>zoom,zoom:setZoom,blocked:()=>busy||gestures.active()});
  canvas.addEventListener('click',async event=>{
    if(tool!=='eyedropper'||busy)return;
    const matrix=canvas.getScreenCTM();
    if(!matrix)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()),snapshot=doc;
    try{
      const color=await sampleColor(snapshot,point);
      if(disposed||tool!=='eyedropper'||snapshot!==doc)return;
      if(!color){notify('У цій точці прозоре полотно.');return;}
      change(()=>{
        const items=selected();
        for(const object of items.length?items:[defaults]){object.fill=color;object.fillMode='solid';}
      });
    }catch(error){if(!disposed)notify(error.message);}
  });
  host.addEventListener('keydown',event=>{
    if(busy||event.defaultPrevented||event.target.closest('input,textarea,select,dialog'))return;
    const key=event.key.toLowerCase(),command=event.ctrlKey||event.metaKey;
    if(!command&&!event.altKey&&Object.hasOwn(shortcuts,key)){
      const next=shortcuts[key],group=toolGroups.find(([, , keys])=>keys.includes(next))[0];
      event.preventDefault();showToolGroup(group);activateTool(next);return;
    }
    if(command&&key==='s'){event.preventDefault();save();}
    if(command&&key==='z'){event.preventDefault();travel(event.shiftKey?'redo':'undo');}
    if(command&&key==='y'){event.preventDefault();travel('redo');}
    if(command&&['c','x','v'].includes(key)){event.preventDefault();clip({c:'copy',x:'cut',v:'paste'}[key]);}
    if(event.key==='Escape'){
      if(gestures.hasPath?.()){gestures.cancel();return;}
      closePanel();selectedIds.clear();clearNodes();setTool('select');render();
    }
    if(event.key==='Delete'&&selected().length){
      event.preventDefault();
      if(tool==='nodes'||tool==='add-node'){if(!deleteNode.disabled)deleteNode.click();}
      else change(()=>remove(selected()));
    }
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(delta&&selected().length){
      event.preventDefault();
      const step=event.shiftKey?10:1;
      change(()=>{for(const object of selected()){object.x+=delta[0]*step;object.y+=delta[1]*step;}});
    }
  });
  const leave=event=>{if(autosave.dirty()||busy){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',leave);openPanel('style',false);render();
  const frame=requestAnimationFrame(()=>{if(!record)fit();});
  if(fileId)run(async()=>{
    const file=await fs.getFile(fileId);
    if(!file)throw new Error('Файл уже видалено.');
    reset(await parseProject(file.blob),file,file.name,resume?.position);
  });
  return {
    getResumePosition(id){if(record?.id===id)return getPosition();},
    async canLeave(){
      if(busy)return false;
      gestures.cancel();
      try{await autosave.flush();return true;}
      catch{return confirm('Малюнок не збережено. Вийти й втратити зміни?');}
    },
    dispose(){
      disposed=true;cancelAnimationFrame(frame);removeWheelZoom();gestures.dispose();autosave.dispose();textDialog?.close();
      document.body.classList.remove('vector-focus-mode');window.removeEventListener('beforeunload',leave);
    }
  };
}
