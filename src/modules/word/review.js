import { el } from '../../components/ui.js';
import { imagePresets,tablePresets } from './styles.js';

const tableStyleAttribute='data-word-table-style';
const imageStyleAttribute='data-word-image-style';
const cellProperties=[
  'background-color',
  ...['top','right','bottom','left'].flatMap(side=>['width','style','color'].map(property=>`border-${side}-${property}`))
];
const invalidReview='Пошкоджені дані рецензування.';
const unsupportedEdits='У копії є зміни поза рецензуванням цієї роботи. Скасуй їх, залишивши видалення змісту й оформлення таблиць та зображень.';
const maxNodes=20000;
const draftCache=new WeakMap();

function parse(html){
  const root=document.createElement('div');
  root.innerHTML=html;
  return root;
}

function objects(root,kind){
  return [...root.querySelectorAll(kind==='table'?'table':'img')].filter(node=>!node.closest('[data-word-toc]'));
}

function cells(table){
  return [...table.rows].flatMap(row=>[...row.cells]);
}

function pathTo(root,node){
  const path=[];
  while(node!==root){
    path.unshift([...node.parentNode.childNodes].indexOf(node));
    node=node.parentNode;
  }
  return path;
}

function checkedSourceId(value){
  if(value===undefined)return undefined;
  if(typeof value!=='string'||!/^[0-9a-f]{32}$/i.test(value))throw new Error(invalidReview);
  return value.toLowerCase();
}

function cellChanges(before,after){
  const original=cells(before),edited=cells(after);
  if(original.length!==edited.length)return null;
  const changes=[];
  original.forEach((cell,index)=>{
    const revised=edited[index];
    cellProperties.forEach((property,position)=>{
      const from=cell.style.getPropertyValue(property),to=revised.style.getPropertyValue(property);
      if(from!==to)changes.push([index,position,from,to]);
      cell.style.removeProperty(property);revised.style.removeProperty(property);
    });
    if(!cell.style.length)cell.removeAttribute('style');
    if(!revised.style.length)revised.removeAttribute('style');
  });
  return changes;
}

function compareDraft(html,review){
  const cached=draftCache.get(review);
  if(cached?.html===html)return cached.result;
  const result=diffDraft(review.baseHtml,html);
  draftCache.set(review,{html,result});
  return result;
}

function diffDraft(originalHtml,editedHtml){
  if(originalHtml===editedHtml)return {changes:[],unsupported:false};
  const original=parse(originalHtml),edited=parse(editedHtml);
  const oldContents=original.querySelectorAll('[data-word-toc]'),newContents=edited.querySelectorAll('[data-word-toc]');
  const changes=[];
  if(oldContents.length===1&&newContents.length===0){
    const old=oldContents[0];
    changes.push({id:'toc',kind:'toc',path:pathTo(original,old),before:old.outerHTML,status:'pending'});
    old.remove();
  }
  for(const [kind,attribute] of [['table',tableStyleAttribute],['image',imageStyleAttribute]]){
    const before=objects(original,kind),after=objects(edited,kind);
    if(before.length!==after.length)return {changes,unsupported:true};
    for(let index=0;index<before.length;index++){
      const old=before[index],revised=after[index];
      const from=old.getAttribute(attribute)||'',to=revised.getAttribute(attribute)||'';
      old.removeAttribute(attribute);revised.removeAttribute(attribute);
      const properties=kind==='table'?cellChanges(old,revised):[];
      if(!properties)return {changes,unsupported:true};
      if(from!==to||properties.length){
        const change={id:`${kind}-${index}`,kind,index,from,to,status:'pending'};
        if(properties.length)change.cells=properties;
        changes.push(change);
      }
    }
  }
  return {changes,unsupported:original.innerHTML!==edited.innerHTML};
}

export function startReview(html,{sourceId}={}){
  return {mode:'editing',sourceId:checkedSourceId(sourceId),baseHtml:html};
}

export function getReviewSummary(html,review){
  const mode=review?.mode;
  const {changes,unsupported}=mode==='editing'?compareDraft(html,review):{changes:review?.changes||[],unsupported:false};
  return {
    mode,changes,unsupported,
    complete:mode==='deciding'&&changes.every(change=>change.status!=='pending')
  };
}

export function prepareReview(html,review){
  if(review?.mode!=='editing')throw new Error('Спочатку почни рецензування.');
  const {changes,unsupported}=compareDraft(html,review);
  if(unsupported)throw new Error(unsupportedEdits);
  if(!changes.length)throw new Error('Спочатку внеси виправлення.');
  return {mode:'deciding',sourceId:review.sourceId,changes};
}

function validIndex(value){
  return Number.isInteger(value)&&value>=0&&value<maxNodes;
}

function readCellChanges(raw){
  if(raw===undefined)return [];
  if(!Array.isArray(raw))throw new Error(invalidReview);
  const probe=document.createElement('td');
  const seen=new Set();
  function cssValue(property,value){
    if(typeof value!=='string'||value.length>=150||/url\(|expression|var\(/i.test(value))throw new Error(invalidReview);
    probe.style.removeProperty(property);
    if(value){
      probe.style.setProperty(property,value);
      if(!probe.style.getPropertyValue(property))throw new Error(invalidReview);
    }
    return probe.style.getPropertyValue(property);
  }
  return raw.map(item=>{
    if(!Array.isArray(item)||item.length!==4)throw new Error(invalidReview);
    const [index,position,from,to]=item,property=cellProperties[position],key=`${index}:${position}`;
    if(!validIndex(index)||!Number.isInteger(position)||!property||seen.has(key))throw new Error(invalidReview);
    seen.add(key);
    const old=cssValue(property,from),revised=cssValue(property,to);
    if(old===revised)throw new Error(invalidReview);
    return [index,position,old,revised];
  });
}

export function validateReview(raw,cleanHTML){
  if(raw===undefined)return undefined;
  if(!raw||typeof raw!=='object')throw new Error(invalidReview);
  const {mode}=raw,sourceId=checkedSourceId(raw.sourceId);
  if(mode==='editing')return startReview(cleanHTML(raw.baseHtml),{sourceId});
  if(mode!=='deciding'||!Array.isArray(raw.changes)||!raw.changes.length)throw new Error(invalidReview);
  const seen=new Set();
  const changes=raw.changes.map(item=>{
    if(!item||typeof item!=='object')throw new Error(invalidReview);
    const {kind,status}=item;
    if(!['pending','accepted','rejected'].includes(status))throw new Error(invalidReview);
    let change;
    if(kind==='toc'){
      const {path}=item;
      if(!Array.isArray(path)||!path.length||path.length>60||!path.every(validIndex))throw new Error(invalidReview);
      const root=parse(cleanHTML(item.before)),toc=root.firstElementChild;
      if(root.childNodes.length!==1||!toc?.matches('div[data-word-toc]'))throw new Error(invalidReview);
      change={id:'toc',kind,path,before:toc.outerHTML,status};
    }else if(kind==='table'||kind==='image'){
      const {index,from,to}=item,presets=kind==='table'?tablePresets:imagePresets;
      const isPreset=value=>typeof value==='string'&&(value===''||Object.hasOwn(presets,value));
      if(!validIndex(index)||!isPreset(from)||!isPreset(to))throw new Error(invalidReview);
      const properties=kind==='table'?readCellChanges(item.cells):[];
      if(from===to&&!properties.length)throw new Error(invalidReview);
      change={id:`${kind}-${index}`,kind,index,from,to,status};
      if(properties.length)change.cells=properties;
    }else throw new Error(invalidReview);
    if(seen.has(change.id))throw new Error(invalidReview);
    seen.add(change.id);
    return change;
  });
  return {mode,sourceId,changes};
}

function restoreContents(root,change){
  const path=change.path.slice(0,-1);
  const parent=path.reduce((node,i)=>node?.childNodes[i],root);
  const index=change.path.at(-1);
  if(!parent||parent.nodeType!==1||parent.childNodes.length<index)throw new Error(invalidReview);
  parent.insertBefore(parse(change.before).firstElementChild,parent.childNodes[index]||null);
}

function decideObject(root,change,accept){
  const {kind,index,from,to}=change;
  const wasRejected=change.status==='rejected';
  const attribute=kind==='table'?tableStyleAttribute:imageStyleAttribute;
  const target=objects(root,kind)[index];
  if(!target||(target.getAttribute(attribute)||'')!==(wasRejected?from:to))throw new Error(invalidReview);
  const targetCells=kind==='table'?cells(target):[];
  for(const [cellIndex,position,old,revised] of change.cells||[]){
    const cell=targetCells[cellIndex],property=cellProperties[position];
    if(!cell||cell.style.getPropertyValue(property)!==(wasRejected?old:revised))throw new Error(invalidReview);
    const desired=accept?revised:old;
    if(desired)cell.style.setProperty(property,desired);
    else cell.style.removeProperty(property);
    if(!cell.style.length)cell.removeAttribute('style');
  }
  const desired=accept?to:from;
  if(desired)target.setAttribute(attribute,desired);
  else target.removeAttribute(attribute);
}

export function decideReview(html,review,id,accept){
  const change=review?.mode==='deciding'&&review.changes.find(item=>item.id===id);
  if(!change)throw new Error('Виправлення не знайдено.');
  const status=accept?'accepted':'rejected';
  if(change.status===status)return {html,review};
  const root=parse(html);
  if(change.kind==='toc'){
    const toc=root.querySelector('[data-word-toc]');
    if(change.status==='rejected'){
      const expected=change.path.reduce((node,i)=>node?.childNodes[i],root);
      if(!toc||expected!==toc)throw new Error(invalidReview);
      toc.remove();
    }else{
      if(toc)throw new Error(invalidReview);
      if(!accept)restoreContents(root,change);
    }
  }else decideObject(root,change,accept);
  const changes=review.changes.map(item=>item===change?{...change,status}:item);
  return {html:root.innerHTML,review:{...review,changes}};
}

function label(change){
  if(change.kind==='toc')return 'Видалення змісту';
  const target=change.kind==='table'?'Оформлення таблиці':'Оформлення зображення';
  return `${target} № ${change.index+1}`;
}

function description(change){
  if(change.kind==='toc')return 'Якщо відхилиш видалення, зміст повернеться в документ.';
  if(change.from===change.to)return 'Змінено межі або заливку комірок.';
  const presets=change.kind==='table'?tablePresets:imagePresets;
  const name=key=>key?presets[key].label:'Без стилю';
  return `${name(change.from)} → ${name(change.to)}`;
}

export function reviewPanel({getDocument,begin,send,decide,finish,removeContents,openPeer}){
  const root=el('section',{className:'word-review-tools','aria-label':'Рецензування'});
  const button=(text,onClick,attrs={})=>el('button',{type:'button',onPointerdown:event=>event.preventDefault(),onClick,...attrs},text);
  let previousHtml,previousReview;
  function refresh(){
    const {html,review}=getDocument();
    if(html===previousHtml&&review===previousReview)return;
    previousHtml=html;previousReview=review;
    const summary=getReviewSummary(html,review);
    const actions=(...items)=>el('div',{className:'word-tool-group'},...items);
    if(!summary.mode){
      root.replaceChildren(
        el('p',{},'Рецензування поточного документа'),
        actions(openPeer?button('Відкрити проєкт',openPeer):null,button('Почати рецензування',begin))
      );
    }else if(summary.mode==='editing'){
      root.replaceChildren(
        el('p',{},summary.unsupported?unsupportedEdits:'Доступні зміни стилю таблиці й зображення та видалення змісту.'),
        el('p',{role:'status'},`Запропонованих виправлень: ${summary.changes.length}.`),
        actions(
          button('Видалити зміст',removeContents,{disabled:!html.includes('data-word-toc=')}),
          button('Завантажити копію з виправленнями',send,{disabled:summary.unsupported||!summary.changes.length})
        )
      );
    }else{
      const labels={pending:'Очікує рішення',accepted:'Прийнято',rejected:'Відхилено'};
      root.replaceChildren(
        el('p',{},'Переглянь кожне виправлення й обери дію.'),
        el('ol',{className:'word-review-changes'},...summary.changes.map(change=>
          el('li',{},el('strong',{},label(change)),el('p',{},description(change)),el('p',{className:'muted'},labels[change.status]),
            actions(
              change.status!=='accepted'?button('Прийняти',()=>decide(change.id,true),{'aria-label':`Прийняти: ${label(change)}`}):null,
              change.status!=='rejected'?button('Відхилити',()=>decide(change.id,false),{'aria-label':`Відхилити: ${label(change)}`}):null
            )
          )
        )),
        actions(button('Завершити рецензування',finish,{disabled:!summary.complete}))
      );
    }
  }
  return {root,refresh};
}
