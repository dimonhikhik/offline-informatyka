import { el } from '../../components/ui.js';
import { safeLink } from './model.js';
import { imagePresets,outlineLevel,tablePresets } from './styles.js';
import { updateContents } from './structure.js';

export { imagePresets,objectStylesCSS,outlineLevel,tablePresets } from './styles.js';

const paragraphs='p,div,h1,h2,h3,h4,blockquote,li';
const excluded='[data-word-page],[data-word-columns],[data-word-break],[data-word-toc],[data-word-math]';
const romanLetters={I:1,V:5,X:10,L:50,C:100,D:500,M:1000,І:1,Х:10,С:100,М:1000};
const numberPrefix=/^\s*(\d+(?:\.\d+)*|[IVXLCDMІХСМ]{1,8})[.)]\s+\S/u;

export function sectionNumber(label) {
  const prefix=numberPrefix.exec(label)?.[1];
  if(!prefix)return null;
  if(/^\d/.test(prefix)){
    const numbers=prefix.split('.').map(Number);
    return numbers.length===1?[numbers[0],0]:numbers;
  }
  const values=[...prefix].map(letter=>romanLetters[letter]);
  return [values.reduce((total,value,index)=>total+(value<(values[index+1]??0)?-value:value),0),0];
}

function ownText(node) {
  const read=child=>{
    if(child.nodeType===Node.TEXT_NODE)return child.textContent;
    if(child.nodeType!==Node.ELEMENT_NODE||child.matches('ol,ul,table,[data-word-math]'))return '';
    if(child.tagName==='BR')return ' ';
    return [...child.childNodes].map(read).join('');
  };
  return [...node.childNodes].map(read).join('').replace(/\s+/g,' ').trim();
}

function isParagraph(node) {
  if(!node?.matches(paragraphs)||node.matches(excluded)||node.closest('td,th,[data-word-toc]'))return false;
  if(node.tagName!=='LI'&&node.closest('li'))return false;
  return node.tagName!=='DIV'||![...node.children].some(child=>child.matches(paragraphs));
}

export function outlineEntries(root) {
  return [...root.querySelectorAll(paragraphs)].filter(isParagraph).flatMap(node=>{
    const label=ownText(node);
    if(!label)return [];
    const list=node.tagName==='LI'?node.parentElement.tagName:'';
    const number=sectionNumber(label);
    const kind=list==='UL'||/^[•◦▪‣–—-]\s+/u.test(label)?'bulleted':list==='OL'||number?'numbered':'text';
    const suggestedLevel=kind==='bulleted'?2:kind==='numbered'?Math.min(9,number?.[1]?number.length:1):0;
    return [{node,label,kind,level:outlineLevel(node),suggestedLevel}];
  });
}

function topNodes(editor) {
  return [...editor.childNodes].flatMap(node=>node.nodeType===1&&node.hasAttribute('data-word-page')?[...node.childNodes]:[node]);
}

function sectionMovements(editor,entries) {
  const levels=new Map(entries.map(({node,label,level,suggestedLevel})=>{
    const number=sectionNumber(label);
    return [node,number?(number[1]?number.length:1):level||suggestedLevel];
  }));
  const scopes=new Map();
  function indexScope(parent) {
    const nodes=parent===editor?topNodes(editor):[...parent.childNodes];
    const sections=new Map(),open=[];
    nodes.forEach((node,start)=>{
      const level=levels.get(node);
      if(!level)return;
      const section={level,start,end:nodes.length};
      while(open.at(-1)?.level>=level){
        const before=open.pop();
        before.end=start;
        if(before.level===level){before.next=section;section.previous=before;}
      }
      sections.set(node,section);
      open.push(section);
    });
    const scope={nodes,sections};
    scopes.set(parent,scope);
    return scope;
  }
  return node=>{
    if(node.tagName==='LI'){
      return {
        up:node.previousElementSibling?()=>node.previousElementSibling.before(node):null,
        down:node.nextElementSibling?()=>node.nextElementSibling.after(node):null
      };
    }
    const parent=node.parentElement.hasAttribute('data-word-page')?editor:node.parentElement;
    const {nodes,sections}=scopes.get(parent)||indexScope(parent),section=sections.get(node);
    if(!section)return {};
    const slice=()=>nodes.slice(section.start,section.end);
    return {
      up:section.previous?()=>nodes[section.previous.start].before(...slice()):null,
      down:section.next?()=>nodes[section.next.end-1].after(...slice()):null
    };
  };
}

function applyOutlineLevel(nodes,level) {
  let changed=false;
  for(const node of nodes){
    const value=level?String(level):null;
    if(node.getAttribute('data-word-outline-level')===value)continue;
    if(value)node.setAttribute('data-word-outline-level',value);
    else node.removeAttribute('data-word-outline-level');
    changed=true;
  }
  return changed;
}

function applyTablePreset(table,key) {
  const style=tablePresets[key];
  if(style)table.dataset.wordTableStyle=key;
  else table.removeAttribute('data-word-table-style');
  [...table.rows].forEach((row,index)=>{
    for(const cell of row.cells){
      cell.style.backgroundColor=style?(index===0?style.header:index%2?style.band||'':''):'';
      for(const side of ['top','right','bottom','left']){
        if(style)cell.style.setProperty('border-'+side,`.5pt solid ${style.border}`);
        else for(const property of ['width','style','color'])cell.style.removeProperty('border-'+side+'-'+property);
      }
    }
  });
}

function setImageLink(image,href) {
  let link=image.closest('a');
  if(!link){
    if(!href)return;
    link=el('a');
    image.before(link);link.append(image);
  }else{
    const range=document.createRange();
    range.selectNodeContents(link);range.setStartAfter(image);
    const trailing=range.extractContents();
    range.selectNodeContents(link);range.setEndBefore(image);
    const leading=range.extractContents();
    for(const [fragment,edge] of [[leading,'before'],[trailing,'after']]){
      if(!fragment.textContent&&!fragment.querySelector('img,br,[data-word-math]'))continue;
      const remainder=link.cloneNode(false);
      remainder.append(fragment);link[edge](remainder);
    }
  }
  if(href){link.href=href;link.rel='noopener noreferrer';}
  else link.replaceWith(...link.childNodes);
}

function button(label,action,attrs={}) {
  return el('button',{type:'button',onClick:action,...attrs},label);
}

function levelSelect(label,level,apply) {
  const select=el('select',{'aria-label':label,onChange:e=>apply(Number(e.currentTarget.value))},
    el('option',{value:0},'За стилем'),
    ...Array.from({length:9},(_,i)=>el('option',{value:i+1},`Рівень ${i+1}`)));
  select.value=String(level||0);
  return select;
}

export function createPracticeTools({editor,blocks,dialog,changed,notify,canEdit,dialogError}) {
  function outline(){
    if(!canEdit())return;
    const selected=[...new Set(blocks().map(node=>node.closest('li')||node))].filter(isParagraph);
    let includeBody=false;
    const rows=el('div',{className:'word-outline-entries',role:'list','aria-label':'Структура документа'});
    const showBody=el('input',{type:'checkbox',onChange:e=>{includeBody=e.currentTarget.checked;render();}});
    const filters=el('div',{className:'word-outline-filters'});
    function changeLevels(nodes,level,focusNode){
      if(!canEdit())return;
      if(applyOutlineLevel(nodes.filter(node=>editor.contains(node)),level))changed();
      render(focusNode);
    }
    function render(focusNode){
      const entries=outlineEntries(editor);
      const movementFor=sectionMovements(editor,entries);
      const rendered=entries.filter(item=>includeBody||item.level||item.suggestedLevel);
      let focusControl;
      rows.replaceChildren(...rendered.map(item=>{
        const {node,label,level,suggestedLevel}=item;
        const {up,down}=movementFor(node);
        const move=(action,dir)=>{
          if(!canEdit()||!editor.contains(node))return;
          action();
          if(editor.querySelector('[data-word-toc]'))updateContents(editor);
          changed();render(node);
          rows.querySelector(`[data-word-outline-current] [data-direction="${dir}"]:not(:disabled)`)?.focus({preventScroll:true});
        };
        const controls=el('div',{className:'word-outline-actions'});
        const explicit=Number(node.getAttribute('data-word-outline-level'));
        const select=levelSelect('Рівень для «'+label.slice(0,70)+'»',explicit,value=>changeLevels([node],value,node));
        if(node===focusNode)focusControl=select;
        controls.append(select,button('↑',()=>move(up,'up'),{disabled:!up,'data-direction':'up','aria-label':'Перемістити вище: '+label.slice(0,70)}),
          button('↓',()=>move(down,'down'),{disabled:!down,'data-direction':'down','aria-label':'Перемістити нижче: '+label.slice(0,70)}));
        const visible=level||suggestedLevel;
        const hint=level?`Рівень ${level}`:suggestedLevel?`Пропозиція: рівень ${suggestedLevel}`:'Основний текст';
        return el('div',{className:'word-outline-entry',role:'listitem','data-word-outline-current':node===focusNode,
          style:`--outline-indent:${Math.min(3,Math.max(0,visible-1))}`},
          el('span',{className:'word-outline-label'},label),el('small',{},hint),controls);
      }));
      if(!rendered.length)rows.append(el('p',{className:'muted'},'У документі ще немає пунктів структури. Увімкни «Усі абзаци», щоб задати рівень потрібному абзацу.'));
      focusControl?.focus({preventScroll:true});
    }
    const entries=outlineEntries(editor);
    for(const [kind,level,label] of [['numbered',1,'Нумеровані → рівень 1'],['bulleted',2,'Марковані → рівень 2']]){
      const matches=entries.filter(item=>item.kind===kind).map(item=>item.node);
      if(matches.length)filters.append(button(label,()=>changeLevels(matches,level)));
    }
    if(selected.length)filters.append(el('label',{className:'word-field'},el('span',{},selected.length>1?'Рівень для вибраних абзаців':'Рівень вибраного абзацу'),
      levelSelect('Рівень для вибраних абзаців',Number(selected[0].getAttribute('data-word-outline-level')),level=>changeLevels(selected,level))));
    filters.append(el('label',{className:'word-outline-filter'},showBody,'Усі абзаци'));
    render();
    dialog('Структура документа',filters,rows);
  }

  function formatTable(table) {
    if(!canEdit()||!editor.contains(table)||table.tagName!=='TABLE')return;
    let modal;
    const choices=el('div',{className:'word-object-presets'});
    const render=()=>{
      const current=table.dataset.wordTableStyle||'';
      choices.replaceChildren(...[['',{label:'Без стилю',header:'#fff',border:'#94a3b8'}],...Object.entries(tablePresets)].map(([key,style])=>
        el('button',{type:'button',className:'word-object-preset','aria-pressed':String(current===key),onClick:()=>{
          if(!canEdit()||!editor.contains(table)||current===key)return;
          applyTablePreset(table,key);changed();render();
        }},
        el('span',{className:'word-table-preset-preview','aria-hidden':'true',
          style:`--sample-header:${style.header};--sample-band:${style.band||'#fff'};--sample-border:${style.border}`},
          ...Array.from({length:9},()=>el('i'))),style.label)));
    };
    render();
    modal=dialog('Стиль таблиці',choices,button('Готово',()=>modal.close(),{className:'primary'}));
  }

  function formatImage(image) {
    if(!canEdit()||!editor.contains(image)||image.tagName!=='IMG')return;
    let modal;
    const choices=el('div',{className:'word-object-presets'});
    const render=()=>{
      const current=image.dataset.wordImageStyle||'';
      choices.replaceChildren(...[['',{label:'Без стилю'}],...Object.entries(imagePresets)].map(([key,style])=>
        el('button',{type:'button',className:'word-object-preset','aria-pressed':String(current===key),onClick:()=>{
          if(!canEdit()||!editor.contains(image)||current===key)return;
          if(key)image.dataset.wordImageStyle=key;
          else image.removeAttribute('data-word-image-style');
          changed();render();
        }},el('img',{src:image.getAttribute('src'),alt:'',loading:'lazy','data-word-image-style':key||null}),style.label)));
    };
    const url=el('input',{type:'text',inputmode:'url',placeholder:'https://…',autocapitalize:'off',spellcheck:'false'});
    const savedLink=safeLink(image.closest('a')?.getAttribute('href'));
    url.value=savedLink;
    const form=el('form',{className:'word-image-link-form',onSubmit:event=>{
      event.preventDefault();
      if(!canEdit()||!editor.contains(image))return;
      const raw=url.value.trim(),href=safeLink(raw);
      if(raw&&!href){dialogError(modal,'Введи повну адресу сайту, наприклад https://example.com.');return;}
      if(href!==savedLink){
        setImageLink(image,href);changed();
      }
      modal.close();
    }},
    el('label',{className:'word-field'},el('span',{},'Гіперпосилання зображення'),url),
    savedLink?el('a',{className:'button',href:savedLink,target:'_blank',rel:'noopener noreferrer'},'Відкрити посилання'):null,
    el('button',{type:'submit',className:'primary'},'Готово'));
    render();
    modal=dialog('Оформлення зображення',choices,form);
  }

  function objects() {
    if(!canEdit())return;
    const tables=[...editor.querySelectorAll('table')],images=[...editor.querySelectorAll('img')];
    if(!tables.length&&!images.length){notify('Додай таблицю або зображення через «Вставлення».');return;}
    let modal;
    const items=[
      ...tables.map((table,index)=>button(`Таблиця ${index+1} · ${table.rows.length} × ${table.rows[0]?.cells.length||0}`,
        ()=>{modal.close();formatTable(table);})),
      ...images.map((image,index)=>button(`Зображення ${index+1}`,()=>{modal.close();formatImage(image);}))
    ];
    modal=dialog('Таблиці та зображення',el('div',{className:'word-object-picker'},...items));
  }
  return {outline,objects,formatImage,formatTable};
}
